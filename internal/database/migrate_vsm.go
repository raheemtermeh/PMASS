package database

import (
	"database/sql"
	"fmt"
	"log"
)

// EnsureVSMSchema creates Product-domain tables per Backend Analysis Document (UUID PKs, company_id tenant scope).
func EnsureVSMSchema(db *sql.DB) error {
	statements := []string{
		`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,

		// Bridge: tenants (auth) ↔ companies (domain Tenant = Company)
		`CREATE TABLE IF NOT EXISTS companies (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(255) NOT NULL,
			slug VARCHAR(64) NOT NULL UNIQUE,
			status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
			version INTEGER NOT NULL DEFAULT 1,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id)`,

		`CREATE TABLE IF NOT EXISTS employees (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			first_name VARCHAR(255) NOT NULL,
			last_name VARCHAR(255) NOT NULL,
			email VARCHAR(255) NOT NULL,
			phone VARCHAR(64) NOT NULL DEFAULT '',
			status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
			user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
			version INTEGER NOT NULL DEFAULT 1,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (company_id, email)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id)`,
		`CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status)`,

		`CREATE TABLE IF NOT EXISTS departments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			manager_id UUID REFERENCES employees(id),
			name VARCHAR(255) NOT NULL,
			status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
			version INTEGER NOT NULL DEFAULT 1,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_departments_company ON departments(company_id)`,
		`CREATE INDEX IF NOT EXISTS idx_departments_manager ON departments(manager_id)`,
		`CREATE INDEX IF NOT EXISTS idx_departments_status ON departments(status)`,

		`CREATE TABLE IF NOT EXISTS teams (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			department_id UUID NOT NULL REFERENCES departments(id),
			lead_id UUID REFERENCES employees(id),
			name VARCHAR(255) NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
			version INTEGER NOT NULL DEFAULT 1,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_teams_company ON teams(company_id)`,
		`CREATE INDEX IF NOT EXISTS idx_teams_department ON teams(department_id)`,

		`CREATE TABLE IF NOT EXISTS team_members_vsm (
			company_id UUID NOT NULL REFERENCES companies(id),
			team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
			employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
			PRIMARY KEY (team_id, employee_id)
		)`,

		`CREATE TABLE IF NOT EXISTS products (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			owner_id UUID NOT NULL REFERENCES employees(id),
			name VARCHAR(255) NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			category VARCHAR(128) NOT NULL DEFAULT '',
			status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
			execution_model VARCHAR(64) NOT NULL,
			pipeline_id UUID,
			version INTEGER NOT NULL DEFAULT 1,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			CONSTRAINT products_execution_model_chk CHECK (
				execution_model IN ('DIRECT_TASK', 'PROJECT_FEATURE_TASK', 'FEATURE_TASK')
			),
			CONSTRAINT products_status_chk CHECK (
				status IN ('DRAFT', 'READY', 'ACTIVE', 'COMPLETED', 'ARCHIVED')
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id)`,
		`CREATE INDEX IF NOT EXISTS idx_products_owner ON products(owner_id)`,
		`CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)`,
		`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`,

		`CREATE TABLE IF NOT EXISTS pipelines (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			product_id UUID NOT NULL UNIQUE REFERENCES products(id),
			name VARCHAR(255) NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			version INTEGER NOT NULL DEFAULT 1,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_pipelines_company ON pipelines(company_id)`,

		`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_pipeline_fk`,
		`ALTER TABLE products ADD CONSTRAINT products_pipeline_fk
			FOREIGN KEY (pipeline_id) REFERENCES pipelines(id)`,

		`CREATE TABLE IF NOT EXISTS stages (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			"order" INTEGER NOT NULL,
			entry_criteria TEXT NOT NULL DEFAULT '',
			exit_criteria TEXT NOT NULL DEFAULT '',
			department_id UUID REFERENCES departments(id),
			version INTEGER NOT NULL DEFAULT 1,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_stages_pipeline ON stages(pipeline_id)`,

		`CREATE TABLE IF NOT EXISTS stage_instances (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			product_id UUID NOT NULL REFERENCES products(id),
			stage_id UUID NOT NULL REFERENCES stages(id),
			department_id UUID REFERENCES departments(id),
			status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
			started_at TIMESTAMPTZ,
			finished_at TIMESTAMPTZ,
			reject_reason TEXT NOT NULL DEFAULT '',
			duration_seconds BIGINT,
			version INTEGER NOT NULL DEFAULT 1,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			CONSTRAINT stage_instances_status_chk CHECK (
				status IN ('PENDING', 'ACTIVE', 'COMPLETED', 'REJECTED')
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_stage_instances_product ON stage_instances(product_id)`,
		`CREATE INDEX IF NOT EXISTS idx_stage_instances_company ON stage_instances(company_id)`,
		// Only one ACTIVE stage instance per product (PDF §2.12).
		`CREATE UNIQUE INDEX IF NOT EXISTS uq_stage_instances_one_active
			ON stage_instances(product_id) WHERE status = 'ACTIVE'`,
	}

	for i, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("vsm schema statement %d failed: %w\nSQL: %s", i+1, err, stmt)
		}
	}

	// Some DBs already have legacy tables named projects/features/tasks/etc.
	// CREATE TABLE IF NOT EXISTS would no-op and leave incompatible columns.
	if err := ensurePlanningAndSupportTables(db); err != nil {
		return err
	}

	if err := backfillCompaniesFromTenants(db); err != nil {
		return err
	}

	log.Println("[Bootstrap] VSM (Product-domain) schema ready.")
	return nil
}

func ensurePlanningAndSupportTables(db *sql.DB) error {
	type tableSpec struct {
		name     string
		required string
		create   string
		indexes  []string
	}

	specs := []tableSpec{
		{
			name: "projects", required: "company_id",
			create: `CREATE TABLE projects (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				company_id UUID NOT NULL REFERENCES companies(id),
				product_id UUID NOT NULL REFERENCES products(id),
				name VARCHAR(255) NOT NULL,
				description TEXT NOT NULL DEFAULT '',
				status VARCHAR(32) NOT NULL DEFAULT 'BACKLOG',
				version INTEGER NOT NULL DEFAULT 1,
				created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			indexes: []string{
				`CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id)`,
				`CREATE INDEX IF NOT EXISTS idx_projects_product ON projects(product_id)`,
				`CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)`,
			},
		},
		{
			name: "features", required: "company_id",
			create: `CREATE TABLE features (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				company_id UUID NOT NULL REFERENCES companies(id),
				product_id UUID NOT NULL REFERENCES products(id),
				project_id UUID NOT NULL REFERENCES projects(id),
				title VARCHAR(255) NOT NULL,
				status VARCHAR(32) NOT NULL DEFAULT 'BACKLOG',
				priority VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
				version INTEGER NOT NULL DEFAULT 1,
				created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			indexes: []string{
				`CREATE INDEX IF NOT EXISTS idx_features_company ON features(company_id)`,
				`CREATE INDEX IF NOT EXISTS idx_features_project ON features(project_id)`,
			},
		},
		{
			name: "tasks", required: "company_id",
			create: `CREATE TABLE tasks (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				company_id UUID NOT NULL REFERENCES companies(id),
				feature_id UUID NOT NULL REFERENCES features(id),
				assignee_id UUID REFERENCES employees(id),
				title VARCHAR(255) NOT NULL,
				status VARCHAR(32) NOT NULL DEFAULT 'BACKLOG',
				priority VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
				due_date TIMESTAMPTZ,
				version INTEGER NOT NULL DEFAULT 1,
				created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			indexes: []string{
				`CREATE INDEX IF NOT EXISTS idx_tasks_company ON tasks(company_id)`,
				`CREATE INDEX IF NOT EXISTS idx_tasks_feature ON tasks(feature_id)`,
				`CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id)`,
				`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
			},
		},
		{
			name: "activity_logs", required: "company_id",
			create: `CREATE TABLE activity_logs (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				company_id UUID NOT NULL REFERENCES companies(id),
				entity_type VARCHAR(64) NOT NULL,
				entity_id UUID NOT NULL,
				action VARCHAR(128) NOT NULL,
				actor_id UUID,
				payload JSONB,
				created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			indexes: []string{
				`CREATE INDEX IF NOT EXISTS idx_activity_logs_company ON activity_logs(company_id)`,
				`CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id)`,
				`CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at)`,
			},
		},
		{
			name: "notifications", required: "company_id",
			create: `CREATE TABLE notifications (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				company_id UUID NOT NULL REFERENCES companies(id),
				receiver_id UUID NOT NULL REFERENCES employees(id),
				type VARCHAR(64) NOT NULL,
				title VARCHAR(255) NOT NULL,
				body TEXT NOT NULL DEFAULT '',
				is_read BOOLEAN NOT NULL DEFAULT false,
				version INTEGER NOT NULL DEFAULT 1,
				created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			indexes: []string{
				`CREATE INDEX IF NOT EXISTS idx_notifications_receiver ON notifications(company_id, receiver_id)`,
			},
		},
		{
			name: "comments", required: "company_id",
			create: `CREATE TABLE comments (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				company_id UUID NOT NULL REFERENCES companies(id),
				entity_type VARCHAR(64) NOT NULL,
				entity_id UUID NOT NULL,
				author_id UUID NOT NULL REFERENCES employees(id),
				body TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
		},
		{
			name: "attachments", required: "company_id",
			create: `CREATE TABLE attachments (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				company_id UUID NOT NULL REFERENCES companies(id),
				entity_type VARCHAR(64) NOT NULL,
				entity_id UUID NOT NULL,
				file_name VARCHAR(255) NOT NULL,
				path TEXT NOT NULL,
				size BIGINT NOT NULL DEFAULT 0,
				mime_type VARCHAR(128) NOT NULL DEFAULT '',
				created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
		},
	}

	for _, spec := range specs {
		if err := recreateIfIncompatible(db, spec.name, spec.required, spec.create); err != nil {
			return fmt.Errorf("ensure table %s: %w", spec.name, err)
		}
		for _, idx := range spec.indexes {
			if _, err := db.Exec(idx); err != nil {
				return fmt.Errorf("index on %s failed: %w\nSQL: %s", spec.name, err, idx)
			}
		}
	}
	return nil
}

func backfillCompaniesFromTenants(db *sql.DB) error {
	_, err := db.Exec(`
		INSERT INTO companies (id, name, slug, status)
		SELECT gen_random_uuid(), t.name, t.slug, CASE WHEN t.is_active THEN 'ACTIVE' ELSE 'ARCHIVED' END
		FROM tenants t
		WHERE t.company_id IS NULL
		  AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.slug = t.slug)
	`)
	if err != nil {
		return fmt.Errorf("backfill companies: %w", err)
	}
	_, err = db.Exec(`
		UPDATE tenants t
		SET company_id = c.id
		FROM companies c
		WHERE t.company_id IS NULL AND c.slug = t.slug
	`)
	if err != nil {
		return fmt.Errorf("link tenants to companies: %w", err)
	}
	return nil
}
