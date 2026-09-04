# Phase 8 Implementation — Advanced Conversations + Moderation

**Date:** 2026-09-04  
**Status:** Complete

## Architecture

Extends the single `chatapp.Service` with governance APIs. PostgreSQL remains source of truth; Redis/Hub remain fanout only.

## Conversation types

| Type | Create | Semantics |
|------|--------|-----------|
| DM | `CreateDM` | Deduped pair; block check on create + send |
| Group | `CreateGroup` | Owner = creator; members managed by owner/admin |
| Channel | `CreateChannel` | Requires `chat.create_channel`; visibility PUBLIC/PRIVATE |

## Role / permission matrix

| Action | Member | Moderator | Admin | Owner | `chat.moderate` |
|--------|:------:|:---------:|:-----:|:-----:|:---------------:|
| Read / send | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit / delete own | ✓ | ✓ | ✓ | ✓ | ✓ |
| Delete others | ✗ | ✓ | ✓ | ✓ | ✓ |
| Pin | ✗ | ✓ | ✓ | ✓ | ✓ |
| Manage members | ✗ | ✗ | ✓ | ✓ | ✓ |
| Change roles | ✗ | ✗ | ✓* | ✓ | ✓ |
| Transfer owner | ✗ | ✗ | ✗ | ✓ | ✓ |
| Moderate reports | ✗ | ✗ | ✗ | ✗ | ✓ |
| Invite | ✗ | ✗ | ✓ | ✓ | ✓ |

\* Admin cannot modify peers of equal/higher rank or promote to owner (use transfer).

Roles live on `conversation_members.role` (not a second role table).

## Ownership transfer

`POST /api/v1/chat/conversations/{id}/transfer-owner`  
Atomic: previous owner → `admin`, target → `owner`. Audit + `conversation.role_changed`.

## Invitations

| Method | Path |
|--------|------|
| POST | `/conversations/{id}/invitations` |
| GET | `/invitations` |
| POST | `/invitations/{id}/accept` |
| POST | `/invitations/{id}/reject` |

Pending unique per conversation+invitee. Accept is transactional (status + membership). Notification `chat.invitation`.

## Member management

- Add / remove / leave hardened
- Cannot remove owner (transfer first)
- Cannot self-remove via DELETE members (use `/leave`)
- Rank-aware removal
- Personal archive via member `is_archived` (`/archive`, `/unarchive`)
- Mute / notification_level: `PATCH .../settings`

## Blocking

GET/POST/DELETE `/blocks` — own list only. DM create + send blocked when either direction blocked. Existing DM remains readable.

## Moderation

- `POST .../messages/{id}/report`
- `GET /reports` + `PATCH /reports/{id}` (`chat.moderate` only)

## Reactions / bookmarks / pins / threads / forwarding

- Reactions: existing + notifications
- Bookmarks: `GET /bookmarks` (personal, cursor)
- Pins: existing
- Threads: `GET /messages/{id}/thread` (cursor, ascending)
- Forwarding: **all-or-nothing** multi-target transaction after pre-auth of every target (max 20)

## Realtime events (new)

- `conversation.role_changed`
- `conversation.invitation_created`
- Existing member/message/notification events unchanged

## Audit

Expanded: ownership, roles, invitations, leave, settings, blocks, reports, member remove.

## Indexes (Phase 8)

- `idx_invitations_invitee`
- `idx_invitations_pending_unique`
- `idx_reports_company_status`
- `idx_bookmarks_employee`
- `idx_blocks_blocker`

## Security

Tenant + membership on every mutation; invitations invitee-only accept/reject; reports moderator-only; bookmarks/blocks owner-only.

## Tests

Ownership transfer, invitations, member removal rules, settings/blocks/send-block, atomic forward failure, thread + bookmarks.

## Known limitations

- `conversation_roles` custom JSON table unused (member.role is canonical)
- Report “moderator” conversation role cannot access company report queue (requires `chat.moderate`)
- `go test -race` unavailable on this Windows environment (no CGO/`gcc`); non-race `go test ./...` passes
- Global `conversations.is_archived` unused for user archive (member-level instead)

## Deviations

- Archive endpoints are **per-member**, not global conversation archive
- Role change to `owner` forbidden via PATCH — must use transfer-owner
- Forwarding prefers atomic multi-target over partial success

## Explicit non-goals

**Attachments / Files were NOT implemented.**
