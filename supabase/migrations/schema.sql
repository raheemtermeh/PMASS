-- PMAS PostgreSQL Schema and Seed Script for Supabase

-- Drop tables if they exist (clean setup)
DROP TABLE IF EXISTS marketing_campaigns CASCADE;
DROP TABLE IF EXISTS graph_edges CASCADE;
DROP TABLE IF EXISTS operational_items CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS subsystems CASCADE;
DROP TABLE IF EXISTS design_tokens CASCADE;
DROP TABLE IF EXISTS ui_assets CASCADE;

-- 1. Subsystems (or Workspaces)
CREATE TABLE subsystems (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'healthy', -- 'healthy', 'warning', 'blocked'
    load_percentage INTEGER NOT NULL DEFAULT 0 CHECK (load_percentage >= 0 AND load_percentage <= 100)
);

-- 2. Team Members
CREATE TABLE team_members (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(255) NOT NULL,
    subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE SET NULL,
    capacity_weight NUMERIC(5,2) NOT NULL DEFAULT 1.00
);

-- 3. Operational Items (Tasks, Blockers, Issues, Handoffs)
CREATE TABLE operational_items (
    id SERIAL PRIMARY KEY,
    ticket_code VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL, -- 'task', 'blocker', 'issue', 'handoff'
    severity VARCHAR(50) NOT NULL, -- 'Critical', 'High', 'Medium', 'Low'
    status VARCHAR(50) NOT NULL, -- 'Blocked', 'In Progress', 'Completed', 'Backlog', 'Active', 'Resolved'
    origin_subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE SET NULL,
    assigned_to VARCHAR(255),
    linked_pr VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 4. Graph Edges (relational graph matrix)
CREATE TABLE graph_edges (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES subsystems(id) ON DELETE CASCADE,
    target_id INTEGER REFERENCES subsystems(id) ON DELETE CASCADE,
    edge_type VARCHAR(100) NOT NULL, -- 'subsystem_dependency'
    weight NUMERIC(5,2) NOT NULL DEFAULT 1.00
);

-- 5. Design Tokens (stored as JSON)
CREATE TABLE design_tokens (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL UNIQUE, -- 'typography', 'colors'
    token_data JSONB NOT NULL
);

-- 6. UI Assets (CDN tracking)
CREATE TABLE ui_assets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    size VARCHAR(50) NOT NULL,
    cdn_status VARCHAR(50) NOT NULL, -- 'Live', 'Pending Sync', 'Syncing...'
    date VARCHAR(50) NOT NULL
);

-- 7. Marketing Campaigns
CREATE TABLE marketing_campaigns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    leads INTEGER NOT NULL DEFAULT 0,
    conversion NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    spend NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'Active',
    dependent_subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE SET NULL
);

-- Indexing for fast topology joins and filter operations
CREATE INDEX idx_team_members_subsystem ON team_members(subsystem_id);
CREATE INDEX idx_operational_items_subsystem ON operational_items(origin_subsystem_id);
CREATE INDEX idx_operational_items_type_status ON operational_items(type, status);
CREATE INDEX idx_graph_edges_source ON graph_edges(source_id);
CREATE INDEX idx_graph_edges_target ON graph_edges(target_id);

-- =========================================================================
-- SEED DATA SETUP
-- =========================================================================

-- Insert Subsystems
INSERT INTO subsystems (id, name, slug, status, load_percentage) VALUES
(1, 'Executive Control', 'executive', 'healthy', 0),
(2, 'UI/UX Design', 'uiux', 'warning', 50),
(3, 'Engineering Core', 'engineering', 'healthy', 30),
(4, 'Infrastructure Gateway', 'infrastructure', 'blocked', 80),
(5, 'Marketing', 'marketing', 'healthy', 10),
(6, 'Finance Ledger', 'finance', 'healthy', 15),
(7, 'Legal & HR', 'legalhr', 'healthy', 5);

-- Adjust SERIAL sequence for subsystems
SELECT setval('subsystems_id_seq', 7);

-- Insert Team Members
INSERT INTO team_members (id, name, avatar_url, role, subsystem_id, capacity_weight) VALUES
(1, 'Sarah Jenkins', 'SJ', 'VP of Product', 1, 1.00),
(2, 'Elena R.', 'ER', 'UI/UX Lead', 2, 1.00),
(3, 'Marcus A.', 'MA', 'Principal Architect', 3, 1.00),
(4, 'DevOps Pod 3', 'DP', 'Infra Engineer', 4, 1.00),
(5, 'Clara O.', 'CO', 'Marketing Ops', 5, 1.00),
(6, 'Finance Team', 'FT', 'Ledger Ops', 6, 1.00),
(7, 'Diana Prince', 'DP', 'Compliance Officer', 7, 1.00);

