# PMASS Enterprise Chat System — Implementation Plan

**Phase 0 deliverable — planning only**  
**Companion document:** [CHAT_ARCHITECTURE.md](./CHAT_ARCHITECTURE.md)  
**Date:** 2026-09-01

---

## Overview

This plan breaks chat implementation into **12 independently testable phases**. Each phase produces a working increment that can be verified, deployed, and rolled back without breaking existing PMASS functionality.

**Rules for every phase:**
- No modifications to existing business logic unless explicitly stated (permission seeding only)
- All new code follows VSM clean architecture pattern
- All chat queries enforce `company_id` tenant boundary
- Cursor pagination from the first message list endpoint
- Feature flag `CHAT_ENABLED` gates all chat routes (default `false` until phase 3)

---

## Phase 1: Foundation — Schema, Domain, Repositories

### Objective
Establish chat database schema, domain entities, repository interfaces, and repository implementations. No HTTP endpoints yet.

### Files Likely to Change
| Action | Path |
|--------|------|
| Create | `internal/database/migrate_chat.go` |
| Modify | `internal/database/migrate.go` (chain `EnsureChatSchema`) |
| Create | `internal/domain/chat/entities.go` |
| Create | `internal/domain/chat/repository.go` |
| Create | `internal/domain/chat/errors.go` |
| Create | `internal/domain/chat/cursor.go` |
| Create | `internal/infrastructure/postgres/chat_repo.go` |
| Create | `internal/domain/chat/entities_test.go` |
| Create | `internal/domain/chat/cursor_test.go` |
| Modify | `internal/auth/permissions.go` (add chat permission constants) |
| Modify | `internal/application/roles/service.go` (seed chat permissions in presets) |
| Modify | `.env.example` (add `CHAT_ENABLED=false`) |

### Database Changes
- Create all chat tables (see CHAT_ARCHITECTURE.md §5):
  - `conversations`, `conversation_members`, `conversation_roles`
  - `messages`, `message_reactions`, `message_mentions`, `message_attachments`
  - `message_reads`, `message_deliveries`, `message_bookmarks`, `message_pins`, `message_forwards`
  - `user_presence`, `message_reports`, `blocked_users`, `chat_audit_logs`
  - `message_drafts`, `conversation_invitations`
- Add indexes as specified in architecture doc
- Extend `notifications` table: `source_type`, `source_id`, `action_url` (nullable columns)
- Seed chat permissions into `RolePresetPermissions`

### Backend Changes
- Domain entity constructors with validation (follow `domain/organization/entities.go` pattern)
- Repository interfaces in `domain/chat/repository.go`
- Postgres implementations with `company_id` on every query
- Cursor encode/decode utility
- Wire `EnsureChatSchema` into migration chain

### Frontend Changes
- None

### Tests
- `internal/domain/chat/entities_test.go` — entity validation (empty content, invalid type, nil IDs)
- `internal/domain/chat/cursor_test.go` — encode/decode roundtrip, edge cases
- Manual: verify migration runs cleanly on fresh and existing databases

### Verification Commands
```bash
# Run domain tests
go test ./internal/domain/chat/...

# Start API and verify migration
go run ./cmd/api/main.go
# Check logs for "chat schema" success

# Verify tables exist
psql $DATABASE_URL -c "\dt *conversation*"
psql $DATABASE_URL -c "\dt *message*"

# Verify permissions seeded
psql $DATABASE_URL -c "SELECT permission FROM company_role_permissions WHERE permission LIKE 'chat.%' LIMIT 5;"
```

### Rollback Considerations
- Chat tables are additive (`IF NOT EXISTS`); safe to leave in place
- To rollback: remove `EnsureChatSchema` call from migration chain
- Permission constants can remain (unused until routes registered)
- No existing functionality affected

---

## Phase 2: Core Messaging — REST API, DMs, Groups

### Objective
Implement conversation and message CRUD via REST. Support DM and group conversation creation, message send/edit/delete, and cursor-paginated message history.

### Files Likely to Change
| Action | Path |
|--------|------|
| Create | `internal/application/chat/service.go` |
| Create | `internal/application/chat/service_test.go` |
| Create | `internal/application/chat/conversation.go` |
| Create | `internal/application/chat/message.go` |
| Create | `internal/delivery/http/chat_handler.go` |
| Create | `internal/delivery/http/chat_scope.go` |
| Modify | `internal/delivery/http/wire.go` (wire chat service + handler) |
| Modify | `cmd/api/main.go` (register chat routes behind `CHAT_ENABLED`) |
| Modify | `internal/config/config.go` (add `ChatEnabled bool`) |

