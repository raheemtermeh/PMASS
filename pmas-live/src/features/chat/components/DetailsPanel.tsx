"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/core/providers/I18nProvider";
import type {
  ChatConversationListItem,
  ChatMember,
  ChatPin,
  MemberRole,
  NotificationLevel,
} from "../types";

type PresenceInfo = { status: string; last_seen_at?: string | null } | null | undefined;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function typeLabel(type: string, t: (k: string) => string): string {
  if (type === "DM") return t("chat.directMessage");
  if (type === "GROUP") return t("chat.tab.group");
  if (type === "CHANNEL") return t("chat.tab.channel");
  return type;
}

export function DetailsPanel({
  conversation,
  members,
  pins,
  myEmployeeId,
  myRole,
  canModerate,
  nameByEmployee,
  peerPresence,
  onClose,
  onMute,
  onNotificationLevel,
  onArchive,
  onUnarchive,
  onAddMember,
  onRemoveMember,
  onChangeRole,
  onTransferOwner,
  onLeave,
  onJumpPin,
  onInvite,
}: {
  conversation: ChatConversationListItem | null;
  members: ChatMember[];
  pins: ChatPin[];
  myEmployeeId: string | null;
  myRole: MemberRole | null;
  canModerate: boolean;
  nameByEmployee: Record<string, string>;
  peerPresence?: PresenceInfo;
  onClose: () => void;
  onMute: (muted: boolean) => void;
  onNotificationLevel: (level: NotificationLevel) => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onAddMember: (employeeId: string) => void;
  onRemoveMember: (employeeId: string) => void;
  onChangeRole: (employeeId: string, role: MemberRole) => void;
  onTransferOwner: (employeeId: string) => void;
  onLeave: () => void;
  onJumpPin: (messageId: string) => void;
  onInvite: (employeeId: string) => void;
}) {
  const { t, lang } = useI18n();
  const [memberId, setMemberId] = useState("");
  const canManage = canModerate || myRole === "owner" || myRole === "admin";

  const peer = useMemo(() => {
    if (!conversation || conversation.type !== "DM") return null;
    return members.find((m) => m.employee_id !== myEmployeeId) ?? null;
  }, [conversation, members, myEmployeeId]);

  const title = useMemo(() => {
    if (!conversation) return "";
    if (conversation.type === "DM" && peer) {
      return nameByEmployee[peer.employee_id] || peer.employee_id.slice(0, 8);
    }
    return conversation.name || typeLabel(conversation.type, t);
  }, [conversation, peer, nameByEmployee, t]);

  const presenceStatus = peerPresence?.status || "offline";
  const presenceLabel = t(`chat.presence.${presenceStatus}`);
  const lastSeen =
    peerPresence?.last_seen_at &&
    new Date(peerPresence.last_seen_at).toLocaleString(lang === "fa" ? "fa-IR" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  if (!conversation) {
    return (
      <aside className="chat-details chat-details--empty" aria-label={t("chat.details")}>
        <div className="chat-details-empty">
          <div className="chat-details-empty-orb" aria-hidden />
          <p className="chat-list-kicker">{t("chat.details")}</p>
          <h3>{t("chat.selectConversation")}</h3>
        </div>
      </aside>
    );
  }

  const isDM = conversation.type === "DM";
  const notif = conversation.notification_level || "all";
  const memberCount = members.length || conversation.member_count || (isDM ? 2 : 0);

  return (
    <aside
      className={`chat-details chat-details--${conversation.type.toLowerCase()}`}
      aria-label={t("chat.details")}
    >
      <div className="chat-details-topbar">
        <div>
          <p className="chat-details-kicker">{t("chat.details")}</p>
          <p className="chat-details-topbar-sub">{typeLabel(conversation.type, t)}</p>
        </div>
        <button
          type="button"
          className="chat-details-close"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          ✕
        </button>
      </div>

      <div className="chat-details-body">
        <section className={`chat-details-profile${isDM ? " is-dm" : ""}`}>
          <div className="chat-details-profile-shine" aria-hidden />
          <div className="chat-details-profile-row">
            <div className={`chat-details-avatar status-${isDM ? presenceStatus : "idle"}`}>
              <span>{initials(title)}</span>
              {isDM ? <i className={`chat-presence-dot status-${presenceStatus}`} /> : null}
            </div>
            <div className="chat-details-profile-copy">
              <span className="chat-type-chip">{typeLabel(conversation.type, t)}</span>
              <h3 title={title}>{title}</h3>
              {isDM ? (
                <div className="chat-details-presence">
                  <span className={`chat-presence-pill status-${presenceStatus}`}>
                    <i className={`chat-presence-live status-${presenceStatus}`} aria-hidden />
                    {presenceLabel}
                  </span>
                  {lastSeen && presenceStatus === "offline" ? (
                    <span className="chat-details-last-seen">{lastSeen}</span>
                  ) : null}
                </div>
              ) : (
                <p className="chat-details-profile-meta">
                  {conversation.description?.trim() ||
                    `${t("common.members")} · ${memberCount}`}
                </p>
              )}
            </div>
          </div>

          <div className="chat-details-stats" role="group" aria-label={t("chat.details")}>
            <div className="chat-stat">
              <strong>{memberCount}</strong>
              <span>{t("common.members")}</span>
            </div>
            <div className="chat-stat">
              <strong>{pins.length}</strong>
              <span>{t("chat.pinned")}</span>
            </div>
            <div className="chat-stat">
              <strong>{conversation.unread_count ?? 0}</strong>
              <span>{t("dashboard.unread")}</span>
            </div>
          </div>
        </section>

        <section className="chat-details-section">
          <div className="chat-details-section-head">
            <h4>{t("chat.settings")}</h4>
          </div>
          <div className="chat-settings-grid">
            <button
              type="button"
              className={`chat-setting-tile${conversation.is_muted ? " is-on" : ""}`}
              onClick={() => onMute(!conversation.is_muted)}
            >
              <span className="chat-setting-icon" aria-hidden>
                {conversation.is_muted ? "🔇" : "🔔"}
              </span>
              <span className="chat-setting-label">{t("chat.mute")}</span>
              <span className="chat-setting-state">
                {conversation.is_muted ? t("common.yes") : t("common.no")}
              </span>
            </button>
            <button
              type="button"
              className={`chat-setting-tile${conversation.member_is_archived ? " is-on" : ""}`}
              onClick={() => (conversation.member_is_archived ? onUnarchive() : onArchive())}
            >
              <span className="chat-setting-icon" aria-hidden>
                📦
              </span>
              <span className="chat-setting-label">
                {conversation.member_is_archived ? t("chat.unarchive") : t("chat.archive")}
              </span>
              <span className="chat-setting-state">
                {conversation.member_is_archived ? t("chat.archived") : "—"}
              </span>
            </button>
          </div>

          <div className="chat-notif-level" role="group" aria-label={t("chat.notificationLevel")}>
            <p className="chat-field-label">{t("chat.notificationLevel")}</p>
            <div className="chat-segmented">
              {(
                [
                  ["all", t("chat.notifAll")],
                  ["mentions", t("chat.notifMentions")],
                  ["none", t("chat.notifNone")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={notif === value ? "is-active" : undefined}
                  onClick={() => onNotificationLevel(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="chat-leave-btn" onClick={onLeave}>
            {t("chat.leave")}
          </button>
        </section>

        <section className="chat-details-section">
          <div className="chat-details-section-head">
            <h4>{t("chat.pinned")}</h4>
            <span className="chat-count-chip">{pins.length}</span>
          </div>
          {pins.length === 0 ? (
            <div className="chat-details-blank">{t("chat.noPins")}</div>
          ) : (
            <ul className="chat-pin-list">
              {pins.map((p, i) => (
                <li key={p.message_id} style={{ animationDelay: `${i * 40}ms` }}>
                  <button
                    type="button"
                    className="chat-pin-card"
                    onClick={() => onJumpPin(p.message_id)}
                  >
                    <span className="chat-pin-mark" aria-hidden>
                      📌
                    </span>
                    <span className="chat-pin-text">
                      {(p.message?.content || p.message_id).slice(0, 100)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="chat-details-section">
          <div className="chat-details-section-head">
            <h4>{t("common.members")}</h4>
            <span className="chat-count-chip">{members.length}</span>
          </div>

          {canManage && !isDM && (
            <div className="chat-member-invite">
              <input
                className="chat-input"
                placeholder={t("chat.employeeId")}
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              />
              <div className="chat-member-invite-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (!memberId.trim()) return;
                    onAddMember(memberId.trim());
                    setMemberId("");
                  }}
                >
                  {t("common.add")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (!memberId.trim()) return;
                    onInvite(memberId.trim());
                    setMemberId("");
                  }}
                >
                  {t("chat.invite")}
                </button>
              </div>
            </div>
          )}

          <ul className="chat-member-list">
            {members.map((m, i) => {
              const name = nameByEmployee[m.employee_id] || m.employee_id.slice(0, 8);
              const mine = m.employee_id === myEmployeeId;
              return (
                <li
                  key={m.employee_id}
                  className={`chat-member-card${mine ? " is-me" : ""}`}
                  style={{ animationDelay: `${i * 35}ms` }}
                >
                  <div className="chat-member-main">
                    <div className="chat-member-avatar" aria-hidden>
                      {initials(name)}
                    </div>
                    <div className="chat-member-meta">
                      <strong>
                        {name}
                        {mine ? <em> · me</em> : null}
                      </strong>
                      <span className={`chat-role-badge role-${m.role}`}>{m.role}</span>
                    </div>
                  </div>
                  {canManage && !mine && m.role !== "owner" && (
                    <div className="chat-member-actions">
                      <select
                        value={m.role}
                        aria-label={t("common.role")}
                        onChange={(e) =>
                          onChangeRole(m.employee_id, e.target.value as MemberRole)
                        }
                      >
                        <option value="admin">admin</option>
                        <option value="moderator">moderator</option>
                        <option value="member">member</option>
                      </select>
                      <button type="button" onClick={() => onRemoveMember(m.employee_id)}>
                        {t("common.remove")}
                      </button>
                      {myRole === "owner" && (
                        <button type="button" onClick={() => onTransferOwner(m.employee_id)}>
                          {t("chat.transferOwner")}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </aside>
  );
}
