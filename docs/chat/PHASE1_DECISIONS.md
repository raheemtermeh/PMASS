# Phase 1 — Schema Reconciliation Decisions

**Date:** 2026-09-01

## conversation_notifications table omitted

`CHAT_ARCHITECTURE.md` originally listed both `conversation_members` and `conversation_notifications` with overlapping fields (`is_muted`, `is_archived`, `notification_level`).

**Decision:** Use `conversation_members` as the canonical store for per-user conversation notification preferences. Do **not** create `conversation_notifications`.

**Rationale:** Avoids duplicate state, extra joins, and sync bugs. `conversation_members` already carries mute/archive/notification_level per the architecture spec.

## notifications table extension retained

Phase 1 adds nullable columns to the existing `notifications` table:

- `source_type`
- `source_id`
- `action_url`

**Rationale:** Required for Phase 8 chat notification deep links. Additive, idempotent (`ADD COLUMN IF NOT EXISTS`), no behavior change until chat services write these fields.

## Junction tables without company_id column

`message_reads`, `message_deliveries`, `message_bookmarks`, and `message_reactions` do not duplicate `company_id` at the row level.

**Decision:** Tenant boundary enforced by joining through `messages.company_id` (or verifying message ownership before write). Tables with direct company-scoped queries (`message_mentions`, `message_attachments`, etc.) include `company_id`.

**Rationale:** Matches the Phase 1 field spec while repository methods always validate `company_id` on the parent message before mutation.

## Cursor encoding

Architecture described `base64(created_at|uuid)`. PMASS `shared.FormatCursor` uses raw string encoding for other domains.

**Decision:** Chat uses URL-safe base64 (`RawURLEncoding`) in `internal/domain/chat/cursor.go` as specified for chat message pagination only.

## Chat permissions in VSMPermissions

`chat.*` permissions are included in `VSMPermissions`, so **Company Admin** inherits all chat grants via the existing preset.

Other roles receive explicit subsets in `RolePresetPermissions`.

## Permission backfill strategy

Two idempotent paths:

1. **Migration:** `backfillChatRolePermissions()` in `migrate_chat.go` on startup
2. **Runtime:** `ensureRolePermissions()` in `roles/service.go` during `EnsureDefaults()`

**Rationale:** Existing deployments gain chat permissions without manual SQL; new companies are covered by both paths.

## CHAT_ENABLED default

`CHAT_ENABLED=false` — no HTTP routes in Phase 1. Schema and repositories are present but inactive at the API layer.
