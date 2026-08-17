"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import type { DashboardData } from "@/features/dashboard/types";
import { useI18n } from "@/core/providers/I18nProvider";
import {
  ActivityTrendChart,
  DepartmentLoadChart,
  ProductsStatusChart,
  StagesStatusChart,
  TasksPriorityChart,
  TasksStatusChart,
} from "@/features/dashboard/charts";
import { LifecycleFlowGraph } from "@/features/dashboard/LifecycleFlowGraph";
import {
  AiSummaryWidget,
  CommandWidgetShell,
  MyWorkWidget,
  PipelineAlertsWidget,
  TeamWorkloadWidget,
  UpcomingDeadlinesWidget,
} from "@/features/dashboard/widgets";
import {
  type CommandCenterLayout,
  type WidgetId,
  defaultCommandCenterLayout,
  isWidgetVisible,
  layoutKeyFor,
  mergeCommandCenterLayout,
  moveWidget,
  reorderWidget,
  toggleWidgetHidden,
  toggleWidgetSize,
  widgetSize,
  WIDGET_REGISTRY,
} from "@/features/dashboard/commandCenterLayout";
import { useUILayout } from "@/shared/hooks/useUILayout";

const QUICK_ACTIONS = [
  { href: "/products", key: "createProduct", tone: "cyan" },
  { href: "/planning", key: "createProject", tone: "emerald" },
  { href: "/planning", key: "createFeature", tone: "amber" },
  { href: "/planning", key: "createTask", tone: "rose" },
  { href: "/organization", key: "organization", tone: "violet" },
  { href: "/settings", key: "companySettings", tone: "blue" },
] as const;

