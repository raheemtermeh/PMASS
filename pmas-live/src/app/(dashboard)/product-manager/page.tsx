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
          <p className="wizard-kicker">Value Stream Management</p>
          <h2 className="pm-hero-title">Product is the center</h2>
          <p className="text-dim" style={{ maxWidth: "42rem", marginTop: "0.5rem" }}>
            Company → Organization → <strong>Product</strong> → Pipeline → Stage Instance →
            Project / Feature / Task. This hub tracks what you can do with your role ({roleLabel}).
          </p>
        </div>
        <div className="pm-hero-actions">
          <Link href="/products" className="btn btn-primary">
            Open Products
          </Link>
          <Link href="/organization" className="btn">
            Organization
          </Link>
          <button type="button" className="btn" onClick={() => resetTour(userKey)}>
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
          <strong className="stat-value">{user.permissions?.length ?? 0}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Workspace</span>
          <strong className="stat-value" style={{ fontSize: "1rem" }}>
            {user.tenant?.name ?? "Platform"}
          </strong>
        </div>
      </section>

      <section className="data-panel">
        <div className="panel-header">
          <h2 className="panel-title">Playbook</h2>
        </div>
        <div className="pm-cap-grid">
          {caps.map((cap) => {
            const checked = isChecked(userKey, cap.id);
            return (
              <article key={cap.id} className={`pm-cap-card${checked ? " is-done" : ""}`}>
                <header className="pm-cap-header">
                  <label className="pm-cap-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(userKey, cap.id)}
                    />
                    <span>{cap.title}</span>
                  </label>
                  {cap.href ? (
                    <Link href={cap.href} className="btn btn-sm">
                      Open
                    </Link>
                  ) : null}
                </header>
                <p className="text-dim" style={{ fontSize: "0.875rem" }}>
                  {cap.summary}
                </p>
                <ul className="pm-cap-actions">
                  {cap.actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
