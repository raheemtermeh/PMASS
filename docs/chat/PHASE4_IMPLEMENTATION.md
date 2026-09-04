# Phase 4 Implementation Report — Messenger Core

**Date:** 2026-09-04  
**Status:** Complete

## Message Lifecycle

```
CREATED  →  DELIVERED  →  READ
```

- **CREATED:** REST `SendMessage` / reply / forward persists to PostgreSQL, then publishes `message.created`.
- **DELIVERED:** Recipient `POST .../delivered` upserts `message_deliveries` (idempotent PK).
- **READ:** Recipient `POST .../read` or conversation `POST .../read` (up-to) advances the read cursor.

States need not be observed in order by every client. PostgreSQL is the source of truth.

## Delivery Implementation

- Endpoint: `POST /api/v1/chat/messages/{id}/delivered`
- Own receipt only; membership + company scoped
- `ON CONFLICT DO UPDATE` — duplicate calls are safe
- Emits `message.delivered` after successful write

## Read Implementation

- Per-message: `POST /api/v1/chat/messages/{id}/read`
- Up-to cursor: `POST /api/v1/chat/conversations/{id}/read` with `{ "message_id": "..." }`
- Upserts `message_reads` for the target message
- Advances `conversation_members.last_read_message_id` / `last_read_at` **only forward**
- “Up-to” does **not** bulk-insert read rows for every prior message (cursor-based unread)

## Unread Strategy

Conversation list embeds a **bounded** unread count:

```sql
COUNT(*) FROM (
  SELECT 1 FROM messages m
  ... after read cursor, sender <> viewer, deleted_at IS NULL
  LIMIT 100
) 
```

- Cap: `UnreadCountCap = 100` (`unread_is_capped=true` when hit)
- Excludes own messages
- Uses `idx_messages_conversation_cursor`
- No Redis counters
- No N+1: single SQL with correlated capped subquery per listed conversation (page ≤ 100)

## Conversation Preview Strategy

Columns on `conversations`:

- `last_message_id` (Phase 4)
- `last_message_at`
- `last_message_preview`

| Mutation | Preview behavior |
|----------|------------------|
| New / reply / forward | Set to new message |
| Edit latest | Update preview text |
| Edit non-latest | No change |
| Delete latest | Recalc from next latest via indexed `ORDER BY created_at DESC, id DESC LIMIT 1` |
| Delete non-latest | No change |
| Delete last remaining | Clear preview |

## Multi-Device Behavior

- Each browser/device opens its own WebSocket and must `subscribe`
- Hub fans out to all connections in the conversation room
- Same employee with two subscribed connections both receive events (tested)

## Realtime Consistency

All Phase 2 mutations publish **after** successful DB commit via `EventPublisher`.  
Failed transactions never publish. Event IDs are unique for client dedup.

## Sync Endpoint

```
GET /api/v1/chat/sync?conversation_id=<uuid>&after_message_id=<uuid>&limit=50
```

- Auth + company from JWT (client cannot override company)
- Requires active membership
- Returns messages **after** the anchor (ASC), soft-deleted anchors allowed for cursor only
- PostgreSQL-based; **not** Redis replay / Streams

## Queries / Indexes (Phase 4)

| Index | Purpose |
|-------|---------|
| `conversations.last_message_id` + FK | Stable latest pointer for preview / edit detection |
| `idx_conv_members_last_read_message` | Join unread cursor → message ordering |
| `idx_message_deliveries_message` | Delivery lookups by message |
| `idx_message_reads_message` | Read lookups by message |
| Existing `idx_messages_conversation_cursor` | Latest message + unread scan + history |

## Performance

- Conversation list: one query, cursor-bounded page (≤100), unread capped at 100 scans per row
- Message history: cursor only (no OFFSET)
- Preview recalc: single latest-message lookup, not full history

## Security

- Tenant isolation on sync, read, delivered, list
- Cross-company sync returns not-found / forbidden style errors
- Soft-deleted messages excluded from normal feeds
- GetMessage still hides deleted content; sync cursor may resolve deleted IDs without returning them in the feed

## Tests

- Lifecycle event emission (MemoryPublisher)
- Unread reduce after read-up-to
- Preview edit/delete latest vs old
- Sync after_message_id
- Delivered idempotent
- Cross-company sync denial
- Hub multi-device fan-out
- Existing Phase 2/3 suites

## CHAT_ENABLED

- `false`: no chat REST, WS, sync, or Redis chat runtime
- `true`: Phase 2–4 available

## Known Limitations

- Unread capped at 100 (not exact above that)
- Read-up-to does not write per-message read rows for every prior message
- No Redis unread counters
- No offline event replay
- Race detector unavailable on this Windows host without gcc/CGO

## Deviations

1. Conversation-level read-up-to via cursor rather than bulk `message_reads` inserts.
2. Unread cap documented instead of exact unbounded counts.
3. Sync uses `after_message_id` + existing list direction=after (not a separate event log).

## Files Created

- `internal/application/chat/lifecycle_test.go`
- `docs/chat/PHASE4_IMPLEMENTATION.md`

## Files Modified

- `internal/database/migrate_chat.go` — last_message_id + indexes
- `internal/domain/chat/entities.go` — list/preview/unread fields
- `internal/domain/chat/repository.go` — preview/latest/read-up-to/sync helpers
- `internal/infrastructure/postgres/chat_repo.go` — implementations
- `internal/application/chat/messages.go` — preview lifecycle, sync, read-up-to
- `internal/delivery/http/chat_handler.go` — `/sync`, conversation `/read`
- `internal/realtime/hub_test.go` — multi-device test
