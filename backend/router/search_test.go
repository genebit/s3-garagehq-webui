package router

import (
	"context"
	"fmt"
	"khairul169/garage-webui/utils"
	"reflect"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

func photoStore() *memS3 {
	return newMemS3(
		"photos/",
		"photos/Beach.JPG",
		"photos/beach-2.png",
		"photos/city.png",
		"photos/report (1).txt",
		"photos/Beaches/a.png",
		"photos/archive/old-beach.png",
	)
}

func objectKeys(objects []types.Object) []string {
	keys := []string{}
	for _, o := range objects {
		keys = append(keys, aws.ToString(o.Key))
	}
	return keys
}

func TestSearchFolderMatchesNamesInFolderOnly(t *testing.T) {
	got, err := searchFolder(context.Background(), photoStore(), "b", "photos/", "BEACH")
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"photos/Beaches/"}; !reflect.DeepEqual(got.Prefixes, want) {
		t.Errorf("prefixes = %v, want %v", got.Prefixes, want)
	}
	// Nested photos/archive/old-beach.png is not in this folder; the folder
	// marker "photos/" has an empty name and never matches.
	if want := []string{"photos/Beach.JPG", "photos/beach-2.png"}; !reflect.DeepEqual(objectKeys(got.Objects), want) {
		t.Errorf("objects = %v, want %v", objectKeys(got.Objects), want)
	}
	if got.Truncated {
		t.Error("truncated = true, want false")
	}
}

func TestSearchFolderTreatsTermLiterally(t *testing.T) {
	for _, term := range []string{"(1)", "."} {
		got, err := searchFolder(context.Background(), photoStore(), "b", "photos/", term)
		if err != nil {
			t.Fatal(err)
		}
		keys := objectKeys(got.Objects)
		if term == "(1)" && !reflect.DeepEqual(keys, []string{"photos/report (1).txt"}) {
			t.Errorf("term %q matched %v", term, keys)
		}
		if term == "." && len(keys) != 4 {
			t.Errorf("term %q matched %v, want the 4 files with a dot", term, keys)
		}
	}
	got, err := searchFolder(context.Background(), photoStore(), "b", "photos/", "*")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Objects)+len(got.Prefixes) != 0 {
		t.Errorf("term %q matched %v, want nothing", "*", objectKeys(got.Objects))
	}
}

func TestSearchFolderStopsAtScanLimit(t *testing.T) {
	prev := searchScanLimit
	searchScanLimit = 5
	t.Cleanup(func() { searchScanLimit = prev })

	keys := []string{}
	for i := 0; i < 3000; i++ {
		keys = append(keys, fmt.Sprintf("big/f-%04d.txt", i))
	}
	m := newMemS3(keys...)
	got, err := searchFolder(context.Background(), m, "b", "big/", "f-")
	if err != nil {
		t.Fatal(err)
	}
	if !got.Truncated {
		t.Error("truncated = false, want true")
	}
	if m.lists != 1 {
		t.Errorf("listed %d pages, want 1", m.lists)
	}
}

func TestSearchPagePaginatesFoldersThenFiles(t *testing.T) {
	matches := &searchMatches{
		Prefixes: []string{"p/a1/", "p/a2/"},
		Objects: []types.Object{
			{Key: aws.String("p/a3.txt")}, {Key: aws.String("p/a4.txt")}, {Key: aws.String("p/a5.txt")},
		},
	}

	first := searchPage("b", "p/", matches, 0, 2)
	if !reflect.DeepEqual(first.Prefixes, []string{"p/a1/", "p/a2/"}) || len(first.Objects) != 0 {
		t.Errorf("page 1 = %v / %d objects", first.Prefixes, len(first.Objects))
	}
	if aws.ToString(first.NextToken) != "s:2" {
		t.Errorf("page 1 next = %q, want s:2", aws.ToString(first.NextToken))
	}

	second := searchPage("b", "p/", matches, 2, 2)
	if len(second.Prefixes) != 0 || len(second.Objects) != 2 || *second.Objects[0].ObjectKey != "a3.txt" {
		t.Errorf("page 2 = %v / %v", second.Prefixes, second.Objects)
	}

	third := searchPage("b", "p/", matches, 4, 2)
	if len(third.Objects) != 1 || third.NextToken != nil {
		t.Errorf("page 3 = %d objects, next %v", len(third.Objects), third.NextToken)
	}
}

func TestSearchObjectsCachesLaterPages(t *testing.T) {
	utils.InitCacheManager()
	m := photoStore()
	ctx := context.Background()

	first, err := searchObjects(ctx, m, "b", "photos/", "png", "", 1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := searchObjects(ctx, m, "b", "photos/", "png", aws.ToString(first.NextToken), 1); err != nil {
		t.Fatal(err)
	}
	if m.lists != 1 {
		t.Errorf("paging re-listed the folder: %d lists, want 1", m.lists)
	}
	if _, err := searchObjects(ctx, m, "b", "photos/", "png", "", 1); err != nil {
		t.Fatal(err)
	}
	if m.lists != 2 {
		t.Errorf("a new search should re-list: %d lists, want 2", m.lists)
	}
}

func TestParseSearchToken(t *testing.T) {
	for in, want := range map[string]int{"": 0, "s:10": 10, "abc": 0, "s:-3": 0, "10": 0} {
		if got := parseSearchToken(in); got != want {
			t.Errorf("parseSearchToken(%q) = %d, want %d", in, got, want)
		}
	}
}
