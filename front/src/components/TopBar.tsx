"use client";

import { usePathname, useRouter } from "next/navigation";
import { store } from "@/legacy/state";
import { usePmasStore } from "@/hooks/usePmasStore";
import { getRouteByPath, routes } from "@/lib/routes";

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const state = usePmasStore();
  const route = getRouteByPath(pathname);

  const complianceScore = store.getCompliancePercent();
  const threshold = state.settings?.complianceThreshold || 75;
  const activeBlockersCount = state.blockers.filter(
    (blocker) => blocker.status === "Blocked",
  ).length;
  const alertsEnabled = state.settings?.notificationAlerts !== false;

  let complianceClass = "font-mono text-success";
  if (complianceScore < 50) {
    complianceClass = "font-mono text-danger";
  } else if (complianceScore < threshold) {
    complianceClass = "font-mono text-warning";
  }

  return (
    <header className="top-bar">
      <div className="flex-col">
        <h1
          id="view-title"
          className="text-on-surface"
          style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          {route.title}
        </h1>
        <p
          id="view-subtitle"
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            marginTop: "0.125rem",
          }}
        >
          {route.subtitle}
        </p>
      </div>

      <div className="flex" style={{ alignItems: "center", gap: "1rem" }}>
        <div
          className="flex"
          style={{
            alignItems: "center",
            gap: "0.5rem",
            background: "var(--bg-surface-elevated)",
            padding: "0.375rem 0.75rem",
            borderRadius: "9999px",
            border: "1px solid var(--border-outline-variant-60)",
          }}
        >
          <div className="pulse-indicator pulse-active" id="header-pulse" />
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text-muted)",
            }}
          >
            Compliance:{" "}
          </span>
          <span
            className={complianceClass}
            id="header-compliance-score"
            style={{ fontSize: "0.75rem", fontWeight: 700 }}
          >
            {complianceScore}%
          </span>
        </div>

        {activeBlockersCount > 0 && alertsEnabled && (
          <div
            className="flex"
            id="header-blockers-alert"
            role="button"
            tabIndex={0}
            style={{
              alignItems: "center",
              gap: "0.5rem",
              background: "rgba(244, 63, 94, 0.1)",
              border: "1px solid rgba(244, 63, 94, 0.2)",
              padding: "0.375rem 0.75rem",
              borderRadius: "9999px",
              cursor: "pointer",
              boxShadow:
                activeBlockersCount > 3
                  ? "0 0 10px rgba(244, 63, 94, 0.4)"
                  : "none",
            }}
            onClick={() => router.push(routes.executive.path)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                router.push(routes.executive.path);
              }
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f43f5e"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--color-danger)",
              }}
              className="font-mono"
              id="header-blockers-count"
            >
              {activeBlockersCount} Blocker
              {activeBlockersCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
