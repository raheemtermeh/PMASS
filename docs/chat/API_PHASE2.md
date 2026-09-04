# Chat REST API — Phase 2

**Base path:** `/api/v1/chat`  
**Authentication:** JWT bearer (same as PMASS)  
**Feature flag:** Routes are registered only when `CHAT_ENABLED=true`

All responses use the PMASS VSM envelope:

```json
{
  "success": true,
  "data": { },
  "meta": {},
  "errors": []
}
```

Errors return `success: false` with `errors: [{ "code": "...", "message": "..." }]`.

---

## Permissions

| Permission | Description |
|------------|-------------|
| `chat.view` | List conversations, read messages, bookmarks |
| `chat.send` | Send messages, reactions, create DM/group |
| `chat.create_channel` | Create channels |
| `chat.manage_channel` | Update channel metadata (global or owner/admin) |
| `chat.moderate` | Delete others' messages, pin/unpin, manage members |

Additional **conversation membership** is required for conversation-scoped operations.

---

## Conversations

### List conversations

`GET /api/v1/chat/conversations`

| Query | Description |
|-------|-------------|
| `cursor` | Opaque pagination cursor |
| `limit` / `page_size` | Page size (default 50, max 100) |

**Permission:** `chat.view`

### Create conversation

`POST /api/v1/chat/conversations`

**DM**

```json
{
  "type": "DM",
  "other_employee_id": "<uuid>"
}
```

Returns existing DM if one already exists between the two employees (tenant-scoped deduplication).

**Group**

```json
{
  "type": "GROUP",
  "name": "Team Alpha",
  "member_ids": ["<uuid>", "<uuid>"]
}
```

**Permission:** `chat.send` (no dedicated group-create permission; see PHASE2_IMPLEMENTATION.md)

**Channel**

```json
{
  "type": "CHANNEL",
  "name": "General",
  "slug": "general",
  "description": "Company-wide",
  "visibility": "PUBLIC"
}
```

**Permission:** `chat.create_channel`

### Get conversation

`GET /api/v1/chat/conversations/{conversationID}`

**Permission:** `chat.view` + membership

### Update conversation

`PATCH /api/v1/chat/conversations/{conversationID}`

```json
{
  "name": "New name",
  "description": "...",
  "avatar_url": "https://...",
  "visibility": "PRIVATE",
  "slug": "new-slug"
}
```

Immutable after creation: `company_id`, `type`, `creator`.

**Permission:** owner/admin or `chat.manage_channel` / `chat.moderate`

### Archive / Unarchive

`POST /api/v1/chat/conversations/{conversationID}/archive`  
`POST /api/v1/chat/conversations/{conversationID}/unarchive`

### Leave

`POST /api/v1/chat/conversations/{conversationID}/leave`

Last owner cannot leave without transferring ownership (409).

---

## Membership

### List members

`GET /api/v1/chat/conversations/{conversationID}/members?limit=50`

### Add member

`POST /api/v1/chat/conversations/{conversationID}/members`

```json
{ "employee_id": "<uuid>" }
```

**Permission:** owner/admin or `chat.moderate`

### Remove member

`DELETE /api/v1/chat/conversations/{conversationID}/members/{employeeID}`

Cannot remove last owner (409).

---

## Messages

### List messages

`GET /api/v1/chat/conversations/{conversationID}/messages`

| Query | Description |
|-------|-------------|
| `cursor` | Opaque cursor (base64-encoded `created_at\|id`) |
| `limit` | Default 50, max 100 |
| `direction` | `before` (default) or `after` |

Response:

```json
{
  "items": [ /* Message[] */ ],
  "next_cursor": "...",
  "has_more": true
}
```

Ordering: `created_at DESC, id DESC`. Deleted messages excluded.

### Send message

`POST /api/v1/chat/conversations/{conversationID}/messages`

```json
{
  "content": "Hello",
  "message_type": "TEXT",
  "content_format": "plain",
  "parent_message_id": null,
  "thread_root_id": null
}
```

Client-allowed types: `TEXT`, `FORWARD`. `SYSTEM` is server-only.

**Permission:** `chat.send` + membership  
**Rate limit:** `CHAT_MESSAGE_RATE_RPM` (in-memory per process; 429 on exceed)

### Get / Edit / Delete message

