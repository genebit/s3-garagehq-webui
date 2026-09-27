package router

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
	"log"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

type Browse struct{}

func (b *Browse) GetObjects(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	bucket := r.PathValue("bucket")
	prefix := query.Get("prefix")
	continuationToken := query.Get("next")

	limit, err := strconv.Atoi(query.Get("limit"))
	if err != nil {
		limit = 100
	}

	client, err := getS3Client(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	if search := strings.TrimSpace(query.Get("search")); search != "" {
		result, err := searchObjects(r.Context(), client, bucket, prefix, search, continuationToken, limit)
		if err != nil {
			utils.ResponseError(w, err)
			return
		}
		utils.ResponseSuccess(w, result)
		return
	}

	objects, err := client.ListObjectsV2(context.Background(), &s3.ListObjectsV2Input{
		Bucket:            aws.String(bucket),
		Prefix:            aws.String(prefix),
		Delimiter:         aws.String("/"),
		MaxKeys:           aws.Int32(int32(limit)),
		ContinuationToken: aws.String(continuationToken),
	})

	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	result := schema.BrowseObjectResult{
		Prefixes:  []string{},
		Objects:   toBrowserObjects(bucket, prefix, objects.Contents),
		Prefix:    prefix,
		NextToken: objects.NextContinuationToken,
	}

	for _, prefix := range objects.CommonPrefixes {
		result.Prefixes = append(result.Prefixes, *prefix.Prefix)
	}

	utils.ResponseSuccess(w, result)
}

// toBrowserObjects converts S3 objects to browser rows, with keys made
// relative to prefix. The folder's own marker object (empty name) is skipped.
func toBrowserObjects(bucket, prefix string, objects []types.Object) []schema.BrowserObject {
	out := []schema.BrowserObject{}
	for _, object := range objects {
		key := strings.TrimPrefix(*object.Key, prefix)
		if key == "" {
			continue
		}
		out = append(out, schema.BrowserObject{
			ObjectKey:    &key,
			LastModified: object.LastModified,
			Size:         object.Size,
			Url:          fmt.Sprintf("/browse/%s/%s", bucket, *object.Key),
		})
	}
	return out
}

func (b *Browse) GetOneObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")
	key := r.PathValue("key")
	queryParams := r.URL.Query()
	view := queryParams.Get("view") == "1"
	thumbnail := queryParams.Get("thumb") == "1"
	download := queryParams.Get("dl") == "1"

	client, err := getS3Client(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	if !view && !download && !thumbnail {
		object, err := client.HeadObject(context.Background(), &s3.HeadObjectInput{
			Bucket: aws.String(bucket),
			Key:    aws.String(key),
		})
		if err != nil {
			if isNotFound(err) {
				utils.ResponseErrorStatus(w, err, http.StatusNotFound)
			} else {
				utils.ResponseError(w, err)
			}
			return
		}
		utils.ResponseSuccess(w, object)
		return
	}

	input := &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}
	// Pass ranged reads through so video/audio previews can seek.
	if rng := r.Header.Get("Range"); rng != "" && !thumbnail {
		input.Range = aws.String(rng)
	}
	object, err := client.GetObject(r.Context(), input)

	if err != nil {
		var ae smithy.APIError
		if errors.As(err, &ae) && ae.ErrorCode() == "NoSuchKey" {
			utils.ResponseErrorStatus(w, err, http.StatusNotFound)
			return
		}
		if errors.As(err, &ae) && ae.ErrorCode() == "InvalidRange" {
			utils.ResponseErrorStatus(w, err, http.StatusRequestedRangeNotSatisfiable)
			return
		}

		utils.ResponseError(w, err)
		return
	}

	defer object.Body.Close()
	keys := strings.Split(key, "/")

	if thumbnail {
		body, err := io.ReadAll(object.Body)
		if err != nil {
			utils.ResponseError(w, err)
			return
		}

		thumb, err := utils.CreateThumbnailImage(body, 64, 64)
		if err != nil {

			utils.ResponseError(w, err)
			return
		}

		w.Header().Set("Content-Type", "image/png")
		w.Write(thumb)
		return
	}

	w.WriteHeader(writeObjectHeaders(w.Header(), object, keys[len(keys)-1], download))
	// Headers are already sent, so a failed copy (usually the client going
	// away) can only be logged.
	if _, err := io.Copy(w, object.Body); err != nil {
		log.Printf("Cannot send %s/%s: %v", bucket, key, err)
	}
}

