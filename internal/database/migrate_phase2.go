package database

import (
	"database/sql"
	"fmt"
	"log"
)

// EnsurePhase2Indexes adds only the indexes needed for Phase 2 pagination /
// ordering safety.
//
// It is safe to re-run (all statements use CREATE INDEX IF NOT EXISTS).
func EnsurePhase2Indexes(db *sql.DB) error {
	statements := []string{
		// ---------------------------------------------------------------
		// MVP list endpoints (tenant-scoped MVP tables)
		// ---------------------------------------------------------------
		// work-items: ORDER BY uses explicit CASE ordering + id DESC.
		`CREATE INDEX IF NOT EXISTS idx_section_work_items_tenant_section_status_pri_id_desc
			ON section_work_items (
				tenant_id,
				section,
				(CASE status
					WHEN 'In Progress' THEN 0
					WHEN 'Blocked' THEN 1
					WHEN 'Todo' THEN 2
					WHEN 'Backlog' THEN 3
					WHEN 'Done' THEN 4
					ELSE 5
				END),
				(CASE priority
					WHEN 'Critical' THEN 0
					WHEN 'High' THEN 1
					WHEN 'Medium' THEN 2
					ELSE 3
				END),
				id DESC
			)`,

		// graph edges: ORDER BY id with tenant_id predicate + LIMIT/OFFSET.
		`CREATE INDEX IF NOT EXISTS idx_graph_edges_tenant_id
			ON graph_edges (tenant_id, id)`,

		// operations items: ORDER BY id with tenant_id predicate + LIMIT/OFFSET.
		`CREATE INDEX IF NOT EXISTS idx_operational_items_tenant_id
			ON operational_items (tenant_id, id)`,

		// infra nodes: ORDER BY id with tenant_id predicate + LIMIT/OFFSET.
		`CREATE INDEX IF NOT EXISTS idx_infra_nodes_tenant_id
			ON infra_nodes (tenant_id, id)`,

		// marketing campaigns: ORDER BY c.id with tenant_id predicate.
		`CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant_id
			ON marketing_campaigns (tenant_id, id)`,

		// design tokens + UI assets: ORDER BY id with tenant_id predicate.
		`CREATE INDEX IF NOT EXISTS idx_design_tokens_tenant_id
			ON design_tokens (tenant_id, id)`,
		`CREATE INDEX IF NOT EXISTS idx_ui_assets_tenant_id
			ON ui_assets (tenant_id, id)`,

		// topology + subsystems lists: ORDER BY id with tenant_id predicate.
		`CREATE INDEX IF NOT EXISTS idx_subsystems_tenant_id
			ON subsystems (tenant_id, id)`,
		`CREATE INDEX IF NOT EXISTS idx_team_members_tenant_id
			ON team_members (tenant_id, id)`,

		// finance + compliance MVP list endpoints we bounded in Phase 2.
		`CREATE INDEX IF NOT EXISTS idx_finance_entries_tenant_id
			ON finance_entries (tenant_id, id)`,
		`CREATE INDEX IF NOT EXISTS idx_compliance_controls_tenant_id
			ON compliance_controls (tenant_id, id)`,

		// ---------------------------------------------------------------
		// VSM: attachments list pagination index
		// ---------------------------------------------------------------
		`CREATE INDEX IF NOT EXISTS idx_attachments_entity_created_at_desc
			ON attachments (company_id, entity_type, entity_id, created_at DESC)`,

		// ---------------------------------------------------------------
		// Search: missing pg_trgm indexes for employee name parts
		// (query uses LOWER(first_name) LIKE, LOWER(last_name) LIKE).
		// ---------------------------------------------------------------
		`CREATE EXTENSION IF NOT EXISTS pg_trgm`,
		`CREATE INDEX IF NOT EXISTS idx_employees_first_name_trgm
			ON employees USING gin (LOWER(first_name) gin_trgm_ops)`,
		`CREATE INDEX IF NOT EXISTS idx_employees_last_name_trgm
			ON employees USING gin (LOWER(last_name) gin_trgm_ops)`,
	}

	for i, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("phase2 index statement %d failed: %w\nSQL: %s", i+1, err, stmt)
		}
	}

	log.Println("[Bootstrap] Phase 2 performance indexes ready.")
	return EnsureChatSchema(db)
}

