package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all service configurations.
type Config struct {
	SupabaseDBURL     string
	ServerPort        string
	JWTSecret         string
	EncryptionKey     string
	CORSOrigins       []string
	AppEnv            string
	CookieSecure      bool
	WebAuthnRPID      string
	WebAuthnRPDisplay string
	WebAuthnRPOrigins []string

	DBMaxOpenConns     int
	DBMaxIdleConns     int
	DBConnMaxLifetime  time.Duration
	DBConnMaxIdleTime  time.Duration
	DBStatementTimeout time.Duration

	RequestTimeout  time.Duration
	ShutdownTimeout time.Duration
	SlowRequest     time.Duration

	HTTPReadHeaderTimeout time.Duration
	HTTPReadTimeout       time.Duration
	HTTPWriteTimeout      time.Duration
	HTTPIdleTimeout       time.Duration
	HTTPMaxHeaderBytes    int

	RateLimitRPM     int
	AuthRateLimitRPM int
	RateLimitMaxIPs  int

	PprofEnabled bool
	PprofToken   string
	MetricsToken string
}

// Load reads config from environment variables. Fails closed on missing secrets in production.
func Load() *Config {
	appEnv := strings.ToLower(strings.TrimSpace(firstNonEmpty(os.Getenv("APP_ENV"), os.Getenv("GO_ENV"), "development")))

	dbURL := firstNonEmpty(os.Getenv("SUPABASE_DB_URL"), os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		log.Fatal("[Config] SUPABASE_DB_URL (or DATABASE_URL) is required. Hardcoded DB credentials are disabled.")
	}
	stmtTimeout := envDuration("DB_STATEMENT_TIMEOUT", 15*time.Second)
	dbURL = normalizeDSN(dbURL)
	dbURL = appendStatementTimeout(dbURL, stmtTimeout)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	jwtSecret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if jwtSecret == "" {
		log.Fatal("[Config] JWT_SECRET is required (min 32 characters). No default secret is allowed.")
	}
	if len(jwtSecret) < 32 {
		log.Fatal("[Config] JWT_SECRET must be at least 32 characters")
	}
	if jwtSecret == "change-me-in-production" || jwtSecret == "pmas-live-dev-secret-change-in-production" {
		log.Fatal("[Config] JWT_SECRET must not use a known placeholder value")
	}

	encKey := strings.TrimSpace(os.Getenv("CREDENTIALS_ENCRYPTION_KEY"))
	if encKey == "" {
		if appEnv == "production" {
			log.Fatal("[Config] CREDENTIALS_ENCRYPTION_KEY is required in production")
		}
		log.Println("[Config] WARNING: CREDENTIALS_ENCRYPTION_KEY unset — generating ephemeral key (credentials will not survive restart)")
		encKey = ephemeralKeyFromSecret(jwtSecret)
	}

	origins := parseOrigins(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if len(origins) == 0 {
		// Open by default until explicit origins are configured for the server.
		origins = []string{"*"}
	}

	waRPID := strings.TrimSpace(os.Getenv("WEBAUTHN_RP_ID"))
	if waRPID == "" {
		waRPID = "localhost"
	}
	waDisplay := strings.TrimSpace(os.Getenv("WEBAUTHN_RP_DISPLAY_NAME"))
	if waDisplay == "" {
		waDisplay = "PMAS Live"
	}
	waOrigins := parseOrigins(os.Getenv("WEBAUTHN_RP_ORIGINS"))
	if len(waOrigins) == 0 {
		waOrigins = []string{"http://localhost:3000"}
	}

	return &Config{
		SupabaseDBURL:      dbURL,
		ServerPort:         port,
		JWTSecret:          jwtSecret,
		EncryptionKey:      encKey,
		CORSOrigins:        origins,
		AppEnv:             appEnv,
		CookieSecure:       appEnv == "production" || strings.EqualFold(os.Getenv("COOKIE_SECURE"), "true"),
		WebAuthnRPID:       waRPID,
		WebAuthnRPDisplay:  waDisplay,
		WebAuthnRPOrigins:  waOrigins,
		DBMaxOpenConns:     envInt("DB_MAX_OPEN_CONNS", 25),
		DBMaxIdleConns:     envInt("DB_MAX_IDLE_CONNS", 10),
		DBConnMaxLifetime:  envDuration("DB_CONN_MAX_LIFETIME", 5*time.Minute),
		DBConnMaxIdleTime:  envDuration("DB_CONN_MAX_IDLE_TIME", 1*time.Minute),
		DBStatementTimeout: stmtTimeout,
		RequestTimeout:        envDuration("HTTP_REQUEST_TIMEOUT", 25*time.Second),
		ShutdownTimeout:       envDuration("HTTP_SHUTDOWN_TIMEOUT", 15*time.Second),
		SlowRequest:           envDuration("SLOW_REQUEST_THRESHOLD", 500*time.Millisecond),
		HTTPReadHeaderTimeout: envDuration("HTTP_READ_HEADER_TIMEOUT", 5*time.Second),
		HTTPReadTimeout:       envDuration("HTTP_READ_TIMEOUT", 30*time.Second),
		HTTPWriteTimeout:      envDuration("HTTP_WRITE_TIMEOUT", 30*time.Second),
		HTTPIdleTimeout:       envDuration("HTTP_IDLE_TIMEOUT", 60*time.Second),
		HTTPMaxHeaderBytes:    envInt("HTTP_MAX_HEADER_BYTES", 1<<20),
		RateLimitRPM:          envInt("RATE_LIMIT_RPM", 600),
		AuthRateLimitRPM:      envInt("AUTH_RATE_LIMIT_RPM", 20),
		RateLimitMaxIPs:       envInt("RATE_LIMIT_MAX_IPS", 10000),
		PprofEnabled:       envBool("PPROF_ENABLED", false),
		PprofToken:         strings.TrimSpace(os.Getenv("PPROF_TOKEN")),
		MetricsToken:       strings.TrimSpace(firstNonEmpty(os.Getenv("METRICS_TOKEN"), os.Getenv("PPROF_TOKEN"))),
	}
}

func normalizeDSN(dbURL string) string {
	if !strings.Contains(dbURL, "sslmode=") {
		sep := "?"
		if strings.Contains(dbURL, "?") {
			sep = "&"
		}
		dbURL += sep + "sslmode=require"
	}
	return dbURL
}

func appendStatementTimeout(dbURL string, timeout time.Duration) string {
	if timeout <= 0 {
		return dbURL
	}
	ms := int(timeout / time.Millisecond)
	if ms < 1 {
		ms = 1
	}
	if strings.Contains(strings.ToLower(dbURL), "statement_timeout") {
		return dbURL
	}
	opt := fmt.Sprintf("-c statement_timeout=%d", ms)
	sep := "?"
	if strings.Contains(dbURL, "?") {
		sep = "&"
	}
	return dbURL + sep + "options=" + strings.ReplaceAll(opt, " ", "+")
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return n
}

func envDuration(key string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	if d, err := time.ParseDuration(raw); err == nil {
		return d
	}
	if n, err := strconv.Atoi(raw); err == nil {
		return time.Duration(n) * time.Millisecond
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if raw == "" {
		return fallback
	}
	return raw == "1" || raw == "true" || raw == "yes" || raw == "on"
}

func parseOrigins(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, strings.TrimRight(p, "/"))
		}
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// ephemeralKeyFromSecret derives a deterministic non-secret placeholder for local-only use.
func ephemeralKeyFromSecret(secret string) string {
	// Not cryptographic material for production — local fallback only when APP_ENV != production.
	return fmt.Sprintf("dev-only-%s", secret)
}
