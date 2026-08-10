"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { ModalPortal } from "@/components/ModalPortal";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import { isPlatformRole } from "@/shared/permissions";

interface Tenant {
  id: number;
  slug: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

interface TenantDetail extends Tenant {
  company_id?: string | null;
  company_status?: string;
  logo_url?: string;
  language?: string;
  timezone?: string;
  user_count: number;
  active_users: number;
  employee_count: number;
  product_count: number;
  project_count: number;
  admin_email?: string;
  admin_name?: string;
}

interface ProvisionResponse {
  tenant: Tenant;
  admin: { email: string; full_name: string };
}

type StatusFilter = "all" | "active" | "inactive";

function fmtDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function PlatformTenantsPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [createdHint, setCreatedHint] = useState("");
  const [actionHint, setActionHint] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [editName, setEditName] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);

  const enabled = isPlatformRole(user?.role);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => httpClient.get<Tenant[]>("/api/v1/tenants"),
    enabled,
    staleTime: 60_000,
  });

  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailError,
    error: detailErr,
  } = useQuery({
    queryKey: ["tenant-detail", detailId],
    queryFn: () => httpClient.get<TenantDetail>(`/api/v1/tenants/${detailId}`),
    enabled: enabled && detailId != null,
    staleTime: 15_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => {
      if (statusFilter === "active" && !t.is_active) return false;
      if (statusFilter === "inactive" && t.is_active) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q);
    });
  }, [tenants, search, statusFilter]);

  const provisionMutation = useMutation({
    mutationFn: () =>
      httpClient.post<ProvisionResponse>("/api/v1/tenants", {
        tenant_name: tenantName,
        tenant_slug: tenantSlug.trim().toLowerCase(),
        admin_full_name: adminFullName,
        admin_email: adminEmail,
        admin_password: adminPassword,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["tenants"] });
      setCreatedHint(
        `Created ${res.tenant.name} (${res.tenant.slug}). Admin: ${res.admin.email}`,
      );
      setTenantName("");
      setTenantSlug("");
      setAdminFullName("");
      setAdminEmail("");
      setAdminPassword("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { name?: string; is_active?: boolean } }) =>
      httpClient.patch<Tenant>(`/api/v1/tenants/${id}`, body),
    onSuccess: (t, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["tenants"] });
      void queryClient.invalidateQueries({ queryKey: ["tenant-detail", t.id] });
      setEditing(null);
      if (vars.body.name !== undefined) {
        setActionHint(`Renamed company to “${t.name}”.`);
      } else if (vars.body.is_active === false) {
        setActionHint(`Deactivated “${t.name}”. Users of this company cannot sign in.`);
      } else if (vars.body.is_active === true) {
        setActionHint(`Activated “${t.name}”.`);
      }
    },
  });

  if (!enabled) {
    return (
      <EmptyState
        title="Platform access only"
        description="Only platform administrators can provision company accounts."
      />
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    provisionMutation.mutate();
  }

  function openEdit(t: Tenant) {
    setEditing(t);
    setEditName(t.name);
    setActionHint("");
  }

  function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const name = editName.trim();
    if (!name) return;
    updateMutation.mutate({ id: editing.id, body: { name } });
  }

  function toggleActive(t: Tenant) {
    if (t.is_active) {
      const ok = window.confirm(
        `Deactivate “${t.name}”? Users of this company will not be able to sign in until it is activated again.`,
      );
      if (!ok) return;
      updateMutation.mutate({ id: t.id, body: { is_active: false } });
      return;
    }
    updateMutation.mutate({ id: t.id, body: { is_active: true } });
  }

  return (
    <div className="page-stack">
      <section className="data-panel">
        <h2 className="panel-title">Provision Company</h2>
        <p className="text-dim" style={{ marginBottom: "1rem", fontSize: "0.875rem" }}>
          Creates an isolated company workspace with empty services and a tenant admin who can invite employees.
        </p>
        <form onSubmit={handleSubmit} className="user-form">
          <div className="grid grid-cols-2">
            <div className="form-group">
              <label htmlFor="t-name">Company name</label>
              <input id="t-name" value={tenantName} onChange={(e) => setTenantName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="t-slug">Company ID (slug)</label>
              <input
                id="t-slug"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="acme-corp"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </div>
            <div className="form-group">
              <label htmlFor="a-name">Admin full name</label>
              <input id="a-name" value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="a-email">Admin email</label>
              <input id="a-email" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="a-pass">Admin password</label>
              <input
                id="a-pass"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
          </div>
          {provisionMutation.isError && (
            <p className="auth-error">
              {provisionMutation.error instanceof Error
                ? provisionMutation.error.message
                : "Provision failed"}
            </p>
          )}
          {createdHint && <p className="text-dim">{createdHint}</p>}
          <button type="submit" className="btn btn-primary" disabled={provisionMutation.isPending}>
            {provisionMutation.isPending ? "Provisioning…" : "Create company"}
          </button>
        </form>
      </section>

      <section className="data-panel">
        <div className="panel-header" style={{ marginBottom: "1rem" }}>
          <h2 className="panel-title" style={{ marginBottom: 0 }}>
            Companies
          </h2>
        </div>

        <div className="resource-toolbar" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or company ID…"
            aria-label="Search companies"
            style={{ minWidth: "14rem", flex: "1 1 12rem" }}
          />
          <div style={{ display: "flex", gap: "0.35rem" }}>
            {([
              ["all", "All"],
              ["active", "Active"],
              ["inactive", "Inactive"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`btn btn-sm${statusFilter === value ? " btn-primary" : ""}`}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {actionHint ? <p className="text-dim" style={{ marginBottom: "0.75rem" }}>{actionHint}</p> : null}
        {updateMutation.isError ? (
          <p className="auth-error">
            {updateMutation.error instanceof Error ? updateMutation.error.message : "Update failed"}
          </p>
        ) : null}

        {isLoading ? (
          <p className="text-dim">Loading…</p>
        ) : tenants.length === 0 ? (
          <EmptyState
            title="No companies yet"
            description="Provision the first customer account. Their panel will start empty until they add their own data."
          />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches" description="Try a different search or status filter." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company ID</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td>
                    <button type="button" className="link-btn" onClick={() => setDetailId(t.id)}>
                      {t.name}
                    </button>
                  </td>
                  <td className="font-mono">{t.slug}</td>
                  <td>
                    <span className={`status-badge status-${t.is_active ? "active" : "inactive"}`}>
                      {t.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{fmtDate(t.created_at)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="btn btn-sm" onClick={() => setDetailId(t.id)}>
                      Details
                    </button>{" "}
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => openEdit(t)}
                      disabled={updateMutation.isPending}
                    >
                      Edit
                    </button>{" "}
                    <button
                      type="button"
                      className={`btn btn-sm${t.is_active ? " btn-danger" : ""}`}
                      onClick={() => toggleActive(t)}
                      disabled={updateMutation.isPending}
                    >
                      {t.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {detailId != null ? (
        <ModalPortal>
          <div className="modal-backdrop" role="presentation" onClick={() => setDetailId(null)}>
            <div
              className="modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="company-detail-title"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "36rem" }}
            >
              <h3 id="company-detail-title" className="panel-title">
                Company details
              </h3>

              {detailLoading ? (
                <p className="text-dim">Loading…</p>
              ) : detailError ? (
                <p className="auth-error">
                  {detailErr instanceof Error ? detailErr.message : "Failed to load details"}
                </p>
              ) : detail ? (
                <div className="page-stack" style={{ gap: "1rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "1.1rem" }}>{detail.name}</strong>
                      <span className={`status-badge status-${detail.is_active ? "active" : "inactive"}`}>
                        {detail.is_active ? "Active" : "Inactive"}
                      </span>
                      {detail.company_status ? (
                        <span className="text-dim" style={{ fontSize: "0.8rem" }}>
                          Company: {detail.company_status}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-dim font-mono" style={{ marginTop: "0.35rem", fontSize: "0.85rem" }}>
                      {detail.slug}
                      {detail.company_id ? ` · ${detail.company_id}` : ""}
                    </p>
                  </div>

                  <dl className="grid grid-cols-2" style={{ gap: "0.75rem 1rem", margin: 0 }}>
                    <div>
                      <dt className="text-dim" style={{ fontSize: "0.75rem" }}>Created</dt>
                      <dd style={{ margin: 0 }}>{fmtDate(detail.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-dim" style={{ fontSize: "0.75rem" }}>Updated</dt>
                      <dd style={{ margin: 0 }}>{fmtDate(detail.updated_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-dim" style={{ fontSize: "0.75rem" }}>Language</dt>
                      <dd style={{ margin: 0 }}>{detail.language || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-dim" style={{ fontSize: "0.75rem" }}>Timezone</dt>
                      <dd style={{ margin: 0 }}>{detail.timezone || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-dim" style={{ fontSize: "0.75rem" }}>Admin</dt>
                      <dd style={{ margin: 0 }}>
                        {detail.admin_name || detail.admin_email
                          ? `${detail.admin_name || "—"}${detail.admin_email ? ` (${detail.admin_email})` : ""}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-dim" style={{ fontSize: "0.75rem" }}>Logo</dt>
                      <dd style={{ margin: 0, wordBreak: "break-all" }}>{detail.logo_url || "—"}</dd>
                    </div>
                  </dl>

                  <div className="grid grid-cols-2" style={{ gap: "0.75rem" }}>
                    {[
                      ["Users", detail.user_count],
                      ["Active users", detail.active_users],
                      ["Employees", detail.employee_count],
                      ["Products", detail.product_count],
                      ["Projects", detail.project_count],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="data-panel" style={{ padding: "0.75rem", margin: 0 }}>
                        <div className="text-dim" style={{ fontSize: "0.75rem" }}>{label}</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="modal-footer" style={{ justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setDetailId(null);
                          openEdit(detail);
                        }}
                      >
                        Edit name
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm${detail.is_active ? " btn-danger" : ""}`}
                        onClick={() => toggleActive(detail)}
                        disabled={updateMutation.isPending}
                      >
                        {detail.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                    <button type="button" className="btn" onClick={() => setDetailId(null)}>
                      Close
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {editing ? (
        <ModalPortal>
          <div className="modal-backdrop" role="presentation" onClick={() => !updateMutation.isPending && setEditing(null)}>
            <div
              className="modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-company-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="edit-company-title" className="panel-title">
                Edit company
              </h3>
              <p className="text-dim" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
                Company ID (<span className="font-mono">{editing.slug}</span>) cannot be changed.
              </p>
              <form onSubmit={handleEditSubmit} className="user-form">
                <div className="form-group">
                  <label htmlFor="edit-name">Company name</label>
                  <input
                    id="edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setEditing(null)}
                    disabled={updateMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={updateMutation.isPending || !editName.trim()}>
                    {updateMutation.isPending ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}
