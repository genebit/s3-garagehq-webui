package utils

import (
	"context"
	"os"
	"strings"
	"sync"

	"github.com/coreos/go-oidc/v3/oidc"
)

const googleIssuer = "https://accounts.google.com"

var (
	googleOnce     sync.Once
	googleProvider *oidc.Provider
	googleVerifier *oidc.IDTokenVerifier
	googleInitErr  error
)

func GoogleClientID() string     { return os.Getenv("GOOGLE_CLIENT_ID") }
func GoogleClientSecret() string { return os.Getenv("GOOGLE_CLIENT_SECRET") }

// IsGoogleEnabled reports whether Google sign-in is configured.
func IsGoogleEnabled() bool {
	return GoogleClientID() != "" && GoogleClientSecret() != ""
}

// GoogleAllowedDomains returns the hosted-domain allowlist for Google sign-in.
func GoogleAllowedDomains() []string {
	raw := GetEnv("GOOGLE_ALLOWED_DOMAINS", "gbox.adnu.edu.ph,adnu.edu.ph")
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.ToLower(strings.TrimSpace(p)); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// GoogleOIDC lazily initializes and returns the Google OIDC provider and an
// ID-token verifier bound to the configured client id.
func GoogleOIDC() (*oidc.Provider, *oidc.IDTokenVerifier, error) {
	googleOnce.Do(func() {
		provider, err := oidc.NewProvider(context.Background(), googleIssuer)
		if err != nil {
			googleInitErr = err
			return
		}
		googleProvider = provider
		googleVerifier = provider.Verifier(&oidc.Config{ClientID: GoogleClientID()})
	})
	return googleProvider, googleVerifier, googleInitErr
}
