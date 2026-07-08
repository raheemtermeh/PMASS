package config

import (
	"fmt"
	"log"
	"os"
	"strings"
)

// Config holds all service configurations.
type Config struct {
	SupabaseDBURL  string
	ServerPort     string
	JWTSecret      string
	EncryptionKey  string
	CORSOrigins    []string
	AppEnv         string
	CookieSecure   bool
}

// Load reads config from environment variables. Fails closed on missing secrets in production.
func Load() *Config {
	appEnv := strings.ToLower(strings.TrimSpace(firstNonEmpty(os.Getenv("APP_ENV"), os.Getenv("GO_ENV"), "development")))

	dbURL := firstNonEmpty(os.Getenv("SUPABASE_DB_URL"), os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		log.Fatal("[Config] SUPABASE_DB_URL (or DATABASE_URL) is required. Hardcoded DB credentials are disabled.")
	}
	dbURL = normalizeDSN(dbURL)

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
		origins = []string{
			"http://localhost:3000",
			"http://127.0.0.1:3000",
		}
	}

	return &Config{
		SupabaseDBURL: dbURL,
		ServerPort:    port,
		JWTSecret:     jwtSecret,
		EncryptionKey: encKey,
		CORSOrigins:   origins,
		AppEnv:        appEnv,
		CookieSecure:  appEnv == "production" || strings.EqualFold(os.Getenv("COOKIE_SECURE"), "true"),
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
