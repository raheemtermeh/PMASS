-- PMAS Live Schema — production tables without seed data

DROP TABLE IF EXISTS user_permissions CASCADE;
DROP TABLE IF EXISTS app_users CASCADE;
DROP TABLE IF EXISTS credentials CASCADE;
DROP TABLE IF EXISTS marketing_campaigns CASCADE;
DROP TABLE IF EXISTS graph_edges CASCADE;
DROP TABLE IF EXISTS operational_items CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS subsystems CASCADE;
DROP TABLE IF EXISTS design_tokens CASCADE;
DROP TABLE IF EXISTS ui_assets CASCADE;

CREATE TABLE app_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('super_admin', 'user')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_permissions (
    user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    permission VARCHAR(100) NOT NULL,
    PRIMARY KEY (user_id, permission)
);

CREATE TABLE subsystems (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'healthy',
    load_percentage INTEGER NOT NULL DEFAULT 0 CHECK (load_percentage >= 0 AND load_percentage <= 100)
);

CREATE TABLE team_members (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(255) NOT NULL,
    subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE SET NULL,
    capacity_weight NUMERIC(5,2) NOT NULL DEFAULT 1.00
);

CREATE TABLE operational_items (
    id SERIAL PRIMARY KEY,
    ticket_code VARCHAR(50) NOT NULL UNIQUE,
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
);

CREATE TABLE graph_edges (
    id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
    edge_type VARCHAR(100) NOT NULL,
    weight NUMERIC(5,2) NOT NULL DEFAULT 1.00
);

CREATE TABLE design_tokens (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL UNIQUE,
    token_data JSONB NOT NULL
);

CREATE TABLE ui_assets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    size VARCHAR(50) NOT NULL,
    cdn_status VARCHAR(50) NOT NULL,
    date VARCHAR(50) NOT NULL
);

CREATE TABLE marketing_campaigns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    leads INTEGER NOT NULL DEFAULT 0,
    conversion NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    spend NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'Active',
    dependent_subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE SET NULL
);

CREATE TABLE credentials (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_app_users_email ON app_users(email);
CREATE INDEX idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX idx_team_members_subsystem ON team_members(subsystem_id);
CREATE INDEX idx_operational_items_subsystem ON operational_items(origin_subsystem_id);
CREATE INDEX idx_operational_items_type_status ON operational_items(type, status);
CREATE INDEX idx_graph_edges_source ON graph_edges(source_id);
CREATE INDEX idx_graph_edges_target ON graph_edges(target_id);
