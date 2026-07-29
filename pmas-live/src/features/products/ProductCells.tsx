"use client";

import { useEffect, useRef, useState } from "react";
import type { ListHealth } from "@/features/products/product-utils";

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

  return (
    <div className="pl-progress" title={`${percent}% of pipeline stages completed`}>
      <div className="pl-progress-bar">
        <span className="pl-progress-fill" style={{ width: `${animated}%` }}>
          {percent > 0 && percent < 100 ? <i className="pl-progress-spark" /> : null}
        </span>
      </div>
      <span className="font-mono pl-progress-value">{Math.round(animated)}%</span>
    </div>
  );
}

export function HealthCell({ health }: { health: ListHealth }) {
  return (
    <span className={`pl-health pl-health-${health.level}`} title={health.label}>
      <span className="pl-health-dot" aria-hidden />
      {health.label}
    </span>
  );
}

/**
 * Stage chip with a travelling highlight — a quiet nod to work flowing through
 * the pipeline. Static when the product has not entered a stage yet.
 */
export function StageCell({ stage, hasPipeline }: { stage?: string; hasPipeline: boolean }) {
  if (!stage) {
    return (
      <span className={hasPipeline ? "pl-stage-idle" : "pl-stage-missing"}>
        {hasPipeline ? "Not started" : "No pipeline"}
      </span>
    );
  }
  return (
    <span className="pl-stage-chip">
      <span className="pl-stage-flow" aria-hidden />
      <span className="pl-stage-label">{stage}</span>
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

  return (
    <div
      className={`pl-pulse-card pl-pulse-${metric.tone}`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <span className="pl-pulse-value">
        {Math.round(animated)}
        {metric.suffix ?? ""}
      </span>
      <span className="pl-pulse-label">{metric.label}</span>
      <span className="pl-pulse-glow" aria-hidden />
    </div>
  );
}
