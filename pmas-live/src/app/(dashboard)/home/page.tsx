"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { httpClient } from "@/core/api/http-client";
import type { Company, Employee } from "@/features/vsm/types";
import type { DashboardData } from "@/features/dashboard/types";
import {
  ActivityTrendChart,
  DepartmentLoadChart,
  ProductsStatusChart,
  StagesStatusChart,
  TasksPriorityChart,
  TasksStatusChart,
} from "@/features/dashboard/charts";
import { LifecycleFlowGraph } from "@/features/dashboard/LifecycleFlowGraph";

const QUICK_ACTIONS = [
  { href: "/products", label: "Create product", hint: "Start a new product lifecycle", tone: "cyan" },
  { href: "/planning", label: "Create project", hint: "Plan work under a product", tone: "emerald" },
  { href: "/planning", label: "Create feature", hint: "Break a project into capabilities", tone: "amber" },
  { href: "/planning", label: "Create task", hint: "Assign executable work", tone: "rose" },
  { href: "/organization", label: "Organization", hint: "Employees, departments, teams", tone: "violet" },
  { href: "/settings", label: "Company settings", hint: "Profile, language, timezone", tone: "blue" },
] as const;

export default function HomePage() {
  const qc = useQueryClient();
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

  const markRead = useMutation({
    mutationFn: (id: string) => httpClient.post(`/api/v1/notifications/${id}/read`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-dashboard"] }),
  });

  const s = dash?.summary;
  const charts = dash?.charts;
  const overdueTasks =
    s?.overdue_tasks ??
    (dash?.my_tasks ?? []).filter((t) => {
      if (!t.due_date || ["COMPLETED", "ARCHIVED"].includes(t.status)) return false;
      return new Date(t.due_date).getTime() < Date.now();
    }).length;

  const refreshed = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div className="page-stack command-center cc-modern">
      <section className="cc-hero">
        <div className="cc-hero-glow" aria-hidden />
        <div className="cc-hero-copy">
          <p className="command-eyebrow">Command Center</p>
          <h2 className="cc-hero-title">
            {company?.name ? company.name : "Organization"}
            <span> live workspace</span>
          </h2>
          <p className="cc-hero-sub">
            Real-time company metrics, pipeline health, and workload — scoped to your tenant data,
            refreshed automatically.
          </p>
          <div className="cc-hero-chips">
            <span className="cc-chip cyan">{s?.unread_notifications ?? 0} unread</span>
            <span className="cc-chip amber">{s?.open_tasks ?? 0} open tasks</span>
            <span className="cc-chip rose">{overdueTasks} overdue</span>
            <span className="cc-chip emerald">{s?.employees ?? 0} people</span>
            {refreshed ? (
              <span className="cc-chip muted">
                {isFetching ? "Syncing…" : `Synced ${refreshed}`}
              </span>
            ) : null}
          </div>
        </div>
        <div className="cc-hero-pulse" aria-hidden>
          <div className="cc-pulse-ring" />
          <div className="cc-pulse-core">{company?.name?.slice(0, 2)?.toUpperCase() || "CC"}</div>
        </div>
      </section>

      <LifecycleFlowGraph
        flow={dash?.flow ?? { company_name: company?.name ?? "", products: [] }}
        companyName={company?.name}
      />

      {isLoading ? <p className="text-dim">Loading live dashboard…</p> : null}

      <div className="cc-kpi-grid">
        <Kpi tone="cyan" label="Active products" value={s?.active_products ?? 0} href="/products" />
        <Kpi tone="amber" label="Draft / Ready" value={s?.draft_ready_products ?? 0} href="/products" />
        <Kpi tone="emerald" label="Completed" value={s?.completed_products ?? 0} href="/products" />
        <Kpi tone="rose" label="Open tasks" value={s?.open_tasks ?? 0} href="/planning" />
        <Kpi tone="violet" label="Projects" value={s?.projects ?? 0} href="/planning" />
        <Kpi tone="blue" label="Departments" value={s?.departments ?? 0} href="/organization" />
        <Kpi tone="teal" label="Employees" value={s?.employees ?? 0} href="/organization" />
        <Kpi tone="pink" label="Unread" value={s?.unread_notifications ?? 0} />
        <Kpi tone="amber" label="On hold" value={s?.on_hold_products ?? 0} href="/products" />
        <Kpi tone="rose" label="Overdue tasks" value={overdueTasks} href="/planning" />
        <Kpi tone="emerald" label="Features" value={s?.features ?? 0} href="/planning" />
      </div>

      <div className="cc-charts-grid">
        <ChartPanel title="Products by status" subtitle="Live product lifecycle mix" accent="cyan">
          <ProductsStatusChart data={charts?.products_by_status ?? []} />
        </ChartPanel>
        <ChartPanel title="Tasks by status" subtitle="Company-wide task board" accent="emerald">
          <TasksStatusChart data={charts?.tasks_by_status ?? []} />
        </ChartPanel>
        <ChartPanel title="Activity · 14 days" subtitle="Company activity log trend" accent="info" wide>
          <ActivityTrendChart data={charts?.activity_by_day ?? []} />
        </ChartPanel>
        <ChartPanel title="Tasks by priority" subtitle="Urgency distribution" accent="amber">
          <TasksPriorityChart data={charts?.tasks_by_priority ?? []} />
        </ChartPanel>
        <ChartPanel title="Pipeline stages" subtitle="Stage instance health" accent="rose">
          <StagesStatusChart data={charts?.stages_by_status ?? []} />
        </ChartPanel>
        <ChartPanel title="Department load" subtitle="Active products per department" accent="violet" wide>
          <DepartmentLoadChart data={dash?.department_products ?? []} />
        </ChartPanel>
      </div>

      <section className="data-panel cc-panel">
        <div className="panel-header">
          <h3 className="panel-title">Quick actions</h3>
        </div>
        <div className="quick-actions-grid">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={`quick-action-card cc-action cc-action-${action.tone}`}
            >
              <strong>{action.label}</strong>
              <span className="text-dim">{action.hint}</span>
            </Link>
          ))}
        </div>
      </section>

      {(dash?.my_products?.length || dash?.my_projects?.length || dash?.my_features?.length) ? (
        <section className="data-panel cc-panel">
          <div className="panel-header">
            <h3 className="panel-title">My workspace — assignments</h3>
          </div>
          <div className="command-split">
            <div>
              <h4 className="text-dim" style={{ marginBottom: "0.5rem" }}>
                Products
              </h4>
              <ul className="command-list compact">
                {(dash?.my_products ?? []).map((p) => (
                  <li key={p.id}>
                    <Link href={`/products/${p.id}`}>{p.name}</Link>
                    <span className="status-pill">{p.status}</span>
                  </li>
                ))}
                {(dash?.my_products ?? []).length === 0 ? (
                  <li className="text-dim">No assigned products.</li>
                ) : null}
              </ul>
            </div>
            <div>
              <h4 className="text-dim" style={{ marginBottom: "0.5rem" }}>
                Projects
              </h4>
              <ul className="command-list compact">
                {(dash?.my_projects ?? []).map((p) => (
                  <li key={p.id}>
                    <Link href="/planning">{p.name}</Link>
                    <span className="status-pill">{p.status}</span>
                  </li>
                ))}
                {(dash?.my_projects ?? []).length === 0 ? (
                  <li className="text-dim">No assigned projects.</li>
                ) : null}
              </ul>
            </div>
            <div>
              <h4 className="text-dim" style={{ marginBottom: "0.5rem" }}>
                Features
              </h4>
              <ul className="command-list compact">
                {(dash?.my_features ?? []).map((f) => (
                  <li key={f.id}>
                    <Link href="/planning">{f.name}</Link>
                    <span className="status-pill">{f.status}</span>
                  </li>
                ))}
                {(dash?.my_features ?? []).length === 0 ? (
                  <li className="text-dim">No assigned features.</li>
                ) : null}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <section className="data-panel cc-panel">
        <div className="panel-header">
          <h3 className="panel-title">Workflow & pipeline status</h3>
          <Link href="/products" className="btn btn-sm">
            Products
          </Link>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th>Active stage</th>
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
                    No products in flight. <Link href="/products">Create one</Link>.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="command-split">
        <section className="data-panel cc-panel">
          <div className="panel-header">
            <h3 className="panel-title">My workspace — tasks</h3>
            <Link href="/planning" className="btn btn-sm">
              Planning
            </Link>
          </div>
          <ul className="command-list">
            {(dash?.my_tasks ?? []).map((t) => (
              <li key={t.id}>
                <div>
                  <strong>{t.title}</strong>
                  <div className="text-dim" style={{ fontSize: "0.75rem" }}>
                    {t.status} · {t.priority}
                    {t.due_date ? ` · due ${new Date(t.due_date).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <span className="status-pill">{t.status}</span>
              </li>
            ))}
            {(dash?.my_tasks ?? []).length === 0 ? (
              <li className="text-dim">No assigned tasks yet. Assign tasks in Planning.</li>
            ) : null}
          </ul>
        </section>

        <section className="data-panel cc-panel">
          <h3 className="panel-title" style={{ marginBottom: "0.75rem" }}>
            Notifications
          </h3>
          <ul className="command-list compact">
            {(dash?.notifications ?? []).map((n) => (
              <li key={n.id}>
                <div>
                  <strong>{n.title}</strong>
                  <div className="text-dim">{n.body}</div>
                </div>
                {!n.is_read ? (
                  <button type="button" className="btn btn-sm" onClick={() => markRead.mutate(n.id)}>
                    Read
                  </button>
                ) : (
                  <span className="text-dim" style={{ fontSize: "0.72rem" }}>
                    Read
                  </span>
                )}
              </li>
            ))}
            {(dash?.notifications ?? []).length === 0 ? (
              <li className="text-dim">No notifications.</li>
            ) : null}
          </ul>
        </section>
      </div>

      <section className="data-panel cc-panel">
        <h3 className="panel-title" style={{ marginBottom: "0.75rem" }}>
          Recent activities
        </h3>
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
            <li className="text-dim">Activity appears as you execute products.</li>
          ) : null}
        </ul>
      </section>
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
  return (
    <section className={`cc-chart-panel cc-accent-${accent}${wide ? " cc-wide" : ""}`}>
      <header className="cc-chart-head">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <span className="cc-live-dot" title="Live company data" />
      </header>
      <div className="cc-chart-body">{children}</div>
    </section>
  );
}
