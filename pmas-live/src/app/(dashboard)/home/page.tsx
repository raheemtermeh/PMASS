"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { httpClient } from "@/core/api/http-client";
import type { Company, Employee } from "@/features/vsm/types";

interface DashboardData {
  summary: {
    active_products: number;
    completed_products: number;
    draft_ready_products: number;
    open_tasks: number;
    unread_notifications: number;
  };
  my_tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date?: string | null;
  }[];
  pipeline_statuses: {
    product_id: string;
    product_name: string;
    status: string;
    active_stage?: string;
  }[];
  department_products: {
    department_id: string;
    department_name: string;
    product_count: number;
  }[];
  recent_activities: {
    id: string;
    entity_type: string;
    entity_id: string;
    action: string;
    created_at: string;
  }[];
  notifications: {
    id: string;
    type: string;
    title: string;
    body: string;
    is_read: boolean;
    created_at: string;
  }[];
}

const QUICK_ACTIONS = [
  { href: "/products", label: "Create product", hint: "Start a new product lifecycle" },
  { href: "/planning", label: "Create project", hint: "Plan work under a product" },
  { href: "/planning", label: "Create feature", hint: "Break a project into capabilities" },
  { href: "/planning", label: "Create task", hint: "Assign executable work" },
  { href: "/organization", label: "Organization", hint: "Employees, departments, teams" },
  { href: "/settings", label: "Company settings", hint: "Profile, language, timezone" },
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

  const { data: dash, isLoading } = useQuery({
    queryKey: ["vsm-dashboard", employeeID],
    queryFn: () => httpClient.get<DashboardData>(dashPath),
    staleTime: 20_000,
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => httpClient.post(`/api/v1/notifications/${id}/read`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-dashboard"] }),
  });

  const s = dash?.summary;
  const openFeaturesHint = (dash?.pipeline_statuses ?? []).length;
  const overdueTasks = (dash?.my_tasks ?? []).filter((t) => {
    if (!t.due_date || ["COMPLETED", "ARCHIVED"].includes(t.status)) return false;
    return new Date(t.due_date).getTime() < Date.now();
  }).length;

  return (
    <div className="page-stack command-center">
      <section className="data-panel command-hero">
        <div>
          <p className="command-eyebrow">Command Center</p>
          <h2 className="panel-title" style={{ marginBottom: "0.5rem" }}>
            {company?.name ? `${company.name} workspace` : "Organization dashboard"}
          </h2>
          <p className="text-dim" style={{ fontSize: "0.875rem", maxWidth: 720 }}>
            Personal and organization view of products, projects, features, tasks, workflows, and
            recent activity — the MVP decision hub.
          </p>
        </div>
        <div className="command-hero-meta">
          <span className="status-pill">{s?.unread_notifications ?? 0} unread</span>
          <span className="status-pill">{s?.open_tasks ?? 0} open tasks</span>
        </div>
      </section>

      {isLoading ? <p className="text-dim">Loading dashboard…</p> : null}

      <div className="command-stats">
        <Stat label="Active products" value={s?.active_products ?? 0} href="/products" />
        <Stat label="Draft / Ready" value={s?.draft_ready_products ?? 0} href="/products" />
        <Stat label="Completed products" value={s?.completed_products ?? 0} />
        <Stat label="Open tasks" value={s?.open_tasks ?? 0} href="/planning" />
        <Stat label="Workflows in flight" value={openFeaturesHint} href="/products" />
        <Stat label="Overdue (my tasks)" value={overdueTasks} href="/planning" />
        <Stat label="Unread notifications" value={s?.unread_notifications ?? 0} />
      </div>

      <section className="data-panel">
        <div className="panel-header">
          <h3 className="panel-title">Quick actions</h3>
        </div>
        <div className="quick-actions-grid">
          {QUICK_ACTIONS.map((action) => (
            <Link key={action.label} href={action.href} className="quick-action-card">
              <strong>{action.label}</strong>
              <span className="text-dim">{action.hint}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="data-panel">
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
        <section className="data-panel">
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

        <section className="data-panel">
          <h3 className="panel-title" style={{ marginBottom: "0.75rem" }}>
            Products by department
          </h3>
          <ul className="command-list">
            {(dash?.department_products ?? []).map((d) => (
              <li key={d.department_id}>
                <span>{d.department_name}</span>
                <strong>{d.product_count}</strong>
              </li>
            ))}
            {(dash?.department_products ?? []).length === 0 ? (
              <li className="text-dim">Add departments in Organization.</li>
            ) : null}
          </ul>
        </section>
      </div>

      <div className="command-split">
        <section className="data-panel">
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

        <section className="data-panel">
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

      <section className="data-panel">
        <h3 className="panel-title" style={{ marginBottom: "0.75rem" }}>
          Core MVP flow
        </h3>
        <ol className="command-flow">
          <li>
            <Link href="/organization">Organization</Link> — employees, departments, teams, membership
          </li>
          <li>
            <Link href="/products">Products</Link> — create product + dedicated pipeline
          </li>
          <li>Start execution → move / complete / reject stages</li>
          <li>
            <Link href="/planning">Planning</Link> — project → feature → task (assign & due dates)
          </li>
          <li>
            <Link href="/settings">Settings</Link> — company profile, language, timezone
          </li>
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <div className="stat-card">
      <span className="text-dim" style={{ fontSize: "0.75rem" }}>
        {label}
      </span>
      <strong style={{ fontSize: "1.5rem" }}>{value}</strong>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
