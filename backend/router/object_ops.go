package router

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

var (
	// maxSingleCopySize is the largest object S3 copies in one CopyObject
	// call; bigger objects are copied part by part.
	maxSingleCopySize int64 = 5 << 30

	// minCopyPartSize is the smallest part used for multipart copies.
	minCopyPartSize int64 = 512 << 20
)

func copySource(bucket, key string) *string {
	return aws.String(url.PathEscape(bucket + "/" + key))
}

// copyPartSize picks a part size for a multipart copy that stays within S3's
// part-count limit.
func copyPartSize(size int64) int64 {
	part := minCopyPartSize
	if needed := (size + maxUploadParts - 1) / maxUploadParts; needed > part {
		part = needed
	}
	return part
}

// copyObject copies key to newKey inside bucket. size is the object's size,
// or negative when unknown (it is then looked up).
func copyObject(ctx context.Context, client s3API, bucket, key, newKey string, size int64) error {
	if size >= 0 && size <= maxSingleCopySize {
		return singleCopy(ctx, client, bucket, key, newKey)
	}

	// Unknown size, or a multipart copy, which also needs the source's
	// headers: unlike CopyObject, a multipart upload doesn't inherit them.
	head, err := client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if err != nil {
		return err
	}
	if aws.ToInt64(head.ContentLength) <= maxSingleCopySize {
		return singleCopy(ctx, client, bucket, key, newKey)
	}
	return multipartCopy(ctx, client, bucket, key, newKey, head)
}

func singleCopy(ctx context.Context, client s3API, bucket, key, newKey string) error {
	_, err := client.CopyObject(ctx, &s3.CopyObjectInput{
		Bucket:     aws.String(bucket),
		CopySource: copySource(bucket, key),
		Key:        aws.String(newKey),
	})
	return err
}

// multipartCopy copies an object too large for CopyObject in ranged parts,
// keeping the source's content headers and metadata. A failed copy is
// aborted so no orphaned parts are left behind.
func multipartCopy(ctx context.Context, client s3API, bucket, key, newKey string, source *s3.HeadObjectOutput) error {
	size := aws.ToInt64(source.ContentLength)
	upload, err := client.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket:             aws.String(bucket),
		Key:                aws.String(newKey),
		ContentType:        source.ContentType,
		CacheControl:       source.CacheControl,
		ContentDisposition: source.ContentDisposition,
		ContentEncoding:    source.ContentEncoding,
		ContentLanguage:    source.ContentLanguage,
		Metadata:           source.Metadata,
	})
	if err != nil {
		return err
	}

	abort := func(cause error) error {
		abortCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		if _, err := client.AbortMultipartUpload(abortCtx, &s3.AbortMultipartUploadInput{
			Bucket:   aws.String(bucket),
			Key:      aws.String(newKey),
			UploadId: upload.UploadId,
		}); err != nil {
			log.Printf("Cannot abort multipart copy %s for %s/%s: %v", aws.ToString(upload.UploadId), bucket, newKey, err)
		}
		return cause
	}

	partSize := copyPartSize(size)
	var parts []types.CompletedPart
	for n, offset := int32(1), int64(0); offset < size; n, offset = n+1, offset+partSize {
		end := min(offset+partSize, size) - 1
		out, err := client.UploadPartCopy(ctx, &s3.UploadPartCopyInput{
			Bucket:          aws.String(bucket),
			Key:             aws.String(newKey),
			UploadId:        upload.UploadId,
			PartNumber:      aws.Int32(n),
			CopySource:      copySource(bucket, key),
			CopySourceRange: aws.String(fmt.Sprintf("bytes=%d-%d", offset, end)),
		})
		if err != nil {
			return abort(err)
		}
		parts = append(parts, types.CompletedPart{ETag: out.CopyPartResult.ETag, PartNumber: aws.Int32(n)})
	}

	if _, err := client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:          aws.String(bucket),
		Key:             aws.String(newKey),
		UploadId:        upload.UploadId,
		MultipartUpload: &types.CompletedMultipartUpload{Parts: parts},
	}); err != nil {
		return abort(err)
	}
	return nil
}

// moveSingleObject copies key to newKey, then deletes key.
func moveSingleObject(ctx context.Context, client s3API, bucket, key, newKey string, size int64) error {
	if err := copyObject(ctx, client, bucket, key, newKey, size); err != nil {
		return err
	}
	_, err := client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	return err
}

// moveObjectsWithPrefix moves every object under prefix to destPrefix,
// keeping their paths relative to the prefix.
func moveObjectsWithPrefix(ctx context.Context, client s3API, bucket, prefix, destPrefix string) (int, error) {
	moved := 0
	var continuationToken *string

	for {
		list, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(bucket),
			Prefix:            aws.String(prefix),
			ContinuationToken: continuationToken,
		})
		if err != nil {
			return moved, err
		}

		for _, object := range list.Contents {
			key := *object.Key
			newKey := destPrefix + strings.TrimPrefix(key, prefix)
			if newKey == key {
				continue
			}
			size := int64(-1)
			if object.Size != nil {
				size = *object.Size
			}
			if err := moveSingleObject(ctx, client, bucket, key, newKey, size); err != nil {
				return moved, err
			}
			moved++
		}

		if list.IsTruncated == nil || !*list.IsTruncated {
			break
		}
		continuationToken = list.NextContinuationToken
	}

	return moved, nil
}

// deleteObjectsWithPrefix deletes every object under prefix, 1,000 at a time
// (the S3 limit per DeleteObjects call), and returns how many were deleted.
func deleteObjectsWithPrefix(ctx context.Context, client s3API, bucket, prefix string) (int, error) {
	deleted := 0
	prevFirst := ""

	for {
		// Always list from the start: the previous batch is gone, so the
		// next objects are at the front again.
		list, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket: aws.String(bucket),
			Prefix: aws.String(prefix),
		})
		if err != nil {
			return deleted, err
		}
		if len(list.Contents) == 0 {
			return deleted, nil
		}

		first := aws.ToString(list.Contents[0].Key)
		if first == prevFirst {
			return deleted, fmt.Errorf("objects under %q could not be deleted", prefix)
		}
		prevFirst = first

		ids := make([]types.ObjectIdentifier, 0, len(list.Contents))
		for _, object := range list.Contents {
			ids = append(ids, types.ObjectIdentifier{Key: object.Key})
		}

		res, err := client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
			Bucket: aws.String(bucket),
			Delete: &types.Delete{Objects: ids, Quiet: aws.Bool(true)},
		})
		if err != nil {
			return deleted, err
		}
		if len(res.Errors) > 0 {
			return deleted, fmt.Errorf("%s: %s", aws.ToString(res.Errors[0].Key), aws.ToString(res.Errors[0].Message))
		}
		deleted += len(ids)
	}
}
