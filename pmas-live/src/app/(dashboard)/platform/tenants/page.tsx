"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { ModalPortal } from "@/components/ModalPortal";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import { isPlatformRole } from "@/shared/permissions";
import { useI18n } from "@/core/providers/I18nProvider";
import { localizedEnumLabel, statusTranslationKey } from "@/lib/localized-labels";

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

export default function PlatformTenantsPage() {
  const { t, n, d } = useI18n();
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
        t("platformTenants.created", { name: res.tenant.name, slug: res.tenant.slug, email: res.admin.email }),
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
    onSuccess: (tenant, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["tenants"] });
      void queryClient.invalidateQueries({ queryKey: ["tenant-detail", tenant.id] });
      setEditing(null);
      if (vars.body.name !== undefined) {
        setActionHint(t("platformTenants.renamed", { name: tenant.name }));
      } else if (vars.body.is_active === false) {
        setActionHint(t("platformTenants.deactivated", { name: tenant.name }));
      } else if (vars.body.is_active === true) {
        setActionHint(t("platformTenants.activated", { name: tenant.name }));
      }
    },
  });

  if (!enabled) {
    return (
      <EmptyState
        title={t("platformTenants.accessOnly")}
        description={t("platformTenants.accessOnlyDescription")}
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

  function toggleActive(tenant: Tenant) {
    if (tenant.is_active) {
      const ok = window.confirm(
        t("platformTenants.deactivateConfirm", { name: tenant.name }),
      );
      if (!ok) return;
      updateMutation.mutate({ id: tenant.id, body: { is_active: false } });
      return;
    }
    updateMutation.mutate({ id: tenant.id, body: { is_active: true } });
  }

  return (
    <div className="page-stack">
      <section className="data-panel">
        <h2 className="panel-title">{t("platformTenants.provisionTitle")}</h2>
        <p className="text-dim" style={{ marginBottom: "1rem", fontSize: "0.875rem" }}>
          {t("platformTenants.provisionDescription")}
        </p>
        <form onSubmit={handleSubmit} className="user-form">
          <div className="grid grid-cols-2">
            <div className="form-group">
              <label htmlFor="t-name">{t("platformTenants.companyName")}</label>
              <input id="t-name" value={tenantName} onChange={(e) => setTenantName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="t-slug">{t("platformTenants.companyIdSlug")}</label>
              <input
                id="t-slug"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder={t("platformTenants.slugPlaceholder")}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </div>
            <div className="form-group">
              <label htmlFor="a-name">{t("platformTenants.adminFullName")}</label>
              <input id="a-name" value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="a-email">{t("platformTenants.adminEmail")}</label>
              <input id="a-email" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="a-pass">{t("platformTenants.adminPassword")}</label>
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
              {t("platformTenants.provisionFailed")}
            </p>
          )}
          {createdHint && <p className="text-dim">{createdHint}</p>}
          <button type="submit" className="btn btn-primary" disabled={provisionMutation.isPending}>
            {provisionMutation.isPending ? t("platformTenants.provisioning") : t("platformTenants.createCompany")}
          </button>
        </form>
      </section>

      <section className="data-panel">
        <div className="panel-header" style={{ marginBottom: "1rem" }}>
          <h2 className="panel-title" style={{ marginBottom: 0 }}>
            {t("platformTenants.companies")}
          </h2>
        </div>

        <div className="resource-toolbar" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("platformTenants.searchPlaceholder")}
            aria-label={t("platformTenants.searchLabel")}
            style={{ minWidth: "14rem", flex: "1 1 12rem" }}
          />
          <div style={{ display: "flex", gap: "0.35rem" }}>
            {([
              ["all", t("common.all")],
              ["active", localizedEnumLabel("ACTIVE", statusTranslationKey("ACTIVE"), t)],
              ["inactive", localizedEnumLabel("INACTIVE", statusTranslationKey("INACTIVE"), t)],
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
            {t("platformTenants.updateFailed")}
          </p>
        ) : null}

        {isLoading ? (
          <p className="text-dim">{t("common.loading")}</p>
        ) : tenants.length === 0 ? (
          <EmptyState
            title={t("platformTenants.noCompanies")}
            description={t("platformTenants.noCompaniesDescription")}
          />
        ) : filtered.length === 0 ? (
          <EmptyState title={t("platformTenants.noMatches")} description={t("platformTenants.noMatchesDescription")} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("platformTenants.companyId")}</th>
                <th>{t("common.status")}</th>
                <th>{t("platformTenants.createdColumn")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tenant) => (
                <tr key={tenant.id}>
                  <td>
                    <button type="button" className="link-btn" onClick={() => setDetailId(tenant.id)}>
                      {tenant.name}
                    </button>
                  </td>
                  <td className="font-mono">{tenant.slug}</td>
                  <td>
                    <span className={`status-badge status-${tenant.is_active ? "active" : "inactive"}`}>
                      {localizedEnumLabel(tenant.is_active ? "ACTIVE" : "INACTIVE", statusTranslationKey(tenant.is_active ? "ACTIVE" : "INACTIVE"), t)}
                    </span>
                  </td>
                  <td>{d(tenant.created_at, { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="btn btn-sm" onClick={() => setDetailId(tenant.id)}>
                      {t("common.details")}
                    </button>{" "}
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => openEdit(tenant)}
                      disabled={updateMutation.isPending}
                    >
                      {t("common.edit")}
                    </button>{" "}
                    <button
                      type="button"
                      className={`btn btn-sm${tenant.is_active ? " btn-danger" : ""}`}
                      onClick={() => toggleActive(tenant)}
                      disabled={updateMutation.isPending}
                    >
                      {tenant.is_active ? t("platformTenants.deactivate") : t("platformTenants.activate")}
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
                {t("platformTenants.companyDetails")}
              </h3>

              {detailLoading ? (
                <p className="text-dim">{t("common.loading")}</p>
              ) : detailError ? (
                <p className="auth-error">
                  {t("platformTenants.detailsFailed")}
                </p>
              ) : detail ? (
                <div className="page-stack" style={{ gap: "1rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "1.1rem" }}>{detail.name}</strong>
                      <span className={`status-badge status-${detail.is_active ? "active" : "inactive"}`}>
                        {localizedEnumLabel(detail.is_active ? "ACTIVE" : "INACTIVE", statusTranslationKey(detail.is_active ? "ACTIVE" : "INACTIVE"), t)}
                      </span>
                      {detail.company_status ? (
                        <span className="text-dim" style={{ fontSize: "0.8rem" }}>
                          {t("platformTenants.companyStatus", { status: localizedEnumLabel(detail.company_status, statusTranslationKey(detail.company_status), t) })}
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
                      <dt className="text-dim" style={{ fontSize: "0.75rem" }}>{t("platformTenants.createdColumn")}</dt>
                      <dd style={{ margin: 0 }}>{d(detail.created_at, { dateStyle: "medium", timeStyle: "short" })}</dd>
                    </div>
                    <div>
                      <dt className="text-dim" style={{ fontSize: "0.75rem" }}>{t("platformTenants.updated")}</dt>
                      <dd style={{ margin: 0 }}>{detail.updated_at ? d(detail.updated_at, { dateStyle: "medium", timeStyle: "short" }) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-dim" style={{ fontSize: "0.75rem" }}>{t("platformTenants.language")}</dt>
                      <dd style={{ margin: 0 }}>{detail.language || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-dim" style={{ fontSize: "0.75rem" }}>{t("platformTenants.timezone")}</dt>
                      <dd style={{ margin: 0 }}>{detail.timezone || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-dim" style={{ fontSize: "0.75rem" }}>{t("platformTenants.admin")}</dt>
                      <dd style={{ margin: 0 }}>
                        {detail.admin_name || detail.admin_email
                          ? `${detail.admin_name || "—"}${detail.admin_email ? ` (${detail.admin_email})` : ""}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-dim" style={{ fontSize: "0.75rem" }}>{t("platformTenants.logo")}</dt>
                      <dd style={{ margin: 0, wordBreak: "break-all" }}>{detail.logo_url || "—"}</dd>
                    </div>
                  </dl>

                  <div className="grid grid-cols-2" style={{ gap: "0.75rem" }}>
                    {[
                      [t("platformTenants.users"), detail.user_count],
                      [t("platformTenants.activeUsers"), detail.active_users],
                      [t("platformTenants.employees"), detail.employee_count],
                      [t("platformTenants.products"), detail.product_count],
                      [t("platformTenants.projects"), detail.project_count],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="data-panel" style={{ padding: "0.75rem", margin: 0 }}>
                        <div className="text-dim" style={{ fontSize: "0.75rem" }}>{label}</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{n(Number(value))}</div>
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
                        {t("platformTenants.editName")}
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm${detail.is_active ? " btn-danger" : ""}`}
                        onClick={() => toggleActive(detail)}
                        disabled={updateMutation.isPending}
                      >
                        {detail.is_active ? t("platformTenants.deactivate") : t("platformTenants.activate")}
                      </button>
                    </div>
                    <button type="button" className="btn" onClick={() => setDetailId(null)}>
                      {t("common.close")}
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
                {t("platformTenants.editCompany")}
              </h3>
              <p className="text-dim" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
                {t("platformTenants.immutableId", { slug: editing.slug })}
              </p>
              <form onSubmit={handleEditSubmit} className="user-form">
                <div className="form-group">
                  <label htmlFor="edit-name">{t("platformTenants.companyName")}</label>
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
                    {t("common.cancel")}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={updateMutation.isPending || !editName.trim()}>
                    {updateMutation.isPending ? t("common.saving") : t("common.save")}
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