### Database Changes
- None (tables from phase 1)

### Backend Changes
- `application/chat/service.go`:
  - `CreateConversation` (DM dedup logic, group creation)
  - `ListConversations` (cursor paginated, for current employee)
  - `GetConversation` (with membership check)
  - `AddMembers`, `RemoveMember`, `LeaveConversation`
  - `SendMessage`, `EditMessage`, `DeleteMessage` (soft delete)
  - `ListMessages` (cursor paginated, `direction=before|after`)
  - `MarkRead` (update `conversation_members.last_read_message_id`)
- `delivery/http/chat_handler.go`:
  - REST handlers for conversation and message endpoints (§7.2–7.4)
  - `ChatScope` — extends `CompanyScope` with membership verification
- Authorization: `chat.view`, `chat.send` permission checks
- Rate limiting: extend existing IP limiter with per-user message rate (in-memory initially)

### Frontend Changes
- None (API-only phase)

### Tests
- `internal/application/chat/service_test.go` — stub repo tests:
  - DM dedup returns existing conversation
  - Non-member cannot send message
  - Cursor pagination returns correct order
  - Soft delete sets `deleted_at`
  - Cross-company access denied
- `internal/delivery/http/chat_handler_test.go` — httptest:
  - 401 without auth
  - 403 for non-member
  - 200 with valid conversation list

### Verification Commands
```bash
go test ./internal/application/chat/...
go test ./internal/delivery/http/ -run Chat

# Manual API test (with CHAT_ENABLED=true)
export CHAT_ENABLED=true
go run ./cmd/api/main.go

# Login and get token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"...","portal":"employee","tenant_slug":"..."}' \
  | jq -r '.token')

# Create DM
curl -s -X POST http://localhost:8080/api/v1/chat/conversations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"DM","member_ids":["<employee-uuid>"]}' | jq

# Send message
curl -s -X POST http://localhost:8080/api/v1/chat/conversations/<conv-id>/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello world"}' | jq

# List messages (cursor pagination)
curl -s "http://localhost:8080/api/v1/chat/conversations/<conv-id>/messages?limit=50" \
  -H "Authorization: Bearer $TOKEN" | jq

# Verify tenant isolation: login as different company, confirm 403
```

### Rollback Considerations
- Set `CHAT_ENABLED=false` — all chat routes return 404
- No impact on existing endpoints
- Chat data remains in DB (harmless)

---

## Phase 3: WebSocket Realtime

### Objective
Add WebSocket endpoint for realtime message delivery. Implement connection hub, authentication, room subscriptions, and event broadcasting.

### Files Likely to Change
| Action | Path |
|--------|------|
| Create | `internal/application/chat/ws_hub.go` |
| Create | `internal/application/chat/ws_protocol.go` |
| Create | `internal/delivery/http/chat_ws.go` |
| Modify | `internal/delivery/http/wire.go` |
| Modify | `cmd/api/main.go` |
| Modify | `deploy/nginx.conf` (WebSocket upgrade on `/api/v1/chat/ws`) |
| Modify | `docker-compose.yml` (add Redis service) |
| Modify | `.env.example` (add `REDIS_URL`, `CHAT_REDIS_ENABLED`) |
| Create | `internal/infrastructure/redis/client.go` |
| Create | `internal/infrastructure/redis/pubsub.go` |
| Modify | `internal/config/config.go` |
| Modify | `go.mod` (add `github.com/gorilla/websocket` or use stdlib)

### Database Changes
- None

### Backend Changes
- WebSocket hub: connection registry, room management
- WS auth: JWT validation on upgrade
- Client events: `subscribe`, `unsubscribe`, `message.send`, `typing.start/stop`, `read.mark`, `ping`
- Server events: `message.created`, `message.updated`, `message.deleted`, `typing.started/stopped`, `connected`, `error`
- On REST message send: also publish via hub (dual delivery path)
- Redis pub/sub for multi-instance (optional via `CHAT_REDIS_ENABLED`)
- Heartbeat: 30s ping/pong
- Connection limits: 5 per user, 10K per instance

