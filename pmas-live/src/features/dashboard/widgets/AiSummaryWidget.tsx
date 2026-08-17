"use client";

import { useI18n } from "@/core/providers/I18nProvider";
import { CommandWidgetShell } from "./CommandWidgetShell";
import type { WidgetSize } from "../commandCenterLayout";

interface Props {
  size?: WidgetSize;
  customize?: React.ReactNode;
  dragHandleProps?: React.ComponentProps<typeof CommandWidgetShell>["dragHandleProps"];
  dragging?: boolean;
  dragOver?: boolean;
}

export function AiSummaryWidget({
  size = "half",
  customize,
  dragHandleProps,
  dragging,
  dragOver,
}: Props) {
  const { t } = useI18n();

  return (
    <CommandWidgetShell
      title={t("dashboard.aiSummary")}
      size={size}
      customize={customize}
      dragHandleProps={dragHandleProps}
      dragging={dragging}
      dragOver={dragOver}
    >
      <div className="cc-ai-placeholder">
        <p>{t("ai.subtitle")}</p>
        <ul className="text-dim">
          <li>{t("dashboard.aiHint1")}</li>
          <li>{t("dashboard.aiHint2")}</li>
          <li>{t("dashboard.aiHint3")}</li>
        </ul>
      </div>
    </CommandWidgetShell>
  );
}
