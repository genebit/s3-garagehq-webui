package router

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
	"net/http"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// hashPasswordOrRandom hashes the given password, or a random secret when empty
// so Google-only accounts have no usable password to sign in with.
func hashPasswordOrRandom(password string) (string, error) {
	if password == "" {
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			return "", err
		}
		password = hex.EncodeToString(b)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

type Users struct{}

func (c *Users) GetAll(w http.ResponseWriter, r *http.Request) {
	users := utils.Users.List()
	out := make([]schema.PublicUser, 0, len(users))
	for _, u := range users {
		out = append(out, u.Public())
	}
	utils.ResponseSuccess(w, out)
}

func (c *Users) Create(w http.ResponseWriter, r *http.Request) {
	current, ok := utils.GetCurrentUser(r)
	if !ok {
		utils.ResponseErrorStatus(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}

	var body struct {
		Username string   `json:"username"`
		Email    string   `json:"email"`
		Password string   `json:"password"`
		Role     string   `json:"role"`
		Buckets  []string `json:"buckets"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.ResponseError(w, err)
		return
	}

	username := strings.TrimSpace(body.Username)
	email := strings.ToLower(strings.TrimSpace(body.Email))
	role := schema.Role(body.Role)

	if username == "" {
		utils.ResponseErrorStatus(w, errors.New("username is required"), http.StatusBadRequest)
		return
	}
	if !role.IsValid() {
		utils.ResponseErrorStatus(w, errors.New("invalid role"), http.StatusBadRequest)
		return
	}
	// A user needs at least one way to sign in.
	if body.Password == "" && email == "" {
		utils.ResponseErrorStatus(w, errors.New("provide a password or an email for Google sign-in"), http.StatusBadRequest)
		return
	}
	if body.Password != "" && len(body.Password) < 6 {
		utils.ResponseErrorStatus(w, errors.New("password must be at least 6 characters"), http.StatusBadRequest)
		return
	}
	// Only owners may create other owners.
	if role == schema.RoleOwner && current.Role != schema.RoleOwner {
		utils.ResponseErrorStatus(w, errors.New("only an owner can create owner accounts"), http.StatusForbidden)
		return
	}

	passwordHash, err := hashPasswordOrRandom(body.Password)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	buckets := body.Buckets
	if role != schema.RoleDeveloper {
		buckets = []string{}
	}

	user, err := utils.Users.Create(schema.User{
		Username:     username,
		Email:        email,
		PasswordHash: passwordHash,
		Role:         role,
		Buckets:      buckets,
	})
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	utils.Audit(r, "INFO", fmt.Sprintf("%s created a %s account %q", current.Username, role, user.Username), map[string]interface{}{
		"event":      "user_create",
		"target":     user.Username,
		"targetRole": string(role),
	})
	utils.ResponseSuccess(w, user.Public())
}

func (c *Users) Update(w http.ResponseWriter, r *http.Request) {
	current, ok := utils.GetCurrentUser(r)
	if !ok {
		utils.ResponseErrorStatus(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	target, ok := utils.Users.GetByID(id)
	if !ok {
		utils.ResponseErrorStatus(w, errors.New("user not found"), http.StatusNotFound)
		return
	}

	// Admins cannot modify owner accounts.
	if target.Role == schema.RoleOwner && current.Role != schema.RoleOwner {
		utils.ResponseErrorStatus(w, errors.New("only an owner can modify owner accounts"), http.StatusForbidden)
		return
	}

	var body struct {
		Username *string   `json:"username"`
		Email    *string   `json:"email"`
		Password *string   `json:"password"`
		Role     *string   `json:"role"`
		Buckets  *[]string `json:"buckets"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.ResponseError(w, err)
		return
	}

	// Only owners may promote users to owner.
	if body.Role != nil && schema.Role(*body.Role) == schema.RoleOwner && current.Role != schema.RoleOwner {
		utils.ResponseErrorStatus(w, errors.New("only an owner can assign the owner role"), http.StatusForbidden)
		return
	}
	// Prevent demoting the last owner.
	if body.Role != nil && target.Role == schema.RoleOwner && schema.Role(*body.Role) != schema.RoleOwner &&
		utils.Users.CountByRole(schema.RoleOwner) <= 1 {
		utils.ResponseErrorStatus(w, errors.New("cannot demote the last owner"), http.StatusBadRequest)
		return
	}

	updated, err := utils.Users.Update(id, func(u *schema.User) error {
		if body.Username != nil {
			username := strings.TrimSpace(*body.Username)
			if username == "" {
				return errors.New("username is required")
			}
			u.Username = username
		}
		if body.Email != nil {
			u.Email = strings.ToLower(strings.TrimSpace(*body.Email))
		}
		if body.Role != nil {
			role := schema.Role(*body.Role)
			if !role.IsValid() {
				return errors.New("invalid role")
			}
			u.Role = role
		}
		if body.Buckets != nil {
			u.Buckets = *body.Buckets
		}
		if u.Role != schema.RoleDeveloper {
			u.Buckets = []string{}
		}
		if body.Password != nil && *body.Password != "" {
			if len(*body.Password) < 6 {
				return errors.New("password must be at least 6 characters")
			}
			hash, err := bcrypt.GenerateFromPassword([]byte(*body.Password), bcrypt.DefaultCost)
			if err != nil {
				return err
			}
			u.PasswordHash = string(hash)
		}
		return nil
	})
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	utils.Audit(r, "INFO", fmt.Sprintf("%s updated account %q", current.Username, updated.Username), map[string]interface{}{
		"event":  "user_update",
		"target": updated.Username,
	})
	utils.ResponseSuccess(w, updated.Public())
}

func (c *Users) Delete(w http.ResponseWriter, r *http.Request) {
	current, ok := utils.GetCurrentUser(r)
	if !ok {
		utils.ResponseErrorStatus(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	target, ok := utils.Users.GetByID(id)
	if !ok {
		utils.ResponseErrorStatus(w, errors.New("user not found"), http.StatusNotFound)
		return
	}

	if target.ID == current.ID {
		utils.ResponseErrorStatus(w, errors.New("you cannot delete your own account"), http.StatusBadRequest)
		return
	}
	if target.Role == schema.RoleOwner && current.Role != schema.RoleOwner {
		utils.ResponseErrorStatus(w, errors.New("only an owner can delete owner accounts"), http.StatusForbidden)
		return
	}
	if target.Role == schema.RoleOwner && utils.Users.CountByRole(schema.RoleOwner) <= 1 {
		utils.ResponseErrorStatus(w, errors.New("cannot delete the last owner"), http.StatusBadRequest)
		return
	}

	if err := utils.Users.Delete(id); err != nil {
		utils.ResponseError(w, err)
		return
	}

	utils.Audit(r, "INFO", fmt.Sprintf("%s deleted account %q", current.Username, target.Username), map[string]interface{}{
		"event":  "user_delete",
		"target": target.Username,
	})
	utils.ResponseSuccess(w, true)
}
