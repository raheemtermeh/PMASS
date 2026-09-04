# Phase 7 Implementation — Presence + Typing + Drafts

**Date:** 2026-09-04  
**Status:** Complete

## Presence architecture

WebSocket connections are the **primary online signal**. PostgreSQL `user_presence` is durable fallback / last-seen.

```
WS connect (0→1) → online → UpsertPresence(online) → presence.updated
WS disconnect (1→0) → offline → UpsertPresence(offline, last_seen) → presence.updated
Client presence.set status=away → away (while connections > 0)
```

Connection counting is per-employee in the Hub (`byEmployee`). Multiple tabs/devices stay online until the **final** connection closes.

## Away state

Explicit client command only:

```json
{ "type": "presence.set", "status": "away" }
{ "type": "presence.set", "status": "online" }
```

No per-user inactivity goroutines. Typing start clears away → online.

## Typing TTL

- In-memory map on Hub (not PostgreSQL, not Redis)
- TTL default **8s** (`Config.TypingTTL`)
- Single background sweeper (1s tick) — not a goroutine per user
- `typing.start` refreshes TTL; fans out `typing.started` only when newly created / expired
- `typing.stop` removes immediately
- Fanout: conversation subscribers only; **originating connection excluded**
- Other devices of the same employee **do** receive typing (if subscribed)
- Disconnect clears that employee’s typing entries

Redis is used only as existing realtime fanout for events — not for typing state storage.

## Draft architecture

- Table `message_drafts` (PK: conversation_id + employee_id) — UPSERT only
- Columns: content, parent_message_id, revision, updated_at
- Ownership: JWT employee + company + active membership
- Optimistic concurrency: client may send prior `updated_at`; stale writes → `CHAT_DRAFT_CONFLICT`
- Revision increments on each successful upsert
- Realtime: `draft.updated` with `recipient_id = employee` — **no draft content** in payload

## API endpoints

| Method | Path |
|--------|------|
| GET | `/api/v1/chat/presence?employee_ids=` |
| GET | `/api/v1/chat/conversations/{id}/draft` |
| PUT | `/api/v1/chat/conversations/{id}/draft` |
| DELETE | `/api/v1/chat/conversations/{id}/draft` |

Presence: max 100 IDs, same-company active employees only, merges live Hub status with PG.

## WebSocket events / commands

| Direction | Type | Notes |
|-----------|------|-------|
| C→S | `typing.start` / `typing.stop` | membership required |
| C→S | `presence.set` | `online` \| `away` |
| S→C | `typing.started` / `typing.stopped` | conversation room |
| S→C | `presence.updated` | company WS connections |
| S→C | `draft.updated` | recipient-only |

## Security / tenant isolation

- Presence query filters by company employees
- Typing requires membership (subscribe check)
- Drafts never leave the owning employee (REST + WS)
- `DeliverEvent` recipient / conversation / company gates unchanged
- Typing uses `ExcludeConnID` to avoid self-echo

## Database changes

- `message_drafts.parent_message_id`
- `message_drafts.revision`
- `idx_user_presence_company`

## Redis

No new Redis structures. Existing Pub/Sub remains event fanout only.

## Metrics

- `chat_presence_online`
- `chat_presence_transitions`
- `chat_typing_events`
- `chat_typing_expired`
- `chat_draft_updates`

## Performance

- No DB write on WS ping
- No DB write on typing
- Bounded presence ID list
- Single typing sweeper
- Draft UPSERT (one row per conversation+employee)

## CHAT_ENABLED

When false: no routes, WS, presence runtime, typing sweeper, or Redis subscriber.

## Tests

- Hub multi-device presence online/offline + last_seen
- Typing TTL + no self-echo
- Draft CRUD, conflict, max length, non-member, presence company filter

## Known limitations

- Presence fanout is company-scoped among connected chat WS users (not filtered to shared-conversation peers)
- Away is explicit only (no inactivity timeout)
- Multi-instance: each Hub process has its own connection count; Redis fans events but online truth is per-instance (document for horizontal scale)
- Race detector may be unavailable on Windows without CGO

## Deviations

- Away via explicit `presence.set` (not inactivity timers)
- Typing state in-memory (not Redis) even when Redis fanout is enabled
- Presence list requires `employee_ids` (no unbounded “all company” dump)

## Explicit non-goals

**Attachments / Files were NOT implemented.**
