package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiterStopEndsEvictLoop(t *testing.T) {
	t.Parallel()

	l := newIPRateLimiter(10, time.Minute, 100)
	l.stop()

	select {
	case <-l.stopCh:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("stop channel not closed")
	}
}

func TestSecurityProbePathsSkipRateLimit(t *testing.T) {
	t.Parallel()

	called := false
	sec := NewSecurity(SecurityOptions{RateLimitRPM: 1, AuthRateLimitRPM: 1}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))

	for _, path := range []string{"/health", "/ready", "/metrics"} {
		called = false
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		sec.ServeHTTP(rec, req)
		if !called {
			t.Fatalf("handler not called for %s", path)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("%s status = %d", path, rec.Code)
		}
	}
	sec.Stop()
}
