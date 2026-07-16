"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import { isPlatformRole } from "@/shared/permissions";

interface AccessRequest {
  id: number;
  company_name: string;
  preferred_slug?: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  company_size?: string;
  industry?: string;
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

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export default function PlatformAccessRequestsPage() {
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
        `Created ${res.tenant.name} (${res.tenant.slug}). Admin: ${res.admin.email}`,
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
        title="Platform access only"
        description="Only platform administrators can review access requests."
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
          Approve a landing-page request below, or{" "}
          <a href="/platform/tenants" style={{ color: "var(--color-primary)" }}>
            add a company manually
          </a>{" "}
          with Company ID and admin credentials.
        </p>
      </section>

      {provisionHint && (
        <div className="data-panel" style={{ borderColor: "var(--color-success)" }}>
          <p>{provisionHint}</p>
        </div>
      )}

      <section className="data-panel">
        <div className="landing-filter-bar">
          <h2 className="panel-title" style={{ marginBottom: 0 }}>Access Requests</h2>
          <div className="auth-mode-toggle">
            {(["pending", "approved", "rejected", ""] as const).map((s) => (
              <button
                key={s || "all"}
                type="button"
                className={`btn btn-sm${filter === s ? " btn-primary" : ""}`}
                onClick={() => setFilter(s)}
              >
                {s === "" ? "All" : STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="text-dim">Loading…</p>
        ) : requests.length === 0 ? (
          <EmptyState
            title="No requests"
            description="New requests from the public landing page will appear here."
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Submitted</th>
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
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td>{new Date(r.created_at).toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => openRequest(r)}
                      >
                        {r.status === "pending" ? "Review" : "View"}
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
          <h2 className="panel-title">Details — {selected.company_name}</h2>
          <div className="landing-detail-grid">
            <div><span className="text-dim">Contact:</span> {selected.contact_name}</div>
            <div><span className="text-dim">Email:</span> {selected.contact_email}</div>
            {selected.contact_phone && (
              <div><span className="text-dim">Phone:</span> {selected.contact_phone}</div>
            )}
            {selected.company_size && (
              <div><span className="text-dim">Size:</span> {selected.company_size}</div>
            )}
            {selected.industry && (
              <div><span className="text-dim">Industry:</span> {selected.industry}</div>
            )}
            {selected.preferred_slug && (
              <div><span className="text-dim">Preferred slug:</span> {selected.preferred_slug}</div>
            )}
          </div>
          {selected.message && (
            <p className="text-dim landing-detail-message">{selected.message}</p>
          )}

          {selected.status === "pending" ? (
            <div className="landing-review-actions">
              <form onSubmit={handleProvision} className="user-form landing-review-form">
                <h3>Approve and create account</h3>
                <div className="grid grid-cols-2">
                  <div className="form-group">
                    <label>Company ID (slug)</label>
                    <input
                      value={tenantSlug}
                      onChange={(e) => setTenantSlug(e.target.value)}
                      required
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    />
                  </div>
                  <div className="form-group">
                    <label>Company admin password</label>
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
                  <label>Notes (optional)</label>
                  <input
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="For sending to the company"
                  />
                </div>
                {provisionMutation.isError && (
                  <p className="auth-error">
                    {provisionMutation.error instanceof Error
                      ? provisionMutation.error.message
                      : "Failed to provision account"}
                  </p>
                )}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={provisionMutation.isPending}
                >
                  {provisionMutation.isPending ? "Provisioning…" : "Approve and issue credentials"}
                </button>
              </form>

              <div className="user-form landing-review-form">
                <h3>Reject request</h3>
                <div className="form-group">
                  <label>Reason (optional)</label>
                  <textarea
                    rows={3}
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
                  />
                </div>
                {rejectMutation.isError && (
                  <p className="auth-error">
                    {rejectMutation.error instanceof Error
                      ? rejectMutation.error.message
                      : "Request failed"}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-danger-outline"
                  disabled={rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate(selected.id)}
                >
                  {rejectMutation.isPending ? "Rejecting…" : "Reject request"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-dim">
              Status: {STATUS_LABELS[selected.status]}
              {selected.admin_notes && ` — ${selected.admin_notes}`}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
