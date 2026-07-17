package utils

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"khairul169/garage-webui/schema"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// LegacyUserID is the synthetic id used when a client authenticates via the
// legacy AUTH_USER_PASS environment variable instead of the user store.
const LegacyUserID = "__legacy__"

type UserStore struct {
	path  string
	mu    sync.RWMutex
	users []schema.User
}

var Users *UserStore

func InitUserStore() {
	path := GetEnv("USERS_PATH", "/data/users.json")
	Users = &UserStore{path: path}
	if err := Users.load(); err != nil {
		log.Println("Cannot load user store!", err)
	}
}

func generateID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return time.Now().Format("20060102150405.000000000")
	}
	return hex.EncodeToString(b)
}

func (s *UserStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			s.users = []schema.User{}
			return nil
		}
		return err
	}

	return json.Unmarshal(data, &s.users)
}

// save persists the store to disk. Callers must hold the write lock.
func (s *UserStore) save() error {
	if dir := filepath.Dir(s.path); dir != "" {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return err
		}
	}

	data, err := json.MarshalIndent(s.users, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.path, data, 0o600)
}

func (s *UserStore) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.users)
}

func (s *UserStore) CountByRole(role schema.Role) int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	count := 0
	for _, u := range s.users {
		if u.Role == role {
			count++
		}
	}
	return count
}

func (s *UserStore) List() []schema.User {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]schema.User, len(s.users))
	copy(out, s.users)
	return out
}

func (s *UserStore) GetByID(id string) (schema.User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, u := range s.users {
		if u.ID == id {
			return u, true
		}
	}
	return schema.User{}, false
}

func (s *UserStore) GetByUsername(username string) (schema.User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, u := range s.users {
		if strings.EqualFold(u.Username, username) {
			return u, true
		}
	}
	return schema.User{}, false
}

func (s *UserStore) GetByEmail(email string) (schema.User, bool) {
	email = strings.TrimSpace(email)
	if email == "" {
		return schema.User{}, false
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, u := range s.users {
		if u.Email != "" && strings.EqualFold(u.Email, email) {
			return u, true
		}
	}
	return schema.User{}, false
}

func (s *UserStore) Create(user schema.User) (schema.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, u := range s.users {
		if strings.EqualFold(u.Username, user.Username) {
			return schema.User{}, errors.New("username already exists")
		}
		if user.Email != "" && strings.EqualFold(u.Email, user.Email) {
			return schema.User{}, errors.New("email already in use")
		}
	}

	if user.ID == "" {
		user.ID = generateID()
	}
	if user.CreatedAt.IsZero() {
		user.CreatedAt = time.Now()
	}
	if user.Buckets == nil {
		user.Buckets = []string{}
	}

	s.users = append(s.users, user)
	if err := s.save(); err != nil {
		s.users = s.users[:len(s.users)-1]
		return schema.User{}, err
	}

	return user, nil
}

// Update applies fn to a copy of the stored user, validates username uniqueness,
// then persists. fn should mutate the provided user in place.
func (s *UserStore) Update(id string, fn func(*schema.User) error) (schema.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.users {
		if s.users[i].ID != id {
			continue
		}

		updated := s.users[i]
		if err := fn(&updated); err != nil {
			return schema.User{}, err
		}

		for j := range s.users {
			if j == i {
				continue
			}
			if strings.EqualFold(s.users[j].Username, updated.Username) {
				return schema.User{}, errors.New("username already exists")
			}
			if updated.Email != "" && strings.EqualFold(s.users[j].Email, updated.Email) {
				return schema.User{}, errors.New("email already in use")
			}
		}

		if updated.Buckets == nil {
			updated.Buckets = []string{}
		}

		old := s.users[i]
		s.users[i] = updated
		if err := s.save(); err != nil {
			s.users[i] = old
			return schema.User{}, err
		}
		return updated, nil
	}

	return schema.User{}, errors.New("user not found")
}

func (s *UserStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.users {
		if s.users[i].ID != id {
			continue
		}

		old := s.users
		s.users = append(s.users[:i:i], s.users[i+1:]...)
		if err := s.save(); err != nil {
			s.users = old
			return err
		}
		return nil
	}

	return errors.New("user not found")
}

// GetCurrentUser resolves the authenticated user from the request session.
// It returns a synthetic owner for legacy AUTH_USER_PASS sessions.
func GetCurrentUser(r *http.Request) (schema.User, bool) {
	idVal := Session.Get(r, "userId")
	if idVal == nil {
		return schema.User{}, false
	}

	id, ok := idVal.(string)
	if !ok || id == "" {
		return schema.User{}, false
	}

	if id == LegacyUserID {
		username := strings.Split(GetEnv("AUTH_USER_PASS", ""), ":")[0]
		return schema.User{
			ID:       LegacyUserID,
			Username: username,
			Role:     schema.RoleOwner,
			Buckets:  []string{},
		}, true
	}

	return Users.GetByID(id)
}
