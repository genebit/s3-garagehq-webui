package router

import (
	"khairul169/garage-webui/middleware"
	"net/http"
)

func HandleApiRouter() *http.ServeMux {
	mux := http.NewServeMux()

	// Public auth endpoints (no session required).
	auth := &Auth{}
	mux.HandleFunc("POST /auth/login", auth.Login)
	mux.HandleFunc("POST /auth/register", auth.Register)
	mux.HandleFunc("POST /auth/logout", auth.Logout)
	mux.HandleFunc("POST /auth/change-password", auth.ChangePassword)
	mux.HandleFunc("GET /auth/status", auth.GetStatus)

	google := &Google{}
	mux.HandleFunc("GET /v1/auth/google/login", google.Login)
	mux.HandleFunc("GET /v1/auth/google/callback", google.Callback)

	router := http.NewServeMux()

	users := &Users{}
	router.HandleFunc("GET /users", users.GetAll)
	router.HandleFunc("POST /users", users.Create)
	router.HandleFunc("PATCH /users/{id}", users.Update)
	router.HandleFunc("DELETE /users/{id}", users.Delete)

	config := &Config{}
	router.HandleFunc("GET /config", config.GetAll)

	logs := &Logs{}
	router.HandleFunc("GET /logs", logs.GetAll)

	buckets := &Buckets{}
	router.HandleFunc("GET /buckets", buckets.GetAll)

	browse := &Browse{}
	router.HandleFunc("GET /browse/{bucket}", browse.GetObjects)
	router.HandleFunc("POST /browse/{bucket}", browse.MoveObjects)
	router.HandleFunc("GET /browse/{bucket}/{key...}", browse.GetOneObject)
	router.HandleFunc("PUT /browse/{bucket}/{key...}", browse.PutObject)
	router.HandleFunc("DELETE /browse/{bucket}/{key...}", browse.DeleteObject)

	// Proxy request to garage api endpoint
	router.HandleFunc("/", ProxyHandler)

	mux.Handle("/", middleware.AuthMiddleware(router))
	return mux
}
