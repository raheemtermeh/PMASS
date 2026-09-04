# Phase 2 Implementation Report — Chat REST API

**Date:** 2026-09-01  
**Status:** Complete

## Architecture

```
HTTP (chat_handler.go)
  → ChatScope (company + employee resolution)
  → application/chat.Service
  → domain/chat repositories
  → postgres/chat_repo.go
```

Routes register in `cmd/api/main.go` only when `CHAT_ENABLED=true`.

## Files Created

| Path | Purpose |
|------|---------|
| `internal/application/chat/service.go` | Service wiring, actor, rate limit, auth helpers |
| `internal/application/chat/conversations.go` | Conversation + membership use cases |
| `internal/application/chat/messages.go` | Messages, reactions, bookmarks, pins, moderation |
| `internal/application/chat/service_integration_test.go` | DB integration tests |
| `internal/delivery/http/chat_handler.go` | REST route dispatch |
| `internal/delivery/http/chat_scope.go` | Company + employee actor resolution |
| `internal/delivery/http/chat_wire.go` | Dependency wiring |
| `internal/delivery/http/chat_handler_test.go` | HTTP auth smoke tests |
| `docs/chat/API_PHASE2.md` | API reference |
| `docs/chat/PHASE2_IMPLEMENTATION.md` | This document |

## Files Modified

| Path | Change |
|------|--------|
| `internal/domain/chat/repository.go` | Extended interfaces (list, update, DM lookup, forwards, etc.) |
| `internal/infrastructure/postgres/chat_repo.go` | Repository method implementations |
| `internal/config/config.go` | `ChatMessageRateRPM` |
| `cmd/api/main.go` | Register chat routes when enabled |
| `.env.example` | `CHAT_MESSAGE_RATE_RPM=30` |

(Phase 1 files from prior work remain as foundation.)

## Application Services

Single `chatapp.Service` with use-case methods (not per-table services):

| Area | Methods |
|------|---------|
| Conversations | `CreateDM`, `CreateGroup`, `CreateChannel`, `GetConversation`, `ListConversations`, `UpdateConversation`, `ArchiveConversation`, `UnarchiveConversation` |
| Membership | `AddMember`, `RemoveMember`, `LeaveConversation`, `ListMembers` |
| Messages | `SendMessage`, `GetMessage`, `ListMessages`, `EditMessage`, `DeleteMessage`, `ReplyToMessage`, `ForwardMessage` |
| Reactions | `AddReaction`, `RemoveReaction` |
| Bookmarks | `AddBookmark`, `RemoveBookmark` |
| Pins | `PinMessage`, `UnpinMessage`, `ListPinnedMessages` |
| Receipts | `MarkMessageRead`, `MarkMessageDelivered` |
| Moderation | `ReportMessage`, `BlockUser`, `UnblockUser` |

## Routes Added

All under `/api/v1/chat`, JWT required:

| Method | Path |
|--------|------|
| GET, POST | `/conversations` |
| GET, PATCH | `/conversations/{id}` |
| POST | `/conversations/{id}/archive`, `/unarchive`, `/leave` |
| GET, POST | `/conversations/{id}/members` |
| DELETE | `/conversations/{id}/members/{employeeId}` |
| GET, POST | `/conversations/{id}/messages` |
| GET, POST | `/conversations/{id}/pins` |
| DELETE | `/conversations/{id}/pins/{messageId}` |
| GET, PATCH, DELETE | `/messages/{id}` |
| POST, DELETE | `/messages/{id}/reactions` |
| POST, DELETE | `/messages/{id}/bookmark` |
| POST | `/messages/{id}/read`, `/delivered`, `/reply`, `/forward`, `/report` |
| POST | `/blocks` |
| DELETE | `/blocks/{employeeId}` |

## Permissions & Authorization

| Operation | Permission | Additional check |
|-----------|------------|------------------|
| List/get conversations | `chat.view` | Active membership |
| Create DM/group | `chat.send` | Target in same company; block check for DM |
| Create channel | `chat.create_channel` | Unique slug per company |
| Send/reply/forward | `chat.send` | Membership; rate limit |
| Edit message | `chat.send` | Sender only |
| Delete message | — | Sender or `chat.moderate`/conv moderator |
| Update conversation | — | Owner/admin or `chat.manage_channel` |
| Pin/unpin | — | Conv moderator+ or `chat.moderate` |
| Add/remove members | — | Owner/admin or `chat.moderate` |
| Report | `chat.view` | Membership |

