package router

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
	"net/http"
	"net/url"
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
		Objects:   []schema.BrowserObject{},
		Prefix:    prefix,
		NextToken: objects.NextContinuationToken,
	}

	for _, prefix := range objects.CommonPrefixes {
		result.Prefixes = append(result.Prefixes, *prefix.Prefix)
	}

	for _, object := range objects.Contents {
		key := strings.TrimPrefix(*object.Key, prefix)
		if key == "" {
			continue
		}

		result.Objects = append(result.Objects, schema.BrowserObject{
			ObjectKey:    &key,
			LastModified: object.LastModified,
			Size:         object.Size,
			Url:          fmt.Sprintf("/browse/%s/%s", bucket, *object.Key),
		})
	}

	utils.ResponseSuccess(w, result)
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
			utils.ResponseError(w, err)
		}
		utils.ResponseSuccess(w, object)
		return
	}

	object, err := client.GetObject(context.Background(), &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})

	if err != nil {
		var ae smithy.APIError
		if errors.As(err, &ae) && ae.ErrorCode() == "NoSuchKey" {
			utils.ResponseErrorStatus(w, err, http.StatusNotFound)
			return
		}

		utils.ResponseError(w, err)
		return
	}

	defer object.Body.Close()
	keys := strings.Split(key, "/")

	if download {
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", keys[len(keys)-1]))
	} else if thumbnail {
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

	w.Header().Set("Cache-Control", "max-age=86400")
	w.Header().Set("Last-Modified", object.LastModified.Format(time.RFC1123))

	if object.ContentType != nil {
		w.Header().Set("Content-Type", *object.ContentType)
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	if object.ContentLength != nil {
		w.Header().Set("Content-Length", strconv.FormatInt(*object.ContentLength, 10))
	}
	if object.ETag != nil {
		w.Header().Set("Etag", *object.ETag)
	}

	_, err = io.Copy(w, object.Body)

	if err != nil {
		utils.ResponseError(w, err)
		return
	}
}

func (b *Browse) PutObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")
	key := r.PathValue("key")
	isDirectory := strings.HasSuffix(key, "/")

	file, headers, err := r.FormFile("file")
	if err != nil && !isDirectory {
		utils.ResponseError(w, err)
		return
	}

	if file != nil {
		defer file.Close()
	}
	// Large uploads spill to a temp file on disk; Go does not delete it
	// automatically, so clean it up once the request is done either way.
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	client, err := getS3Client(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	var contentType string = ""
	var size int64 = 0

	if file != nil {
		contentType = headers.Header.Get("Content-Type")
		size = headers.Size
	}

	result, err := client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:        aws.String(bucket),
		Key:           aws.String(key),
		Body:          file,
		ContentLength: aws.Int64(size),
		ContentType:   aws.String(contentType),
	})

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

	utils.ResponseSuccess(w, result)
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
		objects, err := client.ListObjectsV2(context.Background(), &s3.ListObjectsV2Input{
			Bucket: aws.String(bucket),
			Prefix: aws.String(key),
		})

		if err != nil {
			utils.ResponseError(w, err)
			return
		}

		if len(objects.Contents) == 0 {
			utils.ResponseSuccess(w, true)
			return
		}

		keys := make([]types.ObjectIdentifier, 0, len(objects.Contents))

		for _, object := range objects.Contents {
			keys = append(keys, types.ObjectIdentifier{
				Key: object.Key,
			})
		}

		res, err := client.DeleteObjects(context.Background(), &s3.DeleteObjectsInput{
			Bucket: aws.String(bucket),
			Delete: &types.Delete{Objects: keys},
		})

		if err != nil {
			utils.ResponseError(w, fmt.Errorf("cannot delete object: %w", err))
			return
		}

		if len(res.Errors) > 0 {
			utils.ResponseError(w, fmt.Errorf("cannot delete object: %v", res.Errors[0]))
			return
		}

		utils.Audit(r, "INFO", fmt.Sprintf("User %s deleted folder %q (%d object(s)) from bucket %q", utils.AuditUser(r), key, len(keys), bucket), map[string]interface{}{
			"event":  "object_delete_folder",
			"bucket": bucket,
			"key":    key,
			"count":  len(keys),
		})

		utils.ResponseSuccess(w, res)
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
		if err := moveSingleObject(ctx, client, bucket, item, newKey); err != nil {
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

func moveSingleObject(ctx context.Context, client *s3.Client, bucket, key, newKey string) error {
	_, err := client.CopyObject(ctx, &s3.CopyObjectInput{
		Bucket:     aws.String(bucket),
		CopySource: aws.String(url.PathEscape(bucket + "/" + key)),
		Key:        aws.String(newKey),
	})
	if err != nil {
		return err
	}

	_, err = client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	return err
}

func moveObjectsWithPrefix(ctx context.Context, client *s3.Client, bucket, prefix, destPrefix string) (int, error) {
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
			if err := moveSingleObject(ctx, client, bucket, key, newKey); err != nil {
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

	// Determine endpoint and whether to disable HTTPS
	endpoint := utils.Garage.GetS3Endpoint()
	disableHTTPS := !strings.HasPrefix(endpoint, "https://")

	// AWS config without BaseEndpoint
	awsConfig := aws.Config{
		Credentials: creds,
		Region:      utils.Garage.GetS3Region(),
	}

	// Build S3 client with custom endpoint resolver for proper signing
	client := s3.NewFromConfig(awsConfig, func(o *s3.Options) {
		o.UsePathStyle = true
		o.EndpointOptions.DisableHTTPS = disableHTTPS
		o.EndpointResolver = s3.EndpointResolverFunc(func(region string, opts s3.EndpointResolverOptions) (aws.Endpoint, error) {
			return aws.Endpoint{
				URL:           endpoint,
				SigningRegion: utils.Garage.GetS3Region(),
			}, nil
		})
	})

	return client, nil
}
