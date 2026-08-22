"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { httpClient } from "@/core/api/http-client";
import { useI18n } from "@/core/providers/I18nProvider";
import { useVisibleRefetchInterval } from "@/shared/hooks/usePageVisible";
import { localizedEnumLabel, priorityTranslationKey, statusTranslationKey } from "@/lib/localized-labels";
import type {
  DashboardData,
  FlowProduct,
  FlowStage,
} from "@/features/dashboard/types";

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
  const { t } = useI18n();
  if (stages.length === 0) {
    return <p className="text-dim sb-muted">{t("statusBoard.noPipelineStages")}</p>;
  }

  return (
    <ol className="sb-stage-rail" aria-label={t("statusBoard.pipelineStages")}>
      {stages.map((st, i) => {
        const tone = stageTone(st.status);
        const isActive = activeName === st.name || tone === "active";
        const isNext = nextName === st.name && !isActive;
        return (
          <li key={st.id} className={`sb-stage-node sb-stage-${tone}${isActive ? " is-current" : ""}${isNext ? " is-next" : ""}`}>
            <span className="sb-stage-index">{i + 1}</span>
            <div className="sb-stage-copy">
              <strong>{st.name}</strong>
              <span>{localizedEnumLabel(st.status, statusTranslationKey(st.status), t)}</span>
            </div>
            {i < stages.length - 1 ? <span className="sb-stage-connector" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export default function StatusBoardPage() {
  const { lang, t } = useI18n();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const dashboardPollMs = useVisibleRefetchInterval(30_000);

  const { data: dash, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["vsm-dashboard", "status"],
    queryFn: () => httpClient.get<DashboardData>("/api/v1/dashboard?view=status"),
    staleTime: 15_000,
    refetchInterval: dashboardPollMs,
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
    ? new Date(dataUpdatedAt).toLocaleTimeString(lang === "fa" ? "fa-IR" : "en", {
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
          <p className="command-eyebrow">{t("statusBoard.liveStatus")}</p>
          <h2 className="sb-hero-title">
            {t("statusBoard.heading", {
              name: dash?.flow?.company_name || t("statusBoard.organizationFallback"),
            })}
          </h2>
          <p className="sb-hero-sub">{t("statusBoard.description")}</p>
        </div>
        <div className="sb-hero-meta">
          <span className="cc-chip cyan">{t("statusBoard.activeProducts", { count: summary?.active_products ?? 0 })}</span>
          <span className="cc-chip amber">{t("statusBoard.openFeatures", { count: summary?.open_features ?? 0 })}</span>
          <span className="cc-chip emerald">{t("statusBoard.projects", { count: summary?.projects ?? 0 })}</span>
          <span className="cc-chip rose">{t("statusBoard.openTasks", { count: summary?.open_tasks ?? 0 })}</span>
          {refreshed ? (
            <span className="cc-chip muted">
              {isFetching ? t("dashboard.syncing") : t("statusBoard.synced", { time: refreshed })}
            </span>
          ) : null}
        </div>
      </section>

      <div className="cc-kpi-grid">
        <div className="cc-kpi cc-kpi-cyan">
          <span className="cc-kpi-label">{t("statusBoard.productsTracked")}</span>
          <strong className="cc-kpi-value">{products.length}</strong>
        </div>
        <div className="cc-kpi cc-kpi-emerald">
          <span className="cc-kpi-label">{t("statusBoard.completedProducts")}</span>
          <strong className="cc-kpi-value">{summary?.completed_products ?? 0}</strong>
        </div>
        <div className="cc-kpi cc-kpi-amber">
          <span className="cc-kpi-label">{t("products.features")}</span>
          <strong className="cc-kpi-value">{summary?.open_features ?? 0}</strong>
        </div>
        <div className="cc-kpi cc-kpi-rose">
          <span className="cc-kpi-label">{t("statusBoard.onHold")}</span>
          <strong className="cc-kpi-value">{summary?.on_hold_products ?? 0}</strong>
        </div>
      </div>

      <section className="data-panel">
        <div className="panel-header sb-toolbar">
          <h3 className="panel-title">{t("statusBoard.boardSummary")}</h3>
          <div className="sb-toolbar-controls">
            <input
              className="sb-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("statusBoard.searchPlaceholder")}
              aria-label={t("statusBoard.searchLabel")}
            />
            <div className="sb-filters" role="tablist" aria-label={t("statusBoard.statusFilters")}>
              {(
                [
                  ["all", t("statusBoard.all", { count: counts.all })],
                  ["active", t("statusBoard.active", { count: counts.active })],
                  ["no-pipeline", t("statusBoard.noPipeline", { count: counts.noPipeline })],
                  ["blocked", t("statusBoard.blockedHold", { count: counts.blocked })],
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

        {isLoading ? <p className="text-dim">{t("statusBoard.loading")}</p> : null}

        {!isLoading && filtered.length === 0 ? (
          <EmptyState
            title={t("statusBoard.nothingToShow")}
            description={
              products.length === 0
                ? t("statusBoard.createProductHint")
                : t("statusBoard.noMatch")
            }
            action={
              <Link href="/products" className="btn btn-primary">
                {t("statusBoard.goToProducts")}
              </Link>
            }
          />
        ) : null}

        <div className="sb-product-list">
          {filtered.map((product) => {
            const features = product.features ?? [];
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
                      <span className={`status-pill ${statusClass(product.status)}`}>
                        {localizedEnumLabel(product.status, statusTranslationKey(product.status), t)}
                      </span>
                    </div>
                    <p className="sb-product-meta">
                      {product.pipeline_id ? (
                        <>
                          {t("statusBoard.pipeline")}:{" "}
                          <strong>{product.pipeline_name || t("statusBoard.unnamed")}</strong>
                          {product.pipeline_status
                            ? ` · ${localizedEnumLabel(product.pipeline_status, statusTranslationKey(product.pipeline_status), t)}`
                            : null}
                        </>
                      ) : (
                        <span className="text-dim">{t("statusBoard.noPipelineAssigned")}</span>
                      )}
                    </p>
                  </div>
                  <div className="sb-pointers">
                    <div>
                      <span className="sb-pointer-label">{t("statusBoard.currentStage")}</span>
                      <strong>{pipeHint || product.active_stage || "—"}</strong>
                    </div>
                    <div>
                      <span className="sb-pointer-label">{t("statusBoard.nextStage")}</span>
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
                      {product.projects.length} {t("products.projects")}
                    </h4>
                    {product.projects.length === 0 ? (
                      <p className="text-dim sb-muted">{t("statusBoard.noProjects")}</p>
                    ) : (
                      <ul className="sb-item-list">
                        {product.projects.map((pr) => (
                          <li key={pr.id}>
                            <Link href={`/planning?product_id=${product.id}`}>{pr.name}</Link>
                            <span className={`status-pill ${statusClass(pr.status)}`}>
                              {localizedEnumLabel(pr.status, statusTranslationKey(pr.status), t)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h4 className="sb-section-title">
                      {features.length} {t("products.features")}
                    </h4>
                    {features.length === 0 ? (
                      <p className="text-dim sb-muted">{t("statusBoard.noFeatures")}</p>
                    ) : (
                      <ul className="sb-item-list">
                        {features.slice(0, 12).map((f) => (
                          <li key={f.id}>
                            <Link href={`/planning?product_id=${product.id}&project_id=${f.project_id}`}>
                              {f.title}
                            </Link>
                            <span className="sb-feature-meta">
                              {f.priority ? (
                                <em>{localizedEnumLabel(f.priority, priorityTranslationKey(f.priority), t)}</em>
                              ) : null}
                              <span className={`status-pill ${statusClass(f.status)}`}>
                                {localizedEnumLabel(f.status, statusTranslationKey(f.status), t)}
                              </span>
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
