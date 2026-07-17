package utils

import (
	"net"
	"net/http"
	"strings"
)

// ClientIP returns the best-effort client IP, honoring a reverse proxy's
// X-Forwarded-For / X-Real-IP headers.
func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	if xrip := r.Header.Get("X-Real-IP"); xrip != "" {
		return strings.TrimSpace(xrip)
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// AuditUser returns the current session's username for building audit
// messages, falling back to a placeholder when unauthenticated.
func AuditUser(r *http.Request) string {
	if user, ok := GetCurrentUser(r); ok {
		return user.Username
	}
	return "someone"
}

// Audit logs a human-readable footprint event enriched with request metadata
// (ip, user agent) and the current user when one is authenticated.
func Audit(r *http.Request, level, message string, extra map[string]interface{}) {
	fields := map[string]interface{}{
		"ip":        ClientIP(r),
		"userAgent": r.UserAgent(),
	}

	if user, ok := GetCurrentUser(r); ok {
		fields["user"] = user.Username
		fields["role"] = string(user.Role)
	}

	for k, v := range extra {
		fields[k] = v
	}

	Log.Event(level, message, fields)
}
