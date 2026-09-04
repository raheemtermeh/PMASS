# PMASS Enterprise Chat System — Architecture Document

**Phase 0 — Architecture Audit & Design**  
**Status:** Planning only — no implementation in this phase  
**Date:** 2026-09-01  
**Repository:** [github.com/raheemtermeh/PMASS](https://github.com/raheemtermeh/PMASS)

---

## Table of Contents

1. [Current PMASS Architecture Summary](#1-current-pmass-architecture-summary)
2. [Existing Relevant Modules](#2-existing-relevant-modules)
3. [Proposed Chat Architecture](#3-proposed-chat-architecture)
4. [Database ERD Description](#4-database-erd-description)
5. [Database Tables](#5-database-tables)
6. [Message Model](#6-message-model)
7. [API Specification](#7-api-specification)
8. [WebSocket Protocol](#8-websocket-protocol)
9. [Redis Architecture](#9-redis-architecture)
10. [Storage Architecture](#10-storage-architecture)
11. [Authorization Model](#11-authorization-model)
12. [Security Model](#12-security-model)
13. [Notification Architecture](#13-notification-architecture)
14. [Frontend Architecture](#14-frontend-architecture)
15. [Testing Strategy](#15-testing-strategy)
16. [Observability Strategy](#16-observability-strategy)
17. [Performance Strategy](#17-performance-strategy)
18. [Migration Strategy](#18-migration-strategy)
19. [Rollback Strategy](#19-rollback-strategy)
20. [Implementation Phases (Summary)](#20-implementation-phases-summary)
21. [Risks](#21-risks)
22. [Open Questions](#22-open-questions)

---

## 1. Current PMASS Architecture Summary

### 1.1 Stack Overview

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend | Go 1.23, stdlib `net/http` | Single binary `pmas-api` |
| Frontend | Next.js 15, React 19, TypeScript | App Router, standalone Docker build |
| Database | PostgreSQL 16 (Supabase-compatible DSN) | `database/sql` + `lib/pq`, no ORM |
| Gateway | Nginx 1.27 | Port 3185, WebSocket upgrade on `/` |
| Observability | Loki + Grafana (logs), custom JSON `/metrics` | No Prometheus in repo |
| Cache / Pub-Sub | **None** | No Redis today |
| Realtime | **None** | Poll-based notifications |

### 1.2 Backend Structure

```
cmd/api/main.go          — entry point, middleware chain, route registration
internal/
  config/                — env loading
  auth/                  — JWT, bcrypt, permissions, AES-GCM
  middleware/            — CORS, rate limit, authz, request logging
  handlers/              — legacy MVP handlers (int tenant_id)
  delivery/http/         — VSM HTTP layer (UUID company_id, envelope responses)
  application/           — use-case services
  domain/                — entities, repo interfaces, domain errors
  infrastructure/postgres/ — repository implementations
  database/              — migrations (EnsureSchema chain), pool config
  models/                — legacy HTTP DTOs
  logging/               — slog wrapper
  observability/         — metrics, timeouts, pprof
```

**Dual-stack coexistence:** Legacy handlers use `tenant_id INTEGER`; VSM domain uses `company_id UUID`. JWT carries both after middleware reload. Chat **must** follow the VSM pattern.

### 1.3 Middleware Chain (outermost → innermost)

```
WithRequestLog → WithMetrics → WithTimeout → Security (CORS, body cap, IP rate limit) → ServeMux
```

Auth is applied **per-route** via `middleware.Authenticator` wrappers (`RequireAuth`, `RequirePermission`, `RequirePermissionByMethod`).

### 1.4 Authentication

- **JWT Bearer tokens** (HS256), 2h access TTL
- **Refresh tokens** — opaque, SHA-256 hash in `refresh_tokens` table
- **Session invalidation** — `session_version` on `app_users`, reloaded per request
- **Passkeys** — WebAuthn (`github.com/go-webauthn/webauthn`)
- Tokens returned in JSON (not HttpOnly cookies); frontend stores in localStorage/sessionStorage via Zustand

### 1.5 Multi-Tenancy

| Concept | Table | PK | Scope Column |
|---------|-------|-----|--------------|
| Auth workspace | `tenants` | `SERIAL` | — |
| Domain org | `companies` | `UUID` | — |
| Bridge | `tenants.company_id` → `companies.id` | | |
| Login user | `app_users` | `SERIAL` | `tenant_id` |
| Domain identity | `employees` | `UUID` | `company_id` |
| Bridge | `employees.user_id` → `app_users.id` | | |

**Isolation:** Application-level only — no PostgreSQL RLS. All VSM queries include `WHERE company_id = $1`.

### 1.6 Frontend Structure

```
pmas-live/src/
  app/                   — App Router pages (28 page.tsx files)
  components/            — Sidebar, TopBar, NotificationBell, CollaborationPanel
  core/api/http-client.ts — single HTTP client with refresh interceptor
  core/auth/auth-store.ts — Zustand persist
  features/              — domain modules (vsm, dashboard, products, guidance)
  shared/routes.ts       — nav config, permission guards
```

- **TanStack Query v5** for server state (inline `useQuery`/`useMutation`)
- **Zustand** for auth and onboarding state
- **Client-side guards** — no `middleware.ts`; `AuthGuard` + `PermissionGuard`
- API proxy via Next.js rewrites `/api/*` → Go backend

### 1.7 Docker / Deploy

```
docker-compose.yml: db (postgres:16) → api → web (Next standalone) → gateway (nginx:3185)
```

No Redis service. Nginx already supports WebSocket upgrade on `/` but **not** on `/api/` — chat WebSocket route must be added to nginx.

### 1.8 Database Migration Chain

```
EnsureSchema → EnsureVSMSchema → EnsureMVPExtras → EnsureExecutionModels → EnsurePerfIndexes → EnsurePhase2Indexes
```

Migrations run at API startup via `database.EnsureSchema(db)` in `cmd/api/main.go`.

---

## 2. Existing Relevant Modules

### 2.1 Collaboration (closest analog to chat)

| Component | Path | Relevance |
|-----------|------|-----------|
| Comment entity | `internal/domain/support/collaboration.go` | Entity-bound comments with `parent_id`, mentions |
| Collaboration service | `internal/application/collaboration/service.go` | Create/edit/archive comments, attachments, mention notifications |
| Collab handler | `internal/delivery/http/collab_handler.go` | REST endpoints |
| Comment repo | `internal/infrastructure/postgres/mvp_repo.go` | Raw SQL |
| Frontend panel | `pmas-live/src/components/CollaborationPanel.tsx` | Comments, attachments, mentions on products/tasks |

**Key difference:** Existing comments are **entity-bound** (`entity_type` + `entity_id` for products/tasks/features). Chat requires **conversation-bound** messaging with DM/group/channel semantics, read receipts, presence, and realtime delivery. **Do not extend the `comments` table for chat.**

### 2.2 Notifications

| Component | Path | Relevance |
|-----------|------|-----------|
| Notification entity | `internal/domain/support/entities.go` | `company_id`, `receiver_id` (employee), `type`, `title`, `body`, `is_read` |
| Notification repo | `internal/infrastructure/postgres/mvp_repo.go` | CRUD + list |
| NotificationBell | `pmas-live/src/components/NotificationBell.tsx` | Poll `GET /api/v1/notifications?mine=true` |

Chat will **extend** the notification system with new `type` values (e.g. `CHAT_MESSAGE`, `CHAT_MENTION`) and add `conversation_notifications` for per-conversation mute/archive preferences. Reuse `notifications` table for in-app delivery.

### 2.3 Attachments

| Component | Path | Relevance |
|-----------|------|-----------|
| Attachment entity | `internal/domain/support/collaboration.go` | Metadata only (`path`, `mime_type`, `size`) |
| Create flow | `collaboration/service.go` | JSON metadata POST, no binary upload |
| Frontend | `CollaborationPanel.tsx` | `upload://` placeholder paths |

Chat attachments need **real binary storage** — see [Storage Architecture](#10-storage-architecture).

### 2.4 Permissions & Roles

| Component | Path | Relevance |
|-----------|------|-----------|
| Permission constants | `internal/auth/permissions.go` | String-based permissions |
| Company roles | `company_roles`, `company_role_permissions` | Per-company RBAC presets |
| User permissions | `user_permissions` junction | Effective grants, reloaded per request |
| Role service | `internal/application/roles/service.go` | Seed system roles per company |

Chat needs new permissions: `chat.view`, `chat.send`, `chat.create_channel`, `chat.manage_channel`, `chat.moderate`, etc.

### 2.5 Search

| Component | Path | Relevance |
|-----------|------|-----------|
| Search service | `internal/application/search/service.go` | Cross-entity search with `pg_trgm` |
| Perf indexes | `internal/database/migrate_perf.go` | Trigram GIN indexes |

Message search will add `pg_trgm` indexes on `messages.content` and use cursor pagination.

### 2.6 Activity Logs

| Component | Path | Relevance |
|-----------|------|-----------|
| ActivityLog | `internal/domain/support/entities.go` | Immutable audit trail for entity mutations |
| Usage | Various services | Append on create/update/archive |

Chat admin actions (member add/remove, role changes, channel settings) should write to `chat_audit_logs` (dedicated table) rather than overloading `activity_logs`.

### 2.7 Pagination Pattern

| Component | Path | Pattern |
|-----------|------|---------|
| PageQuery | `internal/domain/shared/pagination.go` | `page`, `page_size`, `cursor`, `search`, `sort` |
| Handler helper | `internal/delivery/http/context.go` | `PageQueryFromRequest()` |
| Phase 2 indexes | `internal/database/migrate_phase2.go` | Cursor-friendly composite indexes |

Chat message history **must** use cursor-based pagination (`cursor` = base64-encoded `(created_at, id)` tuple).

### 2.8 Rate Limiting

| Component | Path | Pattern |
|-----------|------|---------|
| IP rate limiter | `internal/middleware/security.go` | In-memory, per-IP, configurable RPM |
| Auth endpoints | Stricter `AUTH_RATE_LIMIT_RPM` (default 20/min) | Login, bootstrap, passkey |

Chat needs **per-user** rate limits for message send, WebSocket connections, and attachment uploads — extend beyond IP-only limiting.

### 2.9 Metrics

| Component | Path | Pattern |
|-----------|------|---------|
| Metrics struct | `internal/observability/metrics.go` | In-memory counters, latency histogram |
| Endpoint | `GET /metrics` | JSON snapshot, `METRICS_TOKEN` protected |
| HTTP middleware | `internal/observability/http.go` | Per-request latency recording |

Chat metrics will extend this same pattern (see [Observability Strategy](#16-observability-strategy)).

---

## 3. Proposed Chat Architecture

### 3.1 Design Principles

1. **Integrate, don't rewrite** — follow VSM clean architecture (`domain` → `application` → `infrastructure/postgres` → `delivery/http`)
2. **Reuse identity** — `app_users` + `employees`, no duplicate user tables
3. **Reuse tenancy** — `company_id UUID` scope on every chat table and query
4. **PostgreSQL is source of truth** — all messages, memberships, reads persisted in PG
5. **Redis for ephemeral only** — presence, typing, pub/sub fan-out, rate limit counters
6. **WebSocket for realtime** — primary delivery path; no polling
7. **Cursor pagination mandatory** — never load full conversation history
8. **No microservices** — chat lives in the same `pmas-api` binary
9. **No voice/video** — architecture extensible but not implemented

### 3.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        pmas-live (Next.js)                      │
│  /chat routes │ WebSocket client │ TanStack Query │ Zustand    │
└────────┬──────────────────────────────┬─────────────────────────┘
         │ REST /api/v1/chat/*          │ WS /api/v1/chat/ws
         ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     nginx gateway (:3185)                        │
│  /api/ → api:8080  │  WebSocket upgrade on /api/v1/chat/ws     │
└────────┬────────────────────────────┬─────────────────────────────┘
         ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      pmas-api (Go binary)                        │
│                                                                  │
│  delivery/http/chat_handler.go  ←→  application/chat/service.go │
│  delivery/http/chat_ws.go           domain/chat/entities.go     │
│                                     infrastructure/postgres/       │
│                                       chat_repo.go               │
│                                     infrastructure/redis/          │
│                                       pubsub.go, presence.go      │
│                                     infrastructure/storage/        │
│                                       object_store.go             │
└────────┬────────────────────────────┬─────────────────────────────┘
         ▼                            ▼
┌─────────────────┐        ┌──────────────────────┐
│  PostgreSQL 16   │        │  Redis 7 (new)        │
│  chat tables     │        │  pub/sub, presence,   │
│  source of truth │        │  typing, rate limits  │
└─────────────────┘        └──────────────────────┘
         │
         ▼
┌─────────────────┐
│  Object Storage  │
│  (S3/MinIO/local)│
│  attachments     │
└─────────────────┘
```

### 3.3 Package Layout (proposed)

```
internal/
  domain/chat/
    entities.go          — Conversation, Message, Reaction, etc.
    repository.go        — Repo interfaces
    errors.go            — Domain errors
    permissions.go       — Chat permission constants
  application/chat/
    service.go           — Business logic orchestration
    ws_hub.go            — WebSocket hub (connection management)
    presence.go          — Presence logic
    search.go            — Message/conversation search
  infrastructure/postgres/
    chat_repo.go         — All chat SQL
  infrastructure/redis/
    pubsub.go            — Redis pub/sub client
    presence_store.go    — Ephemeral presence/typing
    rate_limit.go        — Per-user rate counters
  infrastructure/storage/
    store.go             — ObjectStore interface
    local.go             — Local filesystem (dev)
    s3.go                — S3-compatible (prod)
  delivery/http/
    chat_handler.go      — REST endpoints
    chat_ws.go           — WebSocket upgrade + protocol
```

### 3.4 Realtime Architecture Decision

| Option | Fit for PMASS | Verdict |
|--------|--------------|---------|
| **WebSocket** | Nginx already supports upgrade; Go stdlib compatible | **Primary transport** |
| **Redis Pub/Sub** | Not present today; needed for multi-instance fan-out | **Add Redis** — required when scaling beyond 1 API instance |
| **PostgreSQL LISTEN/NOTIFY** | Works for single instance; poor at scale, no message buffering | Fallback only for dev without Redis |
| **SSE** | One-way only; insufficient for typing/presence bidirectional | Not suitable |
| **Polling** | Current notification pattern; unacceptable for chat UX | **Explicitly excluded** |

**Recommendation:** WebSocket + Redis Pub/Sub + PostgreSQL persistence. For single-instance dev, WebSocket hub can operate in-process without Redis; production compose adds Redis service.

### 3.5 Relationship to Existing Collaboration

| Feature | Existing (`comments`) | Chat (new) |
|---------|----------------------|------------|
| Scope | Entity-bound (product/task) | Conversation-bound |
| Types | Text comments only | Text, system, attachments, voice, forwards |
| Realtime | None (poll) | WebSocket |
| Read receipts | None | Per-user read/delivery tracking |
| Presence | None | Redis-backed |
| Threads | `parent_id` on comments | Dedicated thread model on messages |
| Members | Implicit (product members) | Explicit `conversation_members` |
| Channels | None | Public/private org channels |

Existing collaboration features remain unchanged. Optional future bridge: post system messages in a product channel when linked to a product entity.

---

## 4. Database ERD Description

```
companies (UUID PK)
  │
  ├── employees (UUID PK, user_id → app_users)
  │     │
  │     ├── conversation_members (conversation_id, employee_id) PK
  │     ├── message_reads (message_id, employee_id) PK
  │     ├── message_deliveries (message_id, employee_id) PK
  │     ├── message_reactions (message_id, employee_id, emoji) PK
  │     ├── message_bookmarks (message_id, employee_id) PK
  │     ├── message_mentions (message_id, employee_id) PK
  │     ├── conversation_notifications (conversation_id, employee_id) PK
  │     ├── notification_preferences (employee_id, event_type) PK
  │     ├── user_presence (employee_id) PK
  │     ├── blocked_users (blocker_id, blocked_id) PK
  │     └── message_reports (reporter_id → messages)
  │
  ├── conversations (UUID PK)
  │     ├── type: DM | GROUP | CHANNEL
  │     ├── visibility: PUBLIC | PRIVATE (channels only)
  │     ├── conversation_roles (conversation_id, role_name) — channel admin roles
  │     ├── messages (UUID PK, conversation_id FK)
  │     │     ├── parent_message_id (reply)
  │     │     ├── thread_root_id (thread)
  │     │     ├── message_type: TEXT | SYSTEM | ATTACHMENT | VOICE | FORWARD
  │     │     ├── message_attachments (message_id FK)
  │     │     ├── message_forwards (message_id, original_message_id)
  │     │     └── message_pins (conversation_id, message_id) UNIQUE
  │     └── chat_audit_logs (conversation_id, actor_id, action)
  │
  └── notifications (existing, extended types for chat events)
```

**Tenant isolation:** Every table has `company_id UUID NOT NULL REFERENCES companies(id)`. Every query includes `company_id = $1` as the first predicate.

**Identity:** Chat actors are `employees.id` (UUID), not `app_users.id` (int). JWT middleware already resolves `employee_id` in claims.

---

## 5. Database Tables

### 5.1 `conversations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK DEFAULT gen_random_uuid()` | |
| `company_id` | `UUID NOT NULL FK → companies(id)` | Tenant boundary |
| `type` | `VARCHAR(16) NOT NULL` | `DM`, `GROUP`, `CHANNEL` |
| `name` | `VARCHAR(255)` | NULL for DMs |
| `slug` | `VARCHAR(64)` | Channels only; unique per company |
| `description` | `TEXT` | Channel description |
| `visibility` | `VARCHAR(16)` | `PUBLIC`, `PRIVATE` (channels only) |
| `avatar_url` | `TEXT` | |
| `created_by` | `UUID FK → employees(id)` | |
| `is_archived` | `BOOLEAN DEFAULT false` | |
| `last_message_at` | `TIMESTAMPTZ` | Denormalized for conversation list sort |
| `last_message_preview` | `VARCHAR(255)` | Denormalized snippet |
| `version` | `INTEGER DEFAULT 1` | Optimistic locking |
| `created_at` | `TIMESTAMPTZ NOT NULL` | |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | |
| `deleted_at` | `TIMESTAMPTZ` | Soft delete |

**Indexes:**
- `idx_conversations_company_list ON (company_id, last_message_at DESC) WHERE deleted_at IS NULL`
- `idx_conversations_company_slug ON (company_id, slug) WHERE type = 'CHANNEL' AND deleted_at IS NULL` — UNIQUE
- `idx_conversations_company_type ON (company_id, type) WHERE deleted_at IS NULL`

**Query patterns:** List conversations for employee (join `conversation_members`), lookup by slug, filter by type.

### 5.2 `conversation_members`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `company_id` | `UUID NOT NULL FK` | Denormalized for tenant queries |
| `conversation_id` | `UUID NOT NULL FK → conversations(id)` | |
| `employee_id` | `UUID NOT NULL FK → employees(id)` | |
| `role` | `VARCHAR(32) NOT NULL DEFAULT 'member'` | `owner`, `admin`, `moderator`, `member` |
| `joined_at` | `TIMESTAMPTZ NOT NULL` | |
| `last_read_at` | `TIMESTAMPTZ` | For unread count computation |
| `last_read_message_id` | `UUID FK → messages(id)` | Cursor for read position |
| `is_muted` | `BOOLEAN DEFAULT false` | |
| `is_archived` | `BOOLEAN DEFAULT false` | Per-user archive |
| `notification_level` | `VARCHAR(16) DEFAULT 'all'` | `all`, `mentions`, `none` |
| `left_at` | `TIMESTAMPTZ` | NULL = active member |

**Indexes:**
- `UNIQUE (conversation_id, employee_id) WHERE left_at IS NULL`
- `idx_conv_members_employee ON (company_id, employee_id) WHERE left_at IS NULL`
- `idx_conv_members_conversation ON (conversation_id) WHERE left_at IS NULL`

**Query patterns:** Membership check (authorization), list members, unread computation, conversation list for user.

### 5.3 `conversation_roles` (channel-level custom roles)

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `company_id` | `UUID NOT NULL FK` | |
| `conversation_id` | `UUID NOT NULL FK` | Channels only |
| `name` | `VARCHAR(64) NOT NULL` | e.g. "Moderator" |
| `permissions` | `JSONB NOT NULL DEFAULT '[]'` | Array of permission strings |
| `created_at` | `TIMESTAMPTZ NOT NULL` | |

**Indexes:**
- `UNIQUE (conversation_id, name)`

### 5.4 `messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `company_id` | `UUID NOT NULL FK` | |
| `conversation_id` | `UUID NOT NULL FK → conversations(id)` | |
| `sender_id` | `UUID FK → employees(id)` | NULL for system messages |
| `message_type` | `VARCHAR(16) NOT NULL DEFAULT 'TEXT'` | `TEXT`, `SYSTEM`, `ATTACHMENT`, `VOICE`, `FORWARD` |
| `content` | `TEXT` | Plain text or markdown; NULL for attachment-only |
| `content_format` | `VARCHAR(16) DEFAULT 'plain'` | `plain`, `markdown` |
| `parent_message_id` | `UUID FK → messages(id)` | Direct reply |
| `thread_root_id` | `UUID FK → messages(id)` | Thread parent; NULL = top-level |
| `thread_reply_count` | `INTEGER DEFAULT 0` | Denormalized |
| `metadata` | `JSONB DEFAULT '{}'` | Link previews, edit history refs, etc. |
| `is_edited` | `BOOLEAN DEFAULT false` | |
| `edited_at` | `TIMESTAMPTZ` | |
| `is_pinned` | `BOOLEAN DEFAULT false` | Denormalized; see `message_pins` |
| `created_at` | `TIMESTAMPTZ NOT NULL` | **Cursor pagination key** |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | |
| `deleted_at` | `TIMESTAMPTZ` | Soft delete (tombstone) |

**Indexes:**
- `idx_messages_conversation_cursor ON (conversation_id, created_at DESC, id DESC) WHERE deleted_at IS NULL` — primary message feed
- `idx_messages_thread ON (thread_root_id, created_at ASC) WHERE deleted_at IS NULL AND thread_root_id IS NOT NULL`
- `idx_messages_parent ON (parent_message_id) WHERE parent_message_id IS NOT NULL`
- `idx_messages_sender ON (company_id, sender_id, created_at DESC)`
- `idx_messages_content_trgm ON messages USING GIN (content gin_trgm_ops) WHERE deleted_at IS NULL` — search

**Query patterns:** Cursor-paginated message feed, thread replies, search, sender history.

**Soft delete:** Set `deleted_at`; retain row for audit. Display as "Message deleted" in UI. Hard delete only via admin purge job after retention period.

### 5.5 `message_reactions`

| Column | Type | Notes |
|--------|------|-------|
| `message_id` | `UUID FK → messages(id) ON DELETE CASCADE` | |
| `employee_id` | `UUID FK → employees(id)` | |
| `emoji` | `VARCHAR(32) NOT NULL` | Unicode emoji or shortcode |
| `created_at` | `TIMESTAMPTZ NOT NULL` | |

**PK:** `(message_id, employee_id, emoji)`

**Indexes:**
- `idx_reactions_message ON (message_id)`

### 5.6 `message_mentions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `company_id` | `UUID NOT NULL FK` | |
| `message_id` | `UUID NOT NULL FK → messages(id) ON DELETE CASCADE` | |
| `mentioned_employee_id` | `UUID FK → employees(id)` | |
| `mention_type` | `VARCHAR(16) DEFAULT 'user'` | `user`, `channel`, `everyone` |
| `created_at` | `TIMESTAMPTZ NOT NULL` | |

**Indexes:**
- `idx_mentions_employee ON (company_id, mentioned_employee_id, created_at DESC)`
- `idx_mentions_message ON (message_id)`

### 5.7 `message_attachments`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `company_id` | `UUID NOT NULL FK` | |
| `message_id` | `UUID NOT NULL FK → messages(id) ON DELETE CASCADE` | |
| `file_name` | `VARCHAR(255) NOT NULL` | Original filename |
| `storage_key` | `TEXT NOT NULL` | Object store path (not user-controlled) |
| `mime_type` | `VARCHAR(128) NOT NULL` | Server-validated |
| `size_bytes` | `BIGINT NOT NULL` | |
| `width` | `INTEGER` | Images only |
| `height` | `INTEGER` | Images only |
| `duration_ms` | `INTEGER` | Voice messages only |
| `thumbnail_key` | `TEXT` | Optional preview |
| `checksum_sha256` | `VARCHAR(64)` | Integrity verification |
| `created_at` | `TIMESTAMPTZ NOT NULL` | |

**Indexes:**
- `idx_attachments_message ON (message_id)`

**No binary data in PostgreSQL.** Files stored in object storage; table holds metadata only.

### 5.8 `message_reads`

| Column | Type | Notes |
|--------|------|-------|
| `message_id` | `UUID FK → messages(id) ON DELETE CASCADE` | |
| `employee_id` | `UUID FK → employees(id)` | |
| `read_at` | `TIMESTAMPTZ NOT NULL` | |

**PK:** `(message_id, employee_id)`

**Indexes:**
- `idx_reads_employee ON (employee_id, read_at DESC)`

**Query pattern:** Batch upsert on read receipt; compute read count per message for group chats.

### 5.9 `message_deliveries`

| Column | Type | Notes |
|--------|------|-------|
| `message_id` | `UUID FK → messages(id) ON DELETE CASCADE` | |
| `employee_id` | `UUID FK → employees(id)` | |
| `delivered_at` | `TIMESTAMPTZ NOT NULL` | |

**PK:** `(message_id, employee_id)`

Tracks delivery to client (WebSocket ACK or REST fetch). Separate from read for DM read receipts.

### 5.10 `message_bookmarks`

| Column | Type | Notes |
|--------|------|-------|
| `message_id` | `UUID FK → messages(id) ON DELETE CASCADE` | |
| `employee_id` | `UUID FK → employees(id)` | |
| `created_at` | `TIMESTAMPTZ NOT NULL` | |

**PK:** `(message_id, employee_id)`

### 5.11 `message_pins`

| Column | Type | Notes |
|--------|------|-------|
| `conversation_id` | `UUID FK → conversations(id)` | |
| `message_id` | `UUID FK → messages(id)` | |
| `pinned_by` | `UUID FK → employees(id)` | |
| `pinned_at` | `TIMESTAMPTZ NOT NULL` | |

**PK:** `(conversation_id, message_id)`

### 5.12 `message_forwards`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `company_id` | `UUID NOT NULL FK` | |
| `message_id` | `UUID FK → messages(id)` | The forward message |
| `original_message_id` | `UUID FK → messages(id)` | Source message |
| `original_conversation_id` | `UUID FK → conversations(id)` | Source conversation |
| `created_at` | `TIMESTAMPTZ NOT NULL` | |

### 5.13 `user_presence` (PostgreSQL backup; primary in Redis)

| Column | Type | Notes |
|--------|------|-------|
| `employee_id` | `UUID PK FK → employees(id)` | |
| `company_id` | `UUID NOT NULL FK` | |
| `status` | `VARCHAR(16) NOT NULL DEFAULT 'offline'` | `online`, `away`, `dnd`, `offline` |
| `last_seen_at` | `TIMESTAMPTZ` | |
| `status_message` | `VARCHAR(255)` | Custom status text |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | |

Redis holds live presence with TTL; PG table updated periodically for "last seen" persistence.

### 5.14 `conversation_notifications` (per-user conversation prefs)

| Column | Type | Notes |
|--------|------|-------|
| `conversation_id` | `UUID FK → conversations(id)` | |
| `employee_id` | `UUID FK → employees(id)` | |
| `is_muted` | `BOOLEAN DEFAULT false` | |
| `muted_until` | `TIMESTAMPTZ` | Temporary mute |
| `is_archived` | `BOOLEAN DEFAULT false` | |
| `notification_level` | `VARCHAR(16) DEFAULT 'all'` | |

**PK:** `(conversation_id, employee_id)`

Note: Overlaps with columns on `conversation_members` — consolidate into `conversation_members` during implementation to avoid duplication. Listed separately here for clarity of concerns.

### 5.15 `notification_preferences` (global per-user)

| Column | Type | Notes |
|--------|------|-------|
| `employee_id` | `UUID PK FK → employees(id)` | |
| `company_id` | `UUID NOT NULL FK` | |
| `event_type` | `VARCHAR(64) NOT NULL` | e.g. `chat.message`, `chat.mention`, `chat.dm` |
| `in_app` | `BOOLEAN DEFAULT true` | |
| `browser` | `BOOLEAN DEFAULT false` | |
| `email` | `BOOLEAN DEFAULT false` | Hook only; no email delivery in v1 |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | |

**PK:** `(employee_id, event_type)`

### 5.16 `message_reports`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `company_id` | `UUID NOT NULL FK` | |
| `message_id` | `UUID FK → messages(id)` | |
| `reporter_id` | `UUID FK → employees(id)` | |
| `reason` | `VARCHAR(64) NOT NULL` | `spam`, `harassment`, `inappropriate`, `other` |
| `details` | `TEXT` | |
| `status` | `VARCHAR(16) DEFAULT 'pending'` | `pending`, `reviewed`, `actioned`, `dismissed` |
| `reviewed_by` | `UUID FK → employees(id)` | |
| `created_at` | `TIMESTAMPTZ NOT NULL` | |

### 5.17 `blocked_users`

| Column | Type | Notes |
|--------|------|-------|
| `blocker_id` | `UUID FK → employees(id)` | |
| `blocked_id` | `UUID FK → employees(id)` | |
| `company_id` | `UUID NOT NULL FK` | |
| `created_at` | `TIMESTAMPTZ NOT NULL` | |

**PK:** `(blocker_id, blocked_id)`

### 5.18 `chat_audit_logs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `company_id` | `UUID NOT NULL FK` | |
| `conversation_id` | `UUID FK → conversations(id)` | |
| `actor_id` | `UUID FK → employees(id)` | |
| `action` | `VARCHAR(64) NOT NULL` | `member.added`, `member.removed`, `role.changed`, `channel.updated`, `message.deleted.admin` |
| `target_id` | `UUID` | Affected entity |
| `payload` | `JSONB` | Action details |
| `created_at` | `TIMESTAMPTZ NOT NULL` | Immutable |

**Indexes:**
- `idx_chat_audit_conversation ON (conversation_id, created_at DESC)`
- `idx_chat_audit_company ON (company_id, created_at DESC)`

### 5.19 `message_drafts`

| Column | Type | Notes |
|--------|------|-------|
| `conversation_id` | `UUID FK → conversations(id)` | |
| `employee_id` | `UUID FK → employees(id)` | |
| `content` | `TEXT` | |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | |

**PK:** `(conversation_id, employee_id)`

### 5.20 `conversation_invitations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `company_id` | `UUID NOT NULL FK` | |
| `conversation_id` | `UUID FK → conversations(id)` | |
| `invited_by` | `UUID FK → employees(id)` | |
| `invited_employee_id` | `UUID FK → employees(id)` | |
| `status` | `VARCHAR(16) DEFAULT 'pending'` | `pending`, `accepted`, `declined`, `expired` |
| `expires_at` | `TIMESTAMPTZ` | |
| `created_at` | `TIMESTAMPTZ NOT NULL` | |

---

## 6. Message Model

### 6.1 Message Types

| Type | `message_type` | Content | Attachments |
|------|---------------|---------|-------------|
| Text | `TEXT` | Plain/markdown string | Optional |
| System | `SYSTEM` | Auto-generated text | None |
| Attachment | `ATTACHMENT` | Optional caption | Required (≥1) |
| Voice | `VOICE` | Optional caption | Required (audio) |
| Forward | `FORWARD` | Optional comment | References original |

### 6.2 Metadata JSONB Schema

```json
{
  "link_previews": [
    {
      "url": "https://example.com",
      "title": "Example",
      "description": "...",
      "image_url": "https://...",
      "fetched_at": "2026-09-01T12:00:00Z"
    }
  ],
  "edit_history": [
    { "content": "previous text", "edited_at": "..." }
  ],
  "system_event": {
    "type": "member_joined",
    "employee_id": "uuid",
    "employee_name": "Jane Doe"
  },
  "forward": {
    "original_message_id": "uuid",
    "original_conversation_id": "uuid",
    "original_sender_name": "John"
  }
}
```

### 6.3 Scalability Design

- **Partitioning (future):** `messages` table partitioned by `company_id` hash or `created_at` range when exceeding 100M rows
- **Denormalization:** `conversations.last_message_at`, `thread_reply_count`, `is_pinned` avoid expensive joins on hot paths
- **No unbounded queries:** All list endpoints require `cursor` + `limit` (max 100)
- **Batch loading:** Reactions, mentions, attachments loaded in batch queries keyed by `message_id IN (...)` — never N+1
- **Read receipts:** Upsert in batches; don't query per-message on feed load — use `conversation_members.last_read_message_id`

### 6.4 Message Ordering

- Primary sort: `(created_at ASC, id ASC)` within conversation
- Cursor encoding: `base64(created_at_rfc3339nano + "|" + message_id)`
- Clock skew tolerance: use DB `NOW()` for `created_at`, never client timestamps
- Concurrent sends: UUID v4 IDs guarantee uniqueness; ordering by `created_at` with microsecond precision

---

## 7. API Specification

All endpoints under `/api/v1/chat/`. Responses use existing VSM envelope: `{ "success": true, "data": ... }`.

Authorization column uses chat permissions (see [Authorization Model](#11-authorization-model)). All endpoints require `company_id` from JWT unless noted.

**Rate limits:** Applied per-user via Redis counters. Values are defaults; tunable via env.

### 7.1 Authentication

| Method | Route | Request | Response | Auth | Rate Limit |
|--------|-------|---------|----------|------|------------|
| — | — | — | — | Existing JWT auth reused | — |

WebSocket auth covered in [WebSocket Protocol](#8-websocket-protocol).

### 7.2 Conversations

| Method | Route | Request | Response | Auth | Pagination | Rate Limit |
|--------|-------|---------|----------|------|------------|------------|
| GET | `/api/v1/chat/conversations` | `?cursor=&limit=50&type=&archived=false` | `{ conversations[], next_cursor }` | `chat.view` | Cursor | 60/min |
| POST | `/api/v1/chat/conversations` | `{ type, name?, member_ids[], visibility? }` | `Conversation` | `chat.create_channel` (channels) or `chat.view` (DM/group) | — | 10/min |
| GET | `/api/v1/chat/conversations/:id` | — | `Conversation` + member count | `chat.view` + membership | — | 120/min |
| PATCH | `/api/v1/chat/conversations/:id` | `{ name?, description?, avatar_url? }` | `Conversation` | `chat.manage_channel` or owner | — | 20/min |
| DELETE | `/api/v1/chat/conversations/:id` | — | `{ archived: true }` | owner/admin | — | 5/min |
| POST | `/api/v1/chat/conversations/:id/archive` | — | `{ archived: true }` | member | — | 30/min |
| POST | `/api/v1/chat/conversations/:id/unarchive` | — | `{ archived: false }` | member | — | 30/min |
| GET | `/api/v1/chat/conversations/by-slug/:slug` | — | `Conversation` | `chat.view` + membership or public channel | — | 120/min |

**Tenant boundary:** `company_id` from JWT; conversation must belong to same company.

### 7.3 Members

| Method | Route | Request | Response | Auth | Rate Limit |
|--------|-------|---------|----------|------|------------|
| GET | `/api/v1/chat/conversations/:id/members` | `?cursor=&limit=50` | `{ members[], next_cursor }` | member | 60/min |
| POST | `/api/v1/chat/conversations/:id/members` | `{ employee_ids[] }` | `{ added[] }` | admin/owner | 20/min |
| DELETE | `/api/v1/chat/conversations/:id/members/:employeeId` | — | `{ removed: true }` | admin/owner or self-leave | 20/min |
| PATCH | `/api/v1/chat/conversations/:id/members/:employeeId` | `{ role? }` | `Member` | admin/owner | 20/min |
| POST | `/api/v1/chat/conversations/:id/invitations` | `{ employee_id }` | `Invitation` | admin/owner | 20/min |
| POST | `/api/v1/chat/invitations/:id/accept` | — | `Member` | invitee | 10/min |
| POST | `/api/v1/chat/invitations/:id/decline` | — | `{ declined: true }` | invitee | 10/min |

### 7.4 Messages

| Method | Route | Request | Response | Auth | Pagination | Rate Limit |
|--------|-------|---------|----------|------|------------|------------|
| GET | `/api/v1/chat/conversations/:id/messages` | `?cursor=&limit=50&direction=before` | `{ messages[], next_cursor }` | member | Cursor (required) | 120/min |
| POST | `/api/v1/chat/conversations/:id/messages` | `{ content, content_format?, parent_message_id?, thread_root_id?, attachment_ids[]?, mention_ids[]? }` | `Message` | `chat.send` + member | — | 30/min (60 burst) |
| GET | `/api/v1/chat/messages/:id` | — | `Message` | member of conversation | — | 120/min |
| PATCH | `/api/v1/chat/messages/:id` | `{ content }` | `Message` | sender or moderator | — | 20/min |
| DELETE | `/api/v1/chat/messages/:id` | — | `{ deleted: true }` | sender or moderator | — | 20/min |
| POST | `/api/v1/chat/messages/:id/forward` | `{ target_conversation_ids[], comment? }` | `{ forwarded_messages[] }` | `chat.send` + member of target | — | 10/min |

### 7.5 Threads

| Method | Route | Request | Response | Auth | Pagination | Rate Limit |
|--------|-------|---------|----------|------|------------|------------|
| GET | `/api/v1/chat/messages/:id/thread` | `?cursor=&limit=50` | `{ messages[], next_cursor, reply_count }` | member | Cursor | 120/min |
| POST | `/api/v1/chat/messages/:id/thread` | `{ content, ... }` | `Message` | `chat.send` + member | — | 30/min |

### 7.6 Reactions

| Method | Route | Request | Response | Auth | Rate Limit |
|--------|-------|---------|----------|------|------------|
| POST | `/api/v1/chat/messages/:id/reactions` | `{ emoji }` | `{ reactions[] }` | member | 60/min |
| DELETE | `/api/v1/chat/messages/:id/reactions/:emoji` | — | `{ reactions[] }` | member | 60/min |

### 7.7 Attachments

| Method | Route | Request | Response | Auth | Rate Limit |
|--------|-------|---------|----------|------|------------|
| POST | `/api/v1/chat/attachments/upload-url` | `{ file_name, mime_type, size_bytes }` | `{ upload_url, attachment_id, storage_key, expires_at }` | `chat.send` | 20/min |
| POST | `/api/v1/chat/attachments/:id/confirm` | `{ checksum_sha256? }` | `Attachment` | `chat.send` | 20/min |
| GET | `/api/v1/chat/attachments/:id/download` | — | Redirect to signed URL or stream | member | 60/min |

**Upload flow:** Client requests presigned URL → uploads to object storage → confirms with API → attachment linked to message on send.

**Size limits:** Images 10MB, files 50MB, voice 25MB (configurable).

### 7.8 Search

| Method | Route | Request | Response | Auth | Pagination | Rate Limit |
|--------|-------|---------|----------|------|------------|------------|
| GET | `/api/v1/chat/search/messages` | `?q=&conversation_id=&cursor=&limit=20` | `{ results[], next_cursor }` | `chat.view` | Cursor | 30/min |
| GET | `/api/v1/chat/search/conversations` | `?q=&limit=20` | `{ conversations[] }` | `chat.view` | Limit only | 30/min |

### 7.9 Presence

| Method | Route | Request | Response | Auth | Rate Limit |
|--------|-------|---------|----------|------|------------|
| GET | `/api/v1/chat/presence` | `?employee_ids=id1,id2,...` (max 50) | `{ presences[] }` | `chat.view` | 60/min |
| PUT | `/api/v1/chat/presence` | `{ status, status_message? }` | `Presence` | `chat.view` | 10/min |

Primary presence updates via WebSocket; REST for initial load and fallback.

### 7.10 Notifications (chat-specific)

| Method | Route | Request | Response | Auth | Rate Limit |
|--------|-------|---------|----------|------|------------|
| GET | `/api/v1/chat/unread-counts` | — | `{ total, by_conversation: { id: count } }` | `chat.view` | 60/min |
| POST | `/api/v1/chat/conversations/:id/read` | `{ message_id? }` | `{ last_read_message_id }` | member | 120/min |
| POST | `/api/v1/chat/conversations/:id/mute` | `{ duration? }` | `{ muted: true }` | member | 30/min |
| POST | `/api/v1/chat/conversations/:id/unmute` | — | `{ muted: false }` | member | 30/min |
| GET | `/api/v1/chat/notification-preferences` | — | `{ preferences[] }` | `chat.view` | 30/min |
| PUT | `/api/v1/chat/notification-preferences` | `{ preferences[] }` | `{ preferences[] }` | `chat.view` | 10/min |

### 7.11 Bookmarks

| Method | Route | Request | Response | Auth | Pagination | Rate Limit |
|--------|-------|---------|----------|------|------------|------------|
| GET | `/api/v1/chat/bookmarks` | `?cursor=&limit=50` | `{ bookmarks[], next_cursor }` | `chat.view` | Cursor | 60/min |
| POST | `/api/v1/chat/messages/:id/bookmark` | — | `{ bookmarked: true }` | member | 30/min |
| DELETE | `/api/v1/chat/messages/:id/bookmark` | — | `{ bookmarked: false }` | member | 30/min |

### 7.12 Pins

| Method | Route | Request | Response | Auth | Rate Limit |
|--------|-------|---------|----------|------|------------|
| GET | `/api/v1/chat/conversations/:id/pins` | — | `{ pins[] }` | member | 60/min |
| POST | `/api/v1/chat/conversations/:id/pins` | `{ message_id }` | `Pin` | admin/moderator | 10/min |
| DELETE | `/api/v1/chat/conversations/:id/pins/:messageId` | — | `{ unpinned: true }` | admin/moderator | 10/min |

### 7.13 Reports & Blocks

| Method | Route | Request | Response | Auth | Rate Limit |
|--------|-------|---------|----------|------|------------|
| POST | `/api/v1/chat/messages/:id/report` | `{ reason, details? }` | `Report` | member | 5/min |
| GET | `/api/v1/chat/reports` | `?status=pending&cursor=` | `{ reports[], next_cursor }` | `chat.moderate` | Cursor | 30/min |
| PATCH | `/api/v1/chat/reports/:id` | `{ status, action? }` | `Report` | `chat.moderate` | 20/min |
| POST | `/api/v1/chat/blocks` | `{ employee_id }` | `{ blocked: true }` | `chat.view` | 10/min |
| DELETE | `/api/v1/chat/blocks/:employeeId` | — | `{ blocked: false }` | `chat.view` | 10/min |
| GET | `/api/v1/chat/blocks` | — | `{ blocked_ids[] }` | `chat.view` | 30/min |

### 7.14 Admin

| Method | Route | Request | Response | Auth | Rate Limit |
|--------|-------|---------|----------|------|------------|
| GET | `/api/v1/chat/admin/audit-logs` | `?conversation_id=&cursor=` | `{ logs[], next_cursor }` | `chat.moderate` | Cursor | 30/min |
| DELETE | `/api/v1/chat/admin/conversations/:id` | — | Hard delete (admin) | `chat.moderate` + company admin | 5/min |
| GET | `/api/v1/chat/admin/stats` | — | `{ active_conversations, messages_today, ... }` | `chat.moderate` | — | 10/min |

### 7.15 Drafts

| Method | Route | Request | Response | Auth | Rate Limit |
|--------|-------|---------|----------|------|------------|
| GET | `/api/v1/chat/conversations/:id/draft` | — | `{ content }` | member | 60/min |
| PUT | `/api/v1/chat/conversations/:id/draft` | `{ content }` | `{ saved: true }` | member | 30/min |
| DELETE | `/api/v1/chat/conversations/:id/draft` | — | `{ deleted: true }` | member | 30/min |

---

## 8. WebSocket Protocol

### 8.1 Endpoint

```
WS /api/v1/chat/ws
```

Nginx must proxy WebSocket on this path (add `Upgrade` headers to `/api/` location or dedicated location).

### 8.2 Connection Lifecycle

```
Client                          Server
  │                               │
  │──── HTTP Upgrade + Bearer ───►│ Validate JWT
  │                               │ Load employee_id, company_id
  │                               │ Register connection in hub
  │◄─── 101 Switching Protocols ──│
  │                               │
  │──── { type: "auth" } ────────►│ (if token in query param)
  │◄─── { type: "connected" } ────│ { employee_id, server_time }
  │                               │
  │──── { type: "subscribe", ... }►│ Join conversation rooms
  │◄─── { type: "subscribed" } ───│
  │                               │
  │◄──► heartbeat ping/pong ─────►│ Every 30s; disconnect after 90s miss
  │                               │
  │──── { type: "disconnect" } ───►│ Clean unsubscribe
  │◄─── connection closed ────────│
```

### 8.3 Authentication

**Option A (preferred):** `Authorization: Bearer <token>` header on WebSocket upgrade (supported by modern browsers).

**Option B (fallback):** `?token=<access_token>` query parameter (less secure; log scrubbing required).

Server validates JWT identically to REST middleware, reloads fresh claims, resolves `employee_id` and `company_id`.

### 8.4 Message Envelope

All WebSocket frames are JSON text messages:

```json
{
  "type": "event.name",
  "id": "client-generated-uuid",
  "data": { },
  "timestamp": "2026-09-01T12:00:00Z"
}
```

### 8.5 Client → Server Events

| Event | Data | Authorization |
|-------|------|---------------|
| `subscribe` | `{ conversation_ids: ["uuid"] }` | Must be member of each |
| `unsubscribe` | `{ conversation_ids: ["uuid"] }` | — |
| `message.send` | `{ conversation_id, content, client_id, parent_message_id?, thread_root_id?, attachment_ids? }` | `chat.send` + member |
| `message.edit` | `{ message_id, content }` | Sender or moderator |
| `message.delete` | `{ message_id }` | Sender or moderator |
| `reaction.add` | `{ message_id, emoji }` | Member |
| `reaction.remove` | `{ message_id, emoji }` | Member |
| `typing.start` | `{ conversation_id }` | Member |
| `typing.stop` | `{ conversation_id }` | Member |
| `presence.update` | `{ status, status_message? }` | `chat.view` |
| `read.mark` | `{ conversation_id, message_id }` | Member |
| `delivered.ack` | `{ message_ids: ["uuid"] }` | Member |
| `ping` | `{}` | — |

`client_id` on `message.send` enables optimistic UI deduplication.

### 8.6 Server → Client Events

| Event | Data | Scope |
|-------|------|-------|
| `connected` | `{ employee_id, server_time }` | Connection |
| `subscribed` | `{ conversation_ids[] }` | Connection |
| `message.created` | `Message` (full object with attachments, reactions) | Conversation room |
| `message.updated` | `Message` | Conversation room |
| `message.deleted` | `{ message_id, conversation_id, deleted_at }` | Conversation room |
| `message.reaction.added` | `{ message_id, employee_id, emoji, reactions[] }` | Conversation room |
| `message.reaction.removed` | `{ message_id, employee_id, emoji, reactions[] }` | Conversation room |
| `message.read` | `{ conversation_id, employee_id, message_id, read_at }` | Conversation room |
| `message.delivered` | `{ message_id, employee_id, delivered_at }` | Conversation room |
| `message.pinned` | `{ conversation_id, message_id, pinned_by }` | Conversation room |
| `message.unpinned` | `{ conversation_id, message_id }` | Conversation room |
| `typing.started` | `{ conversation_id, employee_id, employee_name }` | Conversation room (exclude sender) |
| `typing.stopped` | `{ conversation_id, employee_id }` | Conversation room |
| `presence.updated` | `{ employee_id, status, last_seen_at, status_message? }` | Company-wide or subscribed |
| `conversation.created` | `Conversation` | Target members |
| `conversation.updated` | `Conversation` | Conversation room |
| `conversation.member_added` | `{ conversation_id, member }` | Conversation room |
| `conversation.member_removed` | `{ conversation_id, employee_id }` | Conversation room |
| `notification.created` | `Notification` | Target employee only |
| `unread.updated` | `{ conversation_id, unread_count }` | Target employee only |
| `error` | `{ code, message, ref_id? }` | Connection |
| `pong` | `{ server_time }` | Connection |

### 8.7 Room / Subscription Model

- **Company room:** `company:{company_id}` — presence broadcasts
- **Conversation room:** `conv:{conversation_id}` — messages, typing, reactions
- **User room:** `user:{employee_id}` — personal notifications, unread updates

On `subscribe`, server verifies membership in PG (cached in Redis, TTL 5min) before joining rooms.

### 8.8 Reconnection

1. Client detects disconnect (close event or missed pong)
2. Exponential backoff: 1s, 2s, 4s, 8s, max 30s
3. On reconnect: re-authenticate, re-subscribe to active conversations
4. Client fetches missed messages: `GET /conversations/:id/messages?cursor=<last_known>&direction=after`
5. Server tracks `last_event_id` per connection for dedup

### 8.9 Redis Pub/Sub Integration

```
API Instance A                    Redis                    API Instance B
  │                                │                          │
  │ publish conv:uuid event ──────►│                          │
  │                                │───── subscribe conv:uuid ►│
  │                                │                          │ push to local WS clients
```

**Channels:**
- `chat:company:{company_id}` — presence
- `chat:conv:{conversation_id}` — messages, typing, reactions
- `chat:user:{employee_id}` — personal notifications

**Single-instance mode:** Hub delivers directly without Redis publish (config flag `CHAT_REDIS_ENABLED=false`).

### 8.10 Heartbeat

- Server sends `ping` every 30 seconds
- Client must respond with `pong` within 10 seconds
- 3 missed pongs → server closes connection
- Client should also send `ping` if no server activity for 60 seconds

---

## 9. Redis Architecture

### 9.1 Why Redis Is Needed

PMASS currently has **no Redis**. Chat requires Redis for:
1. **Pub/Sub** — fan-out WebSocket events across API instances
2. **Presence** — ephemeral online/away/dnd with TTL
3. **Typing indicators** — auto-expire after 5 seconds
4. **Rate limiting** — per-user counters (IP-only insufficient for authenticated chat)
5. **Membership cache** — avoid PG hit on every subscribe

### 9.2 Docker Addition

```yaml
# docker-compose.yml (future)
redis:
  image: redis:7-alpine
  command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
  expose:
    - "6379"
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
```

### 9.3 Key Schema

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `presence:{company_id}:{employee_id}` | HASH | 120s (refreshed) | `{ status, last_seen, status_message }` |
| `typing:{conversation_id}` | SORTED SET | 5s per member | Score = timestamp; auto-prune |
| `ratelimit:msg:{employee_id}` | STRING (counter) | 60s | Message send rate |
| `ratelimit:ws:{employee_id}` | STRING (counter) | 60s | WS event rate |
| `member:{conversation_id}:{employee_id}` | STRING | 300s | Cached membership boolean |
| `draft:{conversation_id}:{employee_id}` | STRING | 7d | Fast draft access (PG is canonical) |
| `ws:conn:{connection_id}` | HASH | 3600s | Connection metadata for cross-instance routing |

### 9.4 What Redis Is NOT

- Not message storage (PostgreSQL only)
- Not permanent read receipt storage
- Not attachment storage
- Not a replacement for PostgreSQL queries on history load

---

## 10. Storage Architecture

### 10.1 Current State

PMASS has **no binary file storage**. Attachments are metadata-only with placeholder `upload://` paths. Avatar images stored as inline data URLs in user profile.

### 10.2 Proposed ObjectStore Abstraction

```go
// internal/infrastructure/storage/store.go
type ObjectStore interface {
    GenerateUploadURL(ctx context.Context, key string, mimeType string, size int64, expiry time.Duration) (string, error)
    GenerateDownloadURL(ctx context.Context, key string, expiry time.Duration) (string, error)
    Delete(ctx context.Context, key string) error
    Exists(ctx context.Context, key string) (bool, error)
}
```

**Implementations:**
| Implementation | Use Case | Config |
|---------------|----------|--------|
| `LocalStore` | Development | `STORAGE_BACKEND=local`, `STORAGE_LOCAL_PATH=/data/uploads` |
| `S3Store` | Production | `STORAGE_BACKEND=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` |
| MinIO | Self-hosted prod | Same as S3 with custom endpoint |

### 10.3 Storage Key Format

```
{company_id}/{year}/{month}/{attachment_id}/{sanitized_filename}
```

- Company ID prefix enforces tenant isolation at storage level
- Attachment ID (UUID) prevents path traversal
- Filename sanitized server-side (never trust client path)

### 10.4 Upload Security

1. Client requests upload URL with declared `mime_type` and `size_bytes`
2. Server validates against allowlist and max size
3. Server generates presigned PUT URL with content-type constraint
4. Client uploads directly to storage
5. Client calls confirm endpoint; server verifies object exists + size
6. On message send, attachment IDs linked to message
7. Orphaned uploads cleaned by background job (uploads not confirmed within 24h)

### 10.5 MIME Allowlist

| Category | Allowed Types | Max Size |
|----------|--------------|----------|
| Images | `image/jpeg`, `image/png`, `image/gif`, `image/webp` | 10 MB |
| Documents | `application/pdf`, `text/plain`, Office MIME types | 50 MB |
| Audio (voice) | `audio/ogg`, `audio/webm`, `audio/mp4`, `audio/mpeg` | 25 MB |
| Archives | `application/zip` | 50 MB |

Server validates MIME via magic bytes on confirm, not just Content-Type header.

---

## 11. Authorization Model

### 11.1 New Chat Permissions

Add to `internal/auth/permissions.go`:

| Permission | Description |
|-----------|-------------|
| `chat.view` | Access chat, view channels, read messages |
| `chat.send` | Send messages, reactions, upload attachments |
| `chat.create_channel` | Create public/private channels |
| `chat.manage_channel` | Edit channel settings, manage members |
| `chat.moderate` | Delete any message, review reports, manage blocks |
| `chat.admin` | Company-wide chat admin (audit logs, stats) |

### 11.2 Role Preset Mapping

| Company Role | Permissions |
|-------------|-------------|
| Company Admin | All chat permissions |
| Product Manager | `chat.view`, `chat.send`, `chat.create_channel` |
| Team Lead | `chat.view`, `chat.send`, `chat.create_channel` |
| Employee | `chat.view`, `chat.send` |

### 11.3 Conversation-Level Authorization

Beyond company permissions, every operation checks:

1. **Membership:** User is active member of conversation (`conversation_members.left_at IS NULL`)
2. **Conversation role:** `owner` > `admin` > `moderator` > `member`
3. **Channel visibility:** Public channels joinable by any `chat.view` user; private require invitation
4. **Block list:** Blocked users cannot DM each other
5. **Company boundary:** `conversation.company_id == jwt.company_id`

### 11.4 Authorization Check Flow

```
Request → JWT validation → company_id resolution → chat permission check
  → conversation membership check → conversation role check → handler
```

For WebSocket events, same checks applied before processing each client message.

### 11.5 DM Creation Rules

- DM between two employees in same company
- If DM conversation already exists (same two members, type=DM), return existing
- Blocked users cannot initiate DM
- System creates `conversation_members` for both parties

---

## 12. Security Model

### 12.1 Threat Matrix

| Threat | Risk | Mitigation |
|--------|------|------------|
| **IDOR** — access other company's conversations | Critical | `company_id` predicate on every query; membership check |
| **IDOR** — access messages in non-member conversation | Critical | Join `conversation_members` in authorization layer |
| **Broken tenant isolation** | Critical | No cross-company queries; storage keys prefixed by company_id |
| **Unauthorized message access** | High | Membership + company_id on every message fetch |
| **Malicious attachments** | High | MIME allowlist, magic byte validation, virus scan hook (future), no execution |
| **Oversized uploads** | High | Size limits at presign + confirm; nginx `client_max_body_size` |
| **MIME spoofing** | High | Server-side content inspection on confirm |
| **Path traversal** | High | Server-generated storage keys only; never use client-provided paths |
| **XSS through messages** | High | Sanitize on render (frontend); store plain text; CSP headers |
| **HTML injection** | High | Reject HTML in messages unless explicit `content_format=markdown` with sanitized renderer |
| **Markdown injection** | Medium | Use safe markdown subset; no raw HTML in markdown renderer |
| **Mention abuse** | Medium | Rate limit mentions per message (max 50); verify mentioned users are company members |
| **Notification abuse** | Medium | Rate limit notification-triggering events; respect mute settings |
| **Spam** | High | Per-user message rate limit; duplicate detection; report system |
| **WebSocket abuse** | High | Connection limit per user (5); event rate limit; max message size 8KB per WS frame |
| **Connection exhaustion** | High | Max connections per instance (10K); per-user limit; idle timeout |
| **Message flooding** | High | 30 msg/min per user default; exponential backoff on violation |
| **Rate limiting bypass** | Medium | Redis-backed per-user counters, not just IP |
| **Permission escalation** | High | Role changes require admin/owner; audit logged |
| **Admin abuse** | Medium | `chat_audit_logs` for all admin actions; company admin cannot access other companies |
| **Deleted message access** | Medium | Soft-deleted messages return tombstone only; no content in API response |
| **Private channel leakage** | Critical | Private channels excluded from search/list unless member; slug not guessable (UUID-based) |
| **WebSocket token in URL** | Medium | Prefer header auth; scrub query tokens from logs |
| **CSRF** | Low | Bearer token auth (not cookie-based); no CSRF vector |

### 12.2 Input Validation

- Message content: max 10,000 characters
- Channel name: max 255 characters, alphanumeric + spaces + hyphens
- Emoji reactions: max 32 bytes, allowlist of Unicode emoji ranges
- Conversation slug: `[a-z0-9-]`, 3-64 chars, unique per company

### 12.3 Content Sanitization

- **Store:** Raw text in PostgreSQL (no HTML encoding at rest)
- **Serve:** JSON with `content_format` field
- **Render:** Frontend uses DOMPurify or equivalent; markdown renderer with safe mode
- **Search:** Index raw text; no HTML in index

---

## 13. Notification Architecture

### 13.1 Notification Events

| Event | Type Code | Default Channels | Respects Mute |
|-------|-----------|-----------------|---------------|
| New DM message | `chat.dm` | in-app, browser | Yes |
| New channel message | `chat.channel` | in-app | Yes (mentions_only) |
| Mention | `chat.mention` | in-app, browser | Yes (mentions_only still delivers) |
| Thread reply | `chat.thread_reply` | in-app | Yes |
| Reaction to your message | `chat.reaction` | in-app | Yes |
| Channel invitation | `chat.invitation` | in-app, browser | No |
| Member added to group | `chat.member_added` | in-app | No |
| Message pinned | `chat.pin` | in-app | Yes |

### 13.2 Delivery Pipeline

```
Message created
  → Check recipient notification_preferences
  → Check conversation_members.notification_level + is_muted
  → Insert into notifications table (existing)
  → Publish notification.created via WebSocket to user room
  → If browser enabled: include push_payload for service worker (future)
  → If email enabled: enqueue email hook (no delivery in v1)
```

### 13.3 Reuse of Existing `notifications` Table

Extend with optional fields (migration):
- `source_type VARCHAR(32)` — `chat`
- `source_id UUID` — conversation_id or message_id
- `action_url TEXT` — deep link `/chat/channel/:slug` or `/chat/dm/:id`

### 13.4 Browser Notifications

- Frontend registers service worker (future phase)
- WebSocket `notification.created` event triggers `Notification API` if permitted
- No server-side push (no FCM/APNs) in v1

### 13.5 Email Hooks

Define interface:
```go
type EmailNotifier interface {
    SendChatNotification(ctx context.Context, recipient Email, event ChatNotificationEvent) error
}
```
No-op implementation in v1; wire to email service in future phase.

---

## 14. Frontend Architecture

### 14.1 Route Structure

```
/chat                                    — Chat home (conversation list)
/chat/dm/:conversationId                 — Direct message view
/chat/group/:conversationId              — Group conversation view
/chat/channel/:slug                      — Channel view (slug-based)
/chat/channel/:slug/thread/:messageId    — Thread panel (overlay or split)
/chat/search                             — Message & conversation search
/chat/bookmarks                          — Bookmarked messages
/chat/settings                           — Notification preferences
/chat/settings/blocked                   — Blocked users
```

Add to `pmas-live/src/shared/routes.ts`:
```typescript
chat: {
  id: "chat",
  path: "/chat",
  title: "Messages",
  subtitle: "Team communication",
  permission: "chat.view",
  tenantOnly: true,
}
```

### 14.2 Layout Components

```
┌──────────────────────────────────────────────────────────┐
│ TopBar (existing) + NotificationBell                     │
├────────────┬─────────────────────────┬───────────────────┤
│ Sidebar    │ ConversationList        │ MessagePanel      │
│ (existing) │ - Search bar            │ - MessageList     │
│            │ - Unread badges         │ - MessageComposer │
│            │ - Sections:             │ - TypingIndicator │
│            │   Channels, DMs, Groups │                   │
│            │ - Archive/Muted filter  ├───────────────────┤
│            │                         │ ThreadPanel (opt) │
│            │                         │ MemberPanel (opt) │
└────────────┴─────────────────────────┴───────────────────┘
```

### 14.3 State Management

| Concern | Tool | Notes |
|---------|------|-------|
| Server data (conversations, messages) | TanStack Query | Cursor-based infinite queries |
| WebSocket connection | Custom hook `useChatWebSocket` | Reconnect, event dispatch |
| Active conversation | React Context or Zustand | `chat-store.ts` |
| Optimistic messages | TanStack Query cache mutation | `client_id` dedup |
| Drafts | TanStack Query + debounced PUT | Sync with server |
| Presence/typing | Zustand (ephemeral) | Updated via WebSocket |
| Unread counts | TanStack Query | Invalidated on read/mark |

### 14.4 Feature Module Structure

```
pmas-live/src/features/chat/
  types.ts                  — TypeScript interfaces matching Go entities
  api.ts                    — HTTP client wrappers for chat endpoints
  hooks/
    useConversations.ts     — Infinite query for conversation list
    useMessages.ts          — Infinite query for message feed
    useChatWebSocket.ts     — WebSocket connection + event handler
    usePresence.ts          — Presence state
    useTyping.ts            — Typing indicators
    useUnreadCounts.ts      — Unread badge data
  components/
    ChatLayout.tsx          — Three-panel layout
    ConversationList.tsx
    ConversationItem.tsx
    MessagePanel.tsx
    MessageList.tsx         — Virtualized infinite scroll
    MessageBubble.tsx
    MessageComposer.tsx
    ThreadPanel.tsx
    MemberPanel.tsx
    ReactionPicker.tsx
    AttachmentPreview.tsx
    PresenceIndicator.tsx
    TypingIndicator.tsx
    ChatSearch.tsx
  store/
    chat-store.ts           — Active conversation, WS status, typing state
```

### 14.5 Key Frontend Patterns

- **Infinite scroll:** `useInfiniteQuery` with `cursor` param; `react-virtuoso` or `@tanstack/react-virtual` for virtualization
- **Optimistic updates:** On `message.send`, insert into cache with `client_id`; replace on `message.created` WS event
- **Offline-ready:** Cache last 100 messages per conversation in IndexedDB (phase 2); queue sends when offline
- **Responsive:** Mobile = conversation list OR message panel (not both); tablet = two panels; desktop = three panels

---

## 15. Testing Strategy

### 15.1 Unit Tests (Go)

| Area | File | Pattern |
|------|------|---------|
| Domain entities | `internal/domain/chat/entities_test.go` | Constructor validation (follow `organization_test.go`) |
| Service logic | `internal/application/chat/service_test.go` | Stub repos (follow `organization/service_test.go`) |
| Cursor encoding | `internal/domain/chat/cursor_test.go` | Encode/decode roundtrip |
| Permission checks | `internal/domain/chat/permissions_test.go` | Role matrix |

### 15.2 Integration Tests (Go)

| Area | Approach |
|------|----------|
| Repository SQL | Test against real PG (testcontainers or docker-compose test DB) |
| Message ordering | Concurrent inserts, verify cursor pagination order |
| Tenant isolation | Insert in company A, query as company B, expect empty |
| Membership auth | Non-member message fetch returns 403 |

### 15.3 API Tests

| Area | Approach |
|------|----------|
| REST endpoints | `httptest` with mocked service layer |
| Auth enforcement | Requests without JWT → 401; wrong company → 403 |
| Pagination | Verify cursor returns correct pages, no duplicates/gaps |
| Rate limiting | Exceed limit → 429 |

### 15.4 WebSocket Tests

| Area | Approach |
|------|----------|
| Connection auth | Invalid token → connection rejected |
| Subscribe auth | Non-member subscribe → error event |
| Event delivery | Send message → other member receives `message.created` |
| Reconnect | Disconnect → reconnect → missed messages fetchable |

### 15.5 Frontend Tests

| Area | Approach |
|------|----------|
| Component render | React Testing Library for MessageBubble, ConversationList |
| Hook behavior | Mock WebSocket for `useChatWebSocket` |
| Optimistic updates | Verify cache state after send + ACK |

### 15.6 Load Tests

Extend `tests/load/` with chat scenarios:
- `tests/load/chat-smoke.js` — connect WS, send message, verify delivery
- `tests/load/chat-load.js` — 100 concurrent users, 10 msg/s
- `tests/load/chat-stress.js` — connection exhaustion, message flood

### 15.7 Conventions

Follow existing PMASS patterns:
- `t.Parallel()` in middleware-style tests
- Table-driven tests
- `go test ./...` for CI
- k6 for load (existing `tests/load/README.md` workflow)

---

## 16. Observability Strategy

### 16.1 Existing Conventions

- Custom JSON metrics at `GET /metrics` (not Prometheus format)
- `expvar` published counters
- Structured `slog` logging with `service=pmas-api`
- Loki + Grafana for log aggregation
- `X-Request-ID` correlation

### 16.2 New Chat Metrics

Extend `internal/observability/metrics.go` or add `internal/observability/chat_metrics.go`:

| Metric | Type | Description |
|--------|------|-------------|
| `chat_messages_total` | Counter | Messages created (by type) |
| `chat_messages_failed_total` | Counter | Failed message operations |
| `chat_websocket_connections` | Gauge | Active WS connections |
| `chat_websocket_reconnects` | Counter | Reconnection events |
| `chat_message_latency_ms` | Histogram | Send → deliver latency |
| `chat_active_conversations` | Gauge | Conversations with activity in last 24h |
| `chat_attachment_uploads` | Counter | Attachment uploads confirmed |
| `chat_rate_limit_hits` | Counter | Rate limit rejections (by endpoint) |
| `chat_ws_events_total` | Counter | WebSocket events processed (by type) |
| `chat_redis_pubsub_latency_ms` | Histogram | Redis publish → subscriber receive |

### 16.3 Logging

Structured log events:
- `chat_message_sent` — `{ conversation_id, message_id, sender_id, latency_ms }`
- `chat_ws_connected` — `{ employee_id, connection_id }`
- `chat_ws_disconnected` — `{ employee_id, reason, duration_sec }`
- `chat_rate_limited` — `{ employee_id, endpoint, limit }`
- `chat_auth_denied` — `{ employee_id, conversation_id, action }`

No message content in logs.

### 16.4 Grafana

Add chat panels to existing dashboards or create `deploy/observability/grafana/dashboards/pmas-chat.json`:
- Message throughput over time (from logs)
- WS connection count (from metrics endpoint)
- Error rate (from logs)
- p95 message latency

---

## 17. Performance Strategy

### 17.1 Scale Targets

| Scale | Users | Messages | Strategy |
|-------|-------|----------|----------|
| Small | 10 | 100K | Single API instance, no Redis required |
| Medium | 100 | 1M | Single instance + Redis for presence |
| Large | 1,000 | 10M | 2-3 API instances + Redis pub/sub |
| Enterprise | 10,000 | 100M+ | Horizontal API scaling, read replicas, message partitioning |

### 17.2 Query Optimization

| Pattern | Approach |
|---------|----------|
| Conversation list | Denormalized `last_message_at`; index `(company_id, employee_id)` via members join |
| Message feed | Cursor on `(created_at, id)`; never `OFFSET` |
| Unread counts | `conversation_members.last_read_message_id` + count query with index; cache in Redis (TTL 30s) |
| Reactions | Batch load: `SELECT * FROM message_reactions WHERE message_id = ANY($1)` |
| Members | Cache membership in Redis (TTL 5min) |
| Search | `pg_trgm` GIN index; limit to user's conversations |

### 17.3 Anti-Patterns to Avoid

- ❌ Loading entire conversation history
- ❌ N+1 queries for reactions/attachments per message
- ❌ Polling for new messages
- ❌ Redis as message store
- ❌ Storing files in PostgreSQL
- ❌ OFFSET-based pagination
- ❌ Unbounded WebSocket broadcast (always scope to conversation room)

### 17.4 Connection Limits

| Resource | Limit |
|----------|-------|
| WS connections per user | 5 |
| WS connections per instance | 10,000 |
| WS message frame size | 8 KB |
| Messages per request (batch) | 1 |
| Attachment size | 50 MB max |
| Conversation members | 500 (groups), unlimited (channels) |

---

## 18. Migration Strategy

### 18.1 Schema Migration

Add new file: `internal/database/migrate_chat.go` with `EnsureChatSchema(db *sql.DB) error`.

Chain at end of existing migration sequence:
```
... → EnsurePhase2Indexes → EnsureChatSchema
```

All chat tables created in single migration phase with `IF NOT EXISTS` guards (matching existing pattern).

### 18.2 Permission Migration

Seed chat permissions for existing company roles via `rolesapp.Service.EnsureDefaults()` extension — add chat permissions to preset map.

### 18.3 Data Migration

No existing data to migrate (greenfield chat tables). Existing `comments` and `notifications` remain untouched.

### 18.4 Infrastructure Migration

1. Add Redis to `docker-compose.yml`
2. Add storage volume for local dev
3. Add env vars to `.env.example`
4. Update nginx for WebSocket on `/api/v1/chat/ws`

### 18.5 Deployment Order

1. Deploy schema migration (tables created, no code uses them yet)
2. Deploy backend with chat endpoints behind feature flag `CHAT_ENABLED=false`
3. Enable Redis
4. Enable `CHAT_ENABLED=true`
5. Deploy frontend chat routes

---

## 19. Rollback Strategy

| Scenario | Rollback Action |
|----------|---------------|
| Schema migration fails | Migration uses `IF NOT EXISTS`; safe to re-run. No drops. |
| Chat API bugs | Set `CHAT_ENABLED=false`; existing features unaffected |
| WebSocket issues | Clients fall back to REST-only (degraded mode); disable WS endpoint |
| Redis failure | Single-instance mode: disable `CHAT_REDIS_ENABLED`; presence/typing degraded |
| Storage issues | Disable attachment uploads; text-only chat continues |
| Full rollback | Remove chat routes from mux; drop chat tables in separate maintenance window |

Chat tables are **additive only** — no modifications to existing tables (except extending `notifications` with optional columns). Rollback does not affect existing PMASS functionality.

---

## 20. Implementation Phases (Summary)

See `IMPLEMENTATION_PLAN.md` for detailed phase breakdown. High-level:

| Phase | Name | Duration Est. |
|-------|------|---------------|
| 1 | Foundation (schema, domain, repos) | 1-2 weeks |
| 2 | Core messaging (REST, DM, groups) | 2-3 weeks |
| 3 | WebSocket realtime | 1-2 weeks |
| 4 | Channels, threads, reactions | 2 weeks |
| 5 | Attachments & storage | 1-2 weeks |
| 6 | Presence, typing, read receipts | 1 week |
| 7 | Search, bookmarks, pins, forwards | 1-2 weeks |
| 8 | Notifications & preferences | 1 week |
| 9 | Admin, moderation, audit | 1 week |
| 10 | Frontend chat UI | 3-4 weeks |
| 11 | Performance, load testing | 1 week |
| 12 | Polish, offline, browser notifications | 1-2 weeks |

---

## 21. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Dual-stack confusion (tenant_id vs company_id) | High | Chat uses only VSM `company_id` pattern; document clearly |
| No Redis in current infra | Medium | Add to docker-compose; single-instance fallback |
| No file storage exists | High | Build ObjectStore abstraction before attachments phase |
| WebSocket nginx config gap | Medium | `/api/` location lacks Upgrade headers; must add |
| In-memory rate limiting insufficient | Medium | Redis per-user rate limits for chat |
| Migration chain complexity | Low | Follow existing `migrate_*.go` pattern |
| Frontend complexity (realtime UI) | High | Phased UI delivery; REST-first, then WS |
| Performance at scale untested | Medium | Load tests in phase 11; cursor pagination from day 1 |
| Existing notification system overload | Low | Separate chat notification types; same table |
| Permission model gaps | Medium | Define chat permissions early; seed in role presets |

---

## 22. Open Questions

1. **Should public channels be auto-joined by all company employees, or opt-in?** Recommendation: opt-in with discoverable listing.

2. **Maximum message retention period?** Recommendation: indefinite with optional company admin purge policy.

3. **Should chat integrate with product entities?** (e.g., `#product-xyz` channels auto-created). Recommendation: defer to post-v1; design `conversations.metadata` JSONB for future entity links.

4. **Voice message transcription?** Recommendation: out of scope for v1; store audio only.

5. **End-to-end encryption?** Recommendation: not in v1; enterprise customers may require it later. Design should not preclude it (content stored as-is).

6. **Mobile app support?** Recommendation: responsive web first; API design supports native clients.

7. **Federation / cross-company messaging?** Recommendation: out of scope; strict company isolation.

8. **Message export/compliance?** Recommendation: admin export endpoint in phase 9; audit logs from day 1.

9. **Redis hosting in production?** Recommendation: managed Redis (Upstash/ElastiCache) or self-hosted container; decide before phase 3.

10. **Consolidate `conversation_members` and `conversation_notifications`?** Recommendation: yes, keep notification prefs on `conversation_members` to avoid join overhead.
