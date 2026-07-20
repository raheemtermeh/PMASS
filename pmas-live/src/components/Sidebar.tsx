"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import { useMobileNav } from "@/components/MobileNavContext";
import { NavIcon, navLabels } from "@/lib/navigation";
import { hasPermission, isPlatformRole } from "@/shared/permissions";
import {
  platformNavGroups,
  routes,
  tenantNavItems,
  type ViewId,
} from "@/shared/routes";

interface AccessRequestRow {
  id: number;
  status: string;
}

function isNavVisible(
  id: ViewId,
  platform: boolean,
  hasTenant: boolean,
  role: string,
  permissions: string[],
): boolean {
  const route = routes[id];
  if (route.platformOnly) return platform;
  if (route.tenantOnly && !hasTenant && !platform) return false;
  if (route.id === "profile") return true;
  if (route.id === "home") return hasTenant;
  if (!route.permission) return false;
  return hasPermission(role, permissions, route.permission);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { close: closeMobileNav } = useMobileNav();

  const platform = Boolean(user && isPlatformRole(user.role));
  const hasTenant = Boolean(user?.tenant_id);

  // Hooks must run unconditionally (no early return above this).
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
    ? "Platform Admin"
    : user.role === "tenant_admin"
      ? "Company Admin"
      : "User";

  function renderNavItem(viewId: ViewId) {
    const route = routes[viewId];
    const isActive = pathname === route.path || pathname.startsWith(`${route.path}/`);
    const showBadge = viewId === "platform-access-requests" && pendingCount > 0;

    return (
      <li key={viewId} className={`nav-item${isActive ? " active" : ""}`}>
        <Link href={route.path} onClick={closeMobileNav}>
          <NavIcon viewId={viewId} />
          <span>{navLabels[viewId]}</span>
          {showBadge && !collapsed ? (
            <span className="nav-badge" aria-label={`${pendingCount} pending requests`}>
              {pendingCount}
            </span>
          ) : null}
        </Link>
      </li>
    );
  }

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="brand-container">
        <svg className="brand-logo-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span>PMAS Live</span>
        <button
          type="button"
          className="sidebar-mobile-close"
          aria-label="Close sidebar"
          onClick={closeMobileNav}
        >
          ×
        </button>
      </div>

      <Link href="/profile" className="user-profile user-profile-link" onClick={closeMobileNav}>
        <div className="user-avatar">{initials}</div>
        <div className="user-info">
          <span className="user-name">{user.full_name}</span>
          <span className="user-role">
            {user.tenant?.name ? `${user.tenant.name} · ${roleLabel}` : roleLabel}
          </span>
        </div>
      </Link>

      <nav className="flex-1">
        {platform ? (
          platformNavGroups.map((group) => {
            const items = group.items.filter((id) =>
              isNavVisible(id, platform, hasTenant, user.role, user.permissions),
            );
            if (items.length === 0) return null;
            return (
              <div key={group.label} className="sidebar-nav-group">
                {!collapsed ? (
                  <p className="sidebar-nav-group-label">{group.label}</p>
                ) : null}
                <ul className="nav-links">{items.map(renderNavItem)}</ul>
              </div>
            );
          })
        ) : (
          <ul className="nav-links">{tenantNav.map(renderNavItem)}</ul>
        )}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-toggle-footer sidebar-toggle-desktop"
          onClick={() => setCollapsed((v) => !v)}
        >
          <span>{collapsed ? "Expand" : "Collapse"} Sidebar</span>
        </button>
        <button
          type="button"
          className="sidebar-toggle-footer sidebar-toggle-mobile"
          onClick={closeMobileNav}
        >
          <span>Close menu</span>
        </button>
        <button
          type="button"
          className="sidebar-logout-btn"
          disabled={signingOut}
          onClick={() => {
            closeMobileNav();
            setSigningOut(true);
            const done = () => {
              clearSession();
              router.replace("/welcome");
            };
            httpClient
              .post("/api/v1/auth/logout", { refresh_token: refreshToken ?? "" })
              .catch(() => undefined)
              .finally(done);
          }}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}
