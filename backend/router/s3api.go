package router

import (
	"context"
	"errors"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

// s3API is the subset of the S3 client the object browser uses, so its
// listing, search, rename, copy and delete logic can be tested against a fake.
type s3API interface {
	ListObjectsV2(ctx context.Context, in *s3.ListObjectsV2Input, opts ...func(*s3.Options)) (*s3.ListObjectsV2Output, error)
	HeadObject(ctx context.Context, in *s3.HeadObjectInput, opts ...func(*s3.Options)) (*s3.HeadObjectOutput, error)
	CopyObject(ctx context.Context, in *s3.CopyObjectInput, opts ...func(*s3.Options)) (*s3.CopyObjectOutput, error)
	DeleteObject(ctx context.Context, in *s3.DeleteObjectInput, opts ...func(*s3.Options)) (*s3.DeleteObjectOutput, error)
	DeleteObjects(ctx context.Context, in *s3.DeleteObjectsInput, opts ...func(*s3.Options)) (*s3.DeleteObjectsOutput, error)
	CreateMultipartUpload(ctx context.Context, in *s3.CreateMultipartUploadInput, opts ...func(*s3.Options)) (*s3.CreateMultipartUploadOutput, error)
	UploadPartCopy(ctx context.Context, in *s3.UploadPartCopyInput, opts ...func(*s3.Options)) (*s3.UploadPartCopyOutput, error)
	CompleteMultipartUpload(ctx context.Context, in *s3.CompleteMultipartUploadInput, opts ...func(*s3.Options)) (*s3.CompleteMultipartUploadOutput, error)
	AbortMultipartUpload(ctx context.Context, in *s3.AbortMultipartUploadInput, opts ...func(*s3.Options)) (*s3.AbortMultipartUploadOutput, error)
}

var _ s3API = (*s3.Client)(nil)

// isNotFound reports whether err is S3's "no such object" error.
func isNotFound(err error) bool {
	var notFound *types.NotFound
	var noSuchKey *types.NoSuchKey
	if errors.As(err, &notFound) || errors.As(err, &noSuchKey) {
		return true
	}
	var apiErr smithy.APIError
	return errors.As(err, &apiErr) &&
		(apiErr.ErrorCode() == "NotFound" || apiErr.ErrorCode() == "NoSuchKey")
}
