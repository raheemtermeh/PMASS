"use client";

import Link from "next/link";
import { useI18n } from "@/core/providers/I18nProvider";
import type { TeamWorkloadRow } from "../types";
import { CommandWidgetShell } from "./CommandWidgetShell";
import type { WidgetSize } from "../commandCenterLayout";

interface Props {
  items?: TeamWorkloadRow[];
  size?: WidgetSize;
  customize?: React.ReactNode;
  dragHandleProps?: React.ComponentProps<typeof CommandWidgetShell>["dragHandleProps"];
  dragging?: boolean;
  dragOver?: boolean;
}

function loadTone(pct: number): string {
  if (pct >= 85) return "rose";
  if (pct >= 60) return "amber";
  return "emerald";
}

export function TeamWorkloadWidget({
  items = [],
  size = "half",
  customize,
  dragHandleProps,
  dragging,
  dragOver,
}: Props) {
  const { t, n } = useI18n();

  return (
    <CommandWidgetShell
      title={t("dashboard.teamWorkload")}
      size={size}
      customize={customize}
      headerRight={
        <Link href="/organization" className="btn btn-sm">
          {t("dashboard.employees")}
        </Link>
      }
      dragHandleProps={dragHandleProps}
      dragging={dragging}
      dragOver={dragOver}
    >
      <ul className="cc-workload-list">
        {items.map((row) => {
          const tone = loadTone(row.load_percent);
          return (
            <li key={row.employee_id}>
              <div className="cc-workload-meta">
                <strong>{row.name}</strong>
                <span className={`cc-workload-pct cc-workload-${tone}`}>
                  {n(row.load_percent / 100, { style: "percent", maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="cc-workload-track" aria-hidden>
                <div
                  className={`cc-workload-fill cc-workload-${tone}`}
                  style={{ width: `${Math.min(100, Math.max(0, row.load_percent))}%` }}
                />
              </div>
              <span className="text-dim cc-workload-open">
                {n(row.open_tasks)} {t("dashboard.openTasks")}
              </span>
            </li>
          );
        })}
        {items.length === 0 ? (
          <li className="text-dim">{t("dashboard.noTeamWorkload")}</li>
        ) : null}
      </ul>
    </CommandWidgetShell>
  );
}
