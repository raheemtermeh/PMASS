"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import { getRouteByPath } from "@/shared/routes";

interface OperationalItem {
  type: string;
  status: string;
}

export function TopBar() {
  const pathname = usePathname();
  const route = getRouteByPath(pathname);
  const user = useAuthStore((s) => s.user);
  const hasTenant = Boolean(user?.tenant_id);
  const canFetchOps =
    hasTenant &&
    (user?.role === "tenant_admin" ||
      user?.permissions.includes("executive") ||
      false);

  const { data: items = [] } = useQuery({
    queryKey: ["operations-items"],
    queryFn: () => httpClient.get<OperationalItem[]>("/api/v1/operations/items"),
    enabled: canFetchOps,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const activeBlockers = items.filter(
    (item) => item.type === "blocker" && !["Resolved", "Completed"].includes(item.status),
  ).length;

  return (
    <header className="top-bar">
      <div className="flex-col">
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>
          {route?.title ?? "PMAS Live"}
        </h1>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.125rem" }}>
          {route?.subtitle ?? "Production workspace"}
        </p>
      </div>

      <div className="flex" style={{ alignItems: "center", gap: "1rem" }}>
        {user?.tenant?.name && (
          <div className="top-bar-badge">
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>
              {user.tenant.name}
            </span>
          </div>
        )}
        <div className="top-bar-badge">
          <div className="pulse-indicator pulse-active" />
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>
            Live Mode
          </span>
        </div>
        {activeBlockers > 0 && (
          <div className="top-bar-alert">
            <span className="font-mono" style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-danger)" }}>
              {activeBlockers} Active Blocker{activeBlockers !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
