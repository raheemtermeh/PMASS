"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ChatMessage } from "../types";
import { SafeMarkdown } from "../SafeMarkdown";
import { useChatUiStore } from "../ui-store";
import { useI18n } from "@/core/providers/I18nProvider";
import { REACTION_EMOJIS } from "../types";

function initials(id: string): string {
  return id.slice(0, 2).toUpperCase();
}

export const MessageList = memo(function MessageList({
  messages,
  myEmployeeId,
  nameByEmployee,
  loading,
  loadingOlder,
  hasOlder,
  onLoadOlder,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onBookmark,
  onPin,
  onForward,
  onReport,
  onOpenThread,
}: {
  messages: ChatMessage[];
  myEmployeeId: string | null;
  nameByEmployee: Record<string, string>;
  loading: boolean;
  loadingOlder: boolean;
  hasOlder: boolean;
  onLoadOlder: () => void;
  onReply: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onBookmark: (m: ChatMessage) => void;
  onPin: (m: ChatMessage) => void;
  onForward: (m: ChatMessage) => void;
  onReport: (m: ChatMessage) => void;
  onOpenThread: (m: ChatMessage) => void;
}) {
  const { t, lang } = useI18n();
  const parentRef = useRef<HTMLDivElement>(null);
  const highlightId = useChatUiStore((s) => s.highlightMessageId);
  const newCount = useChatUiStore((s) => s.newMessageCount);
  const clearNew = useChatUiStore((s) => s.clearNewMessages);
  const bumpNew = useChatUiStore((s) => s.bumpNewMessages);
  const atBottomRef = useRef(true);
  const prevLenRef = useRef(0);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 12,
  });

  const scrollToBottom = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    clearNew();
  }, [clearNew]);

  const closeMenu = useCallback(() => {
    setMenuId(null);
    setMenuPos(null);
  }, []);

  const openMenu = useCallback((messageId: string) => {
    if (menuId === messageId) {
      closeMenu();
      return;
    }
    const btn = menuBtnRefs.current.get(messageId);
    if (!btn) {
      setMenuId(messageId);
      return;
    }
    const rect = btn.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight && rect.top > menuHeight;
    const top = openUp ? Math.max(8, rect.top - menuHeight - 6) : rect.bottom + 6;
    let left = rect.right - menuWidth;
    left = Math.min(Math.max(8, left), window.innerWidth - menuWidth - 8);
    setMenuPos({ top, left });
    setMenuId(messageId);
  }, [menuId, closeMenu]);

  useLayoutEffect(() => {
    if (loading) return;
    if (prevLenRef.current === 0 && messages.length > 0) {
      scrollToBottom();
    } else if (messages.length > prevLenRef.current) {
      if (atBottomRef.current) scrollToBottom();
      else bumpNew();
    }
    prevLenRef.current = messages.length;
  }, [messages.length, loading, scrollToBottom, bumpNew]);

  useEffect(() => {
    if (!highlightId) return;
    const idx = messages.findIndex((m) => m.id === highlightId);
    if (idx >= 0) {
      virtualizer.scrollToIndex(idx, { align: "center" });
      const tmr = setTimeout(() => useChatUiStore.getState().setHighlightMessageId(null), 2500);
      return () => clearTimeout(tmr);
    }
  }, [highlightId, messages, virtualizer]);

  useEffect(() => {
    if (!menuId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    const onScroll = () => closeMenu();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", closeMenu);
    parentRef.current?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", closeMenu);
      parentRef.current?.removeEventListener("scroll", onScroll);
    };
  }, [menuId, closeMenu]);

  const onScroll = () => {
    const el = parentRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = dist < 80;
    if (atBottomRef.current) clearNew();
    if (el.scrollTop < 80 && hasOlder && !loadingOlder) {
      const prevHeight = el.scrollHeight;
      onLoadOlder();
      requestAnimationFrame(() => {
        if (!parentRef.current) return;
        parentRef.current.scrollTop =
          parentRef.current.scrollHeight - prevHeight + parentRef.current.scrollTop;
      });
    }
  };

  const rows = useMemo(() => messages, [messages]);
  const activeMenuMessage = menuId ? rows.find((m) => m.id === menuId) : null;

  if (loading && rows.length === 0) {
    return (
      <div className="chat-messages chat-skeleton-stack" aria-busy="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="chat-skeleton chat-skeleton-msg" />
        ))}
      </div>
    );
  }

  if (!loading && rows.length === 0) {
    return (
      <div className="chat-messages chat-empty">
        <p>{t("chat.noMessagesYet")}</p>
      </div>
    );
  }

  const menu =
    activeMenuMessage && menuPos && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              type="button"
              className="chat-msg-menu-backdrop"
              aria-label={t("common.close")}
              onClick={closeMenu}
            />
            <div
              className="chat-msg-menu chat-msg-menu--portal"
              role="menu"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onReply(activeMenuMessage);
                  closeMenu();
                }}
              >
                {t("chat.reply")}
              </button>
              {myEmployeeId === activeMenuMessage.sender_id && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onEdit(activeMenuMessage);
                    closeMenu();
                  }}
                >
                  {t("common.edit")}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onDelete(activeMenuMessage);
                  closeMenu();
                }}
              >
                {t("common.delete")}
              </button>
              <div className="chat-react-picker" role="group" aria-label={t("chat.reply")}>
                {REACTION_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      onReact(activeMenuMessage, e);
                      closeMenu();
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onBookmark(activeMenuMessage);
                  closeMenu();
                }}
              >
                {t("chat.bookmark")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onPin(activeMenuMessage);
                  closeMenu();
                }}
              >
                {t("chat.pin")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onForward(activeMenuMessage);
                  closeMenu();
                }}
              >
                {t("chat.forward")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenThread(activeMenuMessage);
                  closeMenu();
                }}
              >
                {t("chat.thread")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onReport(activeMenuMessage);
                  closeMenu();
                }}
              >
                {t("chat.report")}
              </button>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div className="chat-messages-wrap">
      <div
        ref={parentRef}
        className="chat-messages"
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {loadingOlder && <div className="chat-load-older">{t("common.loading")}</div>}
        <div
          style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((vr) => {
            const m = rows[vr.index];
            const mine = myEmployeeId === m.sender_id;
            const deleted = Boolean(m.deleted_at);
            const reactionMap = new Map<string, { count: number; mine: boolean }>();
            for (const r of m.reactions ?? []) {
              const cur = reactionMap.get(r.emoji) ?? { count: 0, mine: false };
              cur.count += 1;
              if (r.employee_id === myEmployeeId) cur.mine = true;
              reactionMap.set(r.emoji, cur);
            }
            return (
              <div
                key={m.id}
                data-index={vr.index}
                ref={virtualizer.measureElement}
                className={`chat-msg-row${mine ? " is-mine" : ""}${highlightId === m.id ? " is-highlight" : ""}${menuId === m.id ? " is-menu-open" : ""}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vr.start}px)`,
                }}
              >
                <div className="chat-msg-avatar" aria-hidden>
                  {initials(nameByEmployee[m.sender_id] || m.sender_id)}
                </div>
                <div className="chat-msg-bubble">
                  <div className="chat-msg-head">
                    <span className="chat-msg-sender">
                      {nameByEmployee[m.sender_id] || m.sender_id.slice(0, 8)}
                    </span>
                    <time dateTime={m.created_at}>
                      {new Date(m.created_at).toLocaleTimeString(
                        lang === "fa" ? "fa-IR" : "en-US",
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                    </time>
                    {!deleted && (
                      <button
                        type="button"
                        className="chat-msg-more"
                        aria-label={t("common.actions")}
                        aria-expanded={menuId === m.id}
                        ref={(el) => {
                          if (el) menuBtnRefs.current.set(m.id, el);
                          else menuBtnRefs.current.delete(m.id);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openMenu(m.id);
                        }}
                      >
                        ⋯
                      </button>
                    )}
                  </div>
                  {m.parent_message_id && !deleted && (
                    <div className="chat-msg-reply-ref">{t("chat.reply")}</div>
                  )}
                  {m.message_type === "FORWARD" && !deleted && (
                    <div className="chat-msg-forward-ref">{t("chat.forwarded")}</div>
                  )}
                  <div className={`chat-msg-body${deleted ? " is-deleted" : ""}`}>
                    {deleted ? (
                      t("chat.messageDeleted")
                    ) : (
                      <SafeMarkdown text={m.content} format={m.content_format} />
                    )}
                  </div>
                  {m.is_edited && !deleted && (
                    <span className="chat-msg-edited">{t("chat.edited")}</span>
                  )}
                  {!deleted && reactionMap.size > 0 && (
                    <div className="chat-msg-reactions">
                      {[...reactionMap.entries()].map(([emoji, info]) => (
                        <button
                          key={emoji}
                          type="button"
                          className={`chat-reaction${info.mine ? " is-active" : ""}`}
                          onClick={() => onReact(m, emoji)}
                        >
                          {emoji} {info.count}
                        </button>
                      ))}
                    </div>
                  )}
                  {(m.thread_reply_count ?? 0) > 0 && (
                    <button
                      type="button"
                      className="chat-thread-link"
                      onClick={() => onOpenThread(m)}
                    >
                      {t("chat.repliesCount").replace(
                        "{count}",
                        String(m.thread_reply_count),
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {newCount > 0 && (
        <button type="button" className="chat-new-pill" onClick={scrollToBottom}>
          {t("chat.newMessages").replace("{count}", String(newCount))}
        </button>
      )}
      {menu}
    </div>
  );
});
