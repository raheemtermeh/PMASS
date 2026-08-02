/** Login portal identifiers — keep in sync with backend auth.Portal* constants. */
export type AuthPortal = "platform" | "company_admin" | "employee";

const LAST_PORTAL_KEY = "pmas-live-last-portal";

export function setLastAuthPortal(portal: AuthPortal): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LAST_PORTAL_KEY, portal);
  } catch {
    /* private mode / quota */
  }
}

export function getLastAuthPortal(): AuthPortal | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(LAST_PORTAL_KEY);
    if (v === "platform" || v === "company_admin" || v === "employee") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function loginPathForPortal(portal?: string | null): string {
  switch (portal) {
    case "platform":
      return "/platform/login";
    case "employee":
      return "/employee/login";
    case "company_admin":
    default:
      return "/welcome#login";
  }
}

/** Prefer role when known; fall back to last portal used on this browser. */
export function resolveSignOutPath(role?: string | null): string {
  const normalized = (role ?? "").trim().toLowerCase();
  if (normalized === "platform_admin" || normalized === "super_admin") {
    return "/platform/login";
  }
  if (normalized === "user") {
    return "/employee/login";
  }
  if (normalized === "tenant_admin") {
    return "/welcome#login";
  }
  return loginPathForPortal(getLastAuthPortal());
}
