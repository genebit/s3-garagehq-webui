package main

import (
	"fmt"
	"khairul169/garage-webui/router"
	"khairul169/garage-webui/ui"
	"khairul169/garage-webui/utils"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

func main() {
	// Initialize app
	godotenv.Load()
	utils.InitLogger()
	log.SetFlags(0)
	log.SetOutput(utils.Log.StdlibWriter())

	// The scratch runtime image has no /tmp, so ensure a writable temp dir
	// exists for multipart uploads that exceed the in-memory threshold.
	tmpDir := utils.GetEnv("TMPDIR", "/data/tmp")
	if err := os.MkdirAll(tmpDir, 0o700); err != nil {
		log.Println("Cannot create temp dir:", err)
	} else {
		os.Setenv("TMPDIR", tmpDir)
	}

	utils.InitCacheManager()
	utils.InitUserStore()
	sessionMgr := utils.InitSessionManager()

	if err := utils.Garage.LoadConfig(); err != nil {
		log.Println("Cannot load garage config!", err)
	}

	basePath := os.Getenv("BASE_PATH")
	mux := http.NewServeMux()

	// Serve API
	apiPrefix := basePath + "/api"
	mux.Handle(apiPrefix+"/", http.StripPrefix(apiPrefix, router.HandleApiRouter()))

	// Static files
	ui.ServeUI(mux)

	// Redirect to UI if BASE_PATH is set
	if basePath != "" {
		mux.Handle("/", http.RedirectHandler(basePath, http.StatusMovedPermanently))
	}

	host := utils.GetEnv("HOST", "0.0.0.0")
	port := utils.GetEnv("PORT", "3909")

	addr := fmt.Sprintf("%s:%s", host, port)
	log.Printf("Starting server on http://%s", addr)

	handler := sessionMgr.LoadAndSave(logRequests(mux))
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// logRequests records each API request to the app log. The log viewer's own
// polling is skipped to avoid feedback noise.
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/api/") ||
			strings.Contains(r.URL.Path, "/api/logs") {
			next.ServeHTTP(w, r)
			return
		}

		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rec, r)
		dur := time.Since(start)

		// Successful requests are covered by semantic audit events; only record
		// failures here so the log stays focused on the user footprint.
		if rec.status < 400 {
			return
		}

		level := "WARN"
		if rec.status >= 500 {
			level = "ERROR"
		}

		utils.Audit(r, level, fmt.Sprintf("Request failed: %s %s (%d)", r.Method, r.URL.Path, rec.status), map[string]interface{}{
			"event":      "request_failed",
			"method":     r.Method,
			"path":       r.URL.Path,
			"status":     rec.status,
			"durationMs": dur.Milliseconds(),
		})
	})
}
