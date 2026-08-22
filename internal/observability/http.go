package observability

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/pprof"
	"runtime"
	"strings"
	"time"

	"PMAS/internal/logging"
)

type contextTimeoutKey struct{}

// WithTimeout bounds the request context so DB/work stops when the client or budget expires.
func WithTimeout(timeout time.Duration, next http.Handler) http.Handler {
	if timeout <= 0 {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isProbePath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(context.WithValue(ctx, contextTimeoutKey{}, timeout)))
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	return r.ResponseWriter.Write(b)
}

func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// WithMetrics records request counts, in-flight, and latency histograms.
func WithMetrics(m *Metrics, slowAfter time.Duration, next http.Handler) http.Handler {
	if m == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isProbePath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		m.BeginRequest()
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		status := rec.status
		if status == 0 {
			status = http.StatusOK
		}
		dur := time.Since(start)
		m.EndRequest(status, dur)
		if slowAfter > 0 && dur >= slowAfter {
			logging.Warn("slow_request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", status,
				"duration_ms", dur.Milliseconds(),
			)
		}
	})
}

// ProtectToken requires Bearer token (or ?token=) when a token is configured.
func ProtectToken(token string, next http.Handler) http.Handler {
	if token == "" {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "profiling/metrics disabled", http.StatusNotFound)
		})
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got := bearerOrQueryToken(r)
		if got == "" || got != token {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func bearerOrQueryToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return strings.TrimSpace(r.URL.Query().Get("token"))
}

func isProbePath(path string) bool {
	return path == "/health" || path == "/ready" || path == "/metrics" || strings.HasPrefix(path, "/debug/")
}

func RegisterPprof(mux *http.ServeMux, token string) {
	pprofMux := http.NewServeMux()
	pprofMux.HandleFunc("/", pprof.Index)
	pprofMux.HandleFunc("/cmdline", pprof.Cmdline)
	pprofMux.HandleFunc("/profile", pprof.Profile)
	pprofMux.HandleFunc("/symbol", pprof.Symbol)
	pprofMux.HandleFunc("/trace", pprof.Trace)
	pprofMux.Handle("/allocs", pprof.Handler("allocs"))
	pprofMux.Handle("/block", pprof.Handler("block"))
	pprofMux.Handle("/goroutine", pprof.Handler("goroutine"))
	pprofMux.Handle("/heap", pprof.Handler("heap"))
	pprofMux.Handle("/mutex", pprof.Handler("mutex"))
	pprofMux.Handle("/threadcreate", pprof.Handler("threadcreate"))
	mux.Handle("/debug/pprof/", ProtectToken(token, http.StripPrefix("/debug/pprof", pprofMux)))
}

func RegisterMetrics(mux *http.ServeMux, token string, m *Metrics, dbStats func() any) {
	mux.Handle("/metrics", ProtectToken(token, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var mem runtime.MemStats
		runtime.ReadMemStats(&mem)
		var stats any
		if dbStats != nil {
			stats = dbStats()
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(m.Snapshot(stats, runtime.NumGoroutine(), mem))
	})))
}
