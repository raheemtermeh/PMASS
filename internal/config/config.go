package config

import (
	"os"
	"strings"
)

// Config holds all service configurations.
type Config struct {
	SupabaseDBURL string
	ServerPort    string
}

// Load reads config from environment variables or returns default baked-in values.
func Load() *Config {
	dbURL := os.Getenv("SUPABASE_DB_URL")
	if dbURL == "" {
		// Baked in Supabase credentials as default fallback
		dbURL = "postgresql://postgres:ts7w%2FUhS%3Fa2g66%2B@198.18.0.230:5432/postgres"
	}

	// Self-healing: Percent-encode special characters in the password if present
	if strings.Contains(dbURL, "ts7w/UhS?a2g66+") {
		dbURL = strings.ReplaceAll(dbURL, "ts7w/UhS?a2g66+", "ts7w%2FUhS%3Fa2g66%2B")
	}

	// Self-healing: Resolve host domain to direct IPv4 to bypass local IPv6 connection issues
	if strings.Contains(dbURL, "@db.ldgrvggiiigzcrchbkby.supabase.co") {
		dbURL = strings.ReplaceAll(dbURL, "@db.ldgrvggiiigzcrchbkby.supabase.co", "@198.18.0.230")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	return &Config{
		SupabaseDBURL: dbURL,
		ServerPort:    port,
	}
}
