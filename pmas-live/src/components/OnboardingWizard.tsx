"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/core/auth/auth-store";
import { useOnboardingStore } from "@/features/guidance/guidance-store";
import { buildWizardSteps } from "@/shared/product-guidance";
import { sanitizeInternalPath } from "@/shared/security";

export function OnboardingWizard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const forceOpen = useOnboardingStore((s) => s.forceOpen);
  const isCompleted = useOnboardingStore((s) => s.isCompleted);
  const markCompleted = useOnboardingStore((s) => s.markCompleted);
  const setForceOpen = useOnboardingStore((s) => s.setForceOpen);

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
  const shouldShow = forceOpen || !isCompleted(userKey);
  if (!shouldShow) return null;

  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex >= steps.length - 1;
  const progress = ((stepIndex + 1) / steps.length) * 100;

  function finish() {
    markCompleted(userKey);
    setForceOpen(false);
    setStepIndex(0);
  }

  function skip() {
    finish();
  }

  function next() {
    if (isLast) {
      finish();
      router.push(sanitizeInternalPath("/product-manager"));
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
    <div className="modal-backdrop active wizard-backdrop" role="dialog" aria-modal="true">
      <div className="modal-content wizard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wizard-progress-track" aria-hidden>
          <div className="wizard-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="modal-header">
          <div>
            <p className="wizard-kicker">
              Guided setup · Step {stepIndex + 1} of {steps.length}
            </p>
            <h3 className="modal-title">{step.title}</h3>
          </div>
          <button type="button" className="modal-close" onClick={skip} aria-label="Skip tour">
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="wizard-body">{step.body}</p>
          <ul className="wizard-bullets">
            {step.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>

        <div className="modal-footer wizard-footer">
          <button type="button" className="btn" onClick={skip}>
            Skip for now
          </button>
          <div className="wizard-footer-actions">
            {stepIndex > 0 && (
              <button type="button" className="btn" onClick={() => setStepIndex((i) => i - 1)}>
                Back
              </button>
            )}
            {step.ctaLabel && step.href ? (
              <button type="button" className="btn btn-primary" onClick={goCta}>
                {step.ctaLabel}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={next}>
                {isLast ? "Open Product Manager" : "Continue"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