### Frontend Changes
- None (backend-only; tested with wscat)

### Tests
- `internal/application/chat/ws_hub_test.go`:
  - Connect, subscribe, receive message event
  - Non-member subscribe rejected
  - Heartbeat timeout disconnects
- `internal/delivery/http/chat_ws_test.go`:
  - Upgrade with valid/invalid token
  - Send message via WS, verify DB persistence

### Verification Commands
```bash
go test ./internal/application/chat/... -run WS
go test ./internal/delivery/http/ -run WS

# Start with Redis
docker compose up -d redis
export CHAT_ENABLED=true REDIS_URL=redis://localhost:6379

# Test WebSocket with wscat
npm install -g wscat
wscat -c "ws://localhost:8080/api/v1/chat/ws" \
  -H "Authorization: Bearer $TOKEN"

# Send subscribe
> {"type":"subscribe","data":{"conversation_ids":["<conv-id>"]}}

# Send message via WS
> {"type":"message.send","data":{"conversation_id":"<conv-id>","content":"Realtime!","client_id":"test-1"}}

# Verify in second terminal (another user token)
# Should receive: {"type":"message.created","data":{...}}
```

### Rollback Considerations
- WS endpoint disabled when `CHAT_ENABLED=false`
- REST messaging from phase 2 still works (degraded mode)
- Redis failure: set `CHAT_REDIS_ENABLED=false` for single-instance mode
- Revert nginx config if WS causes gateway issues

---

## Phase 4: Channels, Threads, Reactions

### Objective
Add organization channels (public/private), thread replies, and emoji reactions.

### Files Likely to Change
| Action | Path |
|--------|------|
| Modify | `internal/application/chat/service.go` |
| Modify | `internal/application/chat/conversation.go` |
| Modify | `internal/application/chat/message.go` |
| Create | `internal/application/chat/reaction.go` |
| Create | `internal/application/chat/thread.go` |
| Modify | `internal/infrastructure/postgres/chat_repo.go` |
| Modify | `internal/delivery/http/chat_handler.go` |
| Modify | `internal/application/chat/ws_protocol.go` |

### Database Changes
- None (tables support these features from phase 1)

### Backend Changes
- Channel creation with slug, visibility, description
- Public channel discovery listing
- Channel admin: update settings, manage members
- Thread: reply to message (`thread_root_id`), list thread replies
- Reactions: add/remove with upsert, batch load on message feed
- WS events: `message.reaction.added/removed`
- System messages on member add/remove

### Frontend Changes
- None

### Tests
- Channel slug uniqueness per company
- Public channel visible to non-members in list
- Private channel hidden from non-members
- Thread reply increments `thread_reply_count`
- Reaction toggle (add then remove)
- Max 20 reactions per message per user

### Verification Commands
```bash
go test ./internal/application/chat/... -run "Channel|Thread|Reaction"

# Create channel
curl -s -X POST http://localhost:8080/api/v1/chat/conversations \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"type":"CHANNEL","name":"general","slug":"general","visibility":"PUBLIC"}' | jq

# Reply in thread
curl -s -X POST http://localhost:8080/api/v1/chat/messages/<msg-id>/thread \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"content":"Thread reply"}' | jq

# Add reaction
curl -s -X POST http://localhost:8080/api/v1/chat/messages/<msg-id>/reactions \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"emoji":"👍"}' | jq

# List thread
curl -s "http://localhost:8080/api/v1/chat/messages/<msg-id>/thread?limit=50" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Rollback Considerations
- Channel/thread/reaction data coexists peacefully
- No changes to existing tables or APIs

---

## Phase 5: Attachments & File Storage

### Objective
Implement object storage abstraction and attachment upload/download flow.

### Files Likely to Change
| Action | Path |
|--------|------|
| Create | `internal/infrastructure/storage/store.go` |
| Create | `internal/infrastructure/storage/local.go` |
| Create | `internal/infrastructure/storage/s3.go` |
| Create | `internal/application/chat/attachment.go` |
| Modify | `internal/delivery/http/chat_handler.go` |
| Modify | `internal/config/config.go` |
| Modify | `.env.example` |
| Modify | `docker-compose.yml` (storage volume for local dev) |

### Database Changes
- None ( `message_attachments` table exists from phase 1)

### Backend Changes
- `ObjectStore` interface with local and S3 implementations
- Upload flow: presign → client upload → confirm
- Download: signed URL redirect
- MIME allowlist validation, size limits
- Magic byte verification on confirm
- Link attachments to messages on send
- Orphan cleanup background goroutine (unconfirmed uploads > 24h)
- Voice message support (audio MIME types, `duration_ms`)

### Frontend Changes
- None

### Tests
- `internal/infrastructure/storage/local_test.go` — upload, download, delete
- `internal/application/chat/attachment_test.go` — MIME rejection, size limit
- Confirm rejects mismatched MIME

### Verification Commands
```bash
go test ./internal/infrastructure/storage/...
go test ./internal/application/chat/... -run Attachment

