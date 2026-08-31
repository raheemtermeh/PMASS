"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/core/providers/I18nProvider";

export interface MoreMenuItem {
  id: string;
  label: string;
  onClick: () => void;
  tone?: "danger" | "default";
  disabled?: boolean;
}

interface MoreMenuProps {
  items: MoreMenuItem[];
  label?: string;
  /** Optional primary actions rendered before the ⋮ trigger. */
  leading?: ReactNode;
}

/** Groups secondary / destructive row actions behind a compact overflow menu. */
export function MoreMenu({ items, label, leading }: MoreMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0 && !leading) return null;

  return (
    <div className="more-menu" ref={rootRef}>
      {leading}
      {items.length > 0 ? (
        <>
          <button
            type="button"
            className="btn btn-sm more-menu-trigger"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((v) => !v)}
            title={label ?? t("common.moreActions")}
          >
            ⋮
          </button>
          {open ? (
            <ul className="more-menu-list" role="menu" id={menuId}>
              {items.map((item) => (
                <li key={item.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={`more-menu-item${item.tone === "danger" ? " danger" : ""}`}
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      item.onClick();
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
