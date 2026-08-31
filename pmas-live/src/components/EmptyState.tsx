"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/core/providers/I18nProvider";

interface EmptyStateProps {
  title?: string;
  description?: string;
  /** Primary CTA rendered inside the empty state (preferred over header-only actions). */
  action?: ReactNode;
  /** Optional secondary link / hint under the CTA. */
  secondary?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ title, description, action, secondary, compact }: EmptyStateProps) {
  const { t } = useI18n();
  return (
    <div className={`empty-state-card${compact ? " compact" : ""}`}>
      <div className="empty-state-icon" aria-hidden>
        ◇
      </div>
      <h3 className="empty-state-title">{title ?? t("emptyState.title")}</h3>
      <p className="empty-state-desc">{description ?? t("emptyStates.noData")}</p>
      {action ? <div className="empty-state-action">{action}</div> : null}
      {secondary ? <div className="empty-state-secondary">{secondary}</div> : null}
    </div>
  );
}
