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

	"github.com/lib/pq"

	"PMAS/internal/auth"
)

type contextKey string

const (
	ClaimsContextKey contextKey = "claims"
	maxJSONBody                 = 1 << 20 // 1 MiB
)

// SecurityOptions configures transport-level protections.
type SecurityOptions struct {
	AllowedOrigins   []string
	RateLimitRPM     int
	AuthRateLimitRPM int
	MaxTrackedIPs    int
}

// Security wires CORS, body limits, and IP rate limiting with explicit shutdown.
type Security struct {
	handler http.Handler
	stopFns []func()
}

// NewSecurity returns middleware that can be stopped during graceful shutdown.
func NewSecurity(opts SecurityOptions, next http.Handler) *Security {
	generalRPM := opts.RateLimitRPM
	if generalRPM < 0 {
		generalRPM = 0
	}
	authRPM := opts.AuthRateLimitRPM
	if authRPM <= 0 {
		authRPM = 20
	}
	maxIPs := opts.MaxTrackedIPs
	if maxIPs <= 0 {
		maxIPs = 10000
	}

	generalLimiter := newIPRateLimiter(generalRPM, time.Minute, maxIPs)
	authLimiter := newIPRateLimiter(authRPM, time.Minute, maxIPs)

	s := &Security{
		stopFns: []func(){generalLimiter.stop, authLimiter.stop},
	}
	s.handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

		path := r.URL.Path
		if isProbePath(path) {
			next.ServeHTTP(w, r)
			return
		}

		ip := clientIP(r)
		if strings.HasPrefix(path, "/api/v1/auth/login") ||
			strings.HasPrefix(path, "/api/v1/auth/bootstrap") ||
			strings.HasPrefix(path, "/api/v1/auth/forgot-password") ||
			strings.HasPrefix(path, "/api/v1/auth/passkeys/login") ||
			(path == "/api/v1/access-requests" && r.Method == http.MethodPost) {
			if !authLimiter.Allow(ip) {
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(http.StatusTooManyRequests)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "Too many auth attempts"})
				return
			}
		} else if generalRPM > 0 && !generalLimiter.Allow(ip) {
			w.Header().Set("Retry-After", "60")
			w.WriteHeader(http.StatusTooManyRequests)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Rate limit exceeded"})
			return
		}

		next.ServeHTTP(w, r)
	})
	return s
}

func (s *Security) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.handler.ServeHTTP(w, r)
}

// Stop ends background rate-limiter maintenance goroutines.
func (s *Security) Stop() {
	for _, fn := range s.stopFns {
		fn()
	}
}

func isProbePath(path string) bool {
	return path == "/health" || path == "/ready" || path == "/metrics" || strings.HasPrefix(path, "/debug/")
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
	shards     [16]limiterShard
	limit      int
	window     time.Duration
	maxTracked int
	disabled   bool
	stopCh     chan struct{}
	stopOnce   sync.Once
}

type limiterShard struct {
	mu         sync.Mutex
	attempts   map[string][]time.Time
	maxEntries int
}

func newIPRateLimiter(limit int, window time.Duration, maxTracked int) *ipRateLimiter {
	l := &ipRateLimiter{
		limit:      limit,
		window:     window,
		maxTracked: maxTracked,
		disabled:   limit <= 0,
		stopCh:     make(chan struct{}),
	}
	perShard := maxTracked / len(l.shards)
	if perShard < 1 {
		perShard = 1
	}
	for i := range l.shards {
		l.shards[i].attempts = make(map[string][]time.Time)
		l.shards[i].maxEntries = perShard
	}
	if !l.disabled {
		go l.evictLoop()
	}
	return l
}

func (l *ipRateLimiter) shardFor(ip string) *limiterShard {
	h := uint32(2166136261)
	for i := 0; i < len(ip); i++ {
		h ^= uint32(ip[i])
		h *= 16777619
	}
	return &l.shards[h%uint32(len(l.shards))]
}

func (l *ipRateLimiter) Allow(ip string) bool {
	if l.disabled {
		return true
	}
	now := time.Now()
	s := l.shardFor(ip)
	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := now.Add(-l.window)
	kept := s.attempts[ip][:0]
	for _, t := range s.attempts[ip] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.limit {
		s.attempts[ip] = kept
		return false
	}
	if _, exists := s.attempts[ip]; !exists {
		s.trimToMaxLocked()
	}
	s.attempts[ip] = append(kept, now)
	return true
}

