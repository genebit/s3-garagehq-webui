package router

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"khairul169/garage-webui/utils"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

var (
	errNameTaken     = errors.New("name already taken")
	errSourceMissing = errors.New("the file or folder no longer exists")
)

// RenameObject renames a file, or a folder and everything in it, within its
// current folder. It never overwrites an existing file or folder.
func (b *Browse) RenameObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")
	key := r.PathValue("key")

	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.ResponseErrorStatus(w, err, http.StatusBadRequest)
		return
	}

	newKey, err := renameTarget(key, body.Name)
	if err != nil {
		utils.ResponseErrorStatus(w, err, http.StatusBadRequest)
		return
	}

	client, err := getS3Client(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	moved, err := renameObject(r.Context(), client, bucket, key, newKey)
	switch {
	case errors.Is(err, errNameTaken):
		utils.ResponseErrorStatus(w, fmt.Errorf("a file or folder named %q already exists", strings.TrimSpace(body.Name)), http.StatusConflict)
		return
	case errors.Is(err, errSourceMissing):
		utils.ResponseErrorStatus(w, err, http.StatusNotFound)
		return
	case err != nil:
		utils.ResponseError(w, fmt.Errorf("cannot rename %q: %w", key, err))
		return
	}

	utils.Audit(r, "INFO", fmt.Sprintf("User %s renamed %q to %q in bucket %q", utils.AuditUser(r), key, newKey, bucket), map[string]interface{}{
		"event":  "object_rename",
		"bucket": bucket,
		"key":    key,
		"newKey": newKey,
		"moved":  moved,
	})
	utils.ResponseSuccess(w, map[string]interface{}{"key": newKey, "moved": moved})
}

// renameTarget returns the key that renaming key to name produces: same
// parent folder, new last segment (folders keep their trailing "/").
func renameTarget(key, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == ".." || strings.Contains(name, "/") {
		return "", errors.New("enter a name without \"/\"")
	}

	isDir := strings.HasSuffix(key, "/")
	trimmed := strings.TrimSuffix(key, "/")
	parent := ""
	if i := strings.LastIndex(trimmed, "/"); i >= 0 {
		parent = trimmed[:i+1]
	}

	newKey := parent + name
	if isDir {
		newKey += "/"
	}
	if newKey == key {
		return "", errors.New("the new name is the same as the current one")
	}
	return newKey, nil
}

// renameObject moves key to newKey, refusing to overwrite. It returns the
// number of objects moved.
func renameObject(ctx context.Context, client s3API, bucket, key, newKey string) (int, error) {
	taken, err := keyExists(ctx, client, bucket, newKey)
	if err != nil {
		return 0, err
	}
	if taken {
		return 0, errNameTaken
	}

	if strings.HasSuffix(key, "/") {
		moved, err := moveObjectsWithPrefix(ctx, client, bucket, key, newKey)
		if err == nil && moved == 0 {
			return 0, errSourceMissing
		}
		return moved, err
	}

	head, err := client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if isNotFound(err) {
		return 0, errSourceMissing
	}
	if err != nil {
		return 0, err
	}
	if err := moveSingleObject(ctx, client, bucket, key, newKey, aws.ToInt64(head.ContentLength)); err != nil {
		return 0, err
	}
	return 1, nil
}

// keyExists reports whether an object exists at key or, for a folder key
// (trailing "/"), whether any object lives under it.
func keyExists(ctx context.Context, client s3API, bucket, key string) (bool, error) {
	if strings.HasSuffix(key, "/") {
		list, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:  aws.String(bucket),
			Prefix:  aws.String(key),
			MaxKeys: aws.Int32(1),
		})
		if err != nil {
			return false, err
		}
		return len(list.Contents) > 0, nil
	}

	_, err := client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if isNotFound(err) {
		return false, nil
	}
	return err == nil, err
}
