# Realtime Protocol — Phase 3

WebSocket endpoint: `GET /api/v1/chat/ws`

All frames are JSON text messages.

## Envelope (server → client)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "message.created",
  "timestamp": "2026-09-04T12:00:00Z",
  "company_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "conversation_id": "11111111-2222-3333-4444-555555555555",
  "actor_id": "99999999-8888-7777-6666-555555555555",
  "payload": {}
}
```

- `id` — unique event ID (client-side dedup key)
- `company_id` / `actor_id` — always server-set
- `timestamp` — server UTC

## Authentication

Preferred:

```
Authorization: Bearer <access_jwt>
```

Browser fallback:

```
GET /api/v1/chat/ws?access_token=<access_jwt>
```

Use short-lived access JWTs only (never refresh tokens).

## Client → server

### subscribe

```json
{
  "type": "subscribe",
  "conversation_ids": ["11111111-2222-3333-4444-555555555555"]
}
```

Server replies:

```json
{
  "id": "...",
  "type": "subscribed",
  "timestamp": "...",
  "company_id": "...",
  "actor_id": "...",
  "payload": {
    "conversation_ids": ["11111111-2222-3333-4444-555555555555"]
  }
}
```

Unauthorized conversation IDs are silently omitted (no cross-tenant leak).

### unsubscribe

```json
{
  "type": "unsubscribe",
  "conversation_ids": ["11111111-2222-3333-4444-555555555555"]
}
```

### ping

```json
{ "type": "ping" }
```

Server replies with `pong` (protocol-level). Native WebSocket ping/pong frames are also used for heartbeat.

### typing.start / typing.stop (optional fan-out)

```json
{
  "type": "typing.start",
  "conversation_id": "11111111-2222-3333-4444-555555555555"
}
```

```json
{
  "type": "typing.stop",
  "conversation_id": "11111111-2222-3333-4444-555555555555"
}
```

No persistence — ephemeral fan-out only.

### Forbidden over WebSocket

`message.create`, `message.update`, `message.delete` — use REST.

---

## Server → client events

### connected

```json
{
  "type": "connected",
  "payload": {
    "employee_id": "99999999-8888-7777-6666-555555555555",
    "server_time": "2026-09-04T12:00:00Z"
  }
}
```

### message.created

```json
{
  "type": "message.created",
  "conversation_id": "...",
  "actor_id": "...",
  "payload": {
    "message": {
      "id": "...",
      "conversation_id": "...",
      "sender_id": "...",
      "content": "Hello",
      "message_type": "TEXT",
      "content_format": "plain",
      "parent_message_id": null,
      "thread_root_id": null,
      "is_edited": false,
      "edited_at": null,
      "created_at": "...",
      "updated_at": "..."
    }
  }
}
```

### message.updated

```json
{
  "type": "message.updated",
  "payload": {
    "message": { "...": "..." },
    "edited_at": "2026-09-04T12:01:00Z"
  }
}
```

### message.deleted

```json
{
  "type": "message.deleted",
  "payload": {
    "message_id": "...",
    "conversation_id": "...",
    "deleted_at": "2026-09-04T12:02:00Z"
  }
}
```

### message.reaction.added / message.reaction.removed

```json
{
  "type": "message.reaction.added",
  "payload": {
    "message_id": "...",
    "conversation_id": "...",
    "employee_id": "...",
    "emoji": "👍"
  }
}
```

### message.read / message.delivered

```json
{
  "type": "message.read",
  "payload": {
    "message_id": "...",
    "conversation_id": "...",
    "employee_id": "...",
    "read_at": "..."
  }
}
```

### message.pinned / message.unpinned

```json
{
  "type": "message.pinned",
  "payload": {
    "message_id": "...",
    "conversation_id": "...",
    "actor_id": "...",
    "pinned_at": "..."
  }
}
```

### conversation.created / conversation.updated

```json
{
  "type": "conversation.created",
  "payload": { "id": "...", "type": "DM", "name": "", "...": "..." }
}
```

### conversation.member_added / conversation.member_removed

```json
{
  "type": "conversation.member_added",
  "payload": {
    "conversation_id": "...",
    "employee_id": "...",
    "role": "member"
  }
}
```

### typing.started / typing.stopped

```json
{
  "type": "typing.started",
  "payload": {
    "conversation_id": "...",
    "employee_id": "..."
  }
}
```

### Protocol placeholders (future phases)

- `presence.updated`
- `notification.created`

---

## Duplicate delivery

Redis Pub/Sub may deliver duplicates after reconnect. Clients should dedupe by `event.id`.

## Heartbeat

- Server native ping every `CHAT_WS_PING_INTERVAL` (default 30s)
- Client must reply with pong within `CHAT_WS_PONG_TIMEOUT` (default 10s)
- Stale connections are closed
