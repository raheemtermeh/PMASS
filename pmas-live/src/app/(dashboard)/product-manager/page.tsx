"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuthStore } from "@/core/auth/auth-store";
import {
  useOnboardingStore,
  usePmProgressStore,
} from "@/features/guidance/guidance-store";
import { capabilitiesForUser } from "@/shared/product-guidance";

export default function ProductManagerPage() {
  const user = useAuthStore((s) => s.user);
  const resetTour = useOnboardingStore((s) => s.resetForUser);
  const toggle = usePmProgressStore((s) => s.toggle);
  const isChecked = usePmProgressStore((s) => s.isChecked);
  const checkedCount = usePmProgressStore((s) => s.checkedCount);

  const caps = useMemo(() => {
    if (!user) return [];
    return capabilitiesForUser({
      role: user.role,
      permissions: user.permissions,
      hasTenant: Boolean(user.tenant_id),
    });
  }, [user]);

  if (!user) return null;

  const userKey = String(user.id);
  const done = checkedCount(
    userKey,
    caps.map((c) => c.id),
  );
  const total = caps.length || 1;
  const pct = Math.round((done / total) * 100);

  const roleLabel =
    user.role === "platform_admin" || user.role === "super_admin"
      ? "Platform Admin"
      : user.role === "tenant_admin"
        ? "Company Admin"
        : "Contributor";

  return (
    <div className="page-stack">
      <section className="pm-hero">
        <div>
          <p className="wizard-kicker">Product Manager</p>
          <h2 className="pm-hero-title">Value stream playbook</h2>
          <p className="text-dim" style={{ maxWidth: "40rem", marginTop: "0.5rem" }}>
            Filtered by your role ({roleLabel}). Product is the center — organization,
            pipeline execution, and planning cascade around it.
          </p>
        </div>
        <div className="pm-hero-actions">
          <button
            type="button"
            className="btn"
            onClick={() => resetTour(userKey)}
          >
            Replay setup wizard
          </button>
          <div className="pm-progress-ring" aria-label={`${pct}% complete`}>
            <strong>{pct}%</strong>
            <span>
              {done}/{caps.length} done
            </span>
          </div>
        </div>
      </section>

      <section className="stats-row">
        <div className="stat-card">
          <span className="stat-label">Capabilities</span>
          <strong className="stat-value">{caps.length}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Permissions</span>
          <strong className="stat-value">
            {user.role === "tenant_admin" ||
            user.role === "platform_admin" ||
            user.role === "super_admin"
              ? "All granted"
              : user.permissions.length}
          </strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Workspace</span>
          <strong className="stat-value" style={{ fontSize: "1rem" }}>
            {user.tenant?.name ?? "Platform"}
          </strong>
        </div>
      </section>

      {caps.length === 0 ? (
        <section className="data-panel">
          <h2 className="panel-title">Nothing assigned yet</h2>
          <p className="text-dim">
            Ask your company admin to grant department permissions in User Management.
          </p>
        </section>
      ) : (
        <div className="pm-grid">
          {caps.map((cap) => {
            const checked = isChecked(userKey, cap.id);
            return (
              <article
                key={cap.id}
                className={`pm-card${checked ? " pm-card-done" : ""}`}
              >
                <div className="pm-card-top">
                  <label className="pm-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(userKey, cap.id)}
                    />
                    <span>{cap.title}</span>
                  </label>
                  {cap.href ? (
                    <Link href={cap.href} className="btn btn-sm btn-primary">
                      Open
                    </Link>
                  ) : null}
                </div>
                <p className="pm-card-summary">{cap.summary}</p>
                <ol className="pm-card-steps">
                  {cap.actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ol>
              </article>
            );
          })}
        </div>
      )}

      <section className="data-panel">
        <h2 className="panel-title">How PMAS product areas fit together</h2>
        <div className="pm-flow">
          <div>
            <strong>1. Access</strong>
            <p className="text-dim">Users + permissions decide which panels appear.</p>
          </div>
          <div>
            <strong>2. Workboard</strong>
            <p className="text-dim">Employer-defined tasks / todos / status per section.</p>
          </div>
          <div>
            <strong>3. Domain CRUD</strong>
            <p className="text-dim">Campaigns, subsystems, tokens, ledger rows, nodes…</p>
          </div>
          <div>
            <strong>4. Cross-links</strong>
            <p className="text-dim">Graph edges and dependent subsystems connect impact.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
