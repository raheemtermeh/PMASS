"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import { isPlatformRole } from "@/shared/permissions";

interface Tenant {
  id: number;
  slug: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

interface ProvisionResponse {
  tenant: Tenant;
  admin: { email: string; full_name: string };
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

  const enabled = isPlatformRole(user?.role);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => httpClient.get<Tenant[]>("/api/v1/tenants"),
    enabled,
    staleTime: 60_000,
  });

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
        <h2 className="panel-title">Companies</h2>
        {isLoading ? (
          <p className="text-dim">Loading…</p>
        ) : tenants.length === 0 ? (
          <EmptyState
            title="No companies yet"
            description="Provision the first customer account. Their panel will start empty until they add their own data."
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company ID</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="font-mono">{t.slug}</td>
                  <td>{t.is_active ? "Active" : "Inactive"}</td>
                  <td>{new Date(t.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
