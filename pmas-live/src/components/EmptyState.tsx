"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/core/providers/I18nProvider";

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  const { t } = useI18n();
  return (
    <div className="empty-state-card">
      <div className="empty-state-icon">◇</div>
      <h3 className="empty-state-title">{title ?? t("emptyState.title")}</h3>
      <p className="empty-state-desc">{description ?? t("emptyStates.noData")}</p>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
