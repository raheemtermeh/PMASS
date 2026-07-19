package middleware

import (
	"context"
	"database/sql"
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"PMAS/internal/auth"
)

type contextKey string

const (
	ClaimsContextKey contextKey = "claims"
	maxJSONBody                = 1 << 20 // 1 MiB
)

// SecurityOptions configures transport-level protections.
type SecurityOptions struct {
	AllowedOrigins []string
}

func WithSecurity(opts SecurityOptions, next http.Handler) http.Handler {
	limiter := newIPRateLimiter(30, time.Minute)
	authLimiter := newIPRateLimiter(10, time.Minute)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		applySecurityHeaders(w)

		// Body size cap for JSON APIs.
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, maxJSONBody)
		}

		origin := r.Header.Get("Origin")
		if origin != "" {
			if !originAllowed(origin, opts.AllowedOrigins) {
				w.WriteHeader(http.StatusForbidden)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "Origin not allowed"})
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "600")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		ip := clientIP(r)
		path := r.URL.Path
		if strings.HasPrefix(path, "/api/v1/auth/login") ||
			strings.HasPrefix(path, "/api/v1/auth/bootstrap") ||
			strings.HasPrefix(path, "/api/v1/auth/forgot-password") ||
			(path == "/api/v1/access-requests" && r.Method == http.MethodPost) {
			if !authLimiter.Allow(ip) {
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(http.StatusTooManyRequests)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "Too many auth attempts"})
				return
			}
		} else if !limiter.Allow(ip) {
			w.Header().Set("Retry-After", "60")
			w.WriteHeader(http.StatusTooManyRequests)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Rate limit exceeded"})
			return
		}

		next.ServeHTTP(w, r)
	})
}

func applySecurityHeaders(w http.ResponseWriter) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
}

func originAllowed(origin string, allowed []string) bool {
	origin = strings.TrimRight(strings.TrimSpace(origin), "/")
	if origin == "" {
		return false
	}
	for _, a := range allowed {
		a = strings.TrimSpace(a)
		// Temporary deploy mode: CORS_ALLOWED_ORIGINS=* reflects any Origin.
		if a == "*" {
			return true
		}
		if strings.EqualFold(origin, strings.TrimRight(a, "/")) {
			return true
		}
	}
	return false
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

type ipRateLimiter struct {
	mu       sync.Mutex
	limit    int
	window   time.Duration
	attempts map[string][]time.Time
}

func newIPRateLimiter(limit int, window time.Duration) *ipRateLimiter {
	return &ipRateLimiter{
		limit:    limit,
		window:   window,
		attempts: make(map[string][]time.Time),
	}
}

func (l *ipRateLimiter) Allow(ip string) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()

	cutoff := now.Add(-l.window)
	kept := l.attempts[ip][:0]
	for _, t := range l.attempts[ip] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.limit {
		l.attempts[ip] = kept
		return false
	}
	l.attempts[ip] = append(kept, now)
	return true
}

// Authenticator reloads user state from DB on every authenticated request.
type Authenticator struct {
	db *sql.DB
}

func NewAuthenticator(db *sql.DB) *Authenticator {
	return &Authenticator{db: db}
}

func (a *Authenticator) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		claims, err := extractClaims(r)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Authentication required"})
			return
		}

		fresh, err := a.loadFreshClaims(r.Context(), claims)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Session revoked or expired"})
			return
		}

		ctx := context.WithValue(r.Context(), ClaimsContextKey, fresh)
		next(w, r.WithContext(ctx))
	}
}

func (a *Authenticator) RequirePermission(permission string, next http.HandlerFunc) http.HandlerFunc {
	return a.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
		claims := ClaimsFromContext(r.Context())
		if claims == nil || !auth.HasPermission(claims.Role, claims.Permissions, permission) {
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Insufficient permissions"})
			return
		}
		next(w, r)
	})
}

func (a *Authenticator) loadFreshClaims(ctx context.Context, tokenClaims *auth.Claims) (*auth.Claims, error) {
	var (
		role     string
		isActive bool
		sv       int
		tid      sql.NullInt64
		email    string
		fullName string
	)

	err := a.db.QueryRowContext(ctx, `
		SELECT email, full_name, role, is_active, tenant_id, COALESCE(session_version, 1)
		FROM app_users WHERE id = $1
	`, tokenClaims.UserID).Scan(&email, &fullName, &role, &isActive, &tid, &sv)
	if err != nil {
		return nil, err
	}
	if !isActive {
		return nil, sql.ErrNoRows
	}
	if sv != tokenClaims.SessionVersion {
		return nil, sql.ErrNoRows
	}

	var tenantID *int
	tenantSlug, tenantName := "", ""
	if tid.Valid {
		id := int(tid.Int64)
		tenantID = &id
		_ = a.db.QueryRowContext(ctx, `
			SELECT slug, name FROM tenants WHERE id = $1 AND is_active = true
		`, id).Scan(&tenantSlug, &tenantName)
		if tenantSlug == "" && !auth.IsPlatformAdmin(role) {
			return nil, sql.ErrNoRows
		}
	}

	perms := []string{}
	if auth.IsTenantAdmin(role) {
		perms = append(perms, auth.AllPermissions...)
	} else {
		rows, err := a.db.QueryContext(ctx, `SELECT permission FROM user_permissions WHERE user_id = $1`, tokenClaims.UserID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var p string
			if err := rows.Scan(&p); err != nil {
				return nil, err
			}
			perms = append(perms, p)
		}
	}

	return &auth.Claims{
		UserID:         tokenClaims.UserID,
		TenantID:       tenantID,
		TenantSlug:     tenantSlug,
		TenantName:     tenantName,
		Email:          email,
		FullName:       fullName,
		Role:           role,
		Permissions:    perms,
		SessionVersion: sv,
		RegisteredClaims: tokenClaims.RegisteredClaims,
	}, nil
}

func ClaimsFromContext(ctx context.Context) *auth.Claims {
	claims, _ := ctx.Value(ClaimsContextKey).(*auth.Claims)
	return claims
}

func extractClaims(r *http.Request) (*auth.Claims, error) {
	header := r.Header.Get("Authorization")
	if header == "" {
		return nil, http.ErrNoCookie
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return nil, http.ErrNoCookie
	}
	return auth.ParseToken(parts[1])
}
