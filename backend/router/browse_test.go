package router

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func TestDeleteObjectsWithPrefixDeletesEveryPage(t *testing.T) {
	keys := []string{"keep.txt"}
	for i := 0; i < 2500; i++ {
		keys = append(keys, fmt.Sprintf("bulk/f-%04d.txt", i))
	}
	m := newMemS3(keys...)

	deleted, err := deleteObjectsWithPrefix(context.Background(), m, "b", "bulk/")
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 2500 || len(m.objects) != 1 || !m.has("keep.txt") {
		t.Errorf("deleted %d, %d objects left", deleted, len(m.objects))
	}
}

func TestDeleteObjectsWithPrefixStopsWhenNothingIsDeleted(t *testing.T) {
	m := newMemS3("bulk/a.txt", "bulk/b.txt")
	m.ignoreDeletes = true

	done := make(chan error, 1)
	go func() {
		_, err := deleteObjectsWithPrefix(context.Background(), m, "b", "bulk/")
		done <- err
	}()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected an error when objects are not actually deleted")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("deleteObjectsWithPrefix looped forever")
	}
}

func TestWriteObjectHeaders(t *testing.T) {
	modified := time.Date(2026, 9, 27, 8, 0, 0, 0, time.UTC)
	full := &s3.GetObjectOutput{
		ContentType:   aws.String("video/mp4"),
		ContentLength: aws.Int64(1000),
		ETag:          aws.String(`"abc"`),
		LastModified:  &modified,
	}
	rec := httptest.NewRecorder()
	if status := writeObjectHeaders(rec.Header(), full, "clip.mp4", false); status != http.StatusOK {
		t.Errorf("status %d, want 200", status)
	}
	if rec.Header().Get("Accept-Ranges") != "bytes" || rec.Header().Get("Content-Length") != "1000" ||
		rec.Header().Get("Last-Modified") != "Sun, 27 Sep 2026 08:00:00 GMT" {
		t.Errorf("headers %v", rec.Header())
	}

	ranged := *full
	ranged.ContentLength = aws.Int64(10)
	ranged.ContentRange = aws.String("bytes 0-9/1000")
	rec = httptest.NewRecorder()
	if status := writeObjectHeaders(rec.Header(), &ranged, "clip.mp4", false); status != http.StatusPartialContent {
		t.Errorf("status %d, want 206", status)
	}
	if rec.Header().Get("Content-Range") != "bytes 0-9/1000" {
		t.Errorf("Content-Range %q", rec.Header().Get("Content-Range"))
	}

	rec = httptest.NewRecorder()
	writeObjectHeaders(rec.Header(), full, "report #1 (final)?.txt", true)
	if got := rec.Header().Get("Content-Disposition"); got != `attachment; filename="report #1 (final)?.txt"` {
		t.Errorf("Content-Disposition %q", got)
	}
	rec = httptest.NewRecorder()
	writeObjectHeaders(rec.Header(), full, "ünï.txt", true)
	if got := rec.Header().Get("Content-Disposition"); got != "attachment; filename*=utf-8''%C3%BCn%C3%AF.txt" {
		t.Errorf("Content-Disposition %q", got)
	}
}
