"use client";

import Link from "next/link";
import { useI18n } from "@/core/providers/I18nProvider";
import type { UpcomingDeadline } from "../types";
import { CommandWidgetShell } from "./CommandWidgetShell";
import type { WidgetSize } from "../commandCenterLayout";
import { localizedEnumLabel, statusTranslationKey } from "@/lib/localized-labels";

interface Props {
  items?: UpcomingDeadline[];
  size?: WidgetSize;
  customize?: React.ReactNode;
  dragHandleProps?: React.ComponentProps<typeof CommandWidgetShell>["dragHandleProps"];
  dragging?: boolean;
  dragOver?: boolean;
}

function dayLabel(
  due: Date,
  today: Date,
  t: (k: string) => string,
  d: (value: Date, options?: Intl.DateTimeFormatOptions) => string,
): string {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diff = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  if (diff < 0) return t("dashboard.overdue");
  if (diff === 0) return t("dashboard.today");
  if (diff === 1) return t("dashboard.tomorrow");
  return d(due, { month: "short", day: "numeric" });
}

export function UpcomingDeadlinesWidget({
  items = [],
  size = "half",
  customize,
  dragHandleProps,
  dragging,
  dragOver,
}: Props) {
  const { t, d } = useI18n();
  const now = new Date();

  return (
    <CommandWidgetShell
      title={t("dashboard.upcomingDeadlines")}
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
      <ul className="cc-deadline-list">
        {items.map((item) => {
          const due = item.due_date ? new Date(item.due_date) : null;
          const label = due ? dayLabel(due, now, t, d) : "—";
          const overdue = due ? due.getTime() < now.getTime() : false;
          return (
            <li key={item.id} className={overdue ? "cc-deadline-overdue" : undefined}>
              <span className="cc-deadline-day">{label}</span>
              <div className="cc-deadline-copy">
                <strong>{item.product_name || item.title}</strong>
                {item.product_name ? <span className="text-dim">{item.title}</span> : null}
              </div>
              <span className="status-pill">
                {localizedEnumLabel(item.status, statusTranslationKey(item.status), t)}
              </span>
            </li>
          );
        })}
        {items.length === 0 ? (
          <li className="text-dim">{t("dashboard.noDeadlines")}</li>
        ) : null}
      </ul>
    </CommandWidgetShell>
  );
}