func (b *Browse) PutObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")
	key := r.PathValue("key")
	isDirectory := strings.HasSuffix(key, "/")

	// The request body is the raw object, streamed straight through to Garage
	// so large files never have to fit in memory or on local disk.
	size := r.ContentLength
	if isDirectory {
		size = 0
	} else if size < 0 {
		utils.ResponseErrorStatus(w, errors.New("missing Content-Length"), http.StatusLengthRequired)
		return
	} else if size > maxObjectSize {
		utils.ResponseErrorStatus(w, fmt.Errorf("file is larger than the %s limit", "5 TiB"), http.StatusRequestEntityTooLarge)
		return
	}

	client, err := getS3Client(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	input := &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}
	if contentType := r.Header.Get("Content-Type"); contentType != "" {
		input.ContentType = aws.String(contentType)
	}

	if isDirectory {
		input.Body = strings.NewReader("")
		input.ContentLength = aws.Int64(0)
		_, err = client.PutObject(r.Context(), input)
	} else {
		input.Body = r.Body
		err = uploadObject(r.Context(), client, input, size)
	}

	if err != nil {
		utils.ResponseError(w, fmt.Errorf("cannot put object: %w", err))
		return
	}

	if isDirectory {
		utils.Audit(r, "INFO", fmt.Sprintf("User %s created folder %q in bucket %q", utils.AuditUser(r), key, bucket), map[string]interface{}{
			"event":  "object_create_folder",
			"bucket": bucket,
			"key":    key,
		})
	} else {
		utils.Audit(r, "INFO", fmt.Sprintf("User %s uploaded %q to bucket %q", utils.AuditUser(r), key, bucket), map[string]interface{}{
			"event":  "object_upload",
			"bucket": bucket,
			"key":    key,
			"size":   size,
		})
	}

	utils.ResponseSuccess(w, map[string]interface{}{"key": key, "size": size})
}

func (b *Browse) DeleteObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")
	key := r.PathValue("key")
	recursive := r.URL.Query().Get("recursive") == "true"
	isDirectory := strings.HasSuffix(key, "/")

	client, err := getS3Client(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	// Delete directory and its content
	if isDirectory && recursive {
		count, err := deleteObjectsWithPrefix(r.Context(), client, bucket, key)
		if err != nil {
			utils.ResponseError(w, fmt.Errorf("cannot delete folder: %w", err))
			return
		}

		utils.Audit(r, "INFO", fmt.Sprintf("User %s deleted folder %q (%d object(s)) from bucket %q", utils.AuditUser(r), key, count, bucket), map[string]interface{}{
			"event":  "object_delete_folder",
			"bucket": bucket,
			"key":    key,
			"count":  count,
		})

		utils.ResponseSuccess(w, map[string]int{"deleted": count})
		return
	}

	// Delete single object
	res, err := client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})

	if err != nil {
		utils.ResponseError(w, fmt.Errorf("cannot delete object: %w", err))
		return
	}

	utils.Audit(r, "INFO", fmt.Sprintf("User %s deleted %q from bucket %q", utils.AuditUser(r), key, bucket), map[string]interface{}{
		"event":  "object_delete",
		"bucket": bucket,
		"key":    key,
	})

	utils.ResponseSuccess(w, res)
}

