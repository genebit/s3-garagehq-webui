package router

import (
	"bytes"
	"context"
	"errors"
	"testing"
)

func TestRenameTarget(t *testing.T) {
	ok := []struct{ key, name, want string }{
		{"docs/a.txt", "b.txt", "docs/b.txt"},
		{"a.txt", "A.txt", "A.txt"},
		{"docs/old/", "new", "docs/new/"},
		{"top/", "x", "x/"},
		{"docs/a.txt", "  padded.txt  ", "docs/padded.txt"},
	}
	for _, c := range ok {
		got, err := renameTarget(c.key, c.name)
		if err != nil || got != c.want {
			t.Errorf("renameTarget(%q, %q) = %q, %v; want %q", c.key, c.name, got, err, c.want)
		}
	}
	for _, name := range []string{"", "  ", "a/b", ".", "..", "a.txt"} {
		if _, err := renameTarget("docs/a.txt", name); err == nil {
			t.Errorf("renameTarget(%q) should fail", name)
		}
	}
}

func TestRenameFile(t *testing.T) {
	m := newMemS3("docs/a.txt", "docs/b.txt")
	moved, err := renameObject(context.Background(), m, "b", "docs/a.txt", "docs/c.txt")
	if err != nil || moved != 1 {
		t.Fatalf("moved %d, err %v", moved, err)
	}
	if !m.has("docs/c.txt") || m.has("docs/a.txt") {
		t.Error("docs/a.txt was not renamed to docs/c.txt")
	}
}

func TestRenameFileRefusesExistingName(t *testing.T) {
	m := newMemS3("docs/a.txt", "docs/b.txt")
	_, err := renameObject(context.Background(), m, "b", "docs/a.txt", "docs/b.txt")
	if !errors.Is(err, errNameTaken) {
		t.Fatalf("err = %v, want errNameTaken", err)
	}
	if string(m.objects["docs/b.txt"]) != "data:docs/b.txt" || !m.has("docs/a.txt") {
		t.Error("a refused rename must leave both files untouched")
	}
}

func TestRenameFileCaseOnly(t *testing.T) {
	m := newMemS3("docs/a.txt")
	if _, err := renameObject(context.Background(), m, "b", "docs/a.txt", "docs/A.txt"); err != nil {
		t.Fatal(err)
	}
	if !m.has("docs/A.txt") || m.has("docs/a.txt") {
		t.Error("case-only rename did not happen")
	}
}

func TestRenameMissingSource(t *testing.T) {
	m := newMemS3()
	if _, err := renameObject(context.Background(), m, "b", "gone.txt", "new.txt"); !errors.Is(err, errSourceMissing) {
		t.Fatalf("err = %v, want errSourceMissing", err)
	}
	if _, err := renameObject(context.Background(), m, "b", "gone/", "new/"); !errors.Is(err, errSourceMissing) {
		t.Fatalf("folder err = %v, want errSourceMissing", err)
	}
}

func TestRenameFolder(t *testing.T) {
	m := newMemS3("p/old/", "p/old/x.txt", "p/old/sub/y.txt", "p/other.txt")
	moved, err := renameObject(context.Background(), m, "b", "p/old/", "p/new/")
	if err != nil || moved != 3 {
		t.Fatalf("moved %d, err %v", moved, err)
	}
	for _, k := range []string{"p/new/", "p/new/x.txt", "p/new/sub/y.txt", "p/other.txt"} {
		if !m.has(k) {
			t.Errorf("missing %s", k)
		}
	}
	for _, k := range []string{"p/old/", "p/old/x.txt", "p/old/sub/y.txt"} {
		if m.has(k) {
			t.Errorf("%s should have moved", k)
		}
	}
}

func TestRenameFolderRefusesExistingName(t *testing.T) {
	m := newMemS3("p/old/x.txt", "p/new/z.txt")
	if _, err := renameObject(context.Background(), m, "b", "p/old/", "p/new/"); !errors.Is(err, errNameTaken) {
		t.Fatalf("err = %v, want errNameTaken", err)
	}
}

func withSmallCopyLimits(t *testing.T) {
	prevMax, prevPart := maxSingleCopySize, minCopyPartSize
	maxSingleCopySize, minCopyPartSize = 4, 3
	t.Cleanup(func() { maxSingleCopySize, minCopyPartSize = prevMax, prevPart })
}

func TestCopyObjectUsesMultipartAboveLimit(t *testing.T) {
	withSmallCopyLimits(t)
	m := newMemS3()
	m.maxCopySize = 4
	m.objects["big"] = []byte("0123456789")

	if err := copyObject(context.Background(), m, "b", "big", "big2", -1); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(m.objects["big2"], []byte("0123456789")) {
		t.Errorf("copy = %q", m.objects["big2"])
	}
	if m.partCopies != 4 || m.copies != 0 {
		t.Errorf("partCopies %d copies %d, want 4 and 0", m.partCopies, m.copies)
	}
}

func TestCopyObjectAbortsFailedMultipartCopy(t *testing.T) {
	withSmallCopyLimits(t)
	m := newMemS3()
	m.objects["big"] = []byte("0123456789")
	m.failPartCopy = 2

	if err := copyObject(context.Background(), m, "b", "big", "big2", -1); err == nil {
		t.Fatal("expected an error")
	}
	if m.aborted != 1 || m.has("big2") || !m.has("big") {
		t.Errorf("aborted %d, big2 %v, big %v", m.aborted, m.has("big2"), m.has("big"))
	}
}

func TestCopyPartSizeStaysWithinPartLimit(t *testing.T) {
	for _, size := range []int64{5<<30 + 1, 1 << 40, maxObjectSize} {
		part := copyPartSize(size)
		if part < minCopyPartSize || (size+part-1)/part > maxUploadParts {
			t.Errorf("size %d: part %d gives %d parts", size, part, (size+part-1)/part)
		}
	}
}
