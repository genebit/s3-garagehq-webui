package router

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"khairul169/garage-webui/utils"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type Google struct{}

func randomToken() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	return hex.EncodeToString(b)
}

// googleRedirectURL derives the OAuth callback URL from the incoming request so
// it works across origins (localhost, production domain behind a proxy). It must
// match one of the redirect URIs registered in the Google Cloud console.
func googleRedirectURL(r *http.Request) string {
	scheme := "http"
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		scheme = proto
	} else if r.TLS != nil {
		scheme = "https"
	}

	host := r.Host
	if fwd := r.Header.Get("X-Forwarded-Host"); fwd != "" {
		host = fwd
	}

	basePath := os.Getenv("BASE_PATH")
	return fmt.Sprintf("%s://%s%s/api/v1/auth/google/callback", scheme, host, basePath)
}

func googleOAuthConfig(provider *oidc.Provider, r *http.Request) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     utils.GoogleClientID(),
		ClientSecret: utils.GoogleClientSecret(),
		Endpoint:     provider.Endpoint(),
		RedirectURL:  googleRedirectURL(r),
		Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
	}
}

func loginRedirect(w http.ResponseWriter, r *http.Request, errMsg string) {
	basePath := os.Getenv("BASE_PATH")
	target := basePath + "/auth/login"
	if errMsg != "" {
		target += "?error=" + url.QueryEscape(errMsg)
	}
	http.Redirect(w, r, target, http.StatusFound)
}

func (g *Google) Login(w http.ResponseWriter, r *http.Request) {
	if !utils.IsGoogleEnabled() {
		utils.ResponseErrorStatus(w, errors.New("google sign-in is not enabled"), http.StatusBadRequest)
		return
	}

	provider, _, err := utils.GoogleOIDC()
	if err != nil {
		utils.ResponseErrorStatus(w, fmt.Errorf("google sign-in unavailable: %w", err), http.StatusBadGateway)
		return
	}

	state := randomToken()
	nonce := randomToken()
	utils.Session.Set(r, "oauthState", state)
	utils.Session.Set(r, "oauthNonce", nonce)

	conf := googleOAuthConfig(provider, r)
	authURL := conf.AuthCodeURL(
		state,
		oidc.Nonce(nonce),
		oauth2.SetAuthURLParam("prompt", "select_account"),
	)

	http.Redirect(w, r, authURL, http.StatusFound)
}

func (g *Google) Callback(w http.ResponseWriter, r *http.Request) {
	if errParam := r.URL.Query().Get("error"); errParam != "" {
		loginRedirect(w, r, "google sign-in was cancelled")
		return
	}

	provider, verifier, err := utils.GoogleOIDC()
	if err != nil {
		loginRedirect(w, r, "google sign-in unavailable")
		return
	}

	// CSRF protection: state must match what we stored before the redirect.
	savedState := utils.Session.Get(r, "oauthState")
	if savedState == nil || r.URL.Query().Get("state") != savedState.(string) {
		loginRedirect(w, r, "invalid sign-in state, please try again")
		return
	}

	conf := googleOAuthConfig(provider, r)
	token, err := conf.Exchange(context.Background(), r.URL.Query().Get("code"))
	if err != nil {
		loginRedirect(w, r, "could not complete google sign-in")
		return
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		loginRedirect(w, r, "google did not return an identity token")
		return
	}

	idToken, err := verifier.Verify(context.Background(), rawIDToken)
	if err != nil {
		loginRedirect(w, r, "could not verify google identity")
		return
	}

	savedNonce := utils.Session.Get(r, "oauthNonce")
	if savedNonce == nil || idToken.Nonce != savedNonce.(string) {
		loginRedirect(w, r, "invalid sign-in nonce, please try again")
		return
	}

	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		HD            string `json:"hd"`
		Name          string `json:"name"`
	}
	if err := idToken.Claims(&claims); err != nil {
		loginRedirect(w, r, "could not read google account details")
		return
	}

	if !claims.EmailVerified {
		loginRedirect(w, r, "your google email is not verified")
		return
	}

	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if !isAllowedGoogleDomain(email, claims.HD) {
		utils.Audit(r, "WARN", fmt.Sprintf("Google sign-in denied for %s (domain not permitted)", email), map[string]interface{}{
			"event": "google_denied",
			"email": email,
		})
		loginRedirect(w, r, "your account domain is not permitted")
		return
	}

	user, ok := utils.Users.GetByEmail(email)
	if !ok {
		utils.Audit(r, "WARN", fmt.Sprintf("Google sign-in denied for %s (no registered account)", email), map[string]interface{}{
			"event": "google_denied",
			"email": email,
		})
		loginRedirect(w, r, "no account is registered for "+email+". Please ask an administrator to add you.")
		return
	}

	utils.Session.Set(r, "userId", user.ID)
	utils.Audit(r, "INFO", fmt.Sprintf("User %s signed in with Google", user.Username), map[string]interface{}{
		"event": "google_login",
		"email": email,
	})

	basePath := os.Getenv("BASE_PATH")
	http.Redirect(w, r, basePath+"/", http.StatusFound)
}

func isAllowedGoogleDomain(email, hd string) bool {
	var domain string
	if at := strings.LastIndex(email, "@"); at >= 0 {
		domain = strings.ToLower(email[at+1:])
	}
	hd = strings.ToLower(strings.TrimSpace(hd))

	for _, allowed := range utils.GoogleAllowedDomains() {
		if domain == allowed || hd == allowed {
			return true
		}
	}
	return false
}
