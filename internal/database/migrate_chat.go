package database

import (
	"database/sql"
	"fmt"
	"log"

	"PMAS/internal/auth"
)

// EnsureChatSchema creates enterprise chat tables and indexes.
// Safe to re-run on existing databases (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
func EnsureChatSchema(db *sql.DB) error {
	statements := []string{
		// Phase 8 notification deep links — additive columns on existing table.
		`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_type VARCHAR(32)`,
		`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_id UUID`,
		`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT`,

		`CREATE TABLE IF NOT EXISTS conversations (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			type VARCHAR(16) NOT NULL CHECK (type IN ('DM', 'GROUP', 'CHANNEL')),
			name VARCHAR(255) NOT NULL DEFAULT '',
			slug VARCHAR(64),
			description TEXT NOT NULL DEFAULT '',
			visibility VARCHAR(16) CHECK (visibility IS NULL OR visibility IN ('PUBLIC', 'PRIVATE')),
			avatar_url TEXT NOT NULL DEFAULT '',
			created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
			is_archived BOOLEAN NOT NULL DEFAULT false,
			last_message_at TIMESTAMPTZ,
			last_message_preview VARCHAR(255) NOT NULL DEFAULT '',
			version INTEGER NOT NULL DEFAULT 1,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			deleted_at TIMESTAMPTZ
		)`,

		`CREATE TABLE IF NOT EXISTS conversation_members (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			employee_id UUID NOT NULL REFERENCES employees(id),
			role VARCHAR(32) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
			joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			last_read_at TIMESTAMPTZ,
			last_read_message_id UUID,
			is_muted BOOLEAN NOT NULL DEFAULT false,
			is_archived BOOLEAN NOT NULL DEFAULT false,
			notification_level VARCHAR(16) NOT NULL DEFAULT 'all' CHECK (notification_level IN ('all', 'mentions', 'none')),
			left_at TIMESTAMPTZ
		)`,

		`CREATE TABLE IF NOT EXISTS conversation_roles (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			name VARCHAR(64) NOT NULL,
			permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (conversation_id, name)
		)`,

		`CREATE TABLE IF NOT EXISTS messages (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			sender_id UUID REFERENCES employees(id) ON DELETE SET NULL,
			message_type VARCHAR(16) NOT NULL DEFAULT 'TEXT' CHECK (message_type IN ('TEXT', 'SYSTEM', 'ATTACHMENT', 'VOICE', 'FORWARD')),
			content TEXT NOT NULL DEFAULT '',
			content_format VARCHAR(16) NOT NULL DEFAULT 'plain' CHECK (content_format IN ('plain', 'markdown')),
			parent_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
			thread_root_id UUID REFERENCES messages(id) ON DELETE SET NULL,
			thread_reply_count INTEGER NOT NULL DEFAULT 0,
			metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
			is_edited BOOLEAN NOT NULL DEFAULT false,
			edited_at TIMESTAMPTZ,
			is_pinned BOOLEAN NOT NULL DEFAULT false,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			deleted_at TIMESTAMPTZ
		)`,

		`DO $$ BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM pg_constraint WHERE conname = 'fk_conv_members_last_read_message'
			) THEN
				ALTER TABLE conversation_members
					ADD CONSTRAINT fk_conv_members_last_read_message
					FOREIGN KEY (last_read_message_id) REFERENCES messages(id) ON DELETE SET NULL;
			END IF;
		END $$`,

		`CREATE TABLE IF NOT EXISTS message_reactions (
			message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			employee_id UUID NOT NULL REFERENCES employees(id),
			emoji VARCHAR(32) NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (message_id, employee_id, emoji)
		)`,

		`CREATE TABLE IF NOT EXISTS message_mentions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			mentioned_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
			mention_type VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (mention_type IN ('user', 'channel', 'everyone')),
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS message_attachments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			file_name VARCHAR(255) NOT NULL,
			storage_key TEXT NOT NULL,
			mime_type VARCHAR(128) NOT NULL DEFAULT '',
			size_bytes BIGINT NOT NULL DEFAULT 0,
			width INTEGER,
			height INTEGER,
			duration_ms INTEGER,
			thumbnail_key TEXT NOT NULL DEFAULT '',
			checksum_sha256 VARCHAR(64) NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS message_reads (
			message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			employee_id UUID NOT NULL REFERENCES employees(id),
			read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (message_id, employee_id)
		)`,

		`CREATE TABLE IF NOT EXISTS message_deliveries (
			message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			employee_id UUID NOT NULL REFERENCES employees(id),
			delivered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (message_id, employee_id)
		)`,

		`CREATE TABLE IF NOT EXISTS message_bookmarks (
			message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			employee_id UUID NOT NULL REFERENCES employees(id),
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (message_id, employee_id)
		)`,

		`CREATE TABLE IF NOT EXISTS message_pins (
			conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			pinned_by UUID NOT NULL REFERENCES employees(id),
			pinned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (conversation_id, message_id)
		)`,

		`CREATE TABLE IF NOT EXISTS message_forwards (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			original_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			original_conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS user_presence (
			employee_id UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
			company_id UUID NOT NULL REFERENCES companies(id),
			status VARCHAR(16) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'dnd', 'offline')),
			last_seen_at TIMESTAMPTZ,
			status_message VARCHAR(255) NOT NULL DEFAULT '',
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS notification_preferences (
			employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
			company_id UUID NOT NULL REFERENCES companies(id),
			event_type VARCHAR(64) NOT NULL,
			in_app BOOLEAN NOT NULL DEFAULT true,
			browser BOOLEAN NOT NULL DEFAULT false,
			email BOOLEAN NOT NULL DEFAULT false,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (employee_id, event_type)
		)`,

		`CREATE TABLE IF NOT EXISTS message_reports (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			reporter_id UUID NOT NULL REFERENCES employees(id),
			reason VARCHAR(64) NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'other')),
			details TEXT NOT NULL DEFAULT '',
			status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
			reviewed_by UUID REFERENCES employees(id) ON DELETE SET NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS blocked_users (
			blocker_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
			blocked_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
			company_id UUID NOT NULL REFERENCES companies(id),
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (blocker_id, blocked_id)
		)`,

		`CREATE TABLE IF NOT EXISTS chat_audit_logs (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
			actor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
			action VARCHAR(64) NOT NULL,
			target_id UUID,
			payload JSONB NOT NULL DEFAULT '{}'::jsonb,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS message_drafts (
			conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
			content TEXT NOT NULL DEFAULT '',
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (conversation_id, employee_id)
		)`,

		`CREATE TABLE IF NOT EXISTS conversation_invitations (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			company_id UUID NOT NULL REFERENCES companies(id),
			conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			invited_by UUID NOT NULL REFERENCES employees(id),
			invited_employee_id UUID NOT NULL REFERENCES employees(id),
			status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
			expires_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,

		// Indexes
		`CREATE INDEX IF NOT EXISTS idx_conversations_company_list
			ON conversations (company_id, last_message_at DESC NULLS LAST)
			WHERE deleted_at IS NULL`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_company_slug
			ON conversations (company_id, slug)
			WHERE type = 'CHANNEL' AND slug IS NOT NULL AND deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_conversations_company_type
			ON conversations (company_id, type)
			WHERE deleted_at IS NULL`,

		`CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_members_active
			ON conversation_members (conversation_id, employee_id)
			WHERE left_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_conv_members_employee
			ON conversation_members (company_id, employee_id)
			WHERE left_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_conv_members_conversation
			ON conversation_members (conversation_id)
			WHERE left_at IS NULL`,

		`CREATE INDEX IF NOT EXISTS idx_messages_conversation_cursor
			ON messages (conversation_id, created_at DESC, id DESC)
			WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_messages_thread
			ON messages (thread_root_id, created_at ASC)
			WHERE deleted_at IS NULL AND thread_root_id IS NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_messages_parent
			ON messages (parent_message_id)
			WHERE parent_message_id IS NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_messages_sender
			ON messages (company_id, sender_id, created_at DESC)
			WHERE deleted_at IS NULL`,

		`CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions (message_id)`,
		`CREATE INDEX IF NOT EXISTS idx_mentions_employee
			ON message_mentions (company_id, mentioned_employee_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_mentions_message ON message_mentions (message_id)`,
		`CREATE INDEX IF NOT EXISTS idx_attachments_message ON message_attachments (message_id)`,

		`CREATE INDEX IF NOT EXISTS idx_reads_employee ON message_reads (employee_id, read_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_chat_audit_conversation
			ON chat_audit_logs (conversation_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_chat_audit_company
			ON chat_audit_logs (company_id, created_at DESC)`,

		// pg_trgm for future message search (extension enabled elsewhere in PMASS migrations).
		`CREATE EXTENSION IF NOT EXISTS pg_trgm`,
		`CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
			ON messages USING gin (content gin_trgm_ops)
			WHERE deleted_at IS NULL`,

		// Phase 4 — messenger core: last_message_id + read/delivery lookup aids
		`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_id UUID`,
		`DO $$ BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversations_last_message'
			) THEN
				ALTER TABLE conversations
					ADD CONSTRAINT fk_conversations_last_message
					FOREIGN KEY (last_message_id) REFERENCES messages(id) ON DELETE SET NULL;
			END IF;
		END $$`,
		// Supports unread cursor joins: member → last_read message ordering.
		`CREATE INDEX IF NOT EXISTS idx_conv_members_last_read_message
			ON conversation_members (last_read_message_id)
			WHERE left_at IS NULL AND last_read_message_id IS NOT NULL`,
		// Supports delivery lookups by message (receipt fan-out / audits).
		`CREATE INDEX IF NOT EXISTS idx_message_deliveries_message
			ON message_deliveries (message_id, delivered_at DESC)`,
		// Supports read lookups by message.
		`CREATE INDEX IF NOT EXISTS idx_message_reads_message
			ON message_reads (message_id, read_at DESC)`,

		// Phase 6 — mention uniqueness + chat notification dedupe
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_mentions_message_employee
			ON message_mentions (message_id, mentioned_employee_id)
			WHERE mentioned_employee_id IS NOT NULL`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_chat_dedupe
			ON notifications (company_id, receiver_id, type, source_id)
			WHERE source_id IS NOT NULL AND COALESCE(is_archived,false)=false`,

		// Phase 7 — drafts reply target + optimistic revision; presence company lookup
		`ALTER TABLE message_drafts ADD COLUMN IF NOT EXISTS parent_message_id UUID`,
		`ALTER TABLE message_drafts ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1`,
		`DO $$ BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_drafts_parent'
			) THEN
				ALTER TABLE message_drafts
					ADD CONSTRAINT fk_message_drafts_parent
					FOREIGN KEY (parent_message_id) REFERENCES messages(id) ON DELETE SET NULL;
			END IF;
		END $$`,
		`CREATE INDEX IF NOT EXISTS idx_user_presence_company
			ON user_presence (company_id, status)`,

		// Phase 8 — invitations / reports / bookmarks lookup aids
		`CREATE INDEX IF NOT EXISTS idx_invitations_invitee
			ON conversation_invitations (company_id, invited_employee_id, status, created_at DESC)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_pending_unique
			ON conversation_invitations (conversation_id, invited_employee_id)
			WHERE status = 'pending'`,
		`CREATE INDEX IF NOT EXISTS idx_reports_company_status
			ON message_reports (company_id, status, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_bookmarks_employee
			ON message_bookmarks (employee_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_blocks_blocker
			ON blocked_users (company_id, blocker_id, created_at DESC)`,
	}

	for i, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("chat schema statement %d failed: %w\nSQL: %s", i+1, err, stmt)
		}
	}

	if err := backfillChatRolePermissions(db); err != nil {
		return fmt.Errorf("chat permission backfill: %w", err)
	}

	log.Println("[Bootstrap] Chat schema ready.")
	return nil
}

func backfillChatRolePermissions(db *sql.DB) error {
	for roleName, perms := range auth.RolePresetPermissions {
		rows, err := db.Query(`SELECT id FROM company_roles WHERE name=$1`, roleName)
		if err != nil {
			return err
		}
		roleIDs := make([]string, 0)
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			roleIDs = append(roleIDs, id)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		for _, roleID := range roleIDs {
			for _, p := range perms {
				if len(p) < 5 || p[:5] != "chat." {
					continue
				}
				if _, err := db.Exec(`
					INSERT INTO company_role_permissions (role_id, permission) VALUES ($1::uuid, $2)
					ON CONFLICT DO NOTHING`, roleID, p); err != nil {
					return err
				}
			}
		}
	}
	return nil
}
