/**
 * Client-side URL and text safety helpers (defense-in-depth against XSS / open redirects).
 */

const ALLOWED_URL_PROTOCOLS = new Set(["https:", "http:"]);

/** Session keys for one-time secrets — never keep these in the address bar. */
export const RESET_TOKEN_SESSION_KEY = "pmas-reset-token";

/** Returns a safe http(s) URL or null when the value is dangerous/invalid. */
export function sanitizeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^javascript:/i.test(trimmed) || /^data:/i.test(trimmed) || /^vbscript:/i.test(trimmed)) {
    return null;
  }
  try {
    const url = new URL(trimmed, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (!ALLOWED_URL_PROTOCOLS.has(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Strip control characters that can break UI text sinks. */
export function sanitizeDisplayText(raw: string | null | undefined, max = 500): string {
  if (!raw) return "";
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, max);
}

/** Relative app path only (blocks protocol-relative and absolute URLs). */
export function sanitizeInternalPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  if (trimmed.includes("\\") || trimmed.includes("\0")) return "/";
  return trimmed.split("?")[0] ?? "/";
}

/** Store a short-lived secret for the next page (e.g. password-reset token). */
export function storeOneTimeSecret(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Quota or private mode — caller may fall back to in-memory state.
  }
}

/** Read and remove a one-time secret so it cannot be reused from storage. */
export function consumeOneTimeSecret(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

/** Remove sensitive query keys from the visible URL without reloading. */
export function stripQueryParamsFromBrowserUrl(keys: string[]): void {
  if (typeof window === "undefined" || keys.length === 0) return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of keys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

/** Accept UUID or positive integer resource ids only — blocks path-probing garbage. */
export function isSafeResourceId(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const id = raw.trim();
  if (!id || id.length > 64) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return true;
  }
  return /^[1-9][0-9]{0,18}$/.test(id);
}