export default function HomePage() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const [customizing, setCustomizing] = useState(false);
  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const [overId, setOverId] = useState<WidgetId | null>(null);
  const [ccLayout, setCcLayout] = useState<CommandCenterLayout>(() => defaultCommandCenterLayout());

  const { data: dash, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["vsm-dashboard", "self"],
    queryFn: () => httpClient.get<DashboardData>("/api/v1/dashboard"),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });

  const layoutKey = layoutKeyFor(user?.tenant_id ? String(user.tenant_id) : undefined, user?.id);
  const { layout: savedLayout, ready: layoutReady, saveLayout } =
    useUILayout<Record<string, unknown>>(layoutKey);

  useEffect(() => {
    if (!layoutReady) return;
    setCcLayout(mergeCommandCenterLayout(savedLayout));
  }, [layoutReady, savedLayout]);

  const persist = (next: CommandCenterLayout) => {
    setCcLayout(next);
    saveLayout(next as unknown as Record<string, unknown>);
  };

  const s = dash?.summary;
  const charts = dash?.charts;
  const overdueTasks =
    s?.overdue_tasks ??
    (dash?.my_tasks ?? []).filter((task) => {
      if (!task.due_date || ["COMPLETED", "ARCHIVED"].includes(task.status)) return false;
      return new Date(task.due_date).getTime() < Date.now();
    }).length;

  const refreshed = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const hasAssignments = Boolean(
    dash?.my_products?.length || dash?.my_projects?.length || dash?.my_features?.length,
  );

  const widgetTitle = useMemo(
    () =>
      ({
        kpis: t("dashboard.kpis"),
        charts: t("dashboard.charts"),
        myWork: t("dashboard.myWork"),
        deadlines: t("dashboard.upcomingDeadlines"),
        teamWorkload: t("dashboard.teamWorkload"),
        pipelineAlerts: t("dashboard.pipelineAlerts"),
        aiSummary: t("dashboard.aiSummary"),
        quickActions: t("dashboard.quickActions"),
        assignments: t("dashboard.myWorkspaceAssignments"),
        workflow: t("dashboard.workflowPipeline"),
        departmentLoad: t("dashboard.departmentLoad"),
        activities: t("dashboard.recentActivities"),
      }) as Record<WidgetId, string>,
    [t],
  );

  const customizeControls = (id: WidgetId) => {
    if (!customizing) return null;
    const visible = isWidgetVisible(ccLayout, id);
    const size = widgetSize(ccLayout, id);
    return (
      <div className="cc-customize-controls">
        <span className="cc-drag-grip" title={t("dashboard.dragReorder")} aria-hidden>
          ⋮⋮
        </span>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => persist(moveWidget(ccLayout, id, "up"))}
          aria-label={t("dashboard.moveUp")}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => persist(moveWidget(ccLayout, id, "down"))}
          aria-label={t("dashboard.moveDown")}
        >
          ↓
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => persist(toggleWidgetSize(ccLayout, id))}
        >
          {size === "full" ? t("dashboard.sizeHalf") : t("dashboard.sizeFull")}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => persist(toggleWidgetHidden(ccLayout, id))}
        >
          {visible ? t("dashboard.hide") : t("dashboard.show")}
        </button>
      </div>
    );
  };

  const dragProps = (id: WidgetId) =>
    customizing
      ? {
          draggable: true as const,
          onDragStart: (e: React.DragEvent) => {
            setDragId(id);
            e.dataTransfer.setData("text/plain", id);
            e.dataTransfer.effectAllowed = "move";
          },
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            setOverId(id);
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const from = (e.dataTransfer.getData("text/plain") || dragId) as WidgetId | null;
            if (from && from !== id) persist(reorderWidget(ccLayout, from, id));
            setDragId(null);
            setOverId(null);
          },
          onDragEnd: () => {
            setDragId(null);
            setOverId(null);
          },
        }
      : undefined;

  const shellProps = (id: WidgetId) => ({
    size: widgetSize(ccLayout, id),
    customize: customizeControls(id),
    dragHandleProps: dragProps(id),
    dragging: dragId === id,
    dragOver: overId === id && dragId !== id,
  });

  const renderWidget = (id: WidgetId): ReactNode => {
    if (!customizing && !isWidgetVisible(ccLayout, id)) return null;
    if (id === "assignments" && !hasAssignments && !customizing) return null;

    const hiddenClass = !isWidgetVisible(ccLayout, id) && customizing ? "cc-widget-hidden" : "";
    const extras = shellProps(id);

    switch (id) {
      case "kpis":
        return (
          <CommandWidgetShell
            key={id}
            title={widgetTitle.kpis}
            className={hiddenClass}
            {...extras}
          >
            <div className="cc-kpi-grid">
              <Kpi tone="cyan" label={t("dashboard.activeProducts")} value={s?.active_products ?? 0} href="/products" />
              <Kpi tone="amber" label={t("dashboard.draftReady")} value={s?.draft_ready_products ?? 0} href="/products" />
              <Kpi tone="emerald" label={t("dashboard.completed")} value={s?.completed_products ?? 0} href="/products" />
              <Kpi tone="rose" label={t("dashboard.openTasks")} value={s?.open_tasks ?? 0} href="/planning" />
              <Kpi tone="violet" label={t("dashboard.projects")} value={s?.projects ?? 0} href="/planning" />
              <Kpi tone="blue" label={t("dashboard.departments")} value={s?.departments ?? 0} href="/organization" />
              <Kpi tone="teal" label={t("dashboard.employees")} value={s?.employees ?? 0} href="/organization" />
              <Kpi tone="pink" label={t("dashboard.unread")} value={s?.unread_notifications ?? 0} />
              <Kpi tone="amber" label={t("dashboard.onHold")} value={s?.on_hold_products ?? 0} href="/products" />
              <Kpi tone="rose" label={t("dashboard.overdueTasks")} value={overdueTasks} href="/planning" />
              <Kpi tone="emerald" label={t("dashboard.features")} value={s?.features ?? 0} href="/planning" />
            </div>
          </CommandWidgetShell>
        );
      case "charts":
        return (
          <CommandWidgetShell
            key={id}
            title={widgetTitle.charts}
            className={hiddenClass}
            {...extras}
          >
            <div className="cc-charts-grid">
              <ChartPanel title={t("dashboard.productsByStatus")} subtitle={t("dashboard.products")} accent="cyan">
                <ProductsStatusChart data={charts?.products_by_status ?? []} />
              </ChartPanel>
              <ChartPanel title={t("dashboard.tasksByStatus")} subtitle={t("dashboard.tasksByStatus")} accent="emerald">
                <TasksStatusChart data={charts?.tasks_by_status ?? []} />
              </ChartPanel>
              <ChartPanel title={t("dashboard.activity14")} subtitle={t("dashboard.activity14")} accent="info" wide>
                <ActivityTrendChart data={charts?.activity_by_day ?? []} />
              </ChartPanel>
              <ChartPanel title={t("dashboard.tasksByPriority")} subtitle={t("dashboard.tasksByPriority")} accent="amber">
                <TasksPriorityChart data={charts?.tasks_by_priority ?? []} />
              </ChartPanel>
              <ChartPanel title={t("dashboard.pipelineStages")} subtitle={t("dashboard.pipelineStages")} accent="rose">
                <StagesStatusChart data={charts?.stages_by_status ?? []} />
              </ChartPanel>
            </div>
          </CommandWidgetShell>
        );
      case "myWork":
        return <MyWorkWidget key={id} data={dash?.my_work} {...extras} />;
      case "deadlines":
        return <UpcomingDeadlinesWidget key={id} items={dash?.upcoming_deadlines} {...extras} />;
      case "teamWorkload":
        return <TeamWorkloadWidget key={id} items={dash?.team_workload} {...extras} />;
      case "pipelineAlerts":
        return <PipelineAlertsWidget key={id} items={dash?.pipeline_alerts} {...extras} />;
      case "aiSummary":
        return <AiSummaryWidget key={id} {...extras} />;
      case "quickActions":
        return (
          <CommandWidgetShell
            key={id}
            title={widgetTitle.quickActions}
            className={hiddenClass}
            {...extras}
          >
            <div className="quick-actions-grid">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.key}
                  href={action.href}
                  className={`quick-action-card cc-action cc-action-${action.tone}`}
                >
                  <strong>{t(`quickActions.${action.key}`)}</strong>
                  <span className="text-dim">{t(`quickActions.${action.key}Hint`)}</span>
                </Link>
              ))}
            </div>
          </CommandWidgetShell>
        );
      case "assignments":
        return (
          <CommandWidgetShell
            key={id}
            title={widgetTitle.assignments}
            className={hiddenClass}
            {...extras}
          >
            <div className="command-split">
              <div>
                <h4 className="text-dim" style={{ marginBottom: "0.5rem" }}>
                  {t("dashboard.products")}
                </h4>
                <ul className="command-list compact">
                  {(dash?.my_products ?? []).map((p) => (
                    <li key={p.id}>
                      <Link href={`/products/${p.id}`}>{p.name}</Link>
                      <span className="status-pill">{p.status}</span>
                    </li>
                  ))}
                  {(dash?.my_products ?? []).length === 0 ? (
                    <li className="text-dim">{t("dashboard.noAssignedProducts")}</li>
                  ) : null}
                </ul>
              </div>
              <div>
                <h4 className="text-dim" style={{ marginBottom: "0.5rem" }}>
                  {t("dashboard.projects")}
                </h4>
                <ul className="command-list compact">
                  {(dash?.my_projects ?? []).map((p) => (
                    <li key={p.id}>
                      <Link href="/planning">{p.name}</Link>
                      <span className="status-pill">{p.status}</span>
                    </li>
                  ))}
                  {(dash?.my_projects ?? []).length === 0 ? (
                    <li className="text-dim">{t("dashboard.noAssignedProjects")}</li>
                  ) : null}
                </ul>
              </div>
              <div>
                <h4 className="text-dim" style={{ marginBottom: "0.5rem" }}>
                  {t("dashboard.features")}
                </h4>
                <ul className="command-list compact">
                  {(dash?.my_features ?? []).map((f) => (
                    <li key={f.id}>
                      <Link href="/planning">{f.name}</Link>
                      <span className="status-pill">{f.status}</span>
                    </li>
                  ))}
                  {(dash?.my_features ?? []).length === 0 ? (
                    <li className="text-dim">{t("dashboard.noAssignedFeatures")}</li>
                  ) : null}
                </ul>
              </div>
            </div>
          </CommandWidgetShell>
        );
      case "workflow":
        return (
          <CommandWidgetShell
            key={id}
            title={widgetTitle.workflow}
            className={hiddenClass}
            headerRight={
              <Link href="/products" className="btn btn-sm">
                {t("dashboard.products")}
              </Link>
            }
            {...extras}
          >
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("dashboard.productCol")}</th>
                    <th>{t("dashboard.statusCol")}</th>
                    <th>{t("dashboard.activeStageCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(dash?.pipeline_statuses ?? []).map((p) => (
                    <tr key={p.product_id}>
                      <td>
                        <Link href={`/products/${p.product_id}`}>{p.product_name}</Link>
                      </td>
                      <td>
                        <span className="status-pill">{p.status}</span>
                      </td>
                      <td>{p.active_stage || "—"}</td>
                    </tr>
                  ))}
                  {(dash?.pipeline_statuses ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-dim">
                        {t("dashboard.noProducts")} <Link href="/products">{t("dashboard.createOne")}</Link>.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CommandWidgetShell>
        );
      case "departmentLoad":
        return (
          <CommandWidgetShell
            key={id}
            title={widgetTitle.departmentLoad}
            className={hiddenClass}
            {...extras}
          >
            <DepartmentLoadChart data={dash?.department_products ?? []} />
          </CommandWidgetShell>
        );
      case "activities":
        return (
          <CommandWidgetShell
            key={id}
            title={widgetTitle.activities}
            className={hiddenClass}
            {...extras}
          >
            <ul className="command-list compact">
              {(dash?.recent_activities ?? []).map((a) => (
                <li key={a.id}>
                  <div>
                    <span className="font-mono">{a.action}</span>
                    <span className="text-dim"> · {a.entity_type}</span>
                  </div>
                  <span className="text-dim" style={{ fontSize: "0.72rem" }}>
                    {a.created_at ? new Date(a.created_at).toLocaleString() : ""}
                  </span>
                </li>
              ))}
              {(dash?.recent_activities ?? []).length === 0 ? (
                <li className="text-dim">{t("dashboard.noActivities")}</li>
              ) : null}
            </ul>
          </CommandWidgetShell>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`page-stack command-center cc-modern${customizing ? " cc-customizing" : ""}`}>
      <section className="cc-hero">
        <div className="cc-hero-glow" aria-hidden />
        <div className="cc-hero-copy">
          <p className="command-eyebrow">{t("dashboard.commandCenter")}</p>
          <h2 className="cc-hero-title">
            {dash?.flow?.company_name || t("dashboard.orgFallback")}
            <span> {t("dashboard.liveWorkspace")}</span>
          </h2>
          <p className="cc-hero-sub">{t("dashboard.heroSub")}</p>
          <div className="cc-hero-chips">
            <span className="cc-chip cyan">
              {s?.unread_notifications ?? 0} {t("dashboard.unread")}
            </span>
            <span className="cc-chip amber">
              {s?.open_tasks ?? 0} {t("dashboard.openTasks")}
            </span>
            <span className="cc-chip rose">
              {overdueTasks} {t("dashboard.overdue")}
            </span>
            <span className="cc-chip emerald">
              {s?.employees ?? 0} {t("dashboard.people")}
            </span>
            {refreshed ? (
              <span className="cc-chip muted">
                {isFetching ? t("dashboard.syncing") : `${t("dashboard.synced")} ${refreshed}`}
              </span>
            ) : null}
          </div>
        </div>
        <div className="cc-hero-side">
          <button
            type="button"
            className={`btn btn-sm cc-customize-btn${customizing ? " active" : ""}`}
            onClick={() => setCustomizing((v) => !v)}
          >
            {customizing ? t("dashboard.doneCustomize") : t("dashboard.customize")}
          </button>
          <div className="cc-hero-pulse" aria-hidden>
            <div className="cc-pulse-ring" />
            <div className="cc-pulse-core">
              {dash?.flow?.company_name?.slice(0, 2)?.toUpperCase() || "CC"}
            </div>
          </div>
        </div>
      </section>

      {customizing ? (
        <div className="cc-customize-bar">
          <p className="text-dim">{t("dashboard.customizeHint")}</p>
          <div className="cc-customize-toggles">
            {WIDGET_REGISTRY.map((w) => {
              const visible = isWidgetVisible(ccLayout, w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  className={`cc-toggle-chip${visible ? " on" : ""}`}
                  onClick={() => persist(toggleWidgetHidden(ccLayout, w.id))}
                >
                  {visible ? t("dashboard.show") : t("dashboard.hide")} · {widgetTitle[w.id]}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <LifecycleFlowGraph
        flow={dash?.flow ?? { company_name: "", products: [] }}
        companyName={dash?.flow?.company_name}
      />

      {isLoading ? <p className="text-dim">{t("dashboard.loading")}</p> : null}

      <div className="cc-widget-grid">
        {ccLayout.order.map((id) => {
          const node = renderWidget(id);
          if (!node) return null;
          return (
            <div
              key={id}
              className={`cc-widget-slot cc-widget-${widgetSize(ccLayout, id)}${!isWidgetVisible(ccLayout, id) && customizing ? " cc-widget-hidden" : ""}`}
            >
              {node}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href?: string;
  tone: string;
}) {
  const inner = (
    <div className={`cc-kpi cc-kpi-${tone}`}>
      <span className="cc-kpi-label">{label}</span>
      <strong className="cc-kpi-value">{value}</strong>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function ChartPanel({
  title,
  subtitle,
  accent,
  wide,
  children,
}: {
  title: string;
  subtitle: string;
  accent: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section className={`cc-chart-panel cc-accent-${accent}${wide ? " cc-wide" : ""}`}>
      <header className="cc-chart-head">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <span className="cc-live-dot" title={t("home.liveCompanyData")} />
      </header>
      <div className="cc-chart-body">{children}</div>
    </section>
  );
}
