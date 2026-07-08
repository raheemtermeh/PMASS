/**
 * Client-side URL and text safety helpers (defense-in-depth against XSS / open redirects).
 */

const ALLOWED_URL_PROTOCOLS = new Set(["https:", "http:"]);

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
