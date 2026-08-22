package database

import (
	"database/sql"
	"fmt"
	"log"
)

// EnsurePerfIndexes creates composite/partial indexes that match actual
// query predicates (company scope + deleted_at + status/sort/join keys).
// Safe to re-run. Does not drop existing single-column indexes.
func EnsurePerfIndexes(db *sql.DB) error {
	statements := []string{
		`CREATE EXTENSION IF NOT EXISTS pg_trgm`,

		// products — dashboard, lists, owner/manager "my products", search
		`CREATE INDEX IF NOT EXISTS idx_products_company_updated_live
			ON products (company_id, updated_at DESC) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_products_company_status_live
			ON products (company_id, status) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_products_company_owner_live
			ON products (company_id, owner_id) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_products_company_manager_live
			ON products (company_id, manager_id) WHERE deleted_at IS NULL AND manager_id IS NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_products_name_trgm
			ON products USING gin (LOWER(name) gin_trgm_ops)`,

		// tasks — dashboard COUNTs, assignee, due dates, blocked/review alerts
		`CREATE INDEX IF NOT EXISTS idx_tasks_company_status_live
			ON tasks (company_id, status) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_company_assignee_live
			ON tasks (company_id, assignee_id, status) WHERE deleted_at IS NULL AND assignee_id IS NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_company_due_live
			ON tasks (company_id, due_date) WHERE deleted_at IS NULL AND due_date IS NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_company_feature
			ON tasks (company_id, feature_id) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm
			ON tasks USING gin (LOWER(title) gin_trgm_ops)`,

		// projects
		`CREATE INDEX IF NOT EXISTS idx_projects_company_updated_live
			ON projects (company_id, updated_at DESC) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_projects_company_product_live
			ON projects (company_id, product_id) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_projects_company_status_live
			ON projects (company_id, status) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_projects_company_owner_live
			ON projects (company_id, owner_id) WHERE deleted_at IS NULL AND owner_id IS NOT NULL`,

		// features
		`CREATE INDEX IF NOT EXISTS idx_features_company_updated_live
			ON features (company_id, updated_at DESC) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_features_company_product_live
			ON features (company_id, product_id) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_features_company_project_live
			ON features (company_id, project_id) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_features_company_status_live
			ON features (company_id, status) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_features_title_trgm
			ON features USING gin (LOWER(title) gin_trgm_ops)`,

		// notifications inbox (hot dashboard + bell)
		`CREATE INDEX IF NOT EXISTS idx_notifications_inbox
			ON notifications (company_id, receiver_id, created_at DESC)
			WHERE COALESCE(is_archived, false) = false`,
		`CREATE INDEX IF NOT EXISTS idx_notifications_unread
			ON notifications (company_id, receiver_id)
			WHERE is_read = false AND COALESCE(is_archived, false) = false`,

		// activity feed / trend chart
		`CREATE INDEX IF NOT EXISTS idx_activity_logs_company_created
			ON activity_logs (company_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_created
			ON activity_logs (company_id, entity_type, entity_id, created_at DESC)`,

		// stage instances — flow graph + pipeline alerts
		`CREATE INDEX IF NOT EXISTS idx_stage_instances_product_stage
			ON stage_instances (company_id, product_id, stage_id, updated_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_stage_instances_company_status
			ON stage_instances (company_id, status, updated_at)`,

		// employees — auth mapping + workload
		`CREATE INDEX IF NOT EXISTS idx_employees_company_user
			ON employees (company_id, user_id) WHERE user_id IS NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_employees_company_status
			ON employees (company_id, status)`,
		`CREATE INDEX IF NOT EXISTS idx_employees_name_trgm
			ON employees USING gin ((LOWER(first_name) || ' ' || LOWER(last_name)) gin_trgm_ops)`,
		`CREATE INDEX IF NOT EXISTS idx_employees_email_trgm
			ON employees USING gin (LOWER(email) gin_trgm_ops)`,

		// org lists
		`CREATE INDEX IF NOT EXISTS idx_departments_company_status
			ON departments (company_id, status)`,
		`CREATE INDEX IF NOT EXISTS idx_teams_company_dept
			ON teams (company_id, department_id)`,

		// collaboration
		`CREATE INDEX IF NOT EXISTS idx_comments_entity
			ON comments (company_id, entity_type, entity_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_attachments_entity
			ON attachments (company_id, entity_type, entity_id)`,

		// tenants → company (VSM scope)
		`CREATE INDEX IF NOT EXISTS idx_tenants_company_id
			ON tenants (company_id) WHERE company_id IS NOT NULL`,
	}

	for i, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("perf index statement %d failed: %w\nSQL: %s", i+1, err, stmt)
		}
	}
	log.Println("[Bootstrap] Performance indexes ready.")
	return nil
}
