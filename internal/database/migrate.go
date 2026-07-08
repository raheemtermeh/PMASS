package database

import (
	"database/sql"
	"fmt"
	"log"
)

// EnsureSchema creates and upgrades schema for multi-tenant PMAS Live.
// Safe for repeated startup; never drops existing business data.
func EnsureSchema(db *sql.DB) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS tenants (
			id SERIAL PRIMARY KEY,
			slug VARCHAR(64) NOT NULL UNIQUE,
			name VARCHAR(255) NOT NULL,
			is_active BOOLEAN NOT NULL DEFAULT true,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS app_users (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
			email VARCHAR(255) NOT NULL,
			password_hash TEXT NOT NULL,
			full_name VARCHAR(255) NOT NULL,
			role VARCHAR(50) NOT NULL DEFAULT 'user',
			is_active BOOLEAN NOT NULL DEFAULT true,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS user_permissions (
			user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
			permission VARCHAR(100) NOT NULL,
			PRIMARY KEY (user_id, permission)
		)`,

		`CREATE TABLE IF NOT EXISTS subsystems (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			slug VARCHAR(255) NOT NULL,
			status VARCHAR(50) NOT NULL DEFAULT 'healthy',
			load_percentage INTEGER NOT NULL DEFAULT 0 CHECK (load_percentage >= 0 AND load_percentage <= 100)
		)`,

		`CREATE TABLE IF NOT EXISTS team_members (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			avatar_url TEXT,
			role VARCHAR(255) NOT NULL,
			subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE SET NULL,
			capacity_weight NUMERIC(5,2) NOT NULL DEFAULT 1.00
		)`,

		`CREATE TABLE IF NOT EXISTS operational_items (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			ticket_code VARCHAR(50) NOT NULL,
			title VARCHAR(255) NOT NULL,
			description TEXT,
			type VARCHAR(50) NOT NULL,
			severity VARCHAR(50) NOT NULL,
			status VARCHAR(50) NOT NULL,
			origin_subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE SET NULL,
			assigned_to VARCHAR(255),
			linked_pr VARCHAR(255),
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			completed_at TIMESTAMPTZ
		)`,

		`CREATE TABLE IF NOT EXISTS graph_edges (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			source_id INTEGER NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
			target_id INTEGER NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
			edge_type VARCHAR(100) NOT NULL,
			weight NUMERIC(5,2) NOT NULL DEFAULT 1.00
		)`,

		`CREATE TABLE IF NOT EXISTS design_tokens (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			category VARCHAR(50) NOT NULL,
			token_data JSONB NOT NULL
		)`,

		`CREATE TABLE IF NOT EXISTS ui_assets (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			size VARCHAR(50) NOT NULL,
			cdn_status VARCHAR(50) NOT NULL,
			date VARCHAR(50) NOT NULL
		)`,

		`CREATE TABLE IF NOT EXISTS marketing_campaigns (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			leads INTEGER NOT NULL DEFAULT 0,
			conversion NUMERIC(5,2) NOT NULL DEFAULT 0.0,
			spend NUMERIC(10,2) NOT NULL DEFAULT 0.00,
			status VARCHAR(50) NOT NULL DEFAULT 'Active',
			dependent_subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE SET NULL
		)`,

		`CREATE TABLE IF NOT EXISTS credentials (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			value TEXT NOT NULL,
			description TEXT,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS finance_entries (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			title VARCHAR(255) NOT NULL,
			category VARCHAR(50) NOT NULL DEFAULT 'opex',
			amount NUMERIC(14,2) NOT NULL DEFAULT 0,
			period VARCHAR(50),
			status VARCHAR(50) NOT NULL DEFAULT 'Active',
			notes TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS compliance_controls (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			code VARCHAR(100) NOT NULL,
			title VARCHAR(255) NOT NULL,
			framework VARCHAR(50),
			status VARCHAR(50) NOT NULL DEFAULT 'Pending',
			owner_name VARCHAR(255),
			notes TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS infra_nodes (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			node_type VARCHAR(50) NOT NULL DEFAULT 'server',
			status VARCHAR(50) NOT NULL DEFAULT 'healthy',
			cpu_pct INTEGER NOT NULL DEFAULT 0 CHECK (cpu_pct >= 0 AND cpu_pct <= 100),
			ram_pct INTEGER NOT NULL DEFAULT 0 CHECK (ram_pct >= 0 AND ram_pct <= 100),
			region VARCHAR(100),
			notes TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS section_work_items (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			section VARCHAR(50) NOT NULL,
			kind VARCHAR(50) NOT NULL DEFAULT 'task',
			title VARCHAR(255) NOT NULL,
			description TEXT,
			status VARCHAR(50) NOT NULL DEFAULT 'Backlog',
			priority VARCHAR(50) NOT NULL DEFAULT 'Medium',
			assignee VARCHAR(255),
			due_date VARCHAR(50),
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
	}

	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("migrate create failed: %w\n%s", err, stmt)
		}
	}

	upgrades := []string{
		`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`,
		`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1`,
		`ALTER TABLE subsystems ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`,
		`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`,
		`ALTER TABLE operational_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`,
		`ALTER TABLE graph_edges ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`,
		`ALTER TABLE design_tokens ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`,
		`ALTER TABLE ui_assets ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`,
		`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`,
		`ALTER TABLE credentials ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`,

		// Allow multi-tenant roles (drops legacy super_admin|user-only check).
		`ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check`,
		`ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('platform_admin', 'tenant_admin', 'user', 'super_admin'))`,

		// Relax legacy global uniqueness so tenant-scoped constraints can take over.
		`ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_email_key`,
		`ALTER TABLE subsystems DROP CONSTRAINT IF EXISTS subsystems_slug_key`,
		`ALTER TABLE operational_items DROP CONSTRAINT IF EXISTS operational_items_ticket_code_key`,
		`ALTER TABLE design_tokens DROP CONSTRAINT IF EXISTS design_tokens_category_key`,
		`ALTER TABLE ui_assets DROP CONSTRAINT IF EXISTS ui_assets_name_key`,
		`ALTER TABLE credentials DROP CONSTRAINT IF EXISTS credentials_name_key`,

		`CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_platform_email ON app_users (email) WHERE tenant_id IS NULL`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_tenant_email ON app_users (tenant_id, email) WHERE tenant_id IS NOT NULL`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_subsystems_tenant_slug ON subsystems (tenant_id, slug)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_operational_items_tenant_ticket ON operational_items (tenant_id, ticket_code)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_design_tokens_tenant_category ON design_tokens (tenant_id, category)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_ui_assets_tenant_name ON ui_assets (tenant_id, name)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_tenant_name ON credentials (tenant_id, name)`,

		`CREATE INDEX IF NOT EXISTS idx_app_users_tenant ON app_users(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_subsystems_tenant ON subsystems(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_team_members_tenant ON team_members(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_operational_items_tenant ON operational_items(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_graph_edges_tenant ON graph_edges(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant ON marketing_campaigns(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_credentials_tenant ON credentials(tenant_id)`,

		// Align finance / compliance / infra columns with CRUD handlers.
		`ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS period VARCHAR(50)`,
		`ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active'`,
		`ALTER TABLE compliance_controls ADD COLUMN IF NOT EXISTS code VARCHAR(100)`,
		`ALTER TABLE infra_nodes ADD COLUMN IF NOT EXISTS node_type VARCHAR(50) DEFAULT 'server'`,
		`ALTER TABLE infra_nodes ADD COLUMN IF NOT EXISTS ram_pct INTEGER DEFAULT 0`,
		`ALTER TABLE infra_nodes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,

		`CREATE INDEX IF NOT EXISTS idx_section_work_items_tenant ON section_work_items(tenant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_section_work_items_section ON section_work_items(tenant_id, section)`,
	}

	for _, stmt := range upgrades {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("migrate upgrade failed: %w\n%s", err, stmt)
		}
	}

	if err := promoteLegacyPlatformAdmin(db); err != nil {
		return err
	}

	log.Println("[Database] Multi-tenant schema ensured")
	return nil
}

// promoteLegacyPlatformAdmin converts the first orphan super_admin (no tenant)
// leftover from pre-tenant installs into a platform_admin.
func promoteLegacyPlatformAdmin(db *sql.DB) error {
	_, err := db.Exec(`
		UPDATE app_users
		SET role = 'platform_admin', tenant_id = NULL
		WHERE id IN (
			SELECT id FROM app_users
			WHERE tenant_id IS NULL AND role IN ('super_admin', 'platform_admin')
			ORDER BY id
			LIMIT 1
		)
	`)
	return err
}
