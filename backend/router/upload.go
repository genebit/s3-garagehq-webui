package router

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

const (
	// minUploadPartSize is the smallest multipart chunk we stream to Garage.
	// Objects smaller than this are sent as a single PutObject.
	minUploadPartSize int64 = 16 << 20

	// maxUploadParts is the S3 limit on parts per multipart upload.
	maxUploadParts = int64(manager.MaxUploadParts)

	// maxObjectSize is the S3 limit on a single object (5 TiB).
	maxObjectSize int64 = 5 << 40

	// uploadMemoryBudget caps the part buffers held in memory per upload.
	uploadMemoryBudget int64 = 64 << 20

	maxUploadConcurrency = 4
)

// uploadPlan picks the multipart part size and concurrency for an object of
// the given size: parts grow past the minimum only as needed to stay within
// S3's part limit, and concurrency shrinks so in-flight buffers stay within
// the memory budget.
func uploadPlan(size int64) (partSize int64, concurrency int) {
	partSize = minUploadPartSize
	if needed := (size + maxUploadParts - 1) / maxUploadParts; needed > partSize {
		partSize = needed
	}

	concurrency = int(uploadMemoryBudget / partSize)
	if concurrency > maxUploadConcurrency {
		concurrency = maxUploadConcurrency
	}
	if concurrency < 1 {
		concurrency = 1
	}
	return partSize, concurrency
}

// uploadObject streams input.Body to S3 without buffering the whole object,
// switching to a multipart upload for anything larger than one part. A failed
// multipart upload is always aborted so no orphaned parts are left behind.
func uploadObject(ctx context.Context, client *s3.Client, input *s3.PutObjectInput, size int64) error {
	partSize, concurrency := uploadPlan(size)

	uploader := manager.NewUploader(client, func(u *manager.Uploader) {
		u.PartSize = partSize
		u.Concurrency = concurrency
		// The uploader would abort with ctx, which is already cancelled when
		// the browser disconnects; abort ourselves below instead.
		u.LeavePartsOnError = true
	})

	_, err := uploader.Upload(ctx, input)

	var failure manager.MultiUploadFailure
	if errors.As(err, &failure) && failure.UploadID() != "" {
		abortCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()

		_, abortErr := client.AbortMultipartUpload(abortCtx, &s3.AbortMultipartUploadInput{
			Bucket:   input.Bucket,
			Key:      input.Key,
			UploadId: aws.String(failure.UploadID()),
		})
		if abortErr != nil {
			log.Printf("Cannot abort multipart upload %s for %s/%s: %v",
				failure.UploadID(), *input.Bucket, *input.Key, abortErr)
		}
	}

	return err
}
