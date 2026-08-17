"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuthStore } from "@/core/auth/auth-store";
import {
  useOnboardingStore,
  usePmProgressStore,
} from "@/features/guidance/guidance-store";
import { useI18n } from "@/core/providers/I18nProvider";
import { capabilitiesForUser } from "@/shared/product-guidance";

export default function ProductManagerPage() {
  const { t, n } = useI18n();
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
      ? t("productManager.roles.platformAdmin")
      : user.role === "tenant_admin"
        ? t("productManager.roles.companyAdmin")
        : t("productManager.roles.contributor");

  return (
    <div className="page-stack">
      <section className="pm-hero">
        <div>
          <p className="wizard-kicker">{t("productManager.kicker")}</p>
          <h2 className="pm-hero-title">{t("productManager.title")}</h2>
          <p className="text-dim" style={{ maxWidth: "40rem", marginTop: "0.5rem" }}>
            {t("productManager.description", { role: roleLabel })}
          </p>
        </div>
        <div className="pm-hero-actions">
          <button
            type="button"
            className="btn"
            onClick={() => resetTour(userKey)}
          >
            {t("productManager.replayWizard")}
          </button>
          <div
            className="pm-progress-ring"
            aria-label={t("productManager.progressAria", { percent: n(pct) })}
          >
            <strong>{t("productManager.percent", { value: n(pct) })}</strong>
            <span>
              {t("productManager.doneCount", { done: n(done), total: n(caps.length) })}
            </span>
          </div>
        </div>
      </section>

      <section className="stats-row">
        <div className="stat-card">
          <span className="stat-label">{t("productManager.stats.capabilities")}</span>
          <strong className="stat-value">{n(caps.length)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t("productManager.stats.permissions")}</span>
          <strong className="stat-value">
            {user.role === "tenant_admin" ||
            user.role === "platform_admin" ||
            user.role === "super_admin"
              ? t("productManager.allGranted")
              : n(user.permissions.length)}
          </strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t("productManager.stats.workspace")}</span>
          <strong className="stat-value" style={{ fontSize: "1rem" }}>
            {user.tenant?.name ?? t("productManager.platform")}
          </strong>
        </div>
      </section>

      {caps.length === 0 ? (
        <section className="data-panel">
          <h2 className="panel-title">{t("productManager.emptyTitle")}</h2>
          <p className="text-dim">
            {t("productManager.emptyDescription")}
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
                    <span>{t(`productManager.capabilities.${cap.id}.title`)}</span>
                  </label>
                  {cap.href ? (
                    <Link href={cap.href} className="btn btn-sm btn-primary">
                      {t("productManager.open")}
                    </Link>
                  ) : null}
                </div>
                <p className="pm-card-summary">
                  {t(`productManager.capabilities.${cap.id}.summary`)}
                </p>
                <ol className="pm-card-steps">
                  {cap.actions.map((a, index) => (
                    <li key={a}>
                      {t(`productManager.capabilities.${cap.id}.actions.${index}`)}
                    </li>
                  ))}
                </ol>
              </article>
            );
          })}
        </div>
      )}

      <section className="data-panel">
        <h2 className="panel-title">{t("productManager.flow.title")}</h2>
        <div className="pm-flow">
          <div>
            <strong>{t("productManager.flow.access.title")}</strong>
            <p className="text-dim">{t("productManager.flow.access.description")}</p>
          </div>
          <div>
            <strong>{t("productManager.flow.workboard.title")}</strong>
            <p className="text-dim">{t("productManager.flow.workboard.description")}</p>
          </div>
          <div>
            <strong>{t("productManager.flow.crud.title")}</strong>
            <p className="text-dim">{t("productManager.flow.crud.description")}</p>
          </div>
          <div>
            <strong>{t("productManager.flow.crossLinks.title")}</strong>
            <p className="text-dim">{t("productManager.flow.crossLinks.description")}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
