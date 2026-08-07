"use client";

import { useI18n } from "@/core/providers/I18nProvider";
import { translations, type Dict } from "@/i18n/translations";
import { useState, useRef, useEffect } from "react";

function langLabel(dict: Dict, key: "english" | "persian"): string {
  const langDict = dict.lang as Dict;
  return (langDict[key] as string) ?? key;
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function choose(next: "en" | "fa") {
    setLang(next);
    setOpen(false);
  }

  const label = lang === "fa" ? "فارسی" : "English";

  return (
    <div className="lang-switch" ref={ref}>
      <button
        type="button"
        className="lang-switch-btn"
        aria-label={t("lang.label")}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("lang.label")}
        onClick={() => setOpen((v) => !v)}
      >
        {lang === "fa" ? (
          <span className="lang-switch-globe lang-switch-globe-fa">فا</span>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        )}
        {!compact ? <span className="lang-switch-label">{label}</span> : null}
      </button>
      {open ? (
        <div className="lang-switch-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className={lang === "en" ? "is-active" : ""}
            onClick={() => choose("en")}
          >
            <span className="lang-switch-flag">EN</span> {langLabel(translations.en, "english")}
          </button>
          <button
            type="button"
            role="menuitem"
            className={lang === "fa" ? "is-active" : ""}
            onClick={() => choose("fa")}
          >
            <span className="lang-switch-flag">فا</span> {langLabel(translations.en, "persian")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
