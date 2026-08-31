"use client";

import { useEffect, useId, useRef } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import { useI18n } from "@/core/providers/I18nProvider";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Accessible confirmation dialog — replaces browser `window.confirm`. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "default",
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="modal-backdrop active confirm-dialog-backdrop"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onClick={() => !busy && onCancel()}
      >
        <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title" id={titleId}>
              {title}
            </h3>
            <button
              type="button"
              className="modal-close"
              onClick={() => !busy && onCancel()}
              aria-label={t("common.close")}
            >
              ×
            </button>
          </div>
          {description ? (
            <div className="modal-body">
              <p className="confirm-dialog-desc" id={descId}>
                {description}
              </p>
            </div>
          ) : null}
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>
              {cancelLabel ?? t("common.cancel")}
            </button>
            <button
              ref={confirmRef}
              type="button"
              className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? t("common.processing") : confirmLabel ?? t("common.confirm")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
