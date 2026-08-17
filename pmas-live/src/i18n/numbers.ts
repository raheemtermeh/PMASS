import type { Lang } from "./translations";

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Latin → Persian digits. Non-digit characters pass through untouched. */
export function toPersianDigits(value: string): string {
  return value.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** Persian/Arabic-Indic digits → Latin, for values sent back to the API. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function localeTag(lang: Lang): string {
  return lang === "fa" ? "fa-IR" : "en-US";
}

/** Locale-aware number formatting (Persian digits + grouping when lang is fa). */
export function formatNumber(
  value: number | null | undefined,
  lang: Lang,
  options?: Intl.NumberFormatOptions,
): string {
  if (value == null || !Number.isFinite(value)) return lang === "fa" ? "—" : "—";
  return new Intl.NumberFormat(localeTag(lang), options).format(value);
}

/** Locale-aware date formatting; Persian uses the Jalali calendar. */
export function formatDate(
  value: string | number | Date | null | undefined,
  lang: Lang,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
): string {
  if (value == null || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const tag = lang === "fa" ? "fa-IR-u-ca-persian" : "en-US";
  return new Intl.DateTimeFormat(tag, options).format(date);
}
