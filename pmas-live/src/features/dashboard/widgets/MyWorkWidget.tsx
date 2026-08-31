"use client";

import Link from "next/link";
import { useI18n } from "@/core/providers/I18nProvider";
import type { DashboardData, MyWorkSummary } from "../types";
import { CommandWidgetShell } from "./CommandWidgetShell";
import type { WidgetSize } from "../commandCenterLayout";

interface Props {
  data?: MyWorkSummary;
  tasks?: DashboardData["my_tasks"];
  size?: WidgetSize;
  customize?: React.ReactNode;
  dragHandleProps?: React.ComponentProps<typeof CommandWidgetShell>["dragHandleProps"];
  dragging?: boolean;
  dragOver?: boolean;
}

const ROWS: { key: keyof MyWorkSummary; labelKey: string; href?: string }[] = [
  { key: "assigned", labelKey: "dashboard.assignedTasks", href: "/planning" },
  { key: "due_today", labelKey: "dashboard.dueToday", href: "/planning" },
  { key: "overdue", labelKey: "dashboard.overdueItems", href: "/planning" },
  { key: "waiting_review", labelKey: "dashboard.waitingReview", href: "/planning" },
  { key: "mentions", labelKey: "dashboard.mentions" },
  { key: "approvals", labelKey: "dashboard.approvals" },
];

export function MyWorkWidget({
  data,
  tasks = [],
  size = "half",
  customize,
  dragHandleProps,
  dragging,
  dragOver,
}: Props) {
  const { t, n } = useI18n();
  const work: MyWorkSummary = data ?? {
    assigned: 0,
    due_today: 0,
    overdue: 0,
    waiting_review: 0,
    mentions: 0,
    approvals: 0,
  };

  const topTasks = tasks.slice(0, 5);

  return (
    <CommandWidgetShell
      title={t("dashboard.myWork")}
      size={size}
      customize={customize}
      headerRight={
        <Link href="/planning" className="btn btn-sm">
          {t("dashboard.planning")}
        </Link>
      }
      dragHandleProps={dragHandleProps}
      dragging={dragging}
      dragOver={dragOver}
    >
      <ul className="cc-mywork-list">
        {ROWS.map((row) => {
          const count = work[row.key] ?? 0;
          const label = (
            <>
              <span>{t(row.labelKey)}</span>
              <strong>{n(count)}</strong>
            </>
          );
          return (
            <li
              key={row.key}
              className={
                count > 0 && (row.key === "overdue" || row.key === "due_today")
                  ? "cc-mywork-hot"
                  : undefined
              }
            >
              {row.href ? <Link href={row.href}>{label}</Link> : <div>{label}</div>}
            </li>
          );
        })}
      </ul>

      <div className="cc-mytasks">
        <h4 className="cc-mytasks-title">{t("dashboard.myTasksList")}</h4>
        {topTasks.length === 0 ? (
          <p className="text-dim cc-mytasks-empty">{t("dashboard.noMyTasks")}</p>
        ) : (
          <ul className="command-list compact">
            {topTasks.map((task) => (
              <li key={task.id}>
                <Link href={`/planning?new=task`}>{task.title}</Link>
                <span className="status-pill">{task.status}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/planning?new=task" className="btn btn-sm cc-mytasks-cta">
          {t("dashboard.openTask")}
        </Link>
      </div>
    </CommandWidgetShell>
  );
}
