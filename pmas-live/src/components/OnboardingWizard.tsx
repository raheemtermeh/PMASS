"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/core/auth/auth-store";
import { useOnboardingStore } from "@/features/guidance/guidance-store";
import { buildWizardSteps, type WizardStep } from "@/shared/product-guidance";
import { firstAllowedPath } from "@/shared/routes";
import { sanitizeInternalPath } from "@/shared/security";
import { useI18n } from "@/core/providers/I18nProvider";

const STEP_TRANSLATIONS: Record<
  string,
  { title: string; body: string; bullets: string[]; cta?: string }
> = {
  welcome: {
    title: "onboarding.welcomeTitle",
    body: "onboarding.welcomeBody",
    bullets: ["onboarding.bullet1", "onboarding.bullet2", "onboarding.bullet3"],
  },
  addCompany: {
    title: "onboarding.addCompany",
    body: "onboarding.addCompanyBody",
    bullets: [
      "onboarding.addCompanyBullet1",
      "onboarding.addCompanyBullet2",
      "onboarding.addCompanyBullet3",
    ],
    cta: "onboarding.addCompanyCta",
  },
  reviewRequests: {
    title: "onboarding.reviewRequests",
    body: "onboarding.reviewRequestsBody",
    bullets: [
      "onboarding.reviewRequestsBullet1",
      "onboarding.reviewRequestsBullet2",
      "onboarding.reviewRequestsBullet3",
    ],
    cta: "onboarding.accessRequestsCta",
  },
  buildOrg: {
    title: "onboarding.buildOrg",
    body: "onboarding.buildOrgBody",
    bullets: [
      "onboarding.buildOrgBullet1",
      "onboarding.buildOrgBullet2",
      "onboarding.buildOrgBullet3",
    ],
    cta: "onboarding.openOrganization",
  },
  firstProduct: {
    title: "onboarding.firstProduct",
    body: "onboarding.firstProductBody",
    bullets: [
      "onboarding.firstProductBullet1",
      "onboarding.firstProductBullet2",
      "onboarding.firstProductBullet3",
    ],
    cta: "onboarding.openProducts",
  },
  planWork: {
    title: "onboarding.planWork",
    body: "onboarding.planWorkBody",
    bullets: [
      "onboarding.planWorkBullet1",
      "onboarding.planWorkBullet2",
      "onboarding.planWorkBullet3",
    ],
    cta: "onboarding.openPlanning",
  },
};

export function OnboardingWizard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const forceOpen = useOnboardingStore((s) => s.forceOpen);
  const completedByUser = useOnboardingStore((s) => s.completedByUser);
  const markCompleted = useOnboardingStore((s) => s.markCompleted);
  const setForceOpen = useOnboardingStore((s) => s.setForceOpen);
  const { t } = useI18n();

  const [stepIndex, setStepIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const steps = useMemo(() => {
    if (!user) return [];
    return buildWizardSteps({
      role: user.role,
      permissions: user.permissions,
      hasTenant: Boolean(user.tenant_id),
      fullName: user.full_name,
    });
  }, [user]);

  if (!mounted || !user || steps.length === 0) return null;

  const userKey = String(user.id);
  const tourCompleted = Boolean(completedByUser[userKey]);
  const shouldShow = forceOpen || !tourCompleted;
  if (!shouldShow) return null;

  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex >= steps.length - 1;
  const progress = ((stepIndex + 1) / steps.length) * 100;

  const firstName = user?.full_name.split(" ")[0] || "";
  const localizeStep = (raw: WizardStep) => {
    const map = STEP_TRANSLATIONS[raw.key];
    if (!map) return raw;
    const title =
      raw.key === "welcome"
        ? t(map.title, { name: firstName })
        : t(map.title);
    return {
      ...raw,
      title,
      body: t(map.body),
      bullets: map.bullets.map((b) => t(b)),
      ctaLabel: map.cta ? t(map.cta) : raw.ctaLabel,
    };
  };
  const localized = localizeStep(step);

  function finish() {
    markCompleted(userKey);
    setForceOpen(false);
    setStepIndex(0);
  }

  function skip() {
    finish();
  }

  function next() {
    if (!user) return;
    if (isLast) {
      finish();
      router.push(
        sanitizeInternalPath(
          firstAllowedPath(user.role, user.permissions, Boolean(user.tenant_id)),
        ),
      );
      return;
    }
    setStepIndex((i) => i + 1);
  }

  function goCta() {
    if (step.href) {
      router.push(sanitizeInternalPath(step.href));
    }
    if (isLast) finish();
    else setStepIndex((i) => i + 1);
  }

  return (
    <div
      className="modal-backdrop active wizard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-wizard-title"
      onClick={skip}
    >
      <div className="modal-content wizard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wizard-progress-track" aria-hidden>
          <div className="wizard-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="modal-header">
          <div>
            <p className="wizard-kicker">
              {t("onboarding.guidedSetup", { a: stepIndex + 1, b: steps.length })}
            </p>
            <h3 id="onboarding-wizard-title" className="modal-title">{localized.title}</h3>
          </div>
          <button type="button" className="modal-close wizard-close" onClick={skip} aria-label={t("onboarding.skipTour")}>
            <span aria-hidden>×</span>
          </button>
        </div>

        <div className="modal-body">
          <p className="wizard-body">{localized.body}</p>
          <ul className="wizard-bullets">
            {localized.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>

        <div className="modal-footer wizard-footer">
          <button type="button" className="btn" onClick={skip}>
            {t("onboarding.skipForNow")}
          </button>
          <div className="wizard-footer-actions">
            {stepIndex > 0 && (
              <button type="button" className="btn" onClick={() => setStepIndex((i) => i - 1)}>
                {t("common.back")}
              </button>
            )}
            {localized.ctaLabel && localized.href ? (
              <button type="button" className="btn btn-primary" onClick={goCta}>
                {localized.ctaLabel}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={next}>
                {isLast ? t("onboarding.openProductManager") : t("common.continue")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
