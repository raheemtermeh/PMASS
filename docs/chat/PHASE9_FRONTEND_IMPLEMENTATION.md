# Phase 9 Frontend Implementation — PMASS Messenger

**Date:** 2026-09-04  
**Status:** Complete

## Architecture

Messenger UI lives inside the existing Next.js App Router app (`pmas-live`), under:

- Routes: `src/app/(dashboard)/chat/`
- Feature module: `src/features/chat/`
- Shared HTTP: `src/core/api/http-client.ts`
- Auth: existing Zustand `useAuthStore` (Bearer JWT)
- Cache: TanStack React Query
- UI state: `useChatUiStore` (Zustand) for composer modes, typing, presence, connection
- Realtime: singleton `ChatWebSocketManager`

No parallel frontend. No second realtime stack. Attachments/files/calls not implemented.

## Routes

| Path | Purpose |
|------|---------|
| `/chat` | Conversation list + empty main pane |
| `/chat/{conversationId}` | Open conversation |
| `/chat/{conversationId}?message={id}` | Deep link → scroll + highlight |

Nav: `chat` ViewId in `shared/routes.ts` (permission `chat.view`).

## Components

- `ChatShell` — orchestrator (toolbar, columns, mutations)
- `ConversationList` — cursor list, unread/mute/archive/typing
- `MessageList` — virtualized messages, actions, new-message pill
- `Composer` — send/edit/reply, drafts debounce, typing, @mentions
- `DetailsPanel` — members, pins, mute/archive/notif level, roles
- `Dialogs` — new DM/group/channel, forward
- `SidePanels` — search, bookmarks, invites, reports, blocks, notifications, thread drawer
- `SafeMarkdown` — safe subset renderer (no `dangerouslySetInnerHTML`)

## API integration

Central client: `src/features/chat/api.ts` covering conversations, messages, reactions, bookmarks, pins, threads, forward, search, presence, drafts, invitations, blocks, reports, sync, notifications.

## WebSocket

- Endpoint: `{API}/api/v1/chat/ws?access_token=…`
- One connection per session (`getChatSocket()`)
- States: connecting / connected / reconnecting / disconnected
- Subscribe/unsubscribe active conversation
- Ping keepalive; exponential backoff reconnect
- After reconnect: restore subscriptions + `GET /sync`

## Event handling

`applyChatEvent` patches React Query caches for message create/update/delete/reactions, conversation membership/role, invitations, notifications, drafts.

Bounded event-id dedupe (`BoundedEventDedupe`, capacity 2000).

Typing/presence update `useChatUiStore` only (no polling).

## Cache strategy

- Conversations: infinite query, `staleTime` 30s
- Messages: query + manual older-page merge (cursor `before`)
- Optimistic: reactions, mute/archive/read where safe
- Messages: REST success then cache insert (no optimistic permanent IDs)

## Responsive

- Desktop: 3 columns
- Tablet: list + messages (details on demand)
- Mobile: single panel (`list` → `messages` → `details`)

AppShell uses stable remount key `/chat` so conversation navigation does not remount the shell.

## Performance

- `@tanstack/react-virtual` for message list
- Memoized list/message components
- Debounced drafts (~700ms) and typing stop (~2.5s)
- No polling for realtime/typing/presence/notifications
- Cursor pagination only

## Security

- Backend remains authoritative for permissions
- JWT from existing auth store (not invented cookies)
- Safe markdown (escaped text + allowlisted http(s)/mailto links)
- CSP `connect-src` extended for `ws:` / `wss:`
- No trust of employee/company IDs from URL alone for authz

## Accessibility

- Dialog Escape closes
- ARIA labels on search/composer/actions
- Keyboard mention navigation
- Visible focus via existing button styles

## RTL / theme

Uses PMASS `dir` + design tokens. Chat CSS uses logical properties (`border-inline-*`, `inset-inline-*`).

## Tests

Vitest unit tests:

- Event dedupe bound
- Draft conflict error mapping
- `message.created` / `message.deleted` cache reducers

Scripts: `npm run test`, `npm run typecheck`

## Build results

- `tsc --noEmit` — pass
- `vitest run` — pass (4 tests)
- `check:i18n` — pass (en/fa synced)
- `next lint` — no committed ESLint config in repo (interactive prompt); skipped as gate
- `next build` — **pass** (`/chat`, `/chat/[conversationId]` emitted)

## Known limitations

- Employee picker for add-member still accepts UUID (plus employee chips in create dialog)
- Channel create requires backend `chat.create_channel`
- Report reason uses prompt dialog (functional, not polished)
- Local Next.js may need `NEXT_PUBLIC_API_URL` for WS if rewrite does not upgrade WebSocket
- Message virtualization estimates sizes; very tall markdown may briefly adjust
- Full component RTL/visual E2E not automated (no Playwright in repo)

## Explicit non-goals

**Attachments / Files were NOT implemented and remain the final major feature phase.**
