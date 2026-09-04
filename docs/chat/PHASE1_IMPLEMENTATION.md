# Phase 1 Implementation Report — Chat Foundation

**Date:** 2026-09-01  
**Status:** Complete

## Files Created

| Path | Purpose |
|------|---------|
| `internal/database/migrate_chat.go` | Chat schema migration + permission backfill |
| `internal/domain/chat/config.go` | Configurable max message length |
| `internal/domain/chat/cursor.go` | Base64 cursor encode/decode |
| `internal/domain/chat/entities.go` | Domain entities + validation |
| `internal/domain/chat/errors.go` | Domain error codes |
| `internal/domain/chat/repository.go` | Repository interfaces |
| `internal/infrastructure/postgres/chat_repo.go` | PostgreSQL repository implementations |
| `internal/domain/chat/entities_test.go` | Entity validation tests |
| `internal/domain/chat/cursor_test.go` | Cursor tests |
| `internal/infrastructure/postgres/chat_repo_test.go` | Tenant isolation + pagination integration tests |
| `docs/chat/PHASE1_DECISIONS.md` | Schema reconciliation decisions |
| `docs/chat/PHASE1_IMPLEMENTATION.md` | This document |

## Files Modified

| Path | Change |
|------|--------|
| `internal/database/migrate_phase2.go` | Chain `EnsureChatSchema` after phase 2 indexes |
| `internal/auth/permissions.go` | Chat permission constants + role presets |
| `internal/application/roles/service.go` | Idempotent chat permission backfill on `EnsureDefaults` |
| `internal/config/config.go` | `ChatEnabled`, `ChatMaxMessageLength` |
| `cmd/api/main.go` | `SetMaxMessageLength` from config |
| `.env.example` | `CHAT_ENABLED=false`, `CHAT_MAX_MESSAGE_LENGTH=10000` |

## Database Tables Created

1. `conversations`
2. `conversation_members`
3. `conversation_roles`
4. `messages`
5. `message_reactions`
6. `message_mentions`
7. `message_attachments`
8. `message_reads`
9. `message_deliveries`
10. `message_bookmarks`
11. `message_pins`
12. `message_forwards`
13. `user_presence`
14. `notification_preferences`
15. `message_reports`
16. `blocked_users`
17. `chat_audit_logs`
18. `message_drafts`
19. `conversation_invitations`

**Not created:** `conversation_notifications` (consolidated into `conversation_members`).

**Extended:** `notifications` — `source_type`, `source_id`, `action_url`.

## Indexes Created

- Conversation list, slug (partial unique), type
- Active member unique `(conversation_id, employee_id) WHERE left_at IS NULL`
- Member lookup by employee and conversation
- Message feed cursor `(conversation_id, created_at DESC, id DESC)`
- Thread, parent, sender history
- Reactions, mentions, attachments
- Read receipts by employee
- Audit logs by conversation and company
- `pg_trgm` GIN on `messages.content` (extension already used by PMASS)

## Key Constraints

- `conversations.type` ∈ {DM, GROUP, CHANNEL}
- `conversations.visibility` ∈ {PUBLIC, PRIVATE} or NULL
- `conversation_members.role` ∈ {owner, admin, moderator, member}
- `conversation_members.notification_level` ∈ {all, mentions, none}
- `messages.message_type` ∈ {TEXT, SYSTEM, ATTACHMENT, VOICE, FORWARD}
- `messages.content_format` ∈ {plain, markdown}
- Channel slug unique per company (partial index)
- Active membership unique per (conversation, employee)

## Domain Entities

`Conversation`, `ConversationMember`, `ConversationRole`, `Message`, `MessageReaction`, `MessageMention`, `MessageAttachment`, `MessageRead`, `MessageDelivery`, `MessageBookmark`, `MessagePin`, `MessageForward`, `UserPresence`, `NotificationPreference`, `MessageReport`, `BlockedUser`, `ChatAuditLog`, `MessageDraft`, `ConversationInvitation`

## Repository Interfaces & Implementations

| Interface | Postgres type | Key methods |
|-----------|---------------|-------------|
| `ConversationRepository` | `ConversationRepo` | Create, Get, Add/Remove member, List members |
| `MessageRepository` | `MessageRepo` | Create, Get, List (cursor), MarkRead, MarkDelivered |
| `ReactionRepository` | `ReactionRepo` | Add, Remove |
| `BookmarkRepository` | `BookmarkRepo` | Add, Remove |
| `AttachmentRepository` | `AttachmentRepo` | Create, Get |
| `PresenceRepository` | `PresenceRepo` | Upsert, Get |
| `PinRepository` | `PinRepo` | Add, Remove, List |
| `ModerationRepository` | `ModerationRepo` | Report, Block, IsBlocked |
| `DraftRepository` | `DraftRepo` | Save, Get, Delete |
| `AuditRepository` | `AuditRepo` | Append |

## Permissions Added

- `chat.view`
- `chat.send`
- `chat.create_channel`
- `chat.manage_channel`
- `chat.moderate`

Seeded into company role presets (see `PHASE1_DECISIONS.md`).

## Configuration

| Variable | Default |
|----------|---------|
| `CHAT_ENABLED` | `false` |
| `CHAT_MAX_MESSAGE_LENGTH` | `10000` |

## Tests

```bash
go test ./internal/domain/chat/...
go test ./...
```

Integration tests in `chat_repo_test.go` skip without `DATABASE_URL` / `SUPABASE_DB_URL`.

## Verification Commands

```bash
gofmt -w internal/domain/chat/ internal/infrastructure/postgres/chat_repo.go internal/database/migrate_chat.go
go test ./internal/domain/chat/...
go test ./...
go build -o bin/pmas-api ./cmd/api

# With database:
psql $DATABASE_URL -c "\dt conversation*"
psql $DATABASE_URL -c "\dt message*"
psql $DATABASE_URL -c "SELECT permission FROM company_role_permissions WHERE permission LIKE 'chat.%' LIMIT 10;"
```

## Known Limitations (Phase 1)

- No HTTP API, WebSocket, Redis, or frontend
- No application/chat service layer
- Attachment binary storage not implemented (metadata table only)
- Presence table is PG backup only; live presence deferred to Phase 6
- `CHAT_ENABLED` has no route effect until Phase 2

## Deviations from CHAT_ARCHITECTURE.md

1. **Omitted `conversation_notifications`** — merged into `conversation_members`
2. **Chat cursor uses dedicated base64 encoding** — not shared `FormatCursor` raw string format
3. **`chat.admin` permission not added** — `chat.moderate` covers admin moderation; company admin gets all chat perms via `VSMPermissions`
