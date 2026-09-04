"use client";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useI18n } from "@/core/providers/I18nProvider";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuthStore } from "@/core/auth/auth-store";
import { httpClient } from "@/core/api/http-client";
import { employeeLabel, type Employee } from "@/features/vsm/types";
import { chatApi } from "../api";
import { chatErrorMessage, isDraftConflict } from "../errors";
import { chatKeys } from "../query-keys";
import { useChatRealtime } from "../hooks/useChatRealtime";
import { useChatUiStore } from "../ui-store";
import type {
  ChatConversationListItem,
  ChatMessage,
  MemberRole,
  NotificationLevel,
  ReportReason,
} from "../types";
import { ConversationList } from "./ConversationList";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { DetailsPanel } from "./DetailsPanel";
import { ForwardDialog, NewConversationDialog } from "./Dialogs";
import { ChatSidePanels } from "./SidePanels";

export function ChatShell({
  conversationId,
  focusMessageId,
}: {
  conversationId: string | null;
  focusMessageId?: string | null;
}) {
  const { t, lang } = useI18n();
  const { showToast } = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const perms = useAuthStore((s) => s.user?.permissions ?? []);
  const canModerate = perms.includes("chat.moderate");
  const canCreateChannel = perms.includes("chat.create_channel");

  const myEmployeeId = useChatUiStore((s) => s.myEmployeeId);
  const connectionState = useChatUiStore((s) => s.connectionState);
  const mobilePanel = useChatUiStore((s) => s.mobilePanel);
  const detailsOpen = useChatUiStore((s) => s.detailsOpen);
  const setMobilePanel = useChatUiStore((s) => s.setMobilePanel);
  const setDetailsOpen = useChatUiStore((s) => s.setDetailsOpen);
  const setReplyTo = useChatUiStore((s) => s.setReplyTo);
  const setEditing = useChatUiStore((s) => s.setEditing);
  const setThreadRoot = useChatUiStore((s) => s.setThreadRoot);
  const setHighlight = useChatUiStore((s) => s.setHighlightMessageId);
  const replyTo = useChatUiStore((s) => s.replyTo);
  const editing = useChatUiStore((s) => s.editing);
  const typingMap = useChatUiStore((s) => s.typingByConversation);
  const presence = useChatUiStore((s) => s.presenceByEmployee);

  useChatRealtime(conversationId);

  const [listSearch, setListSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [panel, setPanel] = useState<
    null | "search" | "bookmarks" | "invites" | "reports" | "blocks" | "notifications"
  >(null);

  const convQuery = useInfiniteQuery({
    queryKey: chatKeys.conversations(),
    queryFn: ({ pageParam }) => chatApi.listConversations(pageParam as string | undefined, 50),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : undefined),
    staleTime: 30_000,
  });

  const conversations = useMemo(
    () => convQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [convQuery.data],
  );

  const active = useMemo(
    () => conversations.find((c) => c.id === conversationId) ?? null,
    [conversations, conversationId],
  );

  const msgQuery = useQuery({
    queryKey: chatKeys.messages(conversationId ?? ""),
    queryFn: () => chatApi.listMessages(conversationId!, { limit: 50 }),
    enabled: Boolean(conversationId),
    staleTime: 15_000,
  });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderCursor, setOlderCursor] = useState<string | undefined>();
  const [hasOlder, setHasOlder] = useState(false);

  useEffect(() => {
    setOlderCursor(msgQuery.data?.next_cursor);
    setHasOlder(Boolean(msgQuery.data?.has_more));
  }, [conversationId, msgQuery.data?.next_cursor, msgQuery.data?.has_more]);

  const messages = useMemo(() => {
    const items = msgQuery.data?.items ?? [];
    return [...items].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [msgQuery.data]);

  const loadOlder = async () => {
    if (!conversationId || !olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await chatApi.listMessages(conversationId, {
        cursor: olderCursor,
        limit: 50,
        direction: "before",
      });
      qc.setQueryData(chatKeys.messages(conversationId), (old: typeof msgQuery.data) => {
        if (!old) return page;
        const map = new Map<string, ChatMessage>();
        for (const m of page.items) map.set(m.id, m);
        for (const m of old.items) map.set(m.id, m);
        return {
          ...old,
          items: [...map.values()].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          ),
        };
      });
      setOlderCursor(page.next_cursor);
      setHasOlder(Boolean(page.has_more));
    } finally {
      setLoadingOlder(false);
    }
  };

  const membersQuery = useQuery({
    queryKey: chatKeys.members(conversationId ?? ""),
    queryFn: () => chatApi.listMembers(conversationId!),
    enabled: Boolean(conversationId),
  });

  const pinsQuery = useQuery({
    queryKey: chatKeys.pins(conversationId ?? ""),
    queryFn: () => chatApi.listPins(conversationId!),
    enabled: Boolean(conversationId),
  });

  const draftQuery = useQuery({
    queryKey: chatKeys.draft(conversationId ?? ""),
    queryFn: async () => {
      try {
        return await chatApi.getDraft(conversationId!);
      } catch {
        return null;
      }
    },
    enabled: Boolean(conversationId),
    retry: false,
  });

  const employeesQuery = useQuery({
    queryKey: ["vsm-employees"],
    queryFn: () => httpClient.get<Employee[]>("/api/v1/employees"),
    staleTime: 120_000,
  });

  const nameByEmployee = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of employeesQuery.data ?? []) map[e.id] = employeeLabel(e);
    return map;
  }, [employeesQuery.data]);

  const myRole = useMemo(() => {
    const m = (membersQuery.data ?? []).find((x) => x.employee_id === myEmployeeId);
    return (m?.role as MemberRole | undefined) ?? null;
  }, [membersQuery.data, myEmployeeId]);

  // Presence for DM peer
  useEffect(() => {
    if (!conversationId || active?.type !== "DM") return;
    const others = (membersQuery.data ?? [])
      .map((m) => m.employee_id)
      .filter((id) => id !== myEmployeeId);
    if (others.length === 0) return;
    void chatApi.presence(others).then((res) => {
      for (const p of res.items ?? []) {
        useChatUiStore.getState().setPresence(p.employee_id, p.status, p.last_seen_at);
      }
    });
  }, [conversationId, active?.type, membersQuery.data, myEmployeeId]);

  useEffect(() => {
    if (focusMessageId) setHighlight(focusMessageId);
  }, [focusMessageId, setHighlight]);

  useEffect(() => {
    if (conversationId) setMobilePanel("messages");
  }, [conversationId, setMobilePanel]);

  // Mark read when viewing latest
  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last || last.sender_id === myEmployeeId) return;
    void chatApi.markReadUpTo(conversationId, last.id).then(() => {
      qc.setQueryData(
        chatKeys.conversations(),
        (old: { pages: { items: ChatConversationListItem[] }[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((c) =>
                c.id === conversationId ? { ...c, unread_count: 0 } : c,
              ),
            })),
          };
        },
      );
    });
  }, [conversationId, messages, myEmployeeId, qc]);

  const selectConversation = (id: string) => {
    router.push(`/chat/${id}`);
    setMobilePanel("messages");
  };

  const errToast = (err: unknown) => showToast(chatErrorMessage(err, lang), "error");

  const sendMutation = async (content: string) => {
    if (!conversationId) return;
    setSending(true);
    try {
      let msg: ChatMessage;
      if (editing) {
        msg = await chatApi.editMessage(editing.id, content);
        setEditing(null);
      } else if (replyTo) {
        msg = await chatApi.reply(replyTo.id, content);
        setReplyTo(null);
      } else {
        msg = await chatApi.sendMessage(conversationId, { content, content_format: "plain" });
      }
      qc.setQueryData(chatKeys.messages(conversationId), (old: { items: ChatMessage[] } | undefined) => {
        if (!old) return { items: [msg], has_more: false };
        const items = old.items.some((m) => m.id === msg.id)
          ? old.items.map((m) => (m.id === msg.id ? msg : m))
          : [...old.items, msg];
        return { ...old, items };
      });
      try {
        await chatApi.deleteDraft(conversationId);
      } catch {
        /* ok */
      }
      void qc.invalidateQueries({ queryKey: chatKeys.draft(conversationId) });
      void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
    } catch (err) {
      errToast(err);
      throw err;
    } finally {
      setSending(false);
    }
  };

  const saveDraft = async (content: string, updatedAt?: string) => {
    if (!conversationId) return;
    try {
      if (!content.trim()) {
        await chatApi.deleteDraft(conversationId);
      } else {
        await chatApi.saveDraft(conversationId, {
          content,
          updated_at: updatedAt,
          parent_message_id: replyTo?.id ?? null,
        });
      }
      void qc.invalidateQueries({ queryKey: chatKeys.draft(conversationId) });
    } catch (err) {
      if (isDraftConflict(err)) {
        showToast(chatErrorMessage(err, lang), "info");
        void qc.invalidateQueries({ queryKey: chatKeys.draft(conversationId) });
      }
    }
  };

  const react = async (m: ChatMessage, emoji: string) => {
    const mine = (m.reactions ?? []).some(
      (r) => r.emoji === emoji && r.employee_id === myEmployeeId,
    );
    try {
      const reactions = mine
        ? await chatApi.removeReaction(m.id, emoji)
        : await chatApi.addReaction(m.id, emoji);
      qc.setQueryData(chatKeys.messages(m.conversation_id), (old: { items: ChatMessage[] } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((x) => (x.id === m.id ? { ...x, reactions } : x)),
        };
      });
    } catch (err) {
      errToast(err);
    }
  };

  const typingOthers = (typingMap[conversationId ?? ""] ?? []).filter(
    (id) => id !== myEmployeeId,
  );

  const peerMember =
    active?.type === "DM"
      ? (membersQuery.data ?? []).find((m) => m.employee_id !== myEmployeeId) ?? null
      : null;
  const peerPresence =
    peerMember && presence[peerMember.employee_id]
      ? presence[peerMember.employee_id]
      : null;
  const mainTitle =
    active?.type === "DM" && peerMember
      ? nameByEmployee[peerMember.employee_id] || peerMember.employee_id.slice(0, 8)
      : active?.name || active?.type || t("chat.conversation");
  const mainInitials = mainTitle
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";
  const presenceStatus = peerPresence?.status || "offline";

  return (
    <div
      className={`chat-shell mobile-${mobilePanel}${detailsOpen ? "" : " details-collapsed"}`}
      data-connection={connectionState}
    >
      <div className="chat-toolbar">
        <div className="chat-toolbar-start">
          <button
            type="button"
            className="btn btn-ghost chat-mobile-only"
            onClick={() => setMobilePanel("list")}
          >
            {t("common.back")}
          </button>
          <span className={`chat-conn-dot status-${connectionState}`} title={connectionState} />
          <div className="chat-toolbar-brand">
            <p className="chat-list-kicker">{t("chat.conversations")}</p>
            <strong>{t("chat.title")}</strong>
          </div>
        </div>
        <div className="chat-toolbar-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setNewOpen(true)}>
            {t("chat.new")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setPanel("search")}>
            {t("common.search")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setPanel("bookmarks")}>
            {t("chat.bookmarks")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setPanel("invites")}>
            {t("chat.invitations")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setPanel("notifications")}>
            {t("chat.notifications")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setPanel("blocks")}>
            {t("chat.blocks")}
          </button>
          {canModerate && (
            <button type="button" className="btn btn-ghost" onClick={() => setPanel("reports")}>
              {t("chat.reports")}
            </button>
          )}
          {conversationId && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setDetailsOpen(!detailsOpen);
                setMobilePanel("details");
              }}
            >
              {t("chat.details")}
            </button>
          )}
        </div>
      </div>

      <div className="chat-columns">
        <ConversationList
          items={conversations}
          activeId={conversationId}
          loading={convQuery.isLoading}
          error={convQuery.isError}
          onSelect={selectConversation}
          onRetry={() => void convQuery.refetch()}
          search={listSearch}
          onSearchChange={setListSearch}
          onLoadMore={() => void convQuery.fetchNextPage()}
          hasMore={Boolean(convQuery.hasNextPage)}
          loadingMore={convQuery.isFetchingNextPage}
        />

        <section className="chat-main" aria-label={t("chat.messages")}>
          {!conversationId ? (
            <div className="chat-empty chat-main-empty">
              <div className="chat-details-empty-orb" aria-hidden />
              <p className="chat-list-kicker">{t("chat.title")}</p>
              <h3>{t("chat.selectConversation")}</h3>
            </div>
          ) : (
            <>
              <header className="chat-main-header">
                <div className="chat-main-peer">
                  <div
                    className={`chat-main-avatar${active?.type === "DM" ? ` status-${presenceStatus}` : ""}`}
                    aria-hidden
                  >
                    {mainInitials}
                    {active?.type === "DM" ? (
                      <i className={`chat-presence-dot status-${presenceStatus}`} />
                    ) : null}
                  </div>
                  <div className="chat-main-peer-copy">
                    <p className="chat-list-kicker">
                      {active?.type === "DM"
                        ? t("chat.directMessage")
                        : active?.type === "CHANNEL"
                          ? t("chat.tab.channel")
                          : active?.type === "GROUP"
                            ? t("chat.tab.group")
                            : t("chat.conversation")}
                    </p>
                    <h2 title={mainTitle}>{mainTitle}</h2>
                    <p className={`chat-muted${typingOthers.length > 0 ? " is-typing" : ""}`}>
                      {typingOthers.length > 0
                        ? t("chat.typing")
                        : peerPresence
                          ? `${t(`chat.presence.${peerPresence.status}`)}${
                              peerPresence.last_seen_at
                                ? ` · ${new Date(peerPresence.last_seen_at).toLocaleString(
                                    lang === "fa" ? "fa-IR" : "en-US",
                                  )}`
                                : ""
                            }`
                          : active?.type}
                    </p>
                  </div>
                </div>
              </header>
              <MessageList
                messages={messages}
                myEmployeeId={myEmployeeId}
                nameByEmployee={nameByEmployee}
                loading={msgQuery.isLoading}
                loadingOlder={loadingOlder}
                hasOlder={hasOlder}
                onLoadOlder={() => void loadOlder()}
                onReply={setReplyTo}
                onEdit={setEditing}
                onDelete={setDeleteMsg}
                onReact={(m, e) => void react(m, e)}
                onBookmark={async (m) => {
                  try {
                    await chatApi.addBookmark(m.id);
                    showToast(t("chat.bookmarked"), "success");
                  } catch (err) {
                    errToast(err);
                  }
                }}
                onPin={async (m) => {
                  try {
                    await chatApi.pinMessage(m.conversation_id, m.id);
                    void qc.invalidateQueries({ queryKey: chatKeys.pins(m.conversation_id) });
                  } catch (err) {
                    errToast(err);
                  }
                }}
                onForward={setForwardMsg}
                onReport={async (m) => {
                  const reason = window.prompt(t("chat.reportReason"), "spam") as ReportReason | null;
                  if (!reason) return;
                  try {
                    await chatApi.reportMessage(m.id, reason);
                    showToast(t("chat.reported"), "success");
                  } catch (err) {
                    errToast(err);
                  }
                }}
                onOpenThread={setThreadRoot}
              />
              <Composer
                conversationId={conversationId}
                members={membersQuery.data ?? []}
                nameByEmployee={nameByEmployee}
                draftContent={draftQuery.data?.content ?? ""}
                draftUpdatedAt={draftQuery.data?.updated_at}
                sending={sending}
                onSend={sendMutation}
                onSaveDraft={saveDraft}
                onCancelEdit={() => setEditing(null)}
              />
            </>
          )}
        </section>

        {detailsOpen && (
          <DetailsPanel
            conversation={active}
            members={membersQuery.data ?? []}
            pins={pinsQuery.data ?? []}
            myEmployeeId={myEmployeeId}
            myRole={myRole}
            canModerate={canModerate}
            nameByEmployee={nameByEmployee}
            peerPresence={peerPresence}
            onClose={() => {
              setDetailsOpen(false);
              setMobilePanel("messages");
            }}
            onMute={(muted) => {
              if (!conversationId) return;
              void chatApi.updateSettings(conversationId, { is_muted: muted }).then(() => {
                void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
              });
            }}
            onNotificationLevel={(level: NotificationLevel) => {
              if (!conversationId) return;
              void chatApi.updateSettings(conversationId, { notification_level: level }).then(() => {
                void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
              });
            }}
            onArchive={() => {
              if (!conversationId) return;
              void chatApi.archive(conversationId).then(() => {
                void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
              });
            }}
            onUnarchive={() => {
              if (!conversationId) return;
              void chatApi.unarchive(conversationId).then(() => {
                void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
              });
            }}
            onAddMember={(employeeId) => {
              if (!conversationId) return;
              void chatApi.addMember(conversationId, employeeId).then(() => {
                void qc.invalidateQueries({ queryKey: chatKeys.members(conversationId) });
              }).catch(errToast);
            }}
            onRemoveMember={(employeeId) => {
              if (!conversationId) return;
              void chatApi.removeMember(conversationId, employeeId).then(() => {
                void qc.invalidateQueries({ queryKey: chatKeys.members(conversationId) });
              }).catch(errToast);
            }}
            onChangeRole={(employeeId, role) => {
              if (!conversationId) return;
              void chatApi.updateMemberRole(conversationId, employeeId, role).then(() => {
                void qc.invalidateQueries({ queryKey: chatKeys.members(conversationId) });
              }).catch(errToast);
            }}
            onTransferOwner={(employeeId) => {
              if (!conversationId) return;
              void chatApi.transferOwner(conversationId, employeeId).then(() => {
                void qc.invalidateQueries({ queryKey: chatKeys.members(conversationId) });
                showToast(t("chat.ownerTransferred"), "success");
              }).catch(errToast);
            }}
            onLeave={() => {
              if (!conversationId) return;
              void chatApi.leave(conversationId).then(() => {
                router.push("/chat");
                void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
              }).catch(errToast);
            }}
            onJumpPin={(messageId) => {
              setHighlight(messageId);
              setMobilePanel("messages");
            }}
            onInvite={(employeeId) => {
              if (!conversationId) return;
              void chatApi.createInvitation(conversationId, employeeId).then(() => {
                showToast(t("chat.inviteSent"), "success");
              }).catch(errToast);
            }}
          />
        )}
      </div>

      <NewConversationDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => {
          void qc.invalidateQueries({ queryKey: chatKeys.conversations() });
          router.push(`/chat/${id}`);
        }}
      />
      <ForwardDialog
        open={Boolean(forwardMsg)}
        messageId={forwardMsg?.id ?? null}
        conversations={conversations}
        onClose={() => setForwardMsg(null)}
        onForward={async (ids) => {
          if (!forwardMsg) return;
          await chatApi.forward(forwardMsg.id, ids);
          showToast(t("chat.forwardedOk"), "success");
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteMsg)}
        title={t("chat.confirmDelete")}
        description={t("chat.confirmDeleteDesc")}
        tone="danger"
        onCancel={() => setDeleteMsg(null)}
        onConfirm={() => {
          if (!deleteMsg) return;
          void chatApi
            .deleteMessage(deleteMsg.id)
            .then(() => {
              void qc.invalidateQueries({
                queryKey: chatKeys.messages(deleteMsg.conversation_id),
              });
              setDeleteMsg(null);
            })
            .catch(errToast);
        }}
      />
      <ChatSidePanels
        panel={panel}
        onClose={() => setPanel(null)}
        conversationId={conversationId}
        canCreateChannel={canCreateChannel}
        canModerate={canModerate}
        nameByEmployee={nameByEmployee}
        onOpenConversation={(id, messageId) => {
          setPanel(null);
          if (messageId) router.push(`/chat/${id}?message=${messageId}`);
          else router.push(`/chat/${id}`);
        }}
      />
    </div>
  );
}
