"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useI18n } from "@/core/providers/I18nProvider";

export type PageGuideId =
  | "home"
  | "organization"
  | "products"
  | "planning"
  | "status"
  | "users"
  | "profile"
  | "productDetail";

const STORAGE_PREFIX = "pmas-page-guide:";

interface PageGuideProps {
  page: PageGuideId;
  /** Max tips to read from i18n (`pageGuides.{page}.tipN`). */
  tipCount?: number;
}

/**
 * Collapsible how-to strip for each dashboard surface.
 * Remembers open/closed preference per page in localStorage.
 */
export function PageGuide({ page, tipCount = 4 }: PageGuideProps) {
  const { t } = useI18n();
  const panelId = useId();
  const storageKey = `${STORAGE_PREFIX}${page}`;
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "0") setOpen(false);
      else if (saved === "1") setOpen(true);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [storageKey]);

  const persist = useCallback(
    (next: boolean) => {
      setOpen(next);
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const tips = useMemo(() => {
    const out: string[] = [];
    for (let i = 1; i <= tipCount; i += 1) {
      const key = `pageGuides.${page}.tip${i}`;
      const value = t(key);
      if (value && value !== key) out.push(value);
    }
    return out;
  }, [page, tipCount, t]);

  const title = t(`pageGuides.${page}.title`);
  const subtitle = t(`pageGuides.${page}.subtitle`);
  if (!tips.length || title === `pageGuides.${page}.title`) return null;

  return (
    <aside
      className={`page-guide${open ? " open" : " collapsed"}${hydrated ? " ready" : ""}`}
      aria-label={title}
    >
      <div className="page-guide-glow" aria-hidden />
      <button
        type="button"
        className="page-guide-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => persist(!open)}
      >
        <span className="page-guide-badge" aria-hidden>
          ?
        </span>
        <span className="page-guide-toggle-copy">
          <strong>{title}</strong>
          {!open ? <span className="page-guide-peek">{subtitle}</span> : null}
        </span>
        <span className="page-guide-chevron" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      <div id={panelId} className="page-guide-body" hidden={!open}>
        <p className="page-guide-subtitle">{subtitle}</p>
        <ol className="page-guide-tips">
          {tips.map((tip, index) => (
            <li key={`${page}-${index}`} className="page-guide-tip">
              <span className="page-guide-index" aria-hidden>
                {index + 1}
              </span>
              <span>{tip}</span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
