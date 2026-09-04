import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type {
  ChatConversationListItem,
  ChatEventEnvelope,
  ChatMessage,
  ChatNotification,
  CursorPage,
} from "../types";
import { chatKeys } from "../query-keys";

function asMessage(payload: Record<string, unknown> | undefined): ChatMessage | null {
  if (!payload) return null;
  const msg = (payload.message ?? payload) as ChatMessage;
  if (!msg?.id || !msg.conversation_id) return null;
  return msg;
}

function upsertMessage(list: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const idx = list.findIndex((m) => m.id === msg.id);
  if (idx >= 0) {
    const next = list.slice();
    next[idx] = { ...next[idx], ...msg };
    return next;
  }
  return [...list, msg].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

function patchConversationPages(
  old: InfiniteData<CursorPage<ChatConversationListItem>> | undefined,
  conversationId: string,
  patch: Partial<ChatConversationListItem>,
): InfiniteData<CursorPage<ChatConversationListItem>> | undefined {
  if (!old) return old;
  const pages = old.pages.map((page) => ({
    ...page,
    items: page.items.map((c) => (c.id === conversationId ? { ...c, ...patch } : c)),
  }));
  if (pages[0]) {
    pages[0] = {
      ...pages[0],
      items: [...pages[0].items].sort((a, b) => {
        const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return tb - ta;
      }),
    };
  }
  return { ...old, pages };
}

/** Apply a realtime chat event to React Query caches without full refetch. */
export function applyChatEvent(
  qc: QueryClient,
  event: ChatEventEnvelope,
  opts: { myEmployeeId: string | null; activeConversationId: string | null },
): void {
  const { myEmployeeId, activeConversationId } = opts;
  const type = event.type;
  const payload = event.payload ?? {};
  const conversationId =
    event.conversation_id ||
    (payload.conversation_id as string | undefined) ||
    (asMessage(payload)?.conversation_id ?? null);

  switch (type) {
    case "message.created": {
      const msg = asMessage(payload);
      if (!msg) return;
      qc.setQueryData<CursorPage<ChatMessage>>(chatKeys.messages(msg.conversation_id), (old) => {
        if (!old) return old;
        return { ...old, items: upsertMessage(old.items, msg) };
      });
      qc.setQueryData<InfiniteData<CursorPage<ChatConversationListItem>>>(
        chatKeys.conversations(),
        (old) => {
          const isOwn = Boolean(myEmployeeId && msg.sender_id === myEmployeeId);
          const isActive = activeConversationId === msg.conversation_id;
          const current = old?.pages
            .flatMap((p) => p.items)
            .find((c) => c.id === msg.conversation_id);
          const unread =
            isOwn || isActive ? (current?.unread_count ?? 0) : (current?.unread_count ?? 0) + 1;
          return patchConversationPages(old, msg.conversation_id, {
            last_message_id: msg.id,
            last_message_at: msg.created_at,
            last_message_preview: msg.deleted_at ? undefined : msg.content?.slice(0, 120),
            unread_count: unread,
          });
        },
      );
      break;
    }
    case "message.updated": {
      const msg = asMessage(payload);
      if (!msg) return;
      qc.setQueryData<CursorPage<ChatMessage>>(chatKeys.messages(msg.conversation_id), (old) => {
        if (!old) return old;
        return { ...old, items: upsertMessage(old.items, msg) };
      });
      break;
    }
    case "message.deleted": {
      const messageId = String(payload.message_id ?? "");
      const cid = String(payload.conversation_id ?? conversationId ?? "");
      if (!messageId || !cid) return;
      qc.setQueryData<CursorPage<ChatMessage>>(chatKeys.messages(cid), (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  content: "",
                  deleted_at: String(payload.deleted_at ?? new Date().toISOString()),
                }
              : m,
          ),
        };
      });
      break;
    }
    case "message.reaction.added":
    case "message.reaction.removed": {
      const messageId = String(payload.message_id ?? "");
      const cid = String(payload.conversation_id ?? conversationId ?? "");
      const emoji = String(payload.emoji ?? "");
      const employeeId = String(payload.employee_id ?? "");
      if (!messageId || !cid) return;
      qc.setQueryData<CursorPage<ChatMessage>>(chatKeys.messages(cid), (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((m) => {
            if (m.id !== messageId) return m;
            const reactions = [...(m.reactions ?? [])];
            if (type === "message.reaction.added") {
              if (!reactions.some((r) => r.employee_id === employeeId && r.emoji === emoji)) {
                reactions.push({ message_id: messageId, employee_id: employeeId, emoji });
              }
              return { ...m, reactions };
            }
            return {
              ...m,
              reactions: reactions.filter(
                (r) => !(r.employee_id === employeeId && r.emoji === emoji),
              ),
            };
          }),
        };
      });
      break;
    }
    case "message.pinned":
    case "message.unpinned": {
      if (conversationId) void qc.invalidateQueries({ queryKey: chatKeys.pins(conversationId) });
      break;
    }
    case "conversation.created":
    case "conversation.updated":
    case "conversation.member_added":
    case "conversation.member_removed":
    case "conversation.role_changed": {
      void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
      if (conversationId) {
        void qc.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) });
        void qc.invalidateQueries({ queryKey: chatKeys.members(conversationId) });
      }
      break;
    }
    case "conversation.invitation_created": {
      void qc.invalidateQueries({ queryKey: chatKeys.invitations() });
      break;
    }
    case "notification.created": {
      const n = payload as unknown as ChatNotification;
      if (!n?.id) break;
      qc.setQueryData(
        chatKeys.notifications(),
        (old: { items: ChatNotification[]; unread_count?: number } | undefined) => {
          if (!old) return { items: [n], unread_count: n.is_read ? 0 : 1 };
          if (old.items.some((x) => x.id === n.id)) return old;
          return {
            ...old,
            items: [n, ...old.items],
            unread_count: (old.unread_count ?? 0) + (n.is_read ? 0 : 1),
          };
        },
      );
      break;
    }
    case "draft.updated": {
      if (conversationId) void qc.invalidateQueries({ queryKey: chatKeys.draft(conversationId) });
      break;
    }
    default:
      break;
  }
}
