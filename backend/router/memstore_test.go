package router

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// memS3 is an in-memory, single-bucket s3API for tests. Listings follow S3's
// rules: keys sorted, at most 1,000 entries per page, delimiter folding.
type memS3 struct {
	mu      sync.Mutex
	objects map[string][]byte
	types   map[string]string // content type per key; copies carry it like S3
	uploads map[string]map[int32][]byte
	upTypes map[string]string // content type given to each multipart upload

	lists, copies, partCopies, aborted int

	maxCopySize   int64 // CopyObject fails above this size when > 0 (S3's 5 GiB cap)
	failPartCopy  int32 // UploadPartCopy fails for this part number when > 0
	ignoreDeletes bool  // DeleteObjects reports success without deleting
}

var _ s3API = (*memS3)(nil)

func newMemS3(keys ...string) *memS3 {
	m := &memS3{
		objects: map[string][]byte{},
		types:   map[string]string{},
		uploads: map[string]map[int32][]byte{},
		upTypes: map[string]string{},
	}
	for _, k := range keys {
		m.objects[k] = []byte("data:" + k)
	}
	return m
}

func (m *memS3) has(key string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.objects[key]
	return ok
}

func (m *memS3) sortedKeys() []string {
	keys := make([]string, 0, len(m.objects))
	for k := range m.objects {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func (m *memS3) ListObjectsV2(_ context.Context, in *s3.ListObjectsV2Input, _ ...func(*s3.Options)) (*s3.ListObjectsV2Output, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.lists++

	prefix, delim := aws.ToString(in.Prefix), aws.ToString(in.Delimiter)
	start := aws.ToString(in.ContinuationToken)
	limit := 1000
	if n := aws.ToInt32(in.MaxKeys); n > 0 && int(n) < limit {
		limit = int(n)
	}

	out := &s3.ListObjectsV2Output{IsTruncated: aws.Bool(false)}
	seen := map[string]bool{}
	count, last := 0, ""
	for _, k := range m.sortedKeys() {
		if !strings.HasPrefix(k, prefix) {
			continue
		}
		entry, isPrefix := k, false
		if delim != "" {
			if i := strings.Index(k[len(prefix):], delim); i >= 0 {
				entry, isPrefix = k[:len(prefix)+i+len(delim)], true
			}
		}
		if entry <= start || seen[entry] {
			continue
		}
		if count == limit {
			out.IsTruncated, out.NextContinuationToken = aws.Bool(true), aws.String(last)
			break
		}
		if isPrefix {
			seen[entry] = true
			out.CommonPrefixes = append(out.CommonPrefixes, types.CommonPrefix{Prefix: aws.String(entry)})
		} else {
			out.Contents = append(out.Contents, types.Object{
				Key:          aws.String(k),
				Size:         aws.Int64(int64(len(m.objects[k]))),
				LastModified: aws.Time(time.Unix(0, 0)),
			})
		}
		count++
		last = entry
	}
	return out, nil
}

func (m *memS3) HeadObject(_ context.Context, in *s3.HeadObjectInput, _ ...func(*s3.Options)) (*s3.HeadObjectOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	data, ok := m.objects[aws.ToString(in.Key)]
	if !ok {
		return nil, &types.NotFound{}
	}
	return &s3.HeadObjectOutput{
		ContentLength: aws.Int64(int64(len(data))),
		ContentType:   aws.String(m.types[aws.ToString(in.Key)]),
	}, nil
}

// source resolves a CopySource ("bucket/key", path-escaped) to its key and
// data. Caller holds the lock.
func (m *memS3) source(copySource *string) (string, []byte, error) {
	raw, err := url.PathUnescape(aws.ToString(copySource))
	if err != nil {
		return "", nil, err
	}
	_, key, _ := strings.Cut(raw, "/")
	data, ok := m.objects[key]
	if !ok {
		return "", nil, &types.NoSuchKey{}
	}
	return key, data, nil
}

func (m *memS3) CopyObject(_ context.Context, in *s3.CopyObjectInput, _ ...func(*s3.Options)) (*s3.CopyObjectOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	src, data, err := m.source(in.CopySource)
	if err != nil {
		return nil, err
	}
	if m.maxCopySize > 0 && int64(len(data)) > m.maxCopySize {
		return nil, errors.New("EntityTooLarge: copy source is larger than the maximum allowable size")
	}
	m.objects[aws.ToString(in.Key)] = append([]byte(nil), data...)
	m.types[aws.ToString(in.Key)] = m.types[src]
	m.copies++
	return &s3.CopyObjectOutput{}, nil
}

func (m *memS3) DeleteObject(_ context.Context, in *s3.DeleteObjectInput, _ ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.objects, aws.ToString(in.Key))
	return &s3.DeleteObjectOutput{}, nil
}

func (m *memS3) DeleteObjects(_ context.Context, in *s3.DeleteObjectsInput, _ ...func(*s3.Options)) (*s3.DeleteObjectsOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(in.Delete.Objects) > 1000 {
		return nil, errors.New("MalformedXML: more than 1000 keys")
	}
	if !m.ignoreDeletes {
		for _, o := range in.Delete.Objects {
			delete(m.objects, aws.ToString(o.Key))
		}
	}
	return &s3.DeleteObjectsOutput{}, nil
}

func (m *memS3) CreateMultipartUpload(_ context.Context, in *s3.CreateMultipartUploadInput, _ ...func(*s3.Options)) (*s3.CreateMultipartUploadOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id := "up-" + strconv.Itoa(len(m.uploads)+1)
	m.uploads[id] = map[int32][]byte{}
	m.upTypes[id] = aws.ToString(in.ContentType)
	return &s3.CreateMultipartUploadOutput{UploadId: aws.String(id)}, nil
}

func (m *memS3) UploadPartCopy(_ context.Context, in *s3.UploadPartCopyInput, _ ...func(*s3.Options)) (*s3.UploadPartCopyOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := aws.ToInt32(in.PartNumber)
	if n == m.failPartCopy {
		return nil, errors.New("InternalError: part copy failed")
	}
	_, data, err := m.source(in.CopySource)
	if err != nil {
		return nil, err
	}
	var from, to int64
	if _, err := fmt.Sscanf(aws.ToString(in.CopySourceRange), "bytes=%d-%d", &from, &to); err != nil {
		return nil, err
	}
	m.uploads[aws.ToString(in.UploadId)][n] = append([]byte(nil), data[from:to+1]...)
	m.partCopies++
	return &s3.UploadPartCopyOutput{CopyPartResult: &types.CopyPartResult{ETag: aws.String(fmt.Sprintf("etag-%d", n))}}, nil
}

func (m *memS3) CompleteMultipartUpload(_ context.Context, in *s3.CompleteMultipartUploadInput, _ ...func(*s3.Options)) (*s3.CompleteMultipartUploadOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	parts := m.uploads[aws.ToString(in.UploadId)]
	var buf bytes.Buffer
	for _, p := range in.MultipartUpload.Parts {
		buf.Write(parts[aws.ToInt32(p.PartNumber)])
	}
	m.objects[aws.ToString(in.Key)] = buf.Bytes()
	m.types[aws.ToString(in.Key)] = m.upTypes[aws.ToString(in.UploadId)]
	delete(m.uploads, aws.ToString(in.UploadId))
	return &s3.CompleteMultipartUploadOutput{}, nil
}

func (m *memS3) AbortMultipartUpload(_ context.Context, in *s3.AbortMultipartUploadInput, _ ...func(*s3.Options)) (*s3.AbortMultipartUploadOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.uploads, aws.ToString(in.UploadId))
	m.aborted++
	return &s3.AbortMultipartUploadOutput{}, nil
}
