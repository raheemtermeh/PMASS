package database

import (
	"database/sql"
	"fmt"
	"log"
)

// EnsureMVPExtras adds Roadmap MVP gaps: company settings, task deps, comment replies,
// plus MVP Feature Planning additive gaps (product/project/feature/task lifecycle fields,
// membership tables, checklists, dependencies, auth tokens). All statements are additive
// (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS) and never drop existing data.
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

		// ---------------------------------------------------------------
		// app_users: username + refresh/reset token tables
		// ---------------------------------------------------------------
		`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS username VARCHAR(64)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_tenant_username ON app_users (tenant_id, username) WHERE username IS NOT NULL AND tenant_id IS NOT NULL`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_platform_username ON app_users (username) WHERE username IS NOT NULL AND tenant_id IS NULL`,

		`CREATE TABLE IF NOT EXISTS refresh_tokens (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
			token_hash TEXT NOT NULL UNIQUE,
			expires_at TIMESTAMPTZ NOT NULL,
			revoked_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)`,

		`CREATE TABLE IF NOT EXISTS password_reset_tokens (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
			token_hash TEXT NOT NULL UNIQUE,
			expires_at TIMESTAMPTZ NOT NULL,
			used_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id)`,

		// ---------------------------------------------------------------
		// products: planning metadata + soft delete + relaxed status check
		// ---------------------------------------------------------------
		`ALTER TABLE products ADD COLUMN IF NOT EXISTS code VARCHAR(64)`,
		`ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(64)`,
		`ALTER TABLE products ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES employees(id)`,
		`ALTER TABLE products ADD COLUMN IF NOT EXISTS priority VARCHAR(32)`,
		`ALTER TABLE products ADD COLUMN IF NOT EXISTS vision TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE products ADD COLUMN IF NOT EXISTS goal TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE products ADD COLUMN IF NOT EXISTS success_metrics TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE products ADD COLUMN IF NOT EXISTS business_value TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE products ADD COLUMN IF NOT EXISTS visibility VARCHAR(32) NOT NULL DEFAULT 'ORGANIZATION'`,
		`ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
		`CREATE INDEX IF NOT EXISTS idx_products_manager ON products(manager_id)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_code ON products(company_id, code) WHERE code IS NOT NULL`,

		`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_chk`,
		`ALTER TABLE products ADD CONSTRAINT products_status_chk CHECK (
			status IN ('DRAFT', 'READY', 'ACTIVE', 'COMPLETED', 'ARCHIVED', 'ON_HOLD', 'PLANNING')
		)`,

		`CREATE TABLE IF NOT EXISTS product_members (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
			employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
			role VARCHAR(64) NOT NULL DEFAULT 'MEMBER',
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (product_id, employee_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_product_members_company ON product_members(company_id)`,
		`CREATE INDEX IF NOT EXISTS idx_product_members_product ON product_members(product_id)`,

		// ---------------------------------------------------------------
		// pipelines / stages: lifecycle + visual metadata
		// ---------------------------------------------------------------
		`ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'`,
		`ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`,
		`ALTER TABLE stages ADD COLUMN IF NOT EXISTS color VARCHAR(32) NOT NULL DEFAULT '#64748b'`,

		// ---------------------------------------------------------------
		// projects: planning metadata + soft delete + audit trail
		// ---------------------------------------------------------------
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS code VARCHAR(64)`,
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS goal TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority VARCHAR(32)`,
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES employees(id)`,
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES employees(id)`,
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ`,
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_end_date TIMESTAMPTZ`,
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimated_duration_days INTEGER`,
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by UUID`,
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_by UUID`,
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_by UUID`,
		`CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id)`,
		`CREATE INDEX IF NOT EXISTS idx_projects_manager ON projects(manager_id)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_company_code ON projects(company_id, code) WHERE code IS NOT NULL`,

		`CREATE TABLE IF NOT EXISTS project_members (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
			role VARCHAR(64) NOT NULL DEFAULT 'MEMBER',
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (project_id, employee_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_project_members_company ON project_members(company_id)`,
		`CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id)`,

		// ---------------------------------------------------------------
		// features: planning metadata + hierarchy + soft delete
		// ---------------------------------------------------------------
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS code VARCHAR(64)`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS goal TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS feature_type VARCHAR(64)`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES employees(id)`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id)`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS parent_feature_id UUID REFERENCES features(id)`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS target_end_date TIMESTAMPTZ`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS estimated_effort INTEGER`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS progress_pct INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS created_by UUID`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS updated_by UUID`,
		`ALTER TABLE features ADD COLUMN IF NOT EXISTS archived_by UUID`,
		`CREATE INDEX IF NOT EXISTS idx_features_owner ON features(owner_id)`,
		`CREATE INDEX IF NOT EXISTS idx_features_team ON features(team_id)`,
		`CREATE INDEX IF NOT EXISTS idx_features_parent ON features(parent_feature_id)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_features_company_code ON features(company_id, code) WHERE code IS NOT NULL`,

		`CREATE TABLE IF NOT EXISTS feature_dependencies (
			company_id UUID NOT NULL REFERENCES companies(id),
			feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
			depends_on_feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (feature_id, depends_on_feature_id),
			CHECK (feature_id <> depends_on_feature_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_feature_deps_company ON feature_dependencies(company_id)`,

		`CREATE TABLE IF NOT EXISTS feature_members (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
			employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
			role VARCHAR(64) NOT NULL DEFAULT 'MEMBER',
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (feature_id, employee_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_feature_members_company ON feature_members(company_id)`,
		`CREATE INDEX IF NOT EXISTS idx_feature_members_feature ON feature_members(feature_id)`,

		// ---------------------------------------------------------------
		// tasks: planning metadata + effort tracking + soft delete
		// ---------------------------------------------------------------
		`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type VARCHAR(64)`,
		`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ`,
		`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER`,
		`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_minutes INTEGER`,
		`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_pct INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
		`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by UUID`,
		`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_by UUID`,
		`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_by UUID`,

		`CREATE TABLE IF NOT EXISTS task_checklists (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
			title VARCHAR(255) NOT NULL,
			position INTEGER NOT NULL DEFAULT 0,
			is_done BOOLEAN NOT NULL DEFAULT false,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_task_checklists_company ON task_checklists(company_id)`,
		`CREATE INDEX IF NOT EXISTS idx_task_checklists_task ON task_checklists(task_id)`,

		// ---------------------------------------------------------------
		// comment_mentions: notify employees/teams referenced in a comment
		// ---------------------------------------------------------------
		`CREATE TABLE IF NOT EXISTS comment_mentions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
			mentioned_employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
			mentioned_team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			CHECK (mentioned_employee_id IS NOT NULL OR mentioned_team_id IS NOT NULL)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_comment_mentions_company ON comment_mentions(company_id)`,
		`CREATE INDEX IF NOT EXISTS idx_comment_mentions_comment ON comment_mentions(comment_id)`,
		`CREATE INDEX IF NOT EXISTS idx_comment_mentions_employee ON comment_mentions(mentioned_employee_id)`,
		`CREATE INDEX IF NOT EXISTS idx_comment_mentions_team ON comment_mentions(mentioned_team_id)`,
	}

	for i, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("mvp extras statement %d failed: %w\nSQL: %s", i+1, err, stmt)
		}
	}
	log.Println("[Bootstrap] MVP extras schema ready.")
	return nil
}
