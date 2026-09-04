# Phase 3 Implementation Report — WebSocket Realtime + Redis Pub/Sub

**Date:** 2026-09-04  
**Status:** Complete

## 1. WebSocket Architecture

```
Client
  → WS /api/v1/chat/ws (JWT auth on upgrade)
  → realtime.Hub (connection registry + subscriptions)
  → write/read pumps per connection

REST mutation (PostgreSQL commit)
  → EventPublisher.Publish
      ├─ HubPublisher (CHAT_REDIS_ENABLED=false) → local DeliverEvent
      └─ Redis Publisher (CHAT_REDIS_ENABLED=true)
            → Redis channel pmass:chat:company:{companyID}
            → one Subscriber per API process
            → Hub.DeliverEvent
            → subscribed WebSocket connections
```

PostgreSQL remains the source of truth. Redis is fan-out only.

**Library:** `github.com/gorilla/websocket` v1.5.3

## 2. Authentication

| Method | Support |
|--------|---------|
| `Authorization: Bearer <access_jwt>` | Preferred |
| `?access_token=<access_jwt>` | Browser fallback |

Token is validated via `Authenticator.AuthenticateToken` (same fresh-claims path as REST).  
Requires `chat.view` + company workspace + resolvable employee.

Client-provided `company_id` / `employee_id` / `actor_id` are never trusted.

## 3. Authorization

- Connection auth once at upgrade
- Subscribe re-checks active conversation membership (`CanSubscribe` → `GetConversationMember`)
- Unauthorized IDs omitted (404-equivalent silence — no cross-tenant leak)
- Events delivered only if connection company matches and conversation is subscribed

## 4. Event Envelope

See `docs/chat/REALTIME_PROTOCOL.md`.

Fields: `id`, `type`, `timestamp`, `company_id`, `conversation_id?`, `actor_id?`, `payload`

## 5. Client Events

Supported: `subscribe`, `unsubscribe`, `ping`, `typing.start`, `typing.stop`  
**Not** supported: message create/update/delete over WS (REST only)

## 6. Server Events

Protocol + publishing for:

- `message.created|updated|deleted`
- `message.reaction.added|removed`
- `message.read|delivered`
- `message.pinned|unpinned`
- `conversation.created|updated`
- `conversation.member_added|removed`
- `typing.started|stopped` (fan-out only)
- Placeholders: `presence.updated`, `notification.created`

## 7. Subscription Model

Per-connection conversation room map. Multiple tabs/devices per employee supported.  
Limits: `CHAT_WS_MAX_SUBSCRIPTIONS` (default 100).

## 8. Redis Topology

- Channel: `pmass:chat:company:{companyID}` (bounded: one channel per company)
- One `PSubscribe("pmass:chat:company:*")` per API process
- Reconnect loop with backoff; REST continues if Redis is down
- Fallback: `CHAT_REDIS_ENABLED=false` → in-process hub publish

## 9. Connection Lifecycle

Upgrade → register → `connected` → subscribe → events → ping/pong → unregister on close/shutdown

## 10. Backpressure

Bounded per-connection send queue (`CHAT_WS_WRITE_QUEUE_SIZE`, default 64).  
On full queue: metric `chat_ws_write_queue_full`, log, disconnect slow client.

## 11. Heartbeat

| Config | Default |
|--------|---------|
| `CHAT_WS_PING_INTERVAL` | 30s |
| `CHAT_WS_PONG_TIMEOUT` | 10s |

Native WebSocket ping/pong + protocol `ping`/`pong`.

## 12. Shutdown

On SIGINT/SIGTERM: stop Redis subscriber → hub shutdown (close conns) → close Redis client → HTTP shutdown.

## 13. Failure Handling

| Failure | Behavior |
|---------|----------|
| Redis publish fails after DB commit | Log + metric; DB write kept; REST success unchanged |
| Redis down at boot | Warn; fall back to local hub |
| Redis disconnect at runtime | Subscriber reconnects; REST unaffected |
| Invalid JWT | 401; metric auth_failures |
| Origin not allowed | Upgrade rejected |

## 14. Metrics

Exposed under `/metrics` → `chat`:

- `chat_ws_connections`
- `chat_ws_connections_rejected`
- `chat_ws_messages_received`
- `chat_ws_messages_sent`
- `chat_ws_write_queue_full`
- `chat_ws_disconnects`
- `chat_ws_auth_failures`
- `chat_ws_subscription_denied`
- `chat_redis_publish_failures`
- `chat_redis_reconnects`

No high-cardinality labels (no employee/conversation/message IDs).

## 15. Security

