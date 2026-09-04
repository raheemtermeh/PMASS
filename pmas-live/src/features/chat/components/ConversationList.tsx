"use client";

import { memo, useMemo } from "react";
import type { ChatConversationListItem } from "../types";
import { useChatUiStore } from "../ui-store";
import { useI18n } from "@/core/providers/I18nProvider";

function formatTime(iso: string | null | undefined, lang: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(lang === "fa" ? "fa-IR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function conversationTitle(c: ChatConversationListItem, t: (k: string) => string): string {
  if (c.name?.trim()) return c.name;
  if (c.type === "DM") return t("chat.directMessage");
  return c.type;
}

function typeTone(type: string): string {
  if (type === "DM") return "dm";
  if (type === "CHANNEL") return "channel";
  return "group";
}

export const ConversationList = memo(function ConversationList({
  items,
  activeId,
  loading,
  error,
  onSelect,
  onRetry,
  search,
  onSearchChange,
  onLoadMore,
  hasMore,
  loadingMore,
}: {
  items: ChatConversationListItem[];
  activeId: string | null;
  loading: boolean;
  error: boolean;
  onSelect: (id: string) => void;
  onRetry: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
}) {
  const { t, lang } = useI18n();
  const typing = useChatUiStore((s) => s.typingByConversation);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const title = (c.name || c.last_message_preview || c.type).toLowerCase();
      return title.includes(q);
    });
  }, [items, search]);

  return (
    <aside className="chat-list" aria-label={t("chat.conversations")}>
      <div className="chat-list-header">
        <div>
          <p className="chat-list-kicker">{t("chat.title")}</p>
          <h2 className="chat-list-title">{t("chat.conversations")}</h2>
        </div>
        <input
          className="chat-input chat-list-search"
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("chat.searchConversations")}
          aria-label={t("chat.searchConversations")}
        />
      </div>
      <div className="chat-list-body" role="list">
        {loading && (
          <div className="chat-skeleton-stack" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="chat-skeleton chat-skeleton-row" />
            ))}
          </div>
        )}
        {!loading && error && (
          <div className="chat-empty">
            <p>{t("chat.loadError")}</p>
            <button type="button" className="btn btn-secondary" onClick={onRetry}>
              {t("common.retry")}
            </button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="chat-empty">
            <div className="chat-details-empty-orb" aria-hidden />
            <p>{t("chat.noConversations")}</p>
          </div>
        )}
        {!loading &&
          filtered.map((c) => {
            const isTyping = (typing[c.id] ?? []).length > 0;
            return (
              <button
                key={c.id}
                type="button"
                role="listitem"
                className={`chat-conv-item tone-${typeTone(c.type)}${activeId === c.id ? " is-active" : ""}`}
                onClick={() => onSelect(c.id)}
              >
                <div className="chat-conv-avatar" data-type={c.type}>
                  {(c.name || c.type).slice(0, 1).toUpperCase()}
                </div>
                <div className="chat-conv-meta">
                  <div className="chat-conv-top">
                    <span className="chat-conv-name">{conversationTitle(c, t)}</span>
                    <span className="chat-conv-time">{formatTime(c.last_message_at, lang)}</span>
                  </div>
                  <div className="chat-conv-bottom">
                    <span className={`chat-conv-preview${isTyping ? " is-typing" : ""}`}>
                      {isTyping
                        ? t("chat.typing")
                        : c.last_message_preview || t("chat.noMessagesYet")}
                    </span>
                    <span className="chat-conv-badges">
                      {c.is_muted ? <span title={t("chat.muted")}>🔇</span> : null}
                      {c.member_is_archived ? <span title={t("chat.archived")}>📦</span> : null}
                      {(c.unread_count ?? 0) > 0 ? (
                        <span className="chat-unread-badge">
                          {c.unread_is_capped ? `${c.unread_count}+` : c.unread_count}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        {hasMore && (
          <button
            type="button"
            className="btn btn-ghost chat-load-more"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? t("common.loading") : t("chat.loadMore")}
          </button>
        )}
      </div>
    </aside>
  );
});
