"use client";

import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ModalPortal } from "@/components/ModalPortal";
import { useI18n } from "@/core/providers/I18nProvider";
import { useToast } from "@/components/Toast";
import { chatApi } from "../api";
import { chatErrorMessage } from "../errors";
import { chatKeys } from "../query-keys";
import { useChatUiStore } from "../ui-store";
import { SafeMarkdown } from "../SafeMarkdown";
import type { ReportStatus } from "../types";

export function ChatSidePanels({
  panel,
  onClose,
  conversationId,
  canModerate,
  nameByEmployee,
  onOpenConversation,
}: {
  panel: null | "search" | "bookmarks" | "invites" | "reports" | "blocks" | "notifications";
  onClose: () => void;
  conversationId: string | null;
  canCreateChannel?: boolean;
  canModerate: boolean;
  nameByEmployee: Record<string, string>;
  onOpenConversation: (conversationId: string, messageId?: string) => void;
}) {
  const { t, lang } = useI18n();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const threadRoot = useChatUiStore((s) => s.threadRoot);
  const setThreadRoot = useChatUiStore((s) => s.setThreadRoot);
  const [searchQ, setSearchQ] = useState("");
  const [searchScope, setSearchScope] = useState<"global" | "conversation">("global");

  const searchEnabled = panel === "search" && searchQ.trim().length >= 2;
  const searchQuery = useQuery({
    queryKey: chatKeys.search(
      searchQ,
      searchScope === "conversation" ? conversationId ?? undefined : undefined,
    ),
    queryFn: () =>
      searchScope === "conversation" && conversationId
        ? chatApi.searchConversation(conversationId, searchQ.trim())
        : chatApi.searchGlobal(searchQ.trim()),
    enabled: searchEnabled,
  });

  const bookmarksQuery = useInfiniteQuery({
    queryKey: chatKeys.bookmarks(),
    queryFn: ({ pageParam }) => chatApi.listBookmarks(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : undefined),
    enabled: panel === "bookmarks",
  });

  const invitesQuery = useQuery({
    queryKey: chatKeys.invitations(),
    queryFn: () => chatApi.listInvitations("pending"),
    enabled: panel === "invites",
  });

  const reportsQuery = useQuery({
    queryKey: chatKeys.reports(),
    queryFn: () => chatApi.listReports("open"),
    enabled: panel === "reports" && canModerate,
  });

  const blocksQuery = useQuery({
    queryKey: chatKeys.blocks(),
    queryFn: () => chatApi.listBlocks(),
    enabled: panel === "blocks",
  });

  const notifQuery = useQuery({
    queryKey: chatKeys.notifications(),
    queryFn: () => chatApi.listNotifications(undefined, 40),
    enabled: panel === "notifications",
  });

  const threadQuery = useQuery({
    queryKey: chatKeys.thread(threadRoot?.id ?? ""),
    queryFn: () => chatApi.listThread(threadRoot!.id),
    enabled: Boolean(threadRoot),
  });

  const err = (e: unknown) => showToast(chatErrorMessage(e, lang), "error");

  const title = useMemo(() => {
    switch (panel) {
      case "search":
        return t("common.search");
      case "bookmarks":
        return t("chat.bookmarks");
      case "invites":
        return t("chat.invitations");
      case "reports":
        return t("chat.reports");
      case "blocks":
        return t("chat.blocks");
      case "notifications":
        return t("chat.notifications");
      default:
        return "";
    }
  }, [panel, t]);

  return (
    <>
      {panel && (
        <ModalPortal>
          <div className="modal-backdrop active" onClick={onClose}>
            <div
              className="modal-content chat-side-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal
            >
              <div className="modal-header">
                <h3 className="modal-title">{title}</h3>
                <button type="button" className="modal-close" onClick={onClose} aria-label={t("common.close")}>
                  ✕
                </button>
              </div>
              <div className="modal-body">
                {panel === "search" && (
                  <>
                    <div className="chat-tabs">
                      <button
                        type="button"
                        className={searchScope === "global" ? "is-active" : undefined}
                        onClick={() => setSearchScope("global")}
                      >
                        {t("chat.searchGlobal")}
                      </button>
                      <button
                        type="button"
                        className={searchScope === "conversation" ? "is-active" : undefined}
                        disabled={!conversationId}
                        onClick={() => setSearchScope("conversation")}
                      >
                        {t("chat.searchInConversation")}
                      </button>
                    </div>
                    <input
                      className="chat-input"
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                      placeholder={t("chat.searchMinChars")}
                    />
                    {searchQuery.isLoading && <p>{t("common.loading")}</p>}
                    <ul className="chat-result-list">
                      {(searchQuery.data?.items ?? []).map((hit) => (
                        <li key={hit.message.id}>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenConversation(hit.message.conversation_id, hit.message.id)
                            }
                          >
                            <strong>
                              {hit.conversation?.name || hit.message.conversation_id.slice(0, 8)}
                            </strong>
                            <span>
                              <SafeMarkdown
                                text={hit.highlight || hit.message.content}
                                format="plain"
                              />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {panel === "bookmarks" && (
                  <ul className="chat-result-list">
                    {(bookmarksQuery.data?.pages.flatMap((p) => p.items) ?? []).map((b) => (
                      <li key={b.message_id}>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenConversation(
                              b.message?.conversation_id || b.conversation?.id || "",
                              b.message_id,
                            )
                          }
                        >
                          {(b.message?.content || b.message_id).slice(0, 120)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {panel === "invites" && (
                  <ul className="chat-result-list">
                    {(invitesQuery.data?.items ?? []).map((inv) => (
                      <li key={inv.id} className="chat-invite-row">
                        <div>
                          <strong>{inv.conversation_id.slice(0, 8)}</strong>
                          <span className="chat-muted">{inv.status}</span>
                        </div>
                        <div>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() =>
                              void chatApi
                                .acceptInvitation(inv.id)
                                .then(() => {
                                  void qc.invalidateQueries({ queryKey: chatKeys.invitations() });
                                  void qc.invalidateQueries({
                                    queryKey: chatKeys.conversations(),
                                  });
                                  onOpenConversation(inv.conversation_id);
                                })
                                .catch(err)
                            }
                          >
                            {t("chat.accept")}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() =>
                              void chatApi
                                .rejectInvitation(inv.id)
                                .then(() =>
                                  void qc.invalidateQueries({ queryKey: chatKeys.invitations() }),
                                )
                                .catch(err)
                            }
                          >
                            {t("chat.reject")}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {panel === "reports" && canModerate && (
                  <ul className="chat-result-list">
                    {(reportsQuery.data?.items ?? []).map((r) => (
                      <li key={r.id} className="chat-invite-row">
                        <div>
                          <strong>{r.reason}</strong>
                          <span className="chat-muted">{r.status}</span>
                          <p>{(r.message?.content || r.message_id).slice(0, 100)}</p>
                        </div>
                        <div>
                          {(["resolved", "rejected"] as ReportStatus[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              className="btn btn-secondary"
                              onClick={() =>
                                void chatApi
                                  .updateReport(r.id, st)
                                  .then(() =>
                                    void qc.invalidateQueries({ queryKey: chatKeys.reports() }),
                                  )
                                  .catch(err)
                              }
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {panel === "blocks" && (
                  <>
                    <BlockForm
                      onBlocked={() => void qc.invalidateQueries({ queryKey: chatKeys.blocks() })}
                    />
                    <ul className="chat-result-list">
                      {(blocksQuery.data?.items ?? []).map((b) => (
                        <li key={b.blocked_id} className="chat-invite-row">
                          <span>{nameByEmployee[b.blocked_id] || b.blocked_id.slice(0, 8)}</span>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() =>
                              void chatApi
                                .unblockUser(b.blocked_id)
                                .then(() =>
                                  void qc.invalidateQueries({ queryKey: chatKeys.blocks() }),
                                )
                                .catch(err)
                            }
                          >
                            {t("chat.unblock")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {panel === "notifications" && (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() =>
                        void chatApi.markAllNotificationsRead().then(() =>
                          void qc.invalidateQueries({ queryKey: chatKeys.notifications() }),
                        )
                      }
                    >
                      {t("chat.markAllRead")}
                    </button>
                    <ul className="chat-result-list">
                      {(notifQuery.data?.items ?? []).map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            className={n.is_read ? undefined : "is-unread"}
                            onClick={() => {
                              void chatApi.markNotificationRead(n.id);
                              if (n.action_url?.startsWith("/chat/")) {
                                const [path, qs] = n.action_url.split("?");
                                const parts = path.split("/").filter(Boolean);
                                const cid = parts[1];
                                const mid = new URLSearchParams(qs || "").get("message") || undefined;
                                if (cid) onOpenConversation(cid, mid);
                              }
                              onClose();
                            }}
                          >
                            <strong>{n.title}</strong>
                            <span>{n.body}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {threadRoot && (
        <ModalPortal>
          <div className="modal-backdrop active" onClick={() => setThreadRoot(null)}>
            <div
              className="modal-content chat-thread-drawer"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal
              aria-label={t("chat.thread")}
            >
              <div className="modal-header">
                <h3 className="modal-title">{t("chat.thread")}</h3>
                <button type="button" className="modal-close" onClick={() => setThreadRoot(null)}>
                  ✕
                </button>
              </div>
              <div className="modal-body">
                {(threadQuery.data?.items ?? []).map((m) => (
                  <div key={m.id} className="chat-thread-item">
                    <strong>{nameByEmployee[m.sender_id] || m.sender_id.slice(0, 8)}</strong>
                    <p>
                      {m.deleted_at ? t("chat.messageDeleted") : m.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}

function BlockForm({ onBlocked }: { onBlocked: () => void }) {
  const { t, lang } = useI18n();
  const { showToast } = useToast();
  const [id, setId] = useState("");
  const mut = useMutation({
    mutationFn: () => chatApi.blockUser(id.trim()),
    onSuccess: () => {
      setId("");
      onBlocked();
      showToast(t("chat.blocked"), "success");
    },
    onError: (e) => showToast(chatErrorMessage(e, lang), "error"),
  });
  return (
    <div className="chat-inline-form">
      <input
        className="chat-input"
        placeholder={t("chat.employeeId")}
        value={id}
        onChange={(e) => setId(e.target.value)}
      />
      <button
        type="button"
        className="btn btn-danger"
        disabled={!id.trim() || mut.isPending}
        onClick={() => mut.mutate()}
      >
        {t("chat.block")}
      </button>
    </div>
  );
}
