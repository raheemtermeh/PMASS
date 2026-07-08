"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthStore } from "@/core/auth/auth-store";
import { NavIcon, navLabels } from "@/lib/navigation";
import { hasPermission, isPlatformRole } from "@/shared/permissions";
import { navItems, routes } from "@/shared/routes";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [collapsed, setCollapsed] = useState(false);

  if (!user) return null;

  const platform = isPlatformRole(user.role);
  const hasTenant = Boolean(user.tenant_id);

  const initials = user.full_name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const visibleNav = navItems.filter((id) => {
    const route = routes[id];
    if (route.platformOnly) return platform;
    if (route.tenantOnly && !hasTenant) return false;
    if (!route.permission) return false;
    return hasPermission(user.role, user.permissions, route.permission);
  });

  const roleLabel = platform
    ? "Platform Admin"
    : user.role === "tenant_admin"
      ? "Company Admin"
      : "User";

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="brand-container">
        <svg className="brand-logo-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span>PMAS Live</span>
      </div>

      <div className="user-profile">
        <div className="user-avatar">{initials}</div>
        <div className="user-info">
          <span className="user-name">{user.full_name}</span>
          <span className="user-role">
            {user.tenant?.name ? `${user.tenant.name} · ${roleLabel}` : roleLabel}
          </span>
        </div>
      </div>

      <nav className="flex-1">
        <ul className="nav-links">
          {visibleNav.map((viewId) => {
            const route = routes[viewId];
            const isActive = pathname === route.path;
            return (
              <li key={viewId} className={`nav-item${isActive ? " active" : ""}`}>
                <Link href={route.path}>
                  <NavIcon viewId={viewId} />
                  <span>{navLabels[viewId]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-toggle-footer"
          onClick={() => setCollapsed((v) => !v)}
        >
          <span>{collapsed ? "Expand" : "Collapse"} Sidebar</span>
        </button>
        <button
          type="button"
          className="sidebar-logout-btn"
          onClick={() => {
            clearSession();
            router.replace("/login");
          }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
