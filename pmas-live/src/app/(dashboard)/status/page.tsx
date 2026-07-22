"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { httpClient } from "@/core/api/http-client";
import type {
  DashboardData,
  FlowFeature,
  FlowProduct,
  FlowStage,
} from "@/features/dashboard/types";
import type { Company, Employee } from "@/features/vsm/types";

type FilterKey = "all" | "active" | "no-pipeline" | "blocked";

function stageTone(status: string): string {
  const s = status.toUpperCase();
  if (["ACTIVE", "IN_PROGRESS"].includes(s)) return "active";
  if (["COMPLETED", "DONE"].includes(s)) return "done";
  if (["REJECTED", "BLOCKED", "CANCELLED"].includes(s)) return "blocked";
  return "pending";
}

function statusClass(status: string): string {
  const s = status.toUpperCase();
  if (["ACTIVE", "IN_PROGRESS", "READY"].includes(s)) return "badge-success";
  if (["COMPLETED", "DONE"].includes(s)) return "badge-info";
  if (["REJECTED", "BLOCKED", "CANCELLED", "ON_HOLD"].includes(s)) return "badge-danger";
  if (["DRAFT", "PENDING", "BACKLOG", "PLANNING"].includes(s)) return "badge-warning";
  return "badge-info";
}

function openFeatures(features: FlowFeature[] = []): FlowFeature[] {
  return features.filter((f) => !["COMPLETED", "DONE", "ARCHIVED", "CANCELLED"].includes(f.status.toUpperCase()));
}

function matchesFilter(p: FlowProduct, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "active") return p.status.toUpperCase() === "ACTIVE";
  if (filter === "no-pipeline") return !p.pipeline_id || p.stages.length === 0;
  if (filter === "blocked") {
    return (
      p.status.toUpperCase() === "ON_HOLD" ||
      p.stages.some((s) => ["REJECTED", "BLOCKED"].includes(s.status.toUpperCase()))
    );
  }
  return true;
}