SELECT setval('team_members_id_seq', 7);

-- Insert Operational Items (Tasks, Blockers, etc.)
INSERT INTO operational_items (id, ticket_code, title, description, type, severity, status, origin_subsystem_id, assigned_to, linked_pr, created_at, completed_at) VALUES
(1, 'BLK-1', 'API Gateway Rate-Limiting Auth Loop', 'API Gateway auth loops under high load conditions. Investigate rate limit configurations on node ingress gateways.', 'blocker', 'Critical', 'Blocked', 4, 'DevOps Pod 3', NULL, '2026-06-27T12:00:00Z', NULL),
(2, 'BLK-2', 'Legal review on OAuth2 user-consent screen', 'OAuth2 authorization screen requires compliance approval from legal counsel before deployment to production environment.', 'blocker', 'High', 'Blocked', 7, 'Diana Prince', NULL, '2026-06-27T12:10:00Z', NULL),
(3, 'BLK-3', 'Figma token integration mismatch in theme engine', 'Mismatch in exported color token variables causing compilation warnings in themes and webpack build errors.', 'blocker', 'Medium', 'Blocked', 2, 'Elena R.', NULL, '2026-06-27T12:20:00Z', NULL),
(4, 'BLK-4', 'Database migration lockup on staging DB', 'Prisma schema migration locked on database nodes. Needs DBA script intervention and lock release execution.', 'blocker', 'Critical', 'Blocked', 3, 'Marcus A.', NULL, '2026-06-27T12:30:00Z', NULL),
(5, 'BLK-5', 'GDPR compliance signoff on analytic scripts', 'GDPR compliance validation requested for newly integrated third-party client analytics script tracking behaviors.', 'blocker', 'High', 'Blocked', 7, 'Diana Prince', NULL, '2026-06-27T12:40:00Z', NULL),
(6, 'BLK-6', 'CI/CD runner concurrency limit exhaustion', 'CI/CD runner node resource allocation limit reached. Increase concurrency caps and provision extra runner nodes.', 'blocker', 'Medium', 'Blocked', 4, 'DevOps Pod 3', NULL, '2026-06-27T12:50:00Z', NULL),
(7, 'BLK-7', 'Finance Q2 CapEx final reconciliation delay', 'Finance team report on Q2 CapEx ledger reconciliation delayed. Waiting for final hardware invoice imports from cloud provider vendors.', 'blocker', 'Low', 'Blocked', 6, 'Finance Team', NULL, '2026-06-27T13:00:00Z', NULL),
(8, 'TSK-8', 'Refactor typography token parser', 'Streamline the typography token JSON extraction process to align with our latest Figma token scheme.', 'task', 'Low', 'In Progress', 2, 'Elena R.', 'PR-412', '2026-06-27T13:05:00Z', NULL),
(9, 'TSK-9', 'Design landing page dark/light toggles', 'Draft alternative variants of visual themes for landing page user custom preferences.', 'task', 'Medium', 'Backlog', 2, 'Elena R.', NULL, '2026-06-27T13:10:00Z', NULL),
(10, 'TSK-10', 'Optimize query index on users table', 'Add composited index on tenant_id and email fields to reduce peak latency of user auth queries.', 'task', 'High', 'In Progress', 3, 'Marcus A.', 'PR-415', '2026-06-27T13:15:00Z', NULL),
(11, 'TSK-11', 'Provision staging replicas for testing', 'Provision and configure duplicate node targets for running E2E build cycles against production-equivalent db locks.', 'task', 'High', 'Completed', 4, 'DevOps Pod 3', 'PR-390', '2026-06-27T10:00:00Z', '2026-06-27T12:00:00Z'),
(12, 'TSK-12', 'Draft release summary blog copy', 'Create initial draft for the release blog posts outlining the enterprise compliance update.', 'task', 'Low', 'Backlog', 5, 'Clara O.', NULL, '2026-06-27T13:20:00Z', NULL),
(13, 'TSK-13', 'Conduct monthly ledger reconciliation', 'Process cloud invoices and cross-reference with monthly operations allocation thresholds.', 'task', 'Medium', 'In Progress', 6, 'Finance Team', NULL, '2026-06-27T13:25:00Z', NULL),
(14, 'TSK-14', 'Update external audit contact list', 'Confirm primary contact emails and schedule access details for external compliance auditor.', 'task', 'Low', 'Completed', 7, 'Diana Prince', 'PR-398', '2026-06-27T10:30:00Z', '2026-06-27T11:45:00Z');