- Origin check via `CORS_ALLOWED_ORIGINS` (+ localhost in development)
- JWT + session version reload
- Membership-gated subscribe
- Max frame size `CHAT_WS_MAX_MESSAGE_SIZE` (8192)
- Connection limits per employee / global
- Middleware skips request timeout + ResponseWriter wrapping on `/api/v1/chat/ws` (Hijack-safe)
- HTTP server read/write timeouts disabled when chat enabled (WS long-lived)

## 16. Tests

| Package | Coverage |
|---------|----------|
| `internal/realtime` | encode/decode, subscribe/deliver, unauthorized subscribe, malformed JSON, origin reject, shutdown |
| `internal/infrastructure/redis` | channel naming; pub/sub integration (skips without `REDIS_URL`) |
| `internal/application/chat` | MemoryPublisher; existing Phase 2 tests |
| `internal/delivery/http` | WS unauthenticated / unavailable |

## 17. Known Limitations

- No offline sync / event replay / Redis Streams
- Typing is fan-out only (no TTL store — Phase 6)
- Presence / notifications protocol-only
- Race detector not runnable on this Windows host (no CGO/gcc)
- Query `access_token` is a browser compromise; prefer Bearer header

## 18. Future Improvements

- Redis Streams or outbox for reliable delivery
- Presence TTL store
- Typing TTL store
- Per-event rate limits on WS commands
- Client reconnect sync API

## Files Created

| Path |
|------|
| `internal/realtime/protocol.go` |
| `internal/realtime/config.go` |
| `internal/realtime/errors.go` |
| `internal/realtime/metrics.go` |
| `internal/realtime/connection.go` |
| `internal/realtime/hub.go` |
| `internal/realtime/protocol_test.go` |
| `internal/realtime/hub_test.go` |
| `internal/infrastructure/redis/pubsub.go` |
| `internal/infrastructure/redis/pubsub_test.go` |
| `internal/application/chat/events.go` |
| `internal/application/chat/events_test.go` |
| `internal/delivery/http/chat_ws.go` |
| `internal/delivery/http/chat_ws_test.go` |
| `docs/chat/REALTIME_PROTOCOL.md` |
| `docs/chat/PHASE3_IMPLEMENTATION.md` |

## Files Modified

| Path | Change |
|------|--------|
| `internal/application/chat/service.go` | Publisher injection |
| `internal/application/chat/conversations.go` | Post-commit event publish |
| `internal/application/chat/messages.go` | Post-commit event publish |
| `internal/application/chat/service_integration_test.go` | NewService signature |
| `internal/delivery/http/chat_wire.go` | ChatStack + WS registration |
| `internal/delivery/http/chat_handler.go` | Ignore `/ws` on REST dispatcher |
| `internal/middleware/security.go` | `AuthenticateToken` |
| `internal/middleware/requestlog.go` | Hijack + skip WS wrap |
| `internal/observability/http.go` | Skip WS timeout/metrics wrap; extras in `/metrics` |
| `internal/config/config.go` | Redis + WS settings |
| `cmd/api/main.go` | Wire hub/Redis/shutdown; disable HTTP R/W timeouts when chat on |
| `deploy/nginx.conf` | WS upgrade for `/api/v1/chat/ws` |
| `docker-compose.yml` | Redis service + `REDIS_URL` |
| `.env.example` | Chat realtime env vars |
| `go.mod` / `go.sum` | gorilla/websocket, go-redis |

## Event Publishing Points

After successful DB commit:

CreateDM/Group/Channel, UpdateConversation, AddMember, RemoveMember, LeaveConversation,  
SendMessage, ReplyToMessage, ForwardMessage, EditMessage, DeleteMessage,  
AddReaction, RemoveReaction, MarkMessageRead, MarkMessageDelivered,  
PinMessage, UnpinMessage

## Deviations from Architecture Doc

1. **REST-only writes** — Phase 3 user spec forbids WS message mutations (architecture draft allowed `message.send` over WS).
2. **Company-scoped Redis channels** — not per-conversation channels (bounded channel count).
3. **Envelope uses `payload`** — architecture draft used `data`.
4. **Single `realtime` package** — instead of `application/chat/ws_hub.go` naming from the plan.
5. **Typing** — optional protocol fan-out without Redis TTL store.

## Verification

```text
go test ./...                          ✅
go build -o bin/pmas-api ./cmd/api     ✅
go test -race ...                      ⚠️ blocked (no gcc/CGO on this host)
```

**CHAT_ENABLED=false:** no REST chat routes, no WS route, no Redis subscriber.  
**CHAT_ENABLED=true:** REST + WS registered; Redis optional via `CHAT_REDIS_ENABLED`.
