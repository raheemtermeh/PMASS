"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/core/providers/I18nProvider";
import type { ChatMember, ChatMessage } from "../types";
import { MAX_MESSAGE_LENGTH } from "../types";
import { useChatUiStore } from "../ui-store";
import { getChatSocket } from "../ws/manager";

export function Composer({
  conversationId,
  disabled,
  disabledReason,
  members,
  nameByEmployee,
  draftContent,
  draftUpdatedAt,
  onSend,
  onSaveDraft,
  onCancelEdit,
  sending,
}: {
  conversationId: string;
  disabled?: boolean;
  disabledReason?: string;
  members: ChatMember[];
  nameByEmployee: Record<string, string>;
  draftContent: string;
  draftUpdatedAt?: string;
  onSend: (content: string) => Promise<void>;
  onSaveDraft: (content: string, updatedAt?: string) => Promise<void>;
  onCancelEdit: () => void;
  sending: boolean;
}) {
  const { t } = useI18n();
  const replyTo = useChatUiStore((s) => s.replyTo);
  const editing = useChatUiStore((s) => s.editing);
  const setReplyTo = useChatUiStore((s) => s.setReplyTo);
  const [text, setText] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIdx, setMentionIdx] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActive = useRef(false);
  const hydrated = useRef<string | null>(null);

  useEffect(() => {
    if (hydrated.current === conversationId) return;
    hydrated.current = conversationId;
    setText(draftContent || "");
  }, [conversationId, draftContent]);

  useEffect(() => {
    if (editing) {
      setText(editing.content);
      taRef.current?.focus();
    }
  }, [editing]);

  const suggestions = useMemo(() => {
    if (!mentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .map((m) => ({
        id: m.employee_id,
        label: nameByEmployee[m.employee_id] || m.employee_id.slice(0, 8),
      }))
      .filter((x) => !q || x.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [mentionOpen, mentionQuery, members, nameByEmployee]);

  const stopTyping = useCallback(() => {
    if (!typingActive.current) return;
    typingActive.current = false;
    getChatSocket().typingStop(conversationId);
    if (typingTimer.current) clearTimeout(typingTimer.current);
  }, [conversationId]);

  useEffect(() => () => stopTyping(), [stopTyping, conversationId]);

  const scheduleDraft = (value: string) => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      void onSaveDraft(value, draftUpdatedAt);
    }, 700);
  };

  const onChange = (value: string) => {
    setText(value);
    scheduleDraft(value);

    const caret = taRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const at = before.match(/@([\w.\u0600-\u06FF]*)$/);
    if (at) {
      setMentionOpen(true);
      setMentionQuery(at[1] ?? "");
      setMentionIdx(0);
    } else {
      setMentionOpen(false);
    }

    if (value.trim() && !disabled) {
      if (!typingActive.current) {
        typingActive.current = true;
        getChatSocket().typingStart(conversationId);
      }
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(stopTyping, 2500);
    } else {
      stopTyping();
    }
  };

  const insertMention = (label: string) => {
    const el = taRef.current;
    if (!el) return;
    const caret = el.selectionStart;
    const before = text.slice(0, caret).replace(/@([\w.\u0600-\u06FF]*)$/, `@${label} `);
    const after = text.slice(caret);
    const next = before + after;
    setText(next);
    setMentionOpen(false);
    scheduleDraft(next);
  };

  const submit = async () => {
    const content = text.trim();
    if (!content || disabled || sending) return;
    if (content.length > MAX_MESSAGE_LENGTH) return;
    stopTyping();
    if (draftTimer.current) clearTimeout(draftTimer.current);
    await onSend(content);
    setText("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        insertMention(suggestions[mentionIdx].label);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="chat-composer">
      {(replyTo || editing) && (
        <div className="chat-composer-banner">
          <span>
            {editing
              ? t("chat.editing")
              : `${t("chat.replyingTo")}: ${(replyTo as ChatMessage).content.slice(0, 80)}`}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (editing) onCancelEdit();
              else setReplyTo(null);
              if (editing) setText(draftContent || "");
            }}
          >
            {t("common.cancel")}
          </button>
        </div>
      )}
      {disabled && disabledReason && (
        <div className="chat-composer-disabled" role="status">
          {disabledReason}
        </div>
      )}
      <div className="chat-composer-row">
        <textarea
          ref={taRef}
          className="chat-input chat-composer-input"
          rows={2}
          value={text}
          disabled={disabled || sending}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={t("chat.messagePlaceholder")}
          aria-label={t("chat.messagePlaceholder")}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled || sending || !text.trim()}
          onClick={() => void submit()}
        >
          {sending ? t("common.processing") : editing ? t("common.save") : t("chat.send")}
        </button>
      </div>
      {mentionOpen && suggestions.length > 0 && (
        <ul className="chat-mention-menu" role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={i === mentionIdx ? "is-active" : undefined}
                role="option"
                aria-selected={i === mentionIdx}
                onClick={() => insertMention(s.label)}
              >
                @{s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