SELECT setval('operational_items_id_seq', 14);

-- Insert Graph Edges (relational matrix representation of subsystems)
INSERT INTO graph_edges (id, source_id, target_id, edge_type, weight) VALUES
(1, 2, 3, 'subsystem_dependency', 1.20), -- uiux -> engineering
(2, 3, 4, 'subsystem_dependency', 1.50), -- engineering -> infrastructure
(3, 1, 2, 'subsystem_dependency', 1.00), -- executive -> uiux
(4, 1, 3, 'subsystem_dependency', 1.10), -- executive -> engineering
(5, 1, 6, 'subsystem_dependency', 1.00), -- executive -> finance
(6, 3, 5, 'subsystem_dependency', 1.20), -- engineering -> marketing
(7, 4, 5, 'subsystem_dependency', 1.30), -- infrastructure -> marketing
(8, 7, 1, 'subsystem_dependency', 1.00), -- legalhr -> executive
(9, 7, 5, 'subsystem_dependency', 1.10), -- legalhr -> marketing
(10, 6, 1, 'subsystem_dependency', 1.00); -- finance -> executive

SELECT setval('graph_edges_id_seq', 10);

-- Insert Figma design tokens metadata
INSERT INTO design_tokens (id, category, token_data) VALUES
(1, 'typography', $${
  "font-sans-title": {
    "fontFamily": "'Inter', sans-serif",
    "fontWeight": "700",
    "fontSize": "1.25rem",
    "lineHeight": "1.4"
  },
  "font-sans-body": {
    "fontFamily": "'Inter', sans-serif",
    "fontWeight": "400",
    "fontSize": "0.875rem",
    "lineHeight": "1.5"
  },
  "font-mono-numbers": {
    "fontFamily": "'JetBrains Mono', monospace",
    "fontWeight": "500",
    "fontSize": "1.75rem",
    "lineHeight": "1.2"
  },
  "font-mono-logs": {
    "fontFamily": "'JetBrains Mono', monospace",
    "fontWeight": "400",
    "fontSize": "0.75rem",
    "lineHeight": "1.6"
  }
}$$),
(2, 'colors', $${
  "bg-surface": "#06070a",
  "bg-surface-container": "#0c0e16",
  "color-primary": "#6366f1",
  "color-success": "#10b981",
  "border-outline-variant": "rgba(99, 102, 241, 0.25)"
}$$);

SELECT setval('design_tokens_id_seq', 2);

-- Insert UI assets
INSERT INTO ui_assets (id, name, size, cdn_status, date) VALUES
(1, 'logo-dark.svg', '1.4 KB', 'Live', 'Jul 01, 2026'),
(2, 'avatar-placeholder.png', '3.8 KB', 'Live', 'Jul 02, 2026'),
(3, 'hero-banner-illustration.svg', '24.5 KB', 'Pending Sync', 'Jul 03, 2026'),
(4, 'font-subset-inter.woff2', '12.0 KB', 'Live', 'Jul 05, 2026');

SELECT setval('ui_assets_id_seq', 4);

-- Insert Marketing Campaigns
INSERT INTO marketing_campaigns (id, name, leads, conversion, spend, status, dependent_subsystem_id) VALUES
(1, 'Enterprise Lead-Gen Google Search', 14200, 2.10, 45000.00, 'Active', 4), -- depends on infrastructure
(2, 'Product Architecture Whitepaper', 8300, 4.80, 28000.00, 'Active', 3),     -- depends on engineering
(3, 'SysOps Global Conf Sponsorship', 1200, 9.20, 85000.00, 'Completed', 4),  -- depends on infrastructure
(4, 'DevOps Weekly Newsletter Programmatic', 4900, 1.50, 12000.00, 'Paused', 4); -- depends on infrastructure

SELECT setval('marketing_campaigns_id_seq', 4);

-- 8. Credentials (for application settings integrations)
CREATE TABLE IF NOT EXISTS credentials (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO credentials (name, value, description) VALUES
('FIGMA_API_TOKEN', 'fig_9876543210abcdef9876543210abcdef', 'Figma Personal Access Token used for pulling UI/UX design token values'),
('GITHUB_PAT', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'GitHub PAT for compiler pipeline triggering and repository access check'),
('AWS_ACCESS_KEY_ID', 'AKIAIOSFODNN7EXAMPLE', 'AWS Access Key ID for pushing high-fidelity design assets to CloudFront CDN')
ON CONFLICT (name) DO NOTHING;