**Group creation permission decision:** No dedicated `chat.create_group` exists. Groups use `chat.send` (same as DM initiation). Documented here per spec.

**Ownership rules:**
- Cannot remove last owner (409).
- Owner cannot leave if sole owner (409); no ownership transfer in Phase 2.
- DM creator gets `owner` role; other participant gets `member`.

**Blocking policy:** Block prevents new DM creation. Existing conversations remain accessible.

## Transaction Boundaries

| Operation | Transaction |
|-----------|-------------|
| Create DM/group/channel + members | Yes |
| Send message + preview update | Yes |
| Reply + thread count increment | Yes |
| Forward + forward metadata + preview | Yes (per target) |
| Single reaction/bookmark/pin | No (single write) |

## Pagination

- Messages: cursor-only (`created_at DESC, id DESC`), default 50, max 100.
- Conversations: cursor via `ListConversationsForEmployee`.
- No OFFSET pagination for message history.

## Security Controls

- Tenant isolation via `company_id` on every repository call.
- Cross-tenant access returns `ErrConversationNotFound` / `ErrMessageNotFound` (404).
- Trusted fields (`sender_id`, `company_id`, timestamps) set server-side.
- `SYSTEM` message type rejected for client sends.
- Content length validated against `CHAT_MAX_MESSAGE_LENGTH`.
- Whitespace-only messages rejected.
- In-memory per-employee message rate limit (`CHAT_MESSAGE_RATE_RPM`).
- Audit log entries for channel create/update, member add/remove, admin delete, pin/unpin.
- XSS: content stored as opaque data; no server HTML rendering.

## Tests

### Application integration (`service_integration_test.go`)

Requires `DATABASE_URL` or `SUPABASE_DB_URL`:

- DM deduplication
- 51-message cursor pagination (50 + 1, no dupes)
- Tenant isolation (cross-company get → 404)
- Edit forbidden for other user
- Deleted message absent from feed
- Malformed cursor
- Reactions add/duplicate/remove
- Bookmark add/remove
- Pin unauthorized
- Moderator delete
- Empty message rejected
- Invalid message type rejected
- Reply parent/thread metadata
- Block prevents new DM

### HTTP (`chat_handler_test.go`)

- Unauthenticated → 401

### Postgres (`chat_repo_test.go` from Phase 1)

- Tenant isolation, cursor pagination at repo layer

## Verification

```bash
gofmt -w internal/application/chat/ internal/delivery/http/chat*.go
go test ./internal/domain/chat/...
go test ./internal/application/chat/...
go test ./internal/infrastructure/postgres/...
go test ./...
go build -o bin/pmas-api ./cmd/api
```

**CHAT_ENABLED=false:** Chat routes not registered; existing API unchanged.  
**CHAT_ENABLED=true:** Chat routes mounted at `/api/v1/chat/*`.

## Known Limitations

| Limitation | Notes |
|------------|-------|
| No unread counts in list | Schema supports read receipts but no efficient per-conversation unread aggregate; deferred |
| In-memory rate limiting | Per-process only; Phase 11 may move to Redis |
| No ownership transfer | Owner must promote another owner before leaving |
| No attachment upload | `ATTACHMENT`/`VOICE` types exist in schema but not exposed |
| No realtime receipts | REST persistence only; broadcast in Phase 3 |
| No search | Phase 7+ |
| Audit payload | `appendAudit` stores action without rich JSON payload |
| Member count in list | Included when efficiently available from list query |

## Deviations from Architecture

1. **Single `Service` struct** instead of separate ConversationService/MessageService files — aligns with PMASS application-layer conventions (one service per bounded context).
2. **Group permission** uses `chat.send` instead of new permission.
3. **Archive** sets `conversations.is_archived` (conversation-level flag per Phase 1 schema).
4. **Reply endpoint** at `/messages/{id}/reply` in addition to `parent_message_id` on send — convenience REST shape.

## Manual API Test Sequence

See `docs/chat/API_PHASE2.md` § Manual verification sequence.
