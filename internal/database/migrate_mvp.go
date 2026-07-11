package database

import (
	"database/sql"
	"fmt"
	"log"
)

// EnsureMVPExtras adds Roadmap MVP gaps: company settings, task deps, comment replies.
func EnsureMVPExtras(db *sql.DB) error {
	statements := []string{
		`ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE companies ADD COLUMN IF NOT EXISTS language VARCHAR(16) NOT NULL DEFAULT 'en'`,
		`ALTER TABLE companies ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'UTC'`,

		`ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES comments(id) ON DELETE SET NULL`,
		`ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false`,

		`ALTER TABLE attachments ADD COLUMN IF NOT EXISTS category VARCHAR(64) NOT NULL DEFAULT 'general'`,

		`CREATE TABLE IF NOT EXISTS task_dependencies (
			company_id UUID NOT NULL REFERENCES companies(id),
			task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
			depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (task_id, depends_on_task_id),
			CHECK (task_id <> depends_on_task_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_task_deps_company ON task_dependencies(company_id)`,

		`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false`,
	}

	for i, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("mvp extras statement %d failed: %w\nSQL: %s", i+1, err, stmt)
		}
	}
	log.Println("[Bootstrap] MVP extras schema ready.")
	return nil
}
