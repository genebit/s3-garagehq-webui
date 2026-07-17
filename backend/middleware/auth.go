package middleware

import (
	"encoding/json"
	"errors"
	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var errForbidden = errors.New("you do not have permission to access this resource")

func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := utils.GetCurrentUser(r)
		if !ok {
			utils.ResponseErrorStatus(w, errors.New("unauthorized"), http.StatusUnauthorized)
			return
		}

		if err := authorize(user, r); err != nil {
			utils.ResponseErrorStatus(w, err, http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func authorize(user schema.User, r *http.Request) error {
	// Owners and admins have full access to cluster resources. Fine-grained
	// owner-vs-admin rules for user management are enforced in the handlers.
	if user.Role.CanManage() {
		return nil
	}

	if user.Role == schema.RoleDeveloper {
		return authorizeDeveloper(user, r)
	}

	return errForbidden
}

// authorizeDeveloper restricts developers to object-level access on the buckets
// assigned to them, plus read-only info for those buckets.
func authorizeDeveloper(user schema.User, r *http.Request) error {
	path := r.URL.Path
	method := r.Method

	switch {
	// Listing buckets is allowed; the handler filters to assigned buckets.
	case method == http.MethodGet && path == "/buckets":
		return nil

	// Object browser (list/get/put/delete) on assigned buckets only.
	case strings.HasPrefix(path, "/browse/"):
		bucket := bucketFromBrowsePath(path)
		if bucket != "" && developerCanAccessBucket(user, bucket) {
			return nil
		}
		return errForbidden

	// Read-only bucket info for assigned buckets.
	case method == http.MethodGet && path == "/v2/GetBucketInfo":
		if developerCanAccessBucketQuery(user, r) {
			return nil
		}
		return errForbidden

	// Read-only key info (incl. secret) for keys granting access to an
	// assigned bucket, so developers can use their buckets programmatically.
	case method == http.MethodGet && path == "/v2/GetKeyInfo":
		if developerCanAccessKey(user, r.URL.Query().Get("id")) {
			return nil
		}
		return errForbidden
	}

	return errForbidden
}

func bucketFromBrowsePath(path string) string {
	// path looks like "/browse/{bucket}" or "/browse/{bucket}/{key...}"
	rest := strings.TrimPrefix(path, "/browse/")
	if rest == "" {
		return ""
	}
	name := rest
	if idx := strings.Index(rest, "/"); idx >= 0 {
		name = rest[:idx]
	}
	if decoded, err := url.PathUnescape(name); err == nil {
		return decoded
	}
	return name
}

func developerCanAccessBucket(user schema.User, aliasOrID string) bool {
	// Assignment is stored by bucket id; accept a direct id match first.
	if user.HasBucket(aliasOrID) {
		return true
	}
	id, err := resolveBucketID(aliasOrID)
	if err != nil {
		return false
	}
	return user.HasBucket(id)
}

func developerCanAccessBucketQuery(user schema.User, r *http.Request) bool {
	query := r.URL.Query()
	if id := query.Get("id"); id != "" {
		return user.HasBucket(id)
	}
	if alias := query.Get("globalAlias"); alias != "" {
		return developerCanAccessBucket(user, alias)
	}
	return false
}

// developerCanAccessKey reports whether the key grants access to any of the
// developer's assigned buckets.
func developerCanAccessKey(user schema.User, keyID string) bool {
	if keyID == "" {
		return false
	}
	for _, bucketID := range user.Buckets {
		ids, err := bucketKeyIDs(bucketID)
		if err != nil {
			continue
		}
		for _, id := range ids {
			if id == keyID {
				return true
			}
		}
	}
	return false
}

// bucketKeyIDs returns the access key ids that have permissions on a bucket,
// caching the result briefly since grants can change.
func bucketKeyIDs(bucketID string) ([]string, error) {
	cacheKey := "bucketkeys:" + bucketID
	if cached := utils.Cache.Get(cacheKey); cached != nil {
		return cached.([]string), nil
	}

	body, err := utils.Garage.Fetch("/v2/GetBucketInfo?id="+url.QueryEscape(bucketID), &utils.FetchOptions{})
	if err != nil {
		return nil, err
	}

	var info struct {
		Keys []struct {
			AccessKeyID string `json:"accessKeyId"`
		} `json:"keys"`
	}
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(info.Keys))
	for _, k := range info.Keys {
		ids = append(ids, k.AccessKeyID)
	}

	utils.Cache.Set(cacheKey, ids, 5*time.Minute)
	return ids, nil
}

// resolveBucketID maps a global alias to its bucket id via the Garage admin API,
// caching the result to avoid repeating the lookup on every request.
func resolveBucketID(alias string) (string, error) {
	cacheKey := "bucketid:" + alias
	if cached := utils.Cache.Get(cacheKey); cached != nil {
		return cached.(string), nil
	}

	body, err := utils.Garage.Fetch("/v2/GetBucketInfo?globalAlias="+url.QueryEscape(alias), &utils.FetchOptions{})
	if err != nil {
		return "", err
	}

	var info struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &info); err != nil {
		return "", err
	}
	if info.ID == "" {
		return "", errors.New("bucket not found")
	}

	utils.Cache.Set(cacheKey, info.ID, time.Hour)
	return info.ID, nil
}
