"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ModalPortal } from "@/components/ModalPortal";
import { useI18n } from "@/core/providers/I18nProvider";
import { httpClient } from "@/core/api/http-client";
import { employeeLabel, type Employee } from "@/features/vsm/types";
import { chatApi } from "../api";
import { MAX_FORWARD_TARGETS } from "../types";

export function NewConversationDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"dm" | "group" | "channel">("dm");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otherId, setOtherId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [memberIds, setMemberIds] = useState("");
  const [visibility, setVisibility] = useState("PRIVATE");
  const { data: employees = [] } = useQuery({
    queryKey: ["vsm-employees"],
    queryFn: () => httpClient.get<Employee[]>("/api/v1/employees"),
    enabled: open,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let conv;
      if (tab === "dm") {
        conv = await chatApi.createDM(otherId);
      } else if (tab === "group") {
        const ids = memberIds
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        conv = await chatApi.createGroup(name.trim(), ids);
      } else {
        conv = await chatApi.createChannel({
          name: name.trim(),
          slug: slug.trim() || undefined,
          visibility,
        });
      }
      onCreated(conv.id);
      onClose();
    } catch {
      setError(t("chat.createFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
      <div className="modal-backdrop active" onClick={() => !busy && onClose()}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
          <div className="modal-header">
            <h3 className="modal-title">{t("chat.newConversation")}</h3>
            <button type="button" className="modal-close" onClick={onClose} aria-label={t("common.close")}>
              ✕
            </button>
          </div>
          <div className="modal-body">
            <div className="chat-tabs">
              {(["dm", "group", "channel"] as const).map((x) => (
                <button
                  key={x}
                  type="button"
                  className={tab === x ? "is-active" : undefined}
                  onClick={() => setTab(x)}
                >
                  {t(`chat.tab.${x}`)}
                </button>
              ))}
            </div>
            {tab === "dm" && (
              <label className="chat-field">
                {t("chat.selectEmployee")}
                <select value={otherId} onChange={(e) => setOtherId(e.target.value)}>
                  <option value="">{t("common.select")}</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {employeeLabel(e)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {tab === "group" && (
              <>
                <label className="chat-field">
                  {t("common.name")}
                  <input className="chat-input" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="chat-field">
                  {t("chat.memberIdsHint")}
                  <input
                    className="chat-input"
                    value={memberIds}
                    onChange={(e) => setMemberIds(e.target.value)}
                  />
                </label>
                <div className="chat-employee-chips">
                  {employees.slice(0, 40).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        setMemberIds((prev) =>
                          prev.includes(e.id) ? prev : prev ? `${prev},${e.id}` : e.id,
                        )
                      }
                    >
                      {employeeLabel(e)}
                    </button>
                  ))}
                </div>
              </>
            )}
            {tab === "channel" && (
              <>
                <label className="chat-field">
                  {t("common.name")}
                  <input className="chat-input" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="chat-field">
                  {t("chat.slug")}
                  <input className="chat-input" value={slug} onChange={(e) => setSlug(e.target.value)} />
                </label>
                <label className="chat-field">
                  {t("chat.visibility")}
                  <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                    <option value="PRIVATE">PRIVATE</option>
                    <option value="PUBLIC">PUBLIC</option>
                  </select>
                </label>
              </>
            )}
            {error && <p className="chat-error">{error}</p>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
              {busy ? t("common.processing") : t("common.create")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export function ForwardDialog({
  open,
  messageId,
  conversations,
  onClose,
  onForward,
}: {
  open: boolean;
  messageId: string | null;
  conversations: { id: string; name?: string | null; type: string }[];
  onClose: () => void;
  onForward: (ids: string[]) => Promise<void>;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return conversations.filter((c) => !qq || (c.name || c.type).toLowerCase().includes(qq));
  }, [conversations, q]);

  if (!open || !messageId) return null;

  return (
    <ModalPortal>
      <div className="modal-backdrop active" onClick={() => !busy && onClose()}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
          <div className="modal-header">
            <h3 className="modal-title">{t("chat.forward")}</h3>
            <button type="button" className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="modal-body">
            <input
              className="chat-input"
              placeholder={t("common.search")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <ul className="chat-forward-list">
              {filtered.map((c) => {
                const on = selected.includes(c.id);
                return (
                  <li key={c.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && selected.length >= MAX_FORWARD_TARGETS}
                        onChange={() =>
                          setSelected((prev) =>
                            on ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                          )
                        }
                      />
                      {c.name || c.type}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || selected.length === 0}
              onClick={async () => {
                setBusy(true);
                try {
                  await onForward(selected);
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("chat.forward")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
