package router

import (
	"bytes"
	"context"
	"crypto/rand"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func TestUploadPlan(t *testing.T) {
	const MiB = int64(1) << 20
	const GiB = int64(1) << 30

	sizes := []int64{0, 1, 5 * MiB, 16*MiB + 1, GiB, 10 * GiB, 156 * GiB, 157 * GiB, 1024 * GiB, maxObjectSize}
	for _, size := range sizes {
		partSize, concurrency := uploadPlan(size)

		if partSize < minUploadPartSize {
			t.Errorf("size %d: part size %d below minimum %d", size, partSize, minUploadPartSize)
		}
		if parts := (size + partSize - 1) / partSize; parts > maxUploadParts {
			t.Errorf("size %d: %d parts exceeds S3 limit %d", size, parts, maxUploadParts)
		}
		if concurrency < 1 {
			t.Errorf("size %d: concurrency %d < 1", size, concurrency)
		}
		// In-flight part buffers stay within the memory budget, unless a
		// single part is already larger than the budget.
		if partSize <= uploadMemoryBudget && partSize*int64(concurrency) > uploadMemoryBudget {
			t.Errorf("size %d: %d x %d exceeds memory budget", size, concurrency, partSize)
		}
	}

	if partSize, concurrency := uploadPlan(GiB); partSize != minUploadPartSize || concurrency != 4 {
		t.Errorf("1 GiB: got part %d concurrency %d, want %d/4", partSize, concurrency, minUploadPartSize)
	}
}

// fakeS3 implements the handful of S3 calls the uploader makes, storing
// completed objects in memory.
type fakeS3 struct {
	mu        sync.Mutex
	objects   map[string][]byte
	parts     map[int][]byte
	aborted   int
	failPart  int           // part number that returns 500 (0 = none)
	partDelay time.Duration // delay before answering each part
	partSeen  chan int      // receives each part number as it arrives
	stall     chan struct{} // when set, parts block until it is closed
}

func newFakeS3() *fakeS3 {
	return &fakeS3{objects: map[string][]byte{}, parts: map[int][]byte{}, partSeen: make(chan int, 100)}
}

func (f *fakeS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	path := r.URL.Path

	switch {
	case r.Method == http.MethodPost && q.Has("uploads"):
		fmt.Fprint(w, `<InitiateMultipartUploadResult><Bucket>b</Bucket><Key>k</Key><UploadId>u1</UploadId></InitiateMultipartUploadResult>`)

	case r.Method == http.MethodPut && q.Get("uploadId") != "":
		n, _ := strconv.Atoi(q.Get("partNumber"))
		f.partSeen <- n
		if f.stall != nil {
			<-f.stall
			return
		}
		if f.partDelay > 0 {
			time.Sleep(f.partDelay)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil || n == f.failPart {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, `<Error><Code>InternalError</Code><Message>boom</Message></Error>`)
			return
		}
		f.mu.Lock()
		f.parts[n] = body
		f.mu.Unlock()
		w.Header().Set("ETag", fmt.Sprintf(`"etag-%d"`, n))

	case r.Method == http.MethodPost && q.Get("uploadId") != "":
		f.mu.Lock()
		nums := make([]int, 0, len(f.parts))
		for n := range f.parts {
			nums = append(nums, n)
		}
		sort.Ints(nums)
		var buf bytes.Buffer
		for _, n := range nums {
			buf.Write(f.parts[n])
		}
		f.objects[path] = buf.Bytes()
		f.mu.Unlock()
		fmt.Fprint(w, `<CompleteMultipartUploadResult><Bucket>b</Bucket><Key>k</Key><ETag>"done"</ETag></CompleteMultipartUploadResult>`)

	case r.Method == http.MethodDelete && q.Get("uploadId") != "":
		f.mu.Lock()
		f.aborted++
		f.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)

	case r.Method == http.MethodPut:
		body, _ := io.ReadAll(r.Body)
		f.mu.Lock()
		f.objects[path] = body
		f.mu.Unlock()
		w.Header().Set("ETag", `"single"`)

	default:
		w.WriteHeader(http.StatusNotImplemented)
	}
}

