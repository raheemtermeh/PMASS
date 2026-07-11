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
  my_tasks: { id: string; title: string; status: string; priority: string }[];
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

  const employeeID = employees[0]?.id;
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

  return (
    <div className="page-stack">
      <section className="data-panel">
        <h2 className="panel-title" style={{ marginBottom: "0.5rem" }}>
          {company?.name ? `${company.name} dashboard` : "MVP Dashboard"}
        </h2>
        <p className="text-dim" style={{ fontSize: "0.875rem", maxWidth: 720 }}>
          Active products, pipeline status, my tasks, notifications, and recent activity — core MVP
          management view.
        </p>
      </section>

      {isLoading ? <p className="text-dim">Loading dashboard…</p> : null}

      <div className="grid grid-cols-2" style={{ gap: "1rem" }}>
        <Stat label="Active products" value={s?.active_products ?? 0} href="/products" />
        <Stat label="Completed" value={s?.completed_products ?? 0} />
        <Stat label="Draft / Ready" value={s?.draft_ready_products ?? 0} />
        <Stat label="Open tasks" value={s?.open_tasks ?? 0} href="/planning" />
        <Stat label="Unread notifications" value={s?.unread_notifications ?? 0} />
      </div>

      <section className="data-panel">
        <div className="panel-header">
          <h3 className="panel-title">Pipeline status</h3>
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

      <div className="grid grid-cols-2" style={{ gap: "1rem" }}>
        <section className="data-panel">
          <h3 className="panel-title" style={{ marginBottom: "0.75rem" }}>
            My tasks
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {(dash?.my_tasks ?? []).map((t) => (
              <li key={t.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                <strong>{t.title}</strong>
                <div className="text-dim" style={{ fontSize: "0.75rem" }}>
                  {t.status} · {t.priority}
                </div>
              </li>
            ))}
            {(dash?.my_tasks ?? []).length === 0 ? (
              <li className="text-dim">No assigned tasks yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="data-panel">
          <h3 className="panel-title" style={{ marginBottom: "0.75rem" }}>
            Products by department
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {(dash?.department_products ?? []).map((d) => (
              <li key={d.department_id} style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                {d.department_name}
                <strong style={{ float: "right" }}>{d.product_count}</strong>
              </li>
            ))}
            {(dash?.department_products ?? []).length === 0 ? (
              <li className="text-dim">Add departments in Organization.</li>
            ) : null}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-2" style={{ gap: "1rem" }}>
        <section className="data-panel">
          <h3 className="panel-title" style={{ marginBottom: "0.75rem" }}>
            Latest activity
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.875rem" }}>
            {(dash?.recent_activities ?? []).map((a) => (
              <li key={a.id} style={{ padding: "0.45rem 0", borderBottom: "1px solid var(--border)" }}>
                <span className="font-mono">{a.action}</span>
                <span className="text-dim"> · {a.entity_type}</span>
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
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.875rem" }}>
            {(dash?.notifications ?? []).map((n) => (
              <li key={n.id} style={{ padding: "0.45rem 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <div>
                    <strong>{n.title}</strong>
                    <div className="text-dim">{n.body}</div>
                  </div>
                  {!n.is_read ? (
                    <button type="button" className="btn btn-sm" onClick={() => markRead.mutate(n.id)}>
                      Read
                    </button>
                  ) : null}
                </div>
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
          Core flow checklist
        </h3>
        <ol style={{ paddingLeft: "1.25rem", lineHeight: 1.7, fontSize: "0.9rem" }}>
          <li>
            <Link href="/organization">Organization</Link> — employees, departments, teams
          </li>
          <li>
            <Link href="/products">Products</Link> — create product + dedicated pipeline
          </li>
          <li>Start execution → move / reject stages</li>
          <li>
            <Link href="/planning">Planning</Link> — project → feature → task
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