# Request upload URL
curl -s -X POST http://localhost:8080/api/v1/chat/attachments/upload-url \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"file_name":"test.png","mime_type":"image/png","size_bytes":1024}' | jq

# Upload file to presigned URL
curl -X PUT "<upload_url>" -H "Content-Type: image/png" --data-binary @test.png

# Confirm upload
curl -s -X POST http://localhost:8080/api/v1/chat/attachments/<id>/confirm \
  -H "Authorization: Bearer $TOKEN" | jq

# Send message with attachment
curl -s -X POST http://localhost:8080/api/v1/chat/conversations/<conv-id>/messages \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"content":"See attached","attachment_ids":["<att-id>"]}' | jq
```

### Rollback Considerations
- Set `STORAGE_BACKEND=local` if S3 issues
- Text-only chat unaffected
- Orphaned storage objects harmless (cleanup job handles)

---

## Phase 6: Presence, Typing, Read Receipts

### Objective
Implement user presence, typing indicators, and message delivery/read tracking.

### Files Likely to Change
| Action | Path |
|--------|------|
| Create | `internal/infrastructure/redis/presence_store.go` |
| Create | `internal/infrastructure/redis/typing_store.go` |
| Create | `internal/application/chat/presence.go` |
| Modify | `internal/application/chat/ws_hub.go` |
| Modify | `internal/delivery/http/chat_handler.go` |
| Modify | `internal/infrastructure/postgres/chat_repo.go` |

### Database Changes
- None ( `user_presence`, `message_reads`, `message_deliveries` exist)

### Backend Changes
- Redis-backed presence with TTL (120s, refreshed on activity)
- PG `user_presence` updated every 5 min for last_seen persistence
- Typing: Redis sorted set, auto-expire 5s
- Read receipts: upsert `message_reads`, update `conversation_members.last_read_message_id`
- Delivery tracking: upsert `message_deliveries` on WS delivery ACK
- Unread count endpoint: `GET /api/v1/chat/unread-counts`
- WS events: `presence.updated`, `message.read`, `message.delivered`, `typing.started/stopped`, `unread.updated`

### Frontend Changes
- None

### Tests
- Presence TTL expiry
- Typing auto-expire
- Read receipt updates unread count
- Delivery ACK idempotent

### Verification Commands
```bash
go test ./internal/application/chat/... -run "Presence|Typing|Read"

# Update presence
curl -s -X PUT http://localhost:8080/api/v1/chat/presence \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"away"}' | jq

# Get presence
curl -s "http://localhost:8080/api/v1/chat/presence?employee_ids=<id1>,<id2>" \
  -H "Authorization: Bearer $TOKEN" | jq

# Mark read
curl -s -X POST http://localhost:8080/api/v1/chat/conversations/<conv-id>/read \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message_id":"<msg-id>"}' | jq

# Unread counts
curl -s http://localhost:8080/api/v1/chat/unread-counts \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Rollback Considerations
- Redis failure: presence/typing degraded (offline), read receipts still work via REST
- No impact on message delivery

---

## Phase 7: Search, Bookmarks, Pins, Forwards, Drafts

### Objective
Implement message/conversation search, bookmarks, pinned messages, message forwarding, and draft persistence.

### Files Likely to Change
| Action | Path |
|--------|------|
| Create | `internal/application/chat/search.go` |
| Create | `internal/application/chat/bookmark.go` |
| Create | `internal/application/chat/pin.go` |
| Create | `internal/application/chat/forward.go` |
| Create | `internal/application/chat/draft.go` |
| Modify | `internal/infrastructure/postgres/chat_repo.go` |
| Modify | `internal/delivery/http/chat_handler.go` |
| Modify | `internal/database/migrate_chat.go` (add trgm index if not already) |

