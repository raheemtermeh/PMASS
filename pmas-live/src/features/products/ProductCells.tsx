"use client";

import { useEffect, useRef, useState } from "react";
import { localizedStageName, type ListHealth } from "@/features/products/product-utils";
import { useI18n } from "@/core/providers/I18nProvider";

/** Eases a number toward its target so cells animate instead of snapping. */
function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const delta = target - from;
    if (delta === 0) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + delta * eased;
      setValue(next);
      fromRef.current = next;
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

export function ProgressCell({ percent }: { percent: number }) {
  const animated = useCountUp(percent);
  const { t, n, lang } = useI18n();

  return (
    <div className="pl-progress" title={t("productCells.progressTitle", { percent })}>
      <div className="pl-progress-bar">
        <span className="pl-progress-fill" style={{ width: `${animated}%` }}>
          {percent > 0 && percent < 100 ? <i className="pl-progress-spark" /> : null}
        </span>
      </div>
      <span className="font-mono pl-progress-value">{n(Math.round(animated))}{lang === "fa" ? "٪" : "%"}</span>
    </div>
  );
}

export function HealthCell({ health }: { health: ListHealth }) {
  const { t } = useI18n();
  const label = t(`productCells.health.${health.level}`);
  return (
    <span className={`pl-health pl-health-${health.level}`} title={label}>
      <span className="pl-health-dot" aria-hidden />
      {label}
    </span>
  );
}

/**
 * Stage chip with a travelling highlight — a quiet nod to work flowing through
 * the pipeline. Static when the product has not entered a stage yet.
 */
export function StageCell({ stage, hasPipeline }: { stage?: string; hasPipeline: boolean }) {
  const { t } = useI18n();
  if (!stage) {
    return (
      <span className={hasPipeline ? "pl-stage-idle" : "pl-stage-missing"}>
        {hasPipeline ? t("productCells.notStarted") : t("productCells.noPipeline")}
      </span>
    );
  }
  return (
    <span className="pl-stage-chip">
      <span className="pl-stage-flow" aria-hidden />
      <span className="pl-stage-label">{localizedStageName(stage, t)}</span>
    </span>
  );
}

export interface PulseMetric {
  label: string;
  value: number;
  suffix?: string;
  tone: "neutral" | "good" | "warn" | "bad";
}

/** Live counters above the list; each number eases in and reacts to filters. */
export function ProductPulseStrip({ metrics }: { metrics: PulseMetric[] }) {
  return (
    <div className="pl-pulse-strip">
      {metrics.map((m, i) => (
        <PulseCard key={m.label} metric={m} index={i} />
      ))}
    </div>
  );
}

function PulseCard({ metric, index }: { metric: PulseMetric; index: number }) {
  const animated = useCountUp(metric.value, 800);
  const { n } = useI18n();

  return (
    <div
      className={`pl-pulse-card pl-pulse-${metric.tone}`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <span className="pl-pulse-value">
        {n(Math.round(animated))}
        {metric.suffix ?? ""}
      </span>
      <span className="pl-pulse-label">{metric.label}</span>
      <span className="pl-pulse-glow" aria-hidden />
    </div>
  );
}
