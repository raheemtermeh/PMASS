"use client";

import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import { useOnboardingStore } from "@/features/guidance/guidance-store";
import { getRouteByPath } from "@/shared/routes";
import type { Product } from "@/features/vsm/types";

interface SearchHit {
  type: string;
  id: string;
  title: string;
  meta?: string;
}

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const route = getRouteByPath(pathname);
  const user = useAuthStore((s) => s.user);
  const resetTour = useOnboardingStore((s) => s.resetForUser);
  const hasTenant = Boolean(user?.tenant_id);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const canFetchProducts =
    hasTenant &&
    (user?.role === "tenant_admin" || user?.permissions.includes("product.view") || false);

  const { data: products = [] } = useQuery({
    queryKey: ["vsm-products"],
    queryFn: () => httpClient.get<Product[]>("/api/v1/products"),
    enabled: canFetchProducts,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const { data: searchData } = useQuery({
    queryKey: ["vsm-search", q],
    queryFn: () =>
      httpClient.get<{ hits: SearchHit[] }>(`/api/v1/search?q=${encodeURIComponent(q)}`),
    enabled: hasTenant && q.trim().length >= 2,
    staleTime: 10_000,
    retry: false,
  });

  const activeProducts = products.filter((p) => p.status === "ACTIVE").length;

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setOpen(true);
  }

  function goHit(hit: SearchHit) {
    setOpen(false);
    setQ("");
    if (hit.type === "product") router.push(`/products/${hit.id}`);
    else if (hit.type === "employee") router.push("/organization");
    else router.push("/planning");
  }

  return (
    <header className="top-bar">
      <div className="flex-col">
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>
          {route?.title ?? "PMAS Live"}
        </h1>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.125rem" }}>
          {route?.subtitle ?? "Value stream workspace"}
        </p>
      </div>

      <div className="flex" style={{ alignItems: "center", gap: "1rem", position: "relative" }}>
        {hasTenant ? (
          <form onSubmit={onSearch} style={{ position: "relative" }}>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search products, tasks…"
              style={{
                minWidth: 200,
                padding: "0.4rem 0.65rem",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "inherit",
                fontSize: "0.8rem",
              }}
            />
            {open && q.trim().length >= 2 ? (
              <div
                style={{
                  position: "absolute",
                  top: "110%",
                  right: 0,
                  width: 280,
                  maxHeight: 280,
                  overflow: "auto",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  zIndex: 50,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                }}
              >
                {(searchData?.hits ?? []).map((h) => (
                  <button
                    key={`${h.type}-${h.id}`}
                    type="button"
                    className="btn btn-sm"
                    style={{ display: "block", width: "100%", textAlign: "left", borderRadius: 0 }}
                    onClick={() => goHit(h)}
                  >
                    <span className="font-mono" style={{ fontSize: "0.7rem" }}>
                      {h.type}
                    </span>{" "}
                    {h.title}
                  </button>
                ))}
                {(searchData?.hits ?? []).length === 0 ? (
                  <p className="text-dim" style={{ padding: "0.75rem", fontSize: "0.8rem" }}>
                    No results
                  </p>
                ) : null}
              </div>
            ) : null}
          </form>
        ) : null}

        {user?.tenant?.name && (
          <div className="top-bar-badge">
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>
              {user.tenant.name}
            </span>
          </div>
        )}
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => user && resetTour(String(user.id))}
          title="Replay first-run setup wizard"
        >
          Help tour
        </button>
        <div className="top-bar-badge">
          <div className="pulse-indicator pulse-active" />
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>
            Live Mode
          </span>
        </div>
        {activeProducts > 0 && (
          <div className="top-bar-badge">
            <span className="font-mono" style={{ fontSize: "0.75rem", fontWeight: 700 }}>
              {activeProducts} Active Product{activeProducts !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