### Database Changes
- Ensure `idx_messages_content_trgm` GIN index exists

### Backend Changes
- Message search: `pg_trgm` with cursor pagination, scoped to user's conversations
- Conversation search: name/slug match
- Bookmarks: add/remove/list
- Pins: add/remove/list per conversation (max 50 pins)
- Forward: create new message in target conversation(s) with `message_forwards` link
- Drafts: save/load/delete per conversation per user

### Frontend Changes
- None

### Tests
- Search returns only messages from user's conversations
- Search respects soft-deleted messages (excluded)
- Forward creates message in target + link record
- Pin limit enforced

### Verification Commands
```bash
go test ./internal/application/chat/... -run "Search|Bookmark|Pin|Forward|Draft"

# Search messages
curl -s "http://localhost:8080/api/v1/chat/search/messages?q=hello&limit=20" \
  -H "Authorization: Bearer $TOKEN" | jq

# Bookmark
curl -s -X POST http://localhost:8080/api/v1/chat/messages/<msg-id>/bookmark \
  -H "Authorization: Bearer $TOKEN" | jq

# Pin
curl -s -X POST http://localhost:8080/api/v1/chat/conversations/<conv-id>/pins \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message_id":"<msg-id>"}' | jq

# Forward
curl -s -X POST http://localhost:8080/api/v1/chat/messages/<msg-id>/forward \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"target_conversation_ids":["<target-conv-id>"],"comment":"FYI"}' | jq
```

### Rollback Considerations
- All additive features; disable via `CHAT_ENABLED=false`

---

## Phase 8: Notifications & Preferences

### Objective
Integrate chat events with existing notification system. Implement per-conversation mute and global notification preferences.

### Files Likely to Change
| Action | Path |
|--------|------|
| Create | `internal/application/chat/notification.go` |
| Modify | `internal/application/chat/service.go` (hook notifications on message/mention) |
| Modify | `internal/application/chat/ws_hub.go` (publish `notification.created`) |
| Modify | `internal/delivery/http/chat_handler.go` |
| Modify | `internal/domain/support/entities.go` (optional source fields) |

### Database Changes
- `notification_preferences` table (if not created in phase 1)
- Extend `notifications` inserts with `source_type='chat'`, `source_id`, `action_url`

### Backend Changes
- On message create: check mute/notification_level → create notification for recipients
- Mention notifications bypass mute (unless `notification_level=none`)
- Mute/unmute conversation endpoints
- Notification preferences CRUD
- Email notifier interface (no-op implementation)
- Unread count integration with notification bell

### Frontend Changes
- None (backend-only; existing NotificationBell will show chat notifications)

### Tests
- Muted conversation suppresses notification
- Mention notification delivered despite mute (mentions_only level)
- Notification preferences respected
- `action_url` deep link format correct

### Verification Commands
```bash
go test ./internal/application/chat/... -run Notification

# Mute conversation
curl -s -X POST http://localhost:8080/api/v1/chat/conversations/<conv-id>/mute \
  -H "Authorization: Bearer $TOKEN" | jq

# Set preferences
curl -s -X PUT http://localhost:8080/api/v1/chat/notification-preferences \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"preferences":[{"event_type":"chat.mention","in_app":true,"browser":true,"email":false}]}' | jq

# Send message in muted conversation — verify no notification created
# Send @mention — verify notification created despite mute
curl -s http://localhost:8080/api/v1/notifications?mine=true \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Rollback Considerations
- Chat notification types ignored by frontend until chat UI exists
- Existing notification system unaffected

---

## Phase 9: Admin, Moderation, Audit

### Objective
Implement message reporting, user blocking, chat audit logs, and admin endpoints.

### Files Likely to Change
| Action | Path |
|--------|------|
| Create | `internal/application/chat/moderation.go` |
| Create | `internal/application/chat/audit.go` |
| Modify | `internal/delivery/http/chat_handler.go` |
| Modify | `internal/infrastructure/postgres/chat_repo.go` |

### Database Changes
- None (tables exist from phase 1)

### Backend Changes
- Report message: create `message_reports` record
- Review reports: admin updates status, optional message delete
- Block/unblock users: prevent DM, hide messages
- Audit log: append on member changes, role changes, admin deletes, channel settings changes
- Admin stats endpoint
- Admin audit log listing
- `chat.moderate` permission required

### Frontend Changes
- None

### Tests
- Blocked user cannot create DM
- Report creates record with pending status
- Admin can delete any message (soft delete + audit log)
- Audit log immutable (no update/delete)

### Verification Commands
```bash
go test ./internal/application/chat/... -run "Moderation|Audit|Block"

