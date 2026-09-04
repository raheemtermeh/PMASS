package httpapi_test

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"testing"

	httpapi "PMAS/internal/delivery/http"
	"PMAS/internal/middleware"
)

func TestChatRoutes_Unauthenticated(t *testing.T) {
	db, err := sql.Open("postgres", "")
	if err != nil {
		t.Fatal(err)
	}
	authz := middleware.NewAuthenticator(db)
	mux := http.NewServeMux()
	httpapi.RegisterChatRoutes(mux, authz, &httpapi.ChatHandler{})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/chat/conversations", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestChatRoutes_InvalidUUID(t *testing.T) {
	db, err := sql.Open("postgres", "")
	if err != nil {
		t.Fatal(err)
	}
	authz := middleware.NewAuthenticator(db)
	mux := http.NewServeMux()
	httpapi.RegisterChatRoutes(mux, authz, &httpapi.ChatHandler{})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/chat/conversations/not-a-uuid", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 before UUID validation without auth, got %d", rec.Code)
	}
}
