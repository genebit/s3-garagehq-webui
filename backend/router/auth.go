package router

import (
	"encoding/json"
	"errors"
	"fmt"
	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
	"net/http"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

type Auth struct{}

// legacyEnabled reports whether the deprecated single-user AUTH_USER_PASS
// mechanism should be honored (only while the user store is empty).
func legacyEnabled() bool {
	return utils.Users.Count() == 0 && utils.GetEnv("AUTH_USER_PASS", "") != ""
}

func (c *Auth) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.ResponseError(w, err)
		return
	}

	username := strings.TrimSpace(body.Username)

	if user, ok := utils.Users.GetByUsername(username); ok {
		if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.Password)) != nil {
			utils.Audit(r, "WARN", fmt.Sprintf("Failed login attempt for %q", username), map[string]interface{}{
				"event":         "login_failed",
				"attemptedUser": username,
			})
			utils.ResponseErrorStatus(w, errors.New("invalid username or password"), http.StatusUnauthorized)
			return
		}

		utils.Session.Set(r, "userId", user.ID)
		utils.Audit(r, "INFO", fmt.Sprintf("User %s has logged in", user.Username), map[string]interface{}{
			"event": "login",
		})
		utils.ResponseSuccess(w, map[string]interface{}{
			"authenticated": true,
			"user":          user.Public(),
		})
		return
	}

	// Legacy fallback for existing AUTH_USER_PASS deployments.
	if legacyEnabled() {
		userPass := strings.Split(utils.GetEnv("AUTH_USER_PASS", ""), ":")
		if len(userPass) >= 2 && username == userPass[0] &&
			bcrypt.CompareHashAndPassword([]byte(userPass[1]), []byte(body.Password)) == nil {
			utils.Session.Set(r, "userId", utils.LegacyUserID)
			utils.Audit(r, "INFO", fmt.Sprintf("User %s has logged in", username), map[string]interface{}{
				"event": "login",
			})
			utils.ResponseSuccess(w, map[string]interface{}{
				"authenticated": true,
			})
			return
		}
	}

	utils.Audit(r, "WARN", fmt.Sprintf("Failed login attempt for %q", username), map[string]interface{}{
		"event":         "login_failed",
		"attemptedUser": username,
	})
	utils.ResponseErrorStatus(w, errors.New("invalid username or password"), http.StatusUnauthorized)
}

// Register creates the first user (an owner) during initial setup. It is only
// available while no users exist and no legacy credentials are configured.
func (c *Auth) Register(w http.ResponseWriter, r *http.Request) {
	if utils.Users.Count() > 0 || utils.GetEnv("AUTH_USER_PASS", "") != "" {
		utils.ResponseErrorStatus(w, errors.New("registration is closed"), http.StatusForbidden)
		return
	}

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.ResponseError(w, err)
		return
	}

	username := strings.TrimSpace(body.Username)
	if username == "" {
		utils.ResponseErrorStatus(w, errors.New("username is required"), http.StatusBadRequest)
		return
	}
	if len(body.Password) < 6 {
		utils.ResponseErrorStatus(w, errors.New("password must be at least 6 characters"), http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	user, err := utils.Users.Create(schema.User{
		Username:     username,
		PasswordHash: string(hash),
		Role:         schema.RoleOwner,
	})
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	utils.Session.Set(r, "userId", user.ID)
	utils.Audit(r, "INFO", fmt.Sprintf("Owner account %s was created", user.Username), map[string]interface{}{
		"event": "register",
	})
	utils.ResponseSuccess(w, map[string]interface{}{
		"authenticated": true,
		"user":          user.Public(),
	})
}

func (c *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	if user, ok := utils.GetCurrentUser(r); ok {
		utils.Audit(r, "INFO", fmt.Sprintf("User %s has logged out", user.Username), map[string]interface{}{
			"event": "logout",
			"user":  user.Username,
		})
	}
	utils.Session.Clear(r)
	utils.ResponseSuccess(w, true)
}

// ChangePassword lets the currently authenticated user (any role) change their
// own password after confirming their current one.
func (c *Auth) ChangePassword(w http.ResponseWriter, r *http.Request) {
	user, ok := utils.GetCurrentUser(r)
	if !ok {
		utils.ResponseErrorStatus(w, errors.New("unauthorized"), http.StatusUnauthorized)
		return
	}
	if user.ID == utils.LegacyUserID {
		utils.ResponseErrorStatus(w, errors.New("this account's password is configured via AUTH_USER_PASS"), http.StatusBadRequest)
		return
	}

	var body struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.ResponseError(w, err)
		return
	}

	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.CurrentPassword)) != nil {
		utils.ResponseErrorStatus(w, errors.New("current password is incorrect"), http.StatusUnauthorized)
		return
	}
	if len(body.NewPassword) < 6 {
		utils.ResponseErrorStatus(w, errors.New("new password must be at least 6 characters"), http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	if _, err := utils.Users.Update(user.ID, func(u *schema.User) error {
		u.PasswordHash = string(hash)
		return nil
	}); err != nil {
		utils.ResponseError(w, err)
		return
	}

	utils.Audit(r, "INFO", fmt.Sprintf("User %s changed their password", user.Username), map[string]interface{}{
		"event": "password_change",
	})
	utils.ResponseSuccess(w, true)
}

func (c *Auth) GetStatus(w http.ResponseWriter, r *http.Request) {
	needsSetup := utils.Users.Count() == 0 && utils.GetEnv("AUTH_USER_PASS", "") == ""

	res := map[string]interface{}{
		"enabled":       true,
		"needsSetup":    needsSetup,
		"authenticated": false,
		"googleEnabled": utils.IsGoogleEnabled(),
		"user":          nil,
	}

	if user, ok := utils.GetCurrentUser(r); ok {
		res["authenticated"] = true
		res["user"] = user.Public()
	}

	utils.ResponseSuccess(w, res)
}
