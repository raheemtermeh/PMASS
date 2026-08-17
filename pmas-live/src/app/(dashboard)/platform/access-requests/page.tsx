"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import { isPlatformRole } from "@/shared/permissions";
import { useI18n } from "@/core/providers/I18nProvider";
import { localizedEnumLabel, statusTranslationKey } from "@/lib/localized-labels";

interface AccessRequest {
  id: number;
  company_name: string;
  preferred_slug?: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  company_size?: string;
  industry?: string;
  website?: string;
  country?: string;
  message?: string;
  status: "pending" | "approved" | "rejected";
  admin_notes?: string;
  provisioned_tenant_id?: number;
  created_at: string;
}

interface ProvisionResult {
  request: AccessRequest;
  tenant: { slug: string; name: string };
  admin: { email: string };
}

export default function PlatformAccessRequestsPage() {
  const { t, d } = useI18n();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const enabled = isPlatformRole(user?.role);

  const [filter, setFilter] = useState<"" | "pending" | "approved" | "rejected">("pending");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tenantSlug, setTenantSlug] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");
  const [provisionHint, setProvisionHint] = useState("");

  const queryPath =
    filter === "" ? "/api/v1/access-requests" : `/api/v1/access-requests?status=${filter}`;

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["access-requests", filter],
    queryFn: () => httpClient.get<AccessRequest[]>(queryPath),
    enabled,
    staleTime: 30_000,
  });

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  const provisionMutation = useMutation({
    mutationFn: (id: number) =>
      httpClient.post<ProvisionResult>(`/api/v1/access-requests/${id}/provision`, {
        tenant_slug: tenantSlug.trim().toLowerCase(),
        admin_password: adminPassword,
        admin_notes: adminNotes.trim() || undefined,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["access-requests"] });
      setProvisionHint(
        t("accessRequests.created", { name: res.tenant.name, slug: res.tenant.slug, email: res.admin.email }),
      );
      setSelectedId(null);
      setTenantSlug("");
      setAdminPassword("");
      setAdminNotes("");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) =>
      httpClient.patch<AccessRequest>(`/api/v1/access-requests/${id}`, {
        status: "rejected",
        admin_notes: rejectNotes.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["access-requests"] });
      setSelectedId(null);
      setRejectNotes("");
    },
  });

  if (!enabled) {
    return (
      <EmptyState
        title={t("accessRequests.accessOnly")}
        description={t("accessRequests.accessOnlyDescription")}
      />
    );
  }

  function openRequest(req: AccessRequest) {
    setSelectedId(req.id);
    setTenantSlug(req.preferred_slug ?? "");
    setAdminPassword("");
    setAdminNotes("");
    setRejectNotes(req.admin_notes ?? "");
    setProvisionHint("");
  }

  function handleProvision(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    provisionMutation.mutate(selectedId);
  }

  return (
    <div className="page-stack">
      <section className="data-panel platform-hint-panel">
        <p className="text-dim" style={{ margin: 0, fontSize: "0.875rem" }}>
          {t("accessRequests.hintBefore")}{" "}
          <a href="/platform/tenants" style={{ color: "var(--color-primary)" }}>
            {t("accessRequests.addManually")}
          </a>{" "}
          {t("accessRequests.hintAfter")}
        </p>
      </section>

      {provisionHint && (
        <div className="data-panel" style={{ borderColor: "var(--color-success)" }}>
          <p>{provisionHint}</p>
        </div>
      )}

      <section className="data-panel">
        <div className="landing-filter-bar">
          <h2 className="panel-title" style={{ marginBottom: 0 }}>{t("accessRequests.title")}</h2>
          <div className="auth-mode-toggle">
            {(["pending", "approved", "rejected", ""] as const).map((s) => (
              <button
                key={s || "all"}
                type="button"
                className={`btn btn-sm${filter === s ? " btn-primary" : ""}`}
                onClick={() => setFilter(s)}
              >
                {s === "" ? t("common.all") : localizedEnumLabel(s, statusTranslationKey(s), t)}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="text-dim">{t("common.loading")}</p>
        ) : requests.length === 0 ? (
          <EmptyState
            title={t("accessRequests.noRequests")}
            description={t("accessRequests.noRequestsDescription")}
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("common.company")}</th>
                  <th>{t("accessRequests.contact")}</th>
                  <th>{t("common.email")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("accessRequests.submitted")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.company_name}</td>
                    <td>{r.contact_name}</td>
                    <td className="font-mono">{r.contact_email}</td>
                    <td>
                      <span className={`status-badge status-${r.status}`}>
                        {localizedEnumLabel(r.status, statusTranslationKey(r.status), t)}
                      </span>
                    </td>
                    <td>{d(r.created_at, { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => openRequest(r)}
                      >
                        {r.status === "pending" ? t("accessRequests.review") : t("common.view")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section className="data-panel">
          <h2 className="panel-title">{t("accessRequests.detailsTitle", { name: selected.company_name })}</h2>
          <div className="landing-detail-grid">
            <div><span className="text-dim">{t("accessRequests.contact")}:</span> {selected.contact_name}</div>
            <div><span className="text-dim">{t("common.email")}:</span> {selected.contact_email}</div>
            {selected.contact_phone && (
              <div><span className="text-dim">{t("common.phone")}:</span> {selected.contact_phone}</div>
            )}
            {selected.company_size && (
              <div><span className="text-dim">{t("accessRequests.size")}:</span> {selected.company_size}</div>
            )}
            {selected.industry && (
              <div><span className="text-dim">{t("accessRequests.industry")}:</span> {selected.industry}</div>
            )}
            {selected.website && (
              <div>
                <span className="text-dim">{t("accessRequests.website")}:</span>{" "}
                <a href={selected.website} target="_blank" rel="noopener noreferrer">
                  {selected.website}
                </a>
              </div>
            )}
            {selected.country && (
              <div><span className="text-dim">{t("accessRequests.country")}:</span> {selected.country}</div>
            )}
            {selected.preferred_slug && (
              <div><span className="text-dim">{t("accessRequests.preferredSlug")}:</span> {selected.preferred_slug}</div>
            )}
          </div>
          {selected.message && (
            <p className="text-dim landing-detail-message">{selected.message}</p>
          )}

          {selected.status === "pending" ? (
            <div className="landing-review-actions">
              <form onSubmit={handleProvision} className="user-form landing-review-form">
                <h3>{t("accessRequests.approveTitle")}</h3>
                <div className="grid grid-cols-2">
                  <div className="form-group">
                    <label>{t("platformTenants.companyIdSlug")}</label>
                    <input
                      value={tenantSlug}
                      onChange={(e) => setTenantSlug(e.target.value)}
                      required
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    />
                  </div>
                  <div className="form-group">
                    <label>{t("accessRequests.companyAdminPassword")}</label>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>{t("accessRequests.notesOptional")}</label>
                  <input
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder={t("accessRequests.notesPlaceholder")}
                  />
                </div>
                {provisionMutation.isError && (
                  <p className="auth-error">
                    {t("accessRequests.provisionFailed")}
                  </p>
                )}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={provisionMutation.isPending}
                >
                  {provisionMutation.isPending ? t("platformTenants.provisioning") : t("accessRequests.approveCredentials")}
                </button>
              </form>

              <div className="user-form landing-review-form">
                <h3>{t("accessRequests.rejectTitle")}</h3>
                <div className="form-group">
                  <label>{t("accessRequests.reasonOptional")}</label>
                  <textarea
                    rows={3}
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
                  />
                </div>
                {rejectMutation.isError && (
                  <p className="auth-error">
                    {t("accessRequests.requestFailed")}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-danger-outline"
                  disabled={rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate(selected.id)}
                >
                  {rejectMutation.isPending ? t("accessRequests.rejecting") : t("accessRequests.rejectRequest")}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-dim">
              {t("accessRequests.statusLine", { status: localizedEnumLabel(selected.status, statusTranslationKey(selected.status), t) })}
              {selected.admin_notes && ` — ${selected.admin_notes}`}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