# Report message
curl -s -X POST http://localhost:8080/api/v1/chat/messages/<msg-id>/report \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"reason":"spam","details":"Repeated messages"}' | jq

# Block user
curl -s -X POST http://localhost:8080/api/v1/chat/blocks \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"employee_id":"<emp-id>"}' | jq

# Admin: list reports
curl -s "http://localhost:8080/api/v1/chat/reports?status=pending" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq

# Admin: audit logs
curl -s "http://localhost:8080/api/v1/chat/admin/audit-logs" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq
```

### Rollback Considerations
- Admin endpoints gated by `chat.moderate` permission
- No impact on non-chat features

---

## Phase 10: Frontend Chat UI

### Objective
Build the complete chat frontend with conversation list, message panel, composer, threads, and realtime updates.

### Files Likely to Change
| Action | Path |
|--------|------|
| Create | `pmas-live/src/features/chat/types.ts` |
| Create | `pmas-live/src/features/chat/api.ts` |
| Create | `pmas-live/src/features/chat/hooks/*.ts` (6-8 hooks) |
| Create | `pmas-live/src/features/chat/components/*.tsx` (12-15 components) |
| Create | `pmas-live/src/features/chat/store/chat-store.ts` |
| Create | `pmas-live/src/app/(dashboard)/chat/page.tsx` |
| Create | `pmas-live/src/app/(dashboard)/chat/dm/[conversationId]/page.tsx` |
| Create | `pmas-live/src/app/(dashboard)/chat/group/[conversationId]/page.tsx` |
| Create | `pmas-live/src/app/(dashboard)/chat/channel/[slug]/page.tsx` |
| Create | `pmas-live/src/app/(dashboard)/chat/channel/[slug]/thread/[messageId]/page.tsx` |
| Create | `pmas-live/src/app/(dashboard)/chat/search/page.tsx` |
| Create | `pmas-live/src/app/(dashboard)/chat/bookmarks/page.tsx` |
| Create | `pmas-live/src/app/(dashboard)/chat/settings/page.tsx` |
| Modify | `pmas-live/src/shared/routes.ts` (add chat route) |
| Modify | `pmas-live/src/shared/permissions.ts` (add chat permissions) |
| Modify | `pmas-live/src/components/Sidebar.tsx` (chat nav item) |
| Modify | `pmas-live/src/i18n/dictionaries/*.ts` (chat strings) |

### Database Changes
- None

### Backend Changes
- None (all APIs ready from phases 2–9)

### Frontend Changes
- **ChatLayout**: responsive three-panel layout (sidebar + conversation list + message panel)
- **ConversationList**: sections for channels, DMs, groups; unread badges; search filter
- **MessagePanel**: virtualized message list (react-virtuoso), infinite scroll up
- **MessageComposer**: text input, emoji picker, attachment button, mention autocomplete
- **MessageBubble**: text, attachments, reactions, reply/thread indicators, edit/delete actions
- **ThreadPanel**: side panel for thread replies
- **MemberPanel**: member list with presence indicators
- **useChatWebSocket**: connect, subscribe, handle all server events, reconnect with backoff
- **Optimistic updates**: insert message on send, reconcile on `message.created`
- **TanStack Query**: infinite queries for conversations and messages
- **Responsive**: mobile shows list OR panel; tablet two-panel; desktop three-panel

### Tests
- Component render tests (MessageBubble, ConversationList)
- Hook tests with mock WebSocket
- Manual E2E: send message, see realtime delivery, edit, react, thread

### Verification Commands
```bash
# Frontend build
cd pmas-live && npm run build

# Lint
cd pmas-live && npm run lint

# Start full stack
docker compose up -d --build
# Or: start.bat

# Manual E2E:
# 1. Login as user A and user B (different browsers)
# 2. Navigate to /chat
# 3. Create DM between A and B
# 4. Send message from A → appears realtime for B
# 5. Edit message → update appears for both
# 6. Add reaction → appears for both
# 7. Reply in thread → thread count updates
# 8. Upload image → displays inline
# 9. Test mobile responsive layout
# 10. Disconnect network → reconnect → missed messages load
```

### Rollback Considerations
- Chat routes in frontend are additive; remove from `routes.ts` to hide
- No impact on existing pages
- `CHAT_ENABLED=false` on backend shows graceful error in chat UI

---

## Phase 11: Performance & Load Testing

### Objective
Validate performance at scale, optimize queries, add chat metrics, and run load tests.

### Files Likely to Change
| Action | Path |
|--------|------|
| Create | `internal/observability/chat_metrics.go` |
| Modify | `internal/observability/metrics.go` (integrate chat metrics in snapshot) |
| Modify | `internal/infrastructure/postgres/chat_repo.go` (query optimization) |
| Create | `internal/infrastructure/redis/rate_limit.go` |
| Create | `tests/load/chat-smoke.js` |
| Create | `tests/load/chat-load.js` |
| Create | `tests/load/chat-stress.js` |
| Create | `deploy/observability/grafana/dashboards/pmas-chat.json` |
| Modify | `tests/load/README.md` |

### Database Changes
- Add any missing indexes identified by `EXPLAIN ANALYZE`
- Consider partial indexes for hot queries

### Backend Changes
- Chat metrics: counters, gauges, histograms (see architecture §16)
- Redis per-user rate limiting (replace in-memory for chat endpoints)
- Query optimization: batch loading, eliminate N+1
- Connection pool tuning for chat workload
- Message feed query `EXPLAIN` verification

### Frontend Changes
- Virtual scroll performance tuning
- WebSocket reconnection stress testing
- Bundle size check for chat feature module

### Tests
- k6 chat smoke: 10 users, WS connect, send/receive
- k6 chat load: 100 users, 10 msg/s sustained
- k6 chat stress: 500 users, connection flood
- Go benchmark: message insert throughput
- Go benchmark: cursor pagination latency

### Verification Commands
```bash
# Go benchmarks
go test ./internal/infrastructure/postgres/ -bench=Chat -benchmem

# k6 load tests
export BASE_URL=http://localhost:3185
export TEST_USERNAME=admin@example.com
export TEST_PASSWORD=...
k6 run tests/load/chat-smoke.js
k6 run tests/load/chat-load.js
k6 run tests/load/chat-stress.js

# Check metrics
curl -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:8080/metrics | jq '.chat'

# EXPLAIN message feed query
psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT * FROM messages WHERE conversation_id='<id>' AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 50;"
```

### Rollback Considerations
- Metrics are additive to `/metrics` JSON
- Rate limit changes can be tuned via env vars
- No breaking changes

---

## Phase 12: Polish, Offline Support, Browser Notifications

### Objective
Final polish: offline message queue, browser push notifications, link previews, and documentation.

### Files Likely to Change
| Action | Path |
|--------|------|
| Create | `pmas-live/src/features/chat/hooks/useOfflineQueue.ts` |
| Create | `pmas-live/src/features/chat/hooks/useBrowserNotifications.ts` |
| Create | `pmas-live/public/sw.js` (service worker, optional) |
| Create | `internal/application/chat/linkpreview.go` |
| Modify | `internal/application/chat/message.go` (fetch link previews on send) |
| Modify | `pmas-live/src/features/chat/components/MessageComposer.tsx` |
| Modify | `pmas-live/src/features/chat/components/MessageBubble.tsx` (link preview cards) |
| Create | `docs/chat/API_REFERENCE.md` (optional quick reference) |

### Database Changes
- None

### Backend Changes
- Link preview fetcher: extract OG tags from URLs in message content (with timeout, caching)
- Rate limit link preview fetches (5/min per user)

### Frontend Changes
- IndexedDB cache for recent messages (offline read)
- Offline send queue: queue messages when WS disconnected, flush on reconnect
- Browser notifications: request permission, show on `notification.created` when tab not focused
- Link preview cards in message bubbles
- Keyboard shortcuts (Ctrl+Enter send, Esc close thread)
- Accessibility: ARIA labels, keyboard navigation

### Tests
- Offline queue: send while disconnected → delivers on reconnect
- Link preview: URL in message → preview fetched and displayed
- Browser notification: permission granted → notification shown

### Verification Commands
```bash
# Full regression
go test ./...
cd pmas-live && npm run build && npm run lint

# Offline test:
# 1. Open chat, disconnect network
# 2. Type and send message → appears optimistically
# 3. Reconnect → message confirmed, no duplicate

# Link preview:
# Send message with https://example.com → preview card appears

# Browser notification:
# Grant permission, switch tab, receive message → OS notification
```

### Rollback Considerations
- Offline/notification features are progressive enhancements
- Core chat works without them

---

## Dependency Graph

```
Phase 1 (Foundation)
  └── Phase 2 (Core REST)
        └── Phase 3 (WebSocket)
              ├── Phase 4 (Channels/Threads/Reactions)
              ├── Phase 5 (Attachments)
              ├── Phase 6 (Presence/Read Receipts)
              └── Phase 8 (Notifications)
                    └── Phase 9 (Admin/Moderation)
Phase 4 + 5 + 6 + 7 (Search/etc.) ──► Phase 10 (Frontend)
Phase 10 ──► Phase 11 (Performance)
Phase 10 ──► Phase 12 (Polish)
```

Phases 4, 5, 6, 7 can be developed in parallel after phase 3.

---

## Environment Variables Summary

| Variable | Default | Phase | Description |
|----------|---------|-------|-------------|
| `CHAT_ENABLED` | `false` | 2 | Enable chat API routes |
| `CHAT_REDIS_ENABLED` | `false` | 3 | Enable Redis pub/sub |
| `REDIS_URL` | — | 3 | Redis connection URL |
| `STORAGE_BACKEND` | `local` | 5 | `local` or `s3` |
| `STORAGE_LOCAL_PATH` | `/data/uploads` | 5 | Local storage path |
| `S3_ENDPOINT` | — | 5 | S3-compatible endpoint |
| `S3_BUCKET` | — | 5 | Storage bucket |
| `S3_ACCESS_KEY` | — | 5 | S3 access key |
| `S3_SECRET_KEY` | — | 5 | S3 secret key |
| `CHAT_MAX_MESSAGE_LENGTH` | `10000` | 2 | Max message characters |
| `CHAT_MESSAGE_RATE_RPM` | `30` | 2 | Messages per minute per user |
| `CHAT_WS_MAX_CONNECTIONS` | `10000` | 3 | Max WS connections per instance |
| `CHAT_MAX_ATTACHMENT_SIZE_MB` | `50` | 5 | Max attachment size |
| `CHAT_MAX_IMAGE_SIZE_MB` | `10` | 5 | Max image size |
| `CHAT_MAX_VOICE_SIZE_MB` | `25` | 5 | Max voice message size |

---

## Total Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| 1. Foundation | 1–2 weeks | 2 weeks |
| 2. Core REST | 2–3 weeks | 5 weeks |
| 3. WebSocket | 1–2 weeks | 7 weeks |
| 4. Channels/Threads/Reactions | 2 weeks | 9 weeks |
| 5. Attachments | 1–2 weeks | 11 weeks |
| 6. Presence/Read Receipts | 1 week | 12 weeks |
| 7. Search/Bookmarks/Pins | 1–2 weeks | 14 weeks |
| 8. Notifications | 1 week | 15 weeks |
| 9. Admin/Moderation | 1 week | 16 weeks |
| 10. Frontend UI | 3–4 weeks | 20 weeks |
| 11. Performance | 1 week | 21 weeks |
| 12. Polish | 1–2 weeks | 23 weeks |

**Total: ~5–6 months** with one full-stack developer. Phases 4–7 parallelization can reduce by 3–4 weeks with two developers.

---

## Definition of Done (Per Phase)

- [ ] All new code follows existing PMASS conventions (gofmt, domain-driven, company_id scoping)
- [ ] Unit tests pass: `go test ./...`
- [ ] No regressions in existing tests
- [ ] Tenant isolation verified (cross-company access returns 403/empty)
- [ ] Authorization enforced on all endpoints
- [ ] Cursor pagination used for all list endpoints
- [ ] `CHAT_ENABLED=false` disables all new routes
- [ ] No modifications to existing business logic (unless permission seeding)
- [ ] Manual verification commands pass
- [ ] Rollback path documented and tested
