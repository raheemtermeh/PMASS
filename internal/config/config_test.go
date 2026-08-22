package config

import (
	"strings"
	"testing"
	"time"
)

func TestAppendStatementTimeout(t *testing.T) {
	t.Parallel()

	base := "postgres://user:pass@host/db?sslmode=require"
	got := appendStatementTimeout(base, 15*time.Second)
	if !strings.Contains(got, "statement_timeout") {
		t.Fatalf("expected statement_timeout in DSN, got %q", got)
	}

	already := base + "&options=-c+statement_timeout%3D5000"
	if appendStatementTimeout(already, 15*time.Second) != already {
		t.Fatalf("should not duplicate statement_timeout option")
	}

	if appendStatementTimeout(base, 0) != base {
		t.Fatalf("zero timeout should leave DSN unchanged")
	}
}
