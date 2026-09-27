package router

import (
	"context"
	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

var (
	// searchScanLimit caps how many folder entries one search reads.
	searchScanLimit = 50000
	searchCacheTTL  = 30 * time.Second
)

// searchTokenPrefix marks a search page token (an offset into the matches),
// so it can't be confused with an S3 continuation token.
const searchTokenPrefix = "s:"

type searchMatches struct {
	Prefixes  []string
	Objects   []types.Object
	Truncated bool
}

// searchFolder lists every entry directly under prefix and keeps the ones
// whose name (the key without prefix) contains term, ignoring case.
func searchFolder(ctx context.Context, client s3API, bucket, prefix, term string) (*searchMatches, error) {
	needle := strings.ToLower(term)
	matches := &searchMatches{}
	scanned := 0
	var token *string

	for {
		list, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(bucket),
			Prefix:            aws.String(prefix),
			Delimiter:         aws.String("/"),
			ContinuationToken: token,
		})
		if err != nil {
			return nil, err
		}

		for _, p := range list.CommonPrefixes {
			name := strings.TrimSuffix(strings.TrimPrefix(aws.ToString(p.Prefix), prefix), "/")
			if strings.Contains(strings.ToLower(name), needle) {
				matches.Prefixes = append(matches.Prefixes, aws.ToString(p.Prefix))
			}
		}
		for _, o := range list.Contents {
			name := strings.TrimPrefix(aws.ToString(o.Key), prefix)
			if name != "" && strings.Contains(strings.ToLower(name), needle) {
				matches.Objects = append(matches.Objects, o)
			}
		}
		scanned += len(list.CommonPrefixes) + len(list.Contents)

		if !aws.ToBool(list.IsTruncated) {
			return matches, nil
		}
		if scanned >= searchScanLimit {
			matches.Truncated = true
			return matches, nil
		}
		token = list.NextContinuationToken
	}
}

// searchObjects answers one page of a folder search. The full match list is
// cached briefly so paging through results doesn't re-list the folder; a new
// search (no page token) always re-lists.
func searchObjects(ctx context.Context, client s3API, bucket, prefix, term, next string, limit int) (schema.BrowseObjectResult, error) {
	cacheKey := "search:" + bucket + "\x00" + prefix + "\x00" + strings.ToLower(term)
	offset := parseSearchToken(next)

	matches, _ := utils.Cache.Get(cacheKey).(*searchMatches)
	if matches == nil || offset == 0 {
		found, err := searchFolder(ctx, client, bucket, prefix, term)
		if err != nil {
			return schema.BrowseObjectResult{}, err
		}
		matches = found
		utils.Cache.Set(cacheKey, matches, searchCacheTTL)
	}

	return searchPage(bucket, prefix, matches, offset, limit), nil
}

func parseSearchToken(next string) int {
	if !strings.HasPrefix(next, searchTokenPrefix) {
		return 0
	}
	n, err := strconv.Atoi(strings.TrimPrefix(next, searchTokenPrefix))
	if err != nil || n < 0 {
		return 0
	}
	return n
}

// searchPage slices one page out of the matches: folders first, then files,
// the same order as a normal listing.
func searchPage(bucket, prefix string, matches *searchMatches, offset, limit int) schema.BrowseObjectResult {
	if limit <= 0 {
		limit = 100
	}
	nPrefixes := len(matches.Prefixes)
	total := nPrefixes + len(matches.Objects)
	offset = min(offset, total)
	end := min(offset+limit, total)

	res := schema.BrowseObjectResult{
		Prefixes:  []string{},
		Objects:   []schema.BrowserObject{},
		Prefix:    prefix,
		Truncated: matches.Truncated,
	}
	if offset < nPrefixes {
		res.Prefixes = append(res.Prefixes, matches.Prefixes[offset:min(end, nPrefixes)]...)
	}
	if end > nPrefixes {
		res.Objects = toBrowserObjects(bucket, prefix, matches.Objects[max(offset-nPrefixes, 0):end-nPrefixes])
	}
	if end < total {
		res.NextToken = aws.String(searchTokenPrefix + strconv.Itoa(end))
	}
	return res
}
