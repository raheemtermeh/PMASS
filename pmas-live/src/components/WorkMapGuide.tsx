"use client";

import Link from "next/link";
import { useI18n } from "@/core/providers/I18nProvider";
import type { ExecutionConfig, WorkLevel } from "@/features/vsm/types";
import { fallbackConfig } from "@/features/products/work-models";

interface WorkMapGuideProps {
  /** Product's resolved execution config; falls back to classic cascade. */
  config?: ExecutionConfig | null;
  /** Highlight by storage key or level key. */
  activeStorage?: "project" | "feature" | "task" | "product";
  compact?: boolean;
}

/**
 * Dynamic Product → … work map driven by the selected product's execution model.
 */
export function WorkMapGuide({ config, activeStorage, compact }: WorkMapGuideProps) {
  const { t } = useI18n();
  const levels: WorkLevel[] = config?.levels?.length
    ? config.levels
    : fallbackConfig("PROJECT_FEATURE_TASK").levels;

  return (
    <aside className={`work-map${compact ? " compact" : ""}`} aria-label={t("workMap.title")}>
      {!compact ? (
        <div className="work-map-copy">
          <p className="work-map-eyebrow">{t("workMap.title")}</p>
          <p className="work-map-hint">{t("workMap.subtitle")}</p>
        </div>
      ) : null}
      <ol className="work-map-steps">
        <li className={`work-map-step${activeStorage === "product" ? " active" : ""}`}>
          <Link href="/products" className="work-map-link">
            <strong>{t("workMap.product")}</strong>
            {!compact ? <span>{t("workMap.productHint")}</span> : null}
          </Link>
        </li>
        {levels.map((level) => (
          <li
            key={`${level.storage}-${level.key}`}
            className={`work-map-step${activeStorage === level.storage ? " active" : ""}`}
          >
            <span className="work-map-arrow" aria-hidden>
              →
            </span>
            <Link href="/planning" className="work-map-link">
              <strong>{level.label}</strong>
            </Link>
          </li>
        ))}
      </ol>
    </aside>
  );
}