`GET /api/v1/chat/messages/{messageID}`  
`PATCH /api/v1/chat/messages/{messageID}` — body `{ "content": "..." }` (sender only)  
`DELETE /api/v1/chat/messages/{messageID}` — soft delete (sender or moderator)

### Reply

`POST /api/v1/chat/messages/{messageID}/reply`

```json
{ "content": "Reply text" }
```

Sets `parent_message_id` and `thread_root_id`; increments thread reply count atomically.

### Forward

`POST /api/v1/chat/messages/{messageID}/forward`

```json
{
  "target_conversation_ids": ["<uuid>"],
  "comment": "optional comment"
}
```

Creates `FORWARD` messages and `message_forwards` metadata rows.

### Read / Delivered receipts

`POST /api/v1/chat/messages/{messageID}/read`  
`POST /api/v1/chat/messages/{messageID}/delivered`

Employee can only update their own receipt. No realtime broadcast in Phase 2.

---

## Reactions

`POST /api/v1/chat/messages/{messageID}/reactions` — `{ "emoji": "👍" }`  
`DELETE /api/v1/chat/messages/{messageID}/reactions?emoji=👍`

Duplicate emoji per user rejected by DB unique constraint.

---

## Bookmarks

`POST /api/v1/chat/messages/{messageID}/bookmark`  
`DELETE /api/v1/chat/messages/{messageID}/bookmark`

---

## Pins

`GET /api/v1/chat/conversations/{conversationID}/pins`  
`POST /api/v1/chat/conversations/{conversationID}/pins` — `{ "message_id": "<uuid>" }`  
`DELETE /api/v1/chat/conversations/{conversationID}/pins/{messageID}`

**Permission:** moderator role in conversation or `chat.moderate`

---

## Moderation

### Report message

`POST /api/v1/chat/messages/{messageID}/report`

```json
{
  "reason": "spam",
  "details": "optional details"
}
```

### Block / Unblock user

`POST /api/v1/chat/blocks` — `{ "employee_id": "<uuid>" }`  
`DELETE /api/v1/chat/blocks/{employeeID}`

Blocking prevents **new DM initiation**; existing conversations remain accessible.

---

## Error codes

| HTTP | Code | When |
|------|------|------|
| 401 | UNAUTHORIZED | Missing/invalid JWT |
| 403 | FORBIDDEN | Missing permission or membership |
| 404 | NOT_FOUND | Resource not found or cross-tenant (no leak) |
| 409 | CONFLICT | Duplicate member, last owner, slug exists |
| 422 | VALIDATION | Invalid cursor, body, message type |
| 429 | CHAT_RATE_LIMITED | Message rate exceeded |

---

## Security

- All queries scoped by `company_id` from JWT tenant context.
- Clients cannot set `sender_id`, `company_id`, timestamps, or audit fields.
- Message content stored as data; no server-side HTML rendering (XSS boundary at frontend).
- Malformed UUIDs → 400; malformed cursors → validation error (no panic).
- Private channels return 404 to non-members (no enumeration).

---

## Manual verification sequence

1. Login and obtain JWT with chat permissions.
2. `POST /conversations` type DM → note `conversation_id`.
3. `POST .../messages` with content.
4. `GET .../messages` — verify cursor pagination.
5. `POST .../messages/{id}/reply`.
6. `PATCH .../messages/{id}` — edit.
7. `POST .../messages/{id}/reactions`.
8. `POST .../messages/{id}/bookmark`.
9. `POST .../conversations/{id}/pins`.
10. `POST .../messages/{id}/read`.
11. `DELETE .../messages/{id}` — verify absent from list.
12. Repeat with second company user — all cross-tenant IDs must return 404.

---

## Phase 4 additions

### Sync (reconnect foundation)

`GET /api/v1/chat/sync?conversation_id=<uuid>&after_message_id=<uuid>&limit=50`

PostgreSQL catch-up after reconnect. Not Redis event replay. Requires membership.

### Read up-to

`POST /api/v1/chat/conversations/{conversationID}/read`

```json
{ "message_id": "<uuid>" }
```

Advances the member read cursor (forward only).

### Conversation list fields

Also returns: `last_message_id`, `unread_count`, `unread_is_capped`, `is_muted`, `notification_level`, `last_read_message_id`, `last_read_at`.
