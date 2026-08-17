"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/core/providers/I18nProvider";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DISMISS_AFTER_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, DISMISS_AFTER_MS);
  }, []);

  const api = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted && toasts.length > 0
        ? createPortal(
            <div className="toast-stack" role="status" aria-live="polite">
              {toasts.map((toast) => (
                <div key={toast.id} className={`toast toast-${toast.tone}`}>
                  <span className="toast-icon" aria-hidden>
                    {toast.tone === "success" ? "✓" : toast.tone === "error" ? "!" : "i"}
                  </span>
                  <p>{toast.message}</p>
                  <button
                    type="button"
                    className="toast-close"
                    aria-label={t("toast.dismiss")}
                    onClick={() => setToasts((c) => c.filter((t) => t.id !== toast.id))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

/** Returns a no-op outside the provider so components stay usable in isolation. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? { showToast: () => {} };
}
