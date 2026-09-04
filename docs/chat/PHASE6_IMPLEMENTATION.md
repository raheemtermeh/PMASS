# Phase 6 Implementation — Search + Mentions + Notifications

**Date:** 2026-09-04  
**Status:** Complete

## Architecture

Phase 6 extends the existing chat stack (single `chatapp.Service`) and reuses the shared `notifications` table / `support.NotificationRepository`.

```
REST search / mutations
        │
        ▼
  chatapp.Service
   ├─ MessageRepo.SearchMessages   (membership-scoped SQL)
   ├─ MentionRepo                  (parse → resolve → replace)
   └─ NotificationRepo             (create after successful mutation)
        │
        ▼
  EventPublisher → Redis/Hub
        │
        ▼
  Hub.DeliverEvent (RecipientID → employee connections only)
```

No second chat service. No Elasticsearch. Attachments intentionally not implemented.

## Search strategy

- **Engine:** PostgreSQL `ILIKE` + existing `pg_trgm` GIN index (`idx_messages_content_trgm`)
- **Score:** `similarity(content, q)` returned for UI; **ordering remains** `(created_at DESC, id DESC)` for stable cursor pagination
- **Bounds:** max limit 100, min query length 2 (whitespace-normalized), soft-deleted excluded
- **Scope:** always joins `conversation_members` for the authenticated employee; `company_id` from auth context only

### Ranking (simple)

1. Exact substring match via `ILIKE %q%` (required filter)
2. Trigram `similarity` score exposed on hits
3. Recency tie-break via cursor order

If ranking-by-score becomes needed later, cursors must encode score — deferred to keep pagination correct and bounded.

## Search pagination

Keyset cursor: `base64url(created_at|message_id)` via existing `chat.EncodeCursor` / `DecodeCursor`. No `OFFSET`.

## Mention model

- Table: `message_mentions` (existing Phase 1 schema; `company_id` retained for tenant boundary)
- Parse: server-side `@username` tokens (`ParseMentionTokens`)
- Resolve: `app_users.username` → `employees` **in same company** and **active conversation members**
- Invalid / cross-company / non-member tokens are ignored
- `ReplaceMentions` on send and edit (delete + insert)
- Unique index: `(message_id, mentioned_employee_id)` where employee set

## Notification lifecycle

Created **after** successful mutation (post-commit path for message persistence; mention sync runs after message insert).

| Event | Type | When |
|-------|------|------|
| @mention | `chat.mention` | Mentioned ≠ sender; respects mute/`none` |
| Reply | `chat.reply` | Parent author ≠ sender; not when level=`mentions` only (unless also mentioned) |
| DM | `chat.dm` | Other DM member; level=`all` |
| Reaction | `chat.reaction` | Message author ≠ reactor; level=`all` |
| Member added | `chat.member_added` | Added employee |
| Pin | `chat.pin` | Other members with level=`all` |

Never notify the actor about their own action. Mute (`is_muted`) or `notification_level=none` suppresses.

Deep link: `notifications.action_url` = `/chat/{conversation_id}?message={message_id}`

Dedupe: unique index on `(company_id, receiver_id, type, source_id)` → `ON CONFLICT DO NOTHING` (idempotent retries).

## Notification authorization

- List / read / read-all: **authenticated employee only** (claims.EmployeeID)
- `MarkRead` requires `(company_id, receiver_id, id)`
- Removed insecure company-wide list and arbitrary `receiver_id` query from HTTP

## Realtime notification delivery

- Event: `notification.created`
- Envelope field: `recipient_id`
- Hub delivers only to that employee's connections (multi-device), same company
- Never company-broadcasts private notifications

## Mute / preferences

Honors `conversation_members.is_muted` and `notification_level` (`all` | `mentions` | `none`).

## Security model

- Search cannot escape membership or company
- Mentions cannot resolve cross-company employees
- Notifications owned by receiver identity from JWT/context
- WebSocket recipient filter prevents cross-employee leakage

## Indexes

Reused: `idx_messages_content_trgm`, notification inbox indexes from perf migration.

Added (Phase 6):

- `idx_mentions_message_employee` (unique partial)
- `idx_notifications_chat_dedupe` (unique partial)

## Performance

- Search: membership join + ILIKE/GIN, `LIMIT ≤ 100`, keyset cursor
- Notifications: keyset list, indexed unread count
- Avoids N+1 mention resolution (single `ANY($tokens)` query)

## API endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/v1/chat/search` | Global company chat search |
| GET | `/api/v1/chat/conversations/{id}/search` | Conversation search |
| GET | `/api/v1/notifications` | Own inbox + `unread_count` |
| POST | `/api/v1/notifications/{id}/read` | Own notification |
| POST | `/api/v1/notifications/read-all` | Own inbox |

Chat routes remain gated by `CHAT_ENABLED`.

## Tests

- Unit: mention parsing; hub recipient-only delivery
- Integration: search (hit/deleted/non-member/cursor/short query); DM notify; mute; ownership mark-read; read-all

## Known limitations

- Score not used for ORDER BY (cursor stability first)
- Group/channel message spam not notified (only DM / mention / reply / reaction / pin / membership)
- No push / email
- Mentions require `app_users.username`
- Race detector may be unavailable on Windows without CGO

## Deviations from plan

- Ranking prefers correctness + keyset order over score-ordered results
- Company-wide notification HTTP listing removed (security) rather than kept behind admin flag
- Notification create is synchronous after mutation (not async worker)

## Explicit non-goals (confirmed)

**Attachments / files / object storage were NOT implemented in Phase 6.**
