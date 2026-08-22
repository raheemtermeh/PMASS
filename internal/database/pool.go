package database

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// PoolOptions are production-safe database/sql pool settings.
type PoolOptions struct {
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
}

// DefaultPoolOptions returns defaults sized for a single API replica
// against PostgreSQL max_connections≈100. Tune via env in production.
func DefaultPoolOptions() PoolOptions {
	return PoolOptions{
		MaxOpenConns:    25,
		MaxIdleConns:    10,
		ConnMaxLifetime: 5 * time.Minute,
		ConnMaxIdleTime: 1 * time.Minute,
	}
}

// ConfigurePool applies pool limits. Idle cannot exceed open.
func ConfigurePool(db *sql.DB, opt PoolOptions) {
	if opt.MaxOpenConns < 1 {
		opt.MaxOpenConns = 25
	}
	if opt.MaxIdleConns < 1 {
		opt.MaxIdleConns = 10
	}
	if opt.MaxIdleConns > opt.MaxOpenConns {
		opt.MaxIdleConns = opt.MaxOpenConns
	}
	db.SetMaxOpenConns(opt.MaxOpenConns)
	db.SetMaxIdleConns(opt.MaxIdleConns)
	if opt.ConnMaxLifetime > 0 {
		db.SetConnMaxLifetime(opt.ConnMaxLifetime)
	}
	if opt.ConnMaxIdleTime > 0 {
		db.SetConnMaxIdleTime(opt.ConnMaxIdleTime)
	}
}

// PingWithTimeout verifies the database without blocking forever.
func PingWithTimeout(db *sql.DB, timeout time.Duration) error {
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	return db.PingContext(ctx)
}

// VerifyStatementTimeout reads the active session setting and compares it to
// the configured expectation. Mismatches return an error for startup logging;
// callers should not treat this as fatal because DSN options may be overridden
// by server roles or PgBouncer.
func VerifyStatementTimeout(db *sql.DB, expected time.Duration) error {
	if expected <= 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	var raw string
	if err := db.QueryRowContext(ctx, `SHOW statement_timeout`).Scan(&raw); err != nil {
		return fmt.Errorf("show statement_timeout: %w", err)
	}
	got, err := parsePGInterval(raw)
	if err != nil {
		return fmt.Errorf("parse statement_timeout %q: %w", raw, err)
	}
	want := expected.Round(time.Millisecond)
	got = got.Round(time.Millisecond)
	if got != want {
		return fmt.Errorf("statement_timeout is %s, expected %s", got, want)
	}
	return nil
}

func parsePGInterval(raw string) (time.Duration, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.EqualFold(raw, "0") {
		return 0, nil
	}
	if d, err := time.ParseDuration(raw); err == nil {
		return d, nil
	}
	// Postgres may return ms for sub-second values, e.g. "15000ms".
	if strings.HasSuffix(raw, "ms") {
		n, err := strconv.ParseInt(strings.TrimSuffix(raw, "ms"), 10, 64)
		if err != nil {
			return 0, err
		}
		return time.Duration(n) * time.Millisecond, nil
	}
	// HH:MM:SS[.fraction]
	if strings.Contains(raw, ":") {
		parts := strings.Split(raw, ":")
		if len(parts) != 3 {
			return 0, fmt.Errorf("unsupported interval %q", raw)
		}
		h, err := strconv.Atoi(parts[0])
		if err != nil {
			return 0, err
		}
		m, err := strconv.Atoi(parts[1])
		if err != nil {
			return 0, err
		}
		secParts := strings.SplitN(parts[2], ".", 2)
		s, err := strconv.Atoi(secParts[0])
		if err != nil {
			return 0, err
		}
		d := time.Duration(h)*time.Hour + time.Duration(m)*time.Minute + time.Duration(s)*time.Second
		if len(secParts) == 2 && secParts[1] != "" {
			frac, err := strconv.ParseFloat("0."+secParts[1], 64)
			if err != nil {
				return 0, err
			}
			d += time.Duration(frac * float64(time.Second))
		}
		return d, nil
	}
	return 0, fmt.Errorf("unsupported interval %q", raw)
}
