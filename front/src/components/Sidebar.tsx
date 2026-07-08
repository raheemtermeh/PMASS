"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAppStore } from "@/features/shell/store/app-store";
import { NavIcon, navLabels } from "@/lib/navigation";
import { navItems, routes } from "@/lib/routes";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAppStore((state) => state.user);
  const isProfileActive = pathname === routes.profile.path;

  return (
    <aside
      className={`sidebar${collapsed ? " collapsed" : ""}`}
      aria-label="Sidebar Navigation"
    >
      <div className="brand-container">
        <svg
          className="brand-logo-icon"
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span>PMAS Control</span>
      </div>

      <div
        className={`user-profile${isProfileActive ? " active" : ""}`}
        id="user-profile-section"
        role="button"
        tabIndex={0}
        onClick={() => router.push(routes.profile.path)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            router.push(routes.profile.path);
          }
        }}
      >
        <div
          className="user-avatar"
          id="profile-avatar"
          style={{
            background:
              user.avatarColor ||
              "linear-gradient(135deg, var(--color-primary), var(--color-info))",
          }}
        >
          {user.avatarText}
        </div>
        <div className="user-info">
          <span className="user-name" id="profile-name">
            {user.name}
          </span>
          <span className="user-role" id="profile-role">
            {user.role}
          </span>
        </div>
      </div>

      <nav className="flex-1" aria-label="Main Navigation Menu">
        <ul className="nav-links" id="sidebar-nav-menu">
          {navItems.map((viewId) => {
            const route = routes[viewId];
            const isActive = pathname === route.path;

            return (
              <li
                key={viewId}
                className={`nav-item${isActive ? " active" : ""}`}
                data-view={viewId}
              >
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
          id="sidebar-toggle-btn"
          type="button"
          className="sidebar-toggle-footer"
          aria-label="Toggle Sidebar"
          onClick={onToggleCollapse}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="11 17 6 12 11 7" />
            <polyline points="18 17 13 12 18 7" />
          </svg>
          <span>Collapse Sidebar</span>
        </button>
      </div>
    </aside>
  );
}