func (s *limiterShard) trimToMaxLocked() {
	if s.maxEntries <= 0 || len(s.attempts) < s.maxEntries {
		return
	}
	for ip := range s.attempts {
		delete(s.attempts, ip)
		if len(s.attempts) < s.maxEntries {
			return
		}
	}
}

func (l *ipRateLimiter) evictLoop() {
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			l.evictStale()
		case <-l.stopCh:
			return
		}
	}
}

func (l *ipRateLimiter) evictStale() {
	cutoff := time.Now().Add(-l.window)
	for i := range l.shards {
		s := &l.shards[i]
		s.mu.Lock()
		for ip, times := range s.attempts {
			kept := times[:0]
			for _, t := range times {
				if t.After(cutoff) {
					kept = append(kept, t)
				}
			}
			if len(kept) == 0 {
				delete(s.attempts, ip)
			} else {
				s.attempts[ip] = kept
			}
		}
		s.trimToMaxLocked()
		s.mu.Unlock()
	}
}

func (l *ipRateLimiter) stop() {
	l.stopOnce.Do(func() {
		close(l.stopCh)
	})
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

// AuthenticateToken validates a bearer token and returns fresh claims (for WebSocket upgrade).
func (a *Authenticator) AuthenticateToken(ctx context.Context, token string) (*auth.Claims, error) {
	claims, err := auth.ParseToken(token)
	if err != nil {
		return nil, err
	}
	return a.loadFreshClaims(ctx, claims)
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

// RequirePermissionByMethod allows a lighter permission for GET/HEAD (read)
// and a stricter one for mutating methods (write).
func (a *Authenticator) RequirePermissionByMethod(readPerm, writePerm string, next http.HandlerFunc) http.HandlerFunc {
	return a.RequireAuth(func(w http.ResponseWriter, r *http.Request) {
		claims := ClaimsFromContext(r.Context())
		needed := writePerm
		if r.Method == http.MethodGet || r.Method == http.MethodHead {
			needed = readPerm
		}
		if claims == nil || !auth.HasPermission(claims.Role, claims.Permissions, needed) {
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Insufficient permissions"})
			return
		}
		next(w, r)
	})
}

func (a *Authenticator) loadFreshClaims(ctx context.Context, tokenClaims *auth.Claims) (*auth.Claims, error) {
	var (
		role       string
		isActive   bool
		sv         int
		tid        sql.NullInt64
		email      string
		fullName   string
		tenantSlug string
		tenantName string
		companyID  sql.NullString
		tenantOK   sql.NullBool
		employeeID sql.NullString
		perms      pq.StringArray
	)

	err := a.db.QueryRowContext(ctx, `
		SELECT u.email, u.full_name, u.role, u.is_active, u.tenant_id, COALESCE(u.session_version, 1),
			COALESCE(t.slug, ''), COALESCE(t.name, ''), t.company_id::text, t.is_active,
			(SELECT e.id::text FROM employees e
			 WHERE e.company_id = t.company_id AND e.user_id = u.id LIMIT 1),
			COALESCE((
				SELECT array_agg(p.permission)
				FROM user_permissions p
				WHERE p.user_id = u.id
			), '{}')
		FROM app_users u
		LEFT JOIN tenants t ON t.id = u.tenant_id
		WHERE u.id = $1
	`, tokenClaims.UserID).Scan(
		&email, &fullName, &role, &isActive, &tid, &sv,
		&tenantSlug, &tenantName, &companyID, &tenantOK,
		&employeeID, &perms,
	)
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
	if tid.Valid {
		id := int(tid.Int64)
		tenantID = &id
		if tenantOK.Valid && !tenantOK.Bool && !auth.IsPlatformAdmin(role) {
			return nil, sql.ErrNoRows
		}
		if tenantSlug == "" && !auth.IsPlatformAdmin(role) {
			return nil, sql.ErrNoRows
		}
	}

	if auth.IsTenantAdmin(role) {
		perms = append([]string{}, auth.AllPermissions...)
	}

	out := &auth.Claims{
		UserID:           tokenClaims.UserID,
		TenantID:         tenantID,
		TenantSlug:       tenantSlug,
		TenantName:       tenantName,
		Email:            email,
		FullName:         fullName,
		Role:             role,
		Permissions:      []string(perms),
		SessionVersion:   sv,
		RegisteredClaims: tokenClaims.RegisteredClaims,
	}
	if companyID.Valid {
		out.CompanyID = companyID.String
	}
	if employeeID.Valid {
		out.EmployeeID = employeeID.String
	}
	return out, nil
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