// MoveObjects moves files and folders to another (possibly nested) prefix in
// the same bucket. S3 has no native move, so this copies then deletes.
func (b *Browse) MoveObjects(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")

	var body struct {
		Items       []string `json:"items"`
		Destination string   `json:"destination"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.ResponseError(w, err)
		return
	}

	dest := strings.TrimPrefix(body.Destination, "/")
	if dest != "" && !strings.HasSuffix(dest, "/") {
		dest += "/"
	}
	if len(body.Items) == 0 {
		utils.ResponseErrorStatus(w, errors.New("no items to move"), http.StatusBadRequest)
		return
	}

	client, err := getS3Client(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	ctx := context.Background()
	moved := 0

	for _, item := range body.Items {
		if item == "" {
			continue
		}

		if strings.HasSuffix(item, "/") {
			// Prevent moving a folder into itself or its own subtree.
			if strings.HasPrefix(dest, item) {
				utils.ResponseErrorStatus(w, fmt.Errorf("cannot move folder %q into itself", item), http.StatusBadRequest)
				return
			}

			folderName := lastSegment(strings.TrimSuffix(item, "/")) + "/"
			n, err := moveObjectsWithPrefix(ctx, client, bucket, item, dest+folderName)
			if err != nil {
				utils.ResponseError(w, fmt.Errorf("cannot move folder %q: %w", item, err))
				return
			}
			moved += n
			continue
		}

		newKey := dest + lastSegment(item)
		if newKey == item {
			continue
		}
		if err := moveSingleObject(ctx, client, bucket, item, newKey, -1); err != nil {
			utils.ResponseError(w, fmt.Errorf("cannot move %q: %w", item, err))
			return
		}
		moved++
	}

	utils.Audit(r, "INFO", fmt.Sprintf("User %s moved %d item(s) in bucket %q to %q", utils.AuditUser(r), moved, bucket, destinationLabel(dest)), map[string]interface{}{
		"event":       "object_move",
		"bucket":      bucket,
		"items":       body.Items,
		"destination": dest,
		"moved":       moved,
	})

	utils.ResponseSuccess(w, map[string]int{"moved": moved})
}

func destinationLabel(dest string) string {
	if dest == "" {
		return "/ (root)"
	}
	return "/" + dest
}

func lastSegment(key string) string {
	if idx := strings.LastIndex(key, "/"); idx >= 0 {
		return key[idx+1:]
	}
	return key
}

func getBucketCredentials(bucket string) (aws.CredentialsProvider, error) {
	cacheKey := fmt.Sprintf("key:%s", bucket)
	cacheData := utils.Cache.Get(cacheKey)

	if cacheData != nil {
		return cacheData.(aws.CredentialsProvider), nil
	}

	body, err := utils.Garage.Fetch("/v2/GetBucketInfo?globalAlias="+bucket, &utils.FetchOptions{})
	if err != nil {
		return nil, err
	}

	var bucketData schema.Bucket
	if err := json.Unmarshal(body, &bucketData); err != nil {
		return nil, err
	}

	var key schema.KeyElement

	for _, k := range bucketData.Keys {
		if !k.Permissions.Read || !k.Permissions.Write {
			continue
		}

		body, err := utils.Garage.Fetch(fmt.Sprintf("/v2/GetKeyInfo?id=%s&showSecretKey=true", k.AccessKeyID), &utils.FetchOptions{})
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(body, &key); err != nil {
			return nil, err
		}
		break
	}

	// Without a granted read+write key there is nothing to build credentials
	// from; returning an error here (instead of caching an empty credential)
	// lets the bucket start working immediately once a key is granted.
	if key.AccessKeyID == "" {
		return nil, errors.New("no key with read & write access is granted to this bucket")
	}

	credential := credentials.NewStaticCredentialsProvider(key.AccessKeyID, key.SecretAccessKey, "")
	utils.Cache.Set(cacheKey, credential, time.Hour)

	return credential, nil
}

func getS3Client(bucket string) (*s3.Client, error) {
	creds, err := getBucketCredentials(bucket)
	if err != nil {
		return nil, fmt.Errorf("cannot get credentials for bucket %s: %w", bucket, err)
	}

	return newS3Client(utils.Garage.GetS3Endpoint(), utils.Garage.GetS3Region(), creds), nil
}

// writeObjectHeaders copies an object's metadata onto the response and
// returns the status to send: 206 for a ranged read, 200 otherwise.
func writeObjectHeaders(h http.Header, object *s3.GetObjectOutput, filename string, download bool) int {
	if download {
		h.Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	}
	h.Set("Cache-Control", "max-age=86400")
	h.Set("Accept-Ranges", "bytes")
	if object.LastModified != nil {
		h.Set("Last-Modified", object.LastModified.UTC().Format(http.TimeFormat))
	}
	if object.ContentType != nil {
		h.Set("Content-Type", *object.ContentType)
	} else {
		h.Set("Content-Type", "application/octet-stream")
	}
	if object.ContentLength != nil {
		h.Set("Content-Length", strconv.FormatInt(*object.ContentLength, 10))
	}
	if object.ETag != nil {
		h.Set("Etag", *object.ETag)
	}
	if object.ContentRange != nil {
		h.Set("Content-Range", *object.ContentRange)
		return http.StatusPartialContent
	}
	return http.StatusOK
}