func newTestClient(t *testing.T, fake *fakeS3) *s3.Client {
	t.Helper()
	srv := httptest.NewServer(fake)
	t.Cleanup(srv.Close)

	client := newS3Client(srv.URL, "garage", credentials.NewStaticCredentialsProvider("id", "secret", ""))
	return s3.New(client.Options(), func(o *s3.Options) {
		o.RetryMaxAttempts = 1
	})
}

func randomBytes(t *testing.T, n int) []byte {
	t.Helper()
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		t.Fatal(err)
	}
	return b
}

func putInput(key string, body io.Reader) *s3.PutObjectInput {
	return &s3.PutObjectInput{Bucket: aws.String("b"), Key: aws.String(key), Body: body}
}

func TestUploadObjectSinglePart(t *testing.T) {
	fake := newFakeS3()
	client := newTestClient(t, fake)
	data := randomBytes(t, 1<<20)

	// io.NopCloser hides Seek, like an http.Request body.
	err := uploadObject(context.Background(), client, putInput("small.bin", io.NopCloser(bytes.NewReader(data))), int64(len(data)))
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if !bytes.Equal(fake.objects["/b/small.bin"], data) {
		t.Fatalf("stored object differs from upload (got %d bytes)", len(fake.objects["/b/small.bin"]))
	}
}

func TestUploadObjectMultipart(t *testing.T) {
	fake := newFakeS3()
	client := newTestClient(t, fake)
	data := randomBytes(t, int(minUploadPartSize)*2+12345)

	err := uploadObject(context.Background(), client, putInput("big.bin", io.NopCloser(bytes.NewReader(data))), int64(len(data)))
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	if len(fake.parts) != 3 {
		t.Fatalf("expected 3 parts, got %d", len(fake.parts))
	}
	if !bytes.Equal(fake.objects["/b/big.bin"], data) {
		t.Fatal("reassembled object differs from upload")
	}
}

func TestUploadObjectAbortsOnPartFailure(t *testing.T) {
	fake := newFakeS3()
	fake.failPart = 2
	client := newTestClient(t, fake)
	data := randomBytes(t, int(minUploadPartSize)*3)

	err := uploadObject(context.Background(), client, putInput("fail.bin", io.NopCloser(bytes.NewReader(data))), int64(len(data)))
	if err == nil {
		t.Fatal("expected an error")
	}
	if fake.aborted != 1 {
		t.Fatalf("expected the multipart upload to be aborted once, got %d", fake.aborted)
	}
	if _, ok := fake.objects["/b/fail.bin"]; ok {
		t.Fatal("failed upload must not produce an object")
	}
}

func TestUploadObjectAbortsWhenClientDisconnects(t *testing.T) {
	fake := newFakeS3()
	fake.partDelay = 200 * time.Millisecond
	client := newTestClient(t, fake)
	data := randomBytes(t, int(minUploadPartSize)*3)

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-fake.partSeen
		cancel() // simulate the browser dropping the request mid-upload
	}()

	err := uploadObject(ctx, client, putInput("gone.bin", io.NopCloser(bytes.NewReader(data))), int64(len(data)))
	if err == nil {
		t.Fatal("expected an error after cancellation")
	}
	if fake.aborted != 1 {
		t.Fatalf("expected abort even though the request context was cancelled, got %d", fake.aborted)
	}
}

func TestUploadObjectFailsWhenStorageStalls(t *testing.T) {
	prev := s3HTTPClient
	s3HTTPClient = newStallTimeoutHTTPClient(300 * time.Millisecond)
	t.Cleanup(func() { s3HTTPClient = prev })

	fake := newFakeS3()
	client := newTestClient(t, fake)

	// Parts never get an answer, like a Garage node that stopped responding
	// without closing the connection.
	release := make(chan struct{})
	t.Cleanup(func() { close(release) })
	fake.stall = release

	data := randomBytes(t, int(minUploadPartSize)*2)
	start := time.Now()
	err := uploadObject(context.Background(), client, putInput("stall.bin", io.NopCloser(bytes.NewReader(data))), int64(len(data)))
	if err == nil {
		t.Fatal("expected an error when storage stalls")
	}
	if elapsed := time.Since(start); elapsed > 10*time.Second {
		t.Fatalf("stalled upload took %s to fail", elapsed)
	}
	if fake.aborted != 1 {
		t.Fatalf("expected the stalled upload to be aborted, got %d", fake.aborted)
	}
}
