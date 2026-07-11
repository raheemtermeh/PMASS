"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuthStore } from "@/core/auth/auth-store";
import { NavIcon, navGroupLabels, navLabels } from "@/lib/navigation";
import { hasPermission, isPlatformRole } from "@/shared/permissions";
import { navItems, routes, type ViewId } from "@/shared/routes";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [collapsed, setCollapsed] = useState(false);

  const platform = isPlatformRole(user?.role);
  const hasTenant = Boolean(user?.tenant_id);

  const visibleNav = useMemo(() => {
    if (!user) return [] as ViewId[];
    return navItems.filter((id) => {
      const route = routes[id];
      if (route.id === "product-manager" || route.id === "profile") return true;
      if (route.platformOnly) return platform;
      if (route.tenantOnly && !hasTenant) return false;
      if (!route.permission) return false;
      return hasPermission(user.role, user.permissions, route.permission);
    });
  }, [user, platform, hasTenant]);

  const groups = useMemo(() => {
    const order = ["value-stream", "operations", "admin"] as const;
    const map = new Map<string, ViewId[]>();
    for (const id of visibleNav) {
      const g = routes[id].group ?? "admin";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(id);
    }
    return order
      .filter((g) => (map.get(g)?.length ?? 0) > 0)
      .map((g) => ({ id: g, label: navGroupLabels[g], items: map.get(g)! }));
  }, [visibleNav]);

  if (!user) return null;

  const initials = user.full_name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const roleLabel = platform
    ? "Platform Admin"
    : user.role === "tenant_admin"
      ? "Company Admin"
      : "User";

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="brand-container">
        <svg
          className="brand-logo-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span>PMAS Live</span>
      </div>

      <Link href="/profile" className="user-profile user-profile-link">
        <div className="user-avatar">{initials}</div>
        <div className="user-info">
          <span className="user-name">{user.full_name}</span>
          <span className="user-role">
            {user.tenant?.name ? `${user.tenant.name} · ${roleLabel}` : roleLabel}
          </span>
        </div>
      </Link>

      <nav className="flex-1">
        {groups.map((group) => (
          <div key={group.id} className="nav-group">
            {!collapsed ? <p className="nav-group-label">{group.label}</p> : null}
            <ul className="nav-links">
              {group.items.map((viewId) => {
                const route = routes[viewId];
                const isActive =
                  pathname === route.path ||
                  (route.path !== "/" && pathname.startsWith(`${route.path}/`));
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
          </div>
        ))}
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
