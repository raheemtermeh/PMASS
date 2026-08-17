"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LOCALE_DIR, translations, type Dict, type Lang } from "@/i18n/translations";
import { formatDate, formatNumber, toPersianDigits } from "@/i18n/numbers";

export interface I18nContextValue {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Locale-aware number (Persian digits under fa). */
  n: (value: number | null | undefined, options?: Intl.NumberFormatOptions) => string;
  /** Locale-aware date (Jalali calendar under fa). */
  d: (
    value: string | number | Date | null | undefined,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "pmas-live-lang";

/** Look up a dotted key (e.g. "nav.home") in a locale dictionary. */
export function lookup(dict: Dict, path: string): string | null {
  const parts = path.split(".");
  let node: Dict = dict;
  for (const part of parts) {
    if (node == null || typeof node !== "object") return null;
    const next = node[part];
    if (next == null) return null;
    node = next as Dict;
  }
  if (typeof node === "string") return node;
  return null;
}

function interpolate(
  template: string,
  lang: Lang,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_m, key) => {
    const value = vars[key];
    if (value == null) return _m;
    if (typeof value === "number") return formatNumber(value, lang);
    return lang === "fa" ? toPersianDigits(value) : value;
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    let initial: Lang = "en";
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "fa" || saved === "en") initial = saved;
    } catch {
      /* ignore */
    }
    applyLang(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyLang = useCallback((next: Lang) => {
    setLangState(next);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", next);
      document.documentElement.setAttribute("dir", LOCALE_DIR[next]);
    }
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const setLang = useCallback(
    (next: Lang) => applyLang(next),
    [applyLang],
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const found = lookup(translations[lang], key);
      const fallback = lang === "en" ? null : lookup(translations.en, key);
      return interpolate(found ?? fallback ?? key, lang, vars);
    },
    [lang],
  );

  const n = useCallback(
    (value: number | null | undefined, options?: Intl.NumberFormatOptions) =>
      formatNumber(value, lang, options),
    [lang],
  );

  const d = useCallback(
    (
      value: string | number | Date | null | undefined,
      options?: Intl.DateTimeFormatOptions,
    ) => formatDate(value, lang, options),
    [lang],
  );

  const dir = LOCALE_DIR[lang];

  const value = useMemo(
    () => ({ lang, dir, setLang, t, n, d }),
    [lang, dir, setLang, t, n, d],
  );

  // Render children immediately so pages hydrate; direction is set in an effect.
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return ctx;
}