function StageRail({ stages, activeName, nextName }: {
  stages: FlowStage[];
  activeName?: string;
  nextName?: string;
}) {
  if (stages.length === 0) {
    return <p className="text-dim sb-muted">No pipeline stages yet.</p>;
  }

  return (
    <ol className="sb-stage-rail" aria-label="Pipeline stages">
      {stages.map((st, i) => {
        const tone = stageTone(st.status);
        const isActive = activeName === st.name || tone === "active";
        const isNext = nextName === st.name && !isActive;
        return (
          <li key={st.id} className={`sb-stage-node sb-stage-${tone}${isActive ? " is-current" : ""}${isNext ? " is-next" : ""}`}>
            <span className="sb-stage-index">{i + 1}</span>
            <div className="sb-stage-copy">
              <strong>{st.name}</strong>
              <span>{st.status}</span>
            </div>
            {i < stages.length - 1 ? <span className="sb-stage-connector" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export default function StatusBoardPage() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const { data: employees = [] } = useQuery({
    queryKey: ["vsm-employees"],
    queryFn: () => httpClient.get<Employee[]>("/api/v1/employees"),
    staleTime: 60_000,
    retry: false,
  });
  const { data: company } = useQuery({
    queryKey: ["vsm-company"],
    queryFn: () => httpClient.get<Company>("/api/v1/company"),
    staleTime: 60_000,
    retry: false,
  });

  const employeeID = employees.find((e) => e.status === "ACTIVE")?.id ?? employees[0]?.id;
  const dashPath = employeeID
    ? `/api/v1/dashboard?employee_id=${employeeID}`
    : "/api/v1/dashboard";

  const { data: dash, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["vsm-dashboard", employeeID],
    queryFn: () => httpClient.get<DashboardData>(dashPath),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });

  const products = dash?.flow?.products ?? [];
  const summary = dash?.summary;
  const pipelineStatuses = dash?.pipeline_statuses ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (!matchesFilter(p, filter)) return false;
      if (!q) return true;
      const hay = [
        p.name,
        p.status,
        p.pipeline_name,
        p.active_stage,
        p.next_stage,
        ...(p.features ?? []).map((f) => f.title),
        ...p.projects.map((pr) => pr.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [products, filter, query]);

  const refreshed = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const counts = useMemo(
    () => ({
      all: products.length,
      active: products.filter((p) => p.status.toUpperCase() === "ACTIVE").length,
      noPipeline: products.filter((p) => !p.pipeline_id || p.stages.length === 0).length,
      blocked: products.filter(
        (p) =>
          p.status.toUpperCase() === "ON_HOLD" ||
          p.stages.some((s) => ["REJECTED", "BLOCKED"].includes(s.status.toUpperCase())),
      ).length,
    }),
    [products],
  );

  return (
    <div className="page-stack status-board">
      <section className="sb-hero">
        <div>
          <p className="command-eyebrow">Live status</p>
          <h2 className="sb-hero-title">
            {company?.name ? company.name : "Organization"}
            <span> status board</span>
          </h2>
          <p className="sb-hero-sub">
            Current stage, pipeline path, projects, and features for every product — read-only
            operational view.
          </p>
        </div>
        <div className="sb-hero-meta">
          <span className="cc-chip cyan">{summary?.active_products ?? 0} active products</span>
          <span className="cc-chip amber">{summary?.open_features ?? 0} open features</span>
          <span className="cc-chip emerald">{summary?.projects ?? 0} projects</span>
          <span className="cc-chip rose">{summary?.open_tasks ?? 0} open tasks</span>
          {refreshed ? (
            <span className="cc-chip muted">{isFetching ? "Syncing…" : `Synced ${refreshed}`}</span>
          ) : null}
        </div>
      </section>

      <div className="cc-kpi-grid">
        <div className="cc-kpi cc-kpi-cyan">
          <span className="cc-kpi-label">Products tracked</span>
          <strong className="cc-kpi-value">{products.length}</strong>
        </div>
        <div className="cc-kpi cc-kpi-emerald">
          <span className="cc-kpi-label">Completed products</span>
          <strong className="cc-kpi-value">{summary?.completed_products ?? 0}</strong>
        </div>
        <div className="cc-kpi cc-kpi-amber">
          <span className="cc-kpi-label">Open features</span>
          <strong className="cc-kpi-value">{summary?.open_features ?? 0}</strong>
        </div>
        <div className="cc-kpi cc-kpi-rose">
          <span className="cc-kpi-label">On hold</span>
          <strong className="cc-kpi-value">{summary?.on_hold_products ?? 0}</strong>
        </div>
      </div>

      <section className="data-panel">
        <div className="panel-header sb-toolbar">
          <h3 className="panel-title">Products · pipelines · next stages</h3>
          <div className="sb-toolbar-controls">
            <input
              className="sb-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search product, stage, feature…"
              aria-label="Search status board"
            />
            <div className="sb-filters" role="tablist" aria-label="Status filters">
              {(
                [
                  ["all", `All (${counts.all})`],
                  ["active", `Active (${counts.active})`],
                  ["no-pipeline", `No pipeline (${counts.noPipeline})`],
                  ["blocked", `Blocked / hold (${counts.blocked})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  className={`btn btn-sm${filter === key ? " btn-primary" : ""}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? <p className="text-dim">Loading live status…</p> : null}

        {!isLoading && filtered.length === 0 ? (
          <EmptyState
            title="Nothing to show"
            description={
              products.length === 0
                ? "Create a product and assign a pipeline to see live stage progress here."
                : "No products match this filter or search."
            }
            action={
              <Link href="/products" className="btn btn-primary">
                Go to Products
              </Link>
            }
          />
        ) : null}

        <div className="sb-product-list">
          {filtered.map((product) => {
            const features = product.features ?? [];
            const open = openFeatures(features);
            const pipeHint =
              pipelineStatuses.find((p) => p.product_id === product.id)?.active_stage ??
              product.active_stage;

            return (
              <article key={product.id} className="sb-product-card">
                <header className="sb-product-head">
                  <div>
                    <div className="sb-product-title-row">
                      <Link href={`/products/${product.id}`} className="sb-product-link">
                        {product.name}
                      </Link>
                      <span className={`status-pill ${statusClass(product.status)}`}>{product.status}</span>
                    </div>
                    <p className="sb-product-meta">
                      {product.pipeline_id ? (
                        <>
                          Pipeline: <strong>{product.pipeline_name || "Unnamed"}</strong>
                          {product.pipeline_status ? ` · ${product.pipeline_status}` : null}
                        </>
                      ) : (
                        <span className="text-dim">No pipeline assigned</span>
                      )}
                    </p>
                  </div>
                  <div className="sb-pointers">
                    <div>
                      <span className="sb-pointer-label">Current stage</span>
                      <strong>{pipeHint || product.active_stage || "—"}</strong>
                    </div>
                    <div>
                      <span className="sb-pointer-label">Next stage</span>
                      <strong>{product.next_stage || "—"}</strong>
                    </div>
                  </div>
                </header>

                <StageRail
                  stages={product.stages}
                  activeName={product.active_stage}
                  nextName={product.next_stage}
                />

                <div className="sb-split">
                  <div>
                    <h4 className="sb-section-title">
                      Projects <span>{product.projects.length}</span>
                    </h4>
                    {product.projects.length === 0 ? (
                      <p className="text-dim sb-muted">No projects yet.</p>
                    ) : (
                      <ul className="sb-item-list">
                        {product.projects.map((pr) => (
                          <li key={pr.id}>
                            <Link href={`/planning?product_id=${product.id}`}>{pr.name}</Link>
                            <span className={`status-pill ${statusClass(pr.status)}`}>{pr.status}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h4 className="sb-section-title">
                      Features <span>{open.length} open / {features.length}</span>
                    </h4>
                    {features.length === 0 ? (
                      <p className="text-dim sb-muted">No features yet.</p>
                    ) : (
                      <ul className="sb-item-list">
                        {features.slice(0, 12).map((f) => (
                          <li key={f.id}>
                            <Link href={`/planning?product_id=${product.id}&project_id=${f.project_id}`}>
                              {f.title}
                            </Link>
                            <span className="sb-feature-meta">
                              {f.priority ? <em>{f.priority}</em> : null}
                              <span className={`status-pill ${statusClass(f.status)}`}>{f.status}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
