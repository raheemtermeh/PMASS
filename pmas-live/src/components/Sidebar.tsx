"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import { useMobileNav } from "@/components/MobileNavContext";
import { useI18n } from "@/core/providers/I18nProvider";
import { NavIcon, navLabels } from "@/lib/navigation";
import { isPlatformRole } from "@/shared/permissions";
import { resolveSignOutPath } from "@/shared/auth-portals";
import {
  canAccessRoute,
  platformNavGroups,
  routes,
  tenantNavItems,
  type ViewId,
} from "@/shared/routes";

interface AccessRequestRow {
  id: number;
  status: string;
}

const COLLAPSE_KEY = "pmas-sidebar-collapsed";

function isNavVisible(
  id: ViewId,
  platform: boolean,
  hasTenant: boolean,
  role: string,
  permissions: string[],
): boolean {
  if (platform && routes[id].platformOnly) return true;
  if (platform && id === "profile") return true;
  return canAccessRoute(routes[id], role, permissions, hasTenant);
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={`rail-collapse-icon${collapsed ? " is-collapsed" : ""}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="3" y="4" width="7" height="16" rx="1.5" opacity="0.35" />
      <path d="M14 8l-3 4 3 4" />
      <path d="M18 8l-3 4 3 4" opacity="0.45" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { close: closeMobileNav } = useMobileNav();

  const platform = Boolean(user && isPlatformRole(user.role));
  const hasTenant = Boolean(user?.tenant_id);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* private mode */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const { data: pendingRequests = [] } = useQuery({
    queryKey: ["access-requests", "pending", "sidebar"],
    queryFn: () =>
      httpClient.get<AccessRequestRow[]>("/api/v1/access-requests?status=pending"),
    enabled: Boolean(user) && platform,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!user) return null;

  const pendingCount = pendingRequests.length;
  const profileActive = pathname === "/profile" || pathname.startsWith("/profile/");

  const initials = user.full_name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const tenantNav = tenantNavItems.filter((id) =>
    isNavVisible(id, platform, hasTenant, user.role, user.permissions),
  );

  const roleLabel = platform
    ? t("role.platformAdmin")
    : user.role === "tenant_admin"
      ? t("role.companyAdmin")
      : t("role.employee");

  const workspaceLabel = user.tenant?.name ?? "Platform";
  const workspaceId = user.tenant?.slug ?? "platform";

  function renderNavItem(viewId: ViewId, staggerIndex = 0) {
    const route = routes[viewId];
    const isActive = pathname === route.path || pathname.startsWith(`${route.path}/`);
    const showBadge = viewId === "platform-access-requests" && pendingCount > 0;
    const label = t(navLabels[viewId]);

    return (
      <li
        key={viewId}
        className={`nav-item nav-item-stagger${isActive ? " active" : ""}`}
        style={{ animationDelay: `${0.05 + staggerIndex * 0.028}s` }}
      >
        <Link
          href={route.path}
          onClick={closeMobileNav}
          data-tooltip={label}
          aria-current={isActive ? "page" : undefined}
        >
          <span className="rail-nav-icon" aria-hidden>
            <NavIcon viewId={viewId} />
          </span>
          <span className="rail-nav-label">{label}</span>
          {showBadge ? (
            <span
              className={`nav-badge${collapsed ? " is-dot" : ""}`}
              aria-label={`${pendingCount} pending requests`}
            >
              {collapsed ? "" : pendingCount}
            </span>
          ) : null}
        </Link>
      </li>
    );
  }

  return (
    <aside className={`sidebar sidebar-alive rail${collapsed ? " collapsed" : ""}`}>
      <div className="rail-ambient" aria-hidden>
        <span className="rail-wash" />
        <span className="rail-grid" />
      </div>

      <div className="brand-container sidebar-brand-alive rail-brand">
        <div className="rail-brand-mark">
          <svg className="brand-logo-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9.5 11.5l2.5 2.5 3.5-4" opacity="0.85" />
          </svg>
          <span className="rail-live-dot" />
        </div>
        <div className="rail-brand-copy">
          <span className="rail-brand-name">PMAS Live</span>
          <span className="rail-brand-tag">{t("nav.workspace")}</span>
        </div>
        <button
          type="button"
          className="sidebar-mobile-close"
          aria-label={t("common.cancel")}
          onClick={closeMobileNav}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="rail-workspace" title={`${workspaceLabel} · ${workspaceId}`}>
        <span className="rail-workspace-pulse" aria-hidden />
        <div className="rail-workspace-copy">
          <span className="rail-workspace-label">{t("nav.workspace")}</span>
          <strong>{workspaceLabel}</strong>
        </div>
        <code className="rail-workspace-id">{workspaceId}</code>
      </div>

      <Link
        href="/profile"
        className={`user-profile user-profile-link sidebar-profile-alive rail-profile${profileActive ? " active" : ""}`}
        onClick={closeMobileNav}
        data-tooltip={user.full_name}
      >
        <div className="user-avatar rail-avatar">
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url} alt="" />
          ) : (
            <span>{initials}</span>
          )}
          <span className="rail-online" aria-hidden title="Online" />
        </div>
        <div className="user-info">
          <span className="user-name">{user.full_name}</span>
          <span className="user-role">{roleLabel}</span>
        </div>
        <span className="rail-profile-chevron" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </Link>

      <nav className="flex-1 sidebar-nav-alive rail-nav" aria-label="Main">
        {platform ? (
          platformNavGroups.map((group, gi) => {
            const items = group.items.filter((id) =>
              isNavVisible(id, platform, hasTenant, user.role, user.permissions),
            );
            if (items.length === 0) return null;
            const offset = gi * 4;
            return (
              <div
                key={group.label}
                className="sidebar-nav-group sidebar-nav-group-alive"
                style={{ animationDelay: `${0.04 + gi * 0.035}s` }}
              >
                <p className="sidebar-nav-group-label rail-group-label">
                  <span>{t(group.labelKey)}</span>
                </p>
                <ul className="nav-links">{items.map((id, ii) => renderNavItem(id, offset + ii))}</ul>
              </div>
            );
          })
        ) : (
          <>
            <p className="sidebar-nav-group-label rail-group-label">
              <span>{t("nav.navigate")}</span>
            </p>
            <ul className="nav-links">{tenantNav.map((id, ii) => renderNavItem(id, ii))}</ul>
          </>
        )}
      </nav>

      <footer className="sidebar-footer rail-dock">
        <div className="rail-dock-glass">
          <button
            type="button"
            className="rail-dock-btn rail-dock-collapse"
            onClick={toggleCollapsed}
            data-tooltip={collapsed ? t("nav.expand") : t("nav.collapse")}
            aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
            aria-pressed={collapsed}
          >
            <CollapseIcon collapsed={collapsed} />
            <span className="rail-dock-label">{collapsed ? t("nav.expand") : t("nav.collapse")}</span>
          </button>

          <span className="rail-dock-divider" aria-hidden />

          <button
            type="button"
            className="rail-dock-btn rail-dock-logout"
            disabled={signingOut}
            data-tooltip={t("common.signOut")}
            aria-label={t("common.signOut")}
            onClick={() => {
              closeMobileNav();
              setSigningOut(true);
              const signOutPath = resolveSignOutPath(user.role);
              const done = () => {
                clearSession();
                router.replace(signOutPath);
              };
              httpClient
                .post("/api/v1/auth/logout", { refresh_token: refreshToken ?? "" })
                .catch(() => undefined)
                .finally(done);
            }}
          >
            <LogoutIcon />
            <span className="rail-dock-label">{signingOut ? t("common.signingOut") : t("common.signOut")}</span>
          </button>
        </div>
      </footer>
    </aside>
  );
}
