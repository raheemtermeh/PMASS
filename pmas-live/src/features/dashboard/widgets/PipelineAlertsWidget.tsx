"use client";

import Link from "next/link";
import { useI18n } from "@/core/providers/I18nProvider";
import type { PipelineAlert } from "../types";
import { CommandWidgetShell } from "./CommandWidgetShell";
import type { WidgetSize } from "../commandCenterLayout";

interface Props {
  items?: PipelineAlert[];
  size?: WidgetSize;
  customize?: React.ReactNode;
  dragHandleProps?: React.ComponentProps<typeof CommandWidgetShell>["dragHandleProps"];
  dragging?: boolean;
  dragOver?: boolean;
}

function kindLabel(kind: string, t: (k: string) => string): string {
  switch (kind) {
    case "STAGE_BLOCKED":
      return t("dashboard.alertStageBlocked");
    case "WAITING_APPROVAL":
      return t("dashboard.alertWaitingApproval");
    case "ON_HOLD":
      return t("dashboard.alertOnHold");
    default:
      return kind;
  }
}

export function PipelineAlertsWidget({
  items = [],
  size = "half",
  customize,
  dragHandleProps,
  dragging,
  dragOver,
}: Props) {
  const { t } = useI18n();

  return (
    <CommandWidgetShell
      title={t("dashboard.pipelineAlerts")}
      size={size}
      customize={customize}
      headerRight={
        <Link href="/products" className="btn btn-sm">
          {t("dashboard.products")}
        </Link>
      }
      dragHandleProps={dragHandleProps}
      dragging={dragging}
      dragOver={dragOver}
    >
      <ul className="cc-alert-list">
        {items.map((alert, idx) => {
          const href =
            alert.product_id && alert.product_id !== "00000000-0000-0000-0000-000000000000"
              ? `/products/${alert.product_id}`
              : "/planning";
          return (
            <li key={`${alert.kind}-${alert.product_id}-${idx}`}>
              <span className="cc-alert-kind" data-kind={alert.kind}>
                {kindLabel(alert.kind, t)}
              </span>
              <div className="cc-alert-copy">
                <Link href={href}>
                  <strong>{alert.product_name}</strong>
                </Link>
                <span className="text-dim">
                  {alert.stage_name || alert.detail}
                  {alert.detail && alert.stage_name && alert.detail !== alert.stage_name
                    ? ` · ${alert.detail}`
                    : ""}
                </span>
              </div>
              <span className="cc-alert-days">
                {alert.days} {t("dashboard.days")}
              </span>
            </li>
          );
        })}
        {items.length === 0 ? (
          <li className="text-dim">{t("dashboard.noPipelineAlerts")}</li>
        ) : null}
      </ul>
    </CommandWidgetShell>
  );
}
