package database

import (
	"database/sql"
	"testing"
	"time"

	_ "github.com/lib/pq"
)

func TestConfigurePoolClampsIdle(t *testing.T) {
	t.Parallel()

	db, err := sql.Open("postgres", "postgres://unused")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ConfigurePool(db, PoolOptions{
		MaxOpenConns:    5,
		MaxIdleConns:    20,
		ConnMaxLifetime: time.Minute,
		ConnMaxIdleTime: time.Minute,
	})

	if got := db.Stats().MaxOpenConnections; got != 5 {
		t.Fatalf("max open = %d, want 5", got)
	}
}

func TestParsePGInterval(t *testing.T) {
	t.Parallel()

	cases := []struct {
		in   string
		want time.Duration
	}{
		{"15s", 15 * time.Second},
		{"15000ms", 15 * time.Second},
		{"00:00:15", 15 * time.Second},
		{"0", 0},
	}
	for _, tc := range cases {
		got, err := parsePGInterval(tc.in)
		if err != nil {
			t.Fatalf("parse %q: %v", tc.in, err)
		}
		if got != tc.want {
			t.Fatalf("parse %q = %v, want %v", tc.in, got, tc.want)
		}
	}
}
