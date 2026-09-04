package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	httpapi "PMAS/internal/delivery/http"
	"PMAS/internal/realtime"
)

func TestChatWS_Unauthenticated(t *testing.T) {
	mux := http.NewServeMux()
	hub := realtime.NewHub(realtime.Config{}, nil, &realtime.Metrics{})
	rt := &httpapi.ChatRealtime{Hub: hub}
	httpapi.RegisterChatRealtimeRoutes(mux, rt)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/chat/ws", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized && rec.Code != http.StatusServiceUnavailable {
		// Authz nil → unavailable; with hub only → unauthorized once wired fully.
		// ChatRealtime without Authz/Scope returns 503.
		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("got %d", rec.Code)
		}
	}
}
