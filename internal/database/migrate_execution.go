package database

import (
	"database/sql"
	"fmt"
	"log"
)

// EnsureExecutionModels extends products with configurable work-map configs and
// marks system parent rows on projects/features for skipped storage layers.
func EnsureExecutionModels(db *sql.DB) error {
	statements := []string{
		`ALTER TABLE products ADD COLUMN IF NOT EXISTS execution_config JSONB`,

		`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_execution_model_chk`,
		`ALTER TABLE products ADD CONSTRAINT products_execution_model_chk CHECK (
			execution_model IN (
				'DIRECT_TASK',
				'PROJECT_FEATURE_TASK',
				'FEATURE_TASK',
				'SCRUM',
				'KANBAN',
				'OKRS',
				'CUSTOM'
			)
		)`,

		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false`,

		`CREATE INDEX IF NOT EXISTS idx_projects_product_system
			ON projects(company_id, product_id, is_system) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_features_product_system
			ON features(company_id, product_id, is_system) WHERE deleted_at IS NULL`,

		// At most one system project per product; one system feature per project.
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_one_system
			ON projects(company_id, product_id) WHERE is_system = true AND deleted_at IS NULL`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_features_one_system
			ON features(company_id, project_id) WHERE is_system = true AND deleted_at IS NULL`,
	}

	for i, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("execution models statement %d failed: %w\nSQL: %s", i+1, err, stmt)
		}
	}
	log.Println("[Bootstrap] Execution models schema ready.")
	return nil
}
