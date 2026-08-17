"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "@/core/providers/ThemeProvider";
import { useI18n } from "@/core/providers/I18nProvider";
import {
  localizedEnumLabel,
  priorityTranslationKey,
  statusTranslationKey,
} from "@/lib/localized-labels";
import { CHART_PALETTE, type DayCount, type NamedCount } from "./types";

function useChartChrome() {
  const { theme } = useTheme();
  const light = theme === "light";
  return {
    light,
    tooltip: light
      ? {
          background: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.14)",
          borderRadius: 10,
          color: "#0f172a",
          fontSize: 12,
          boxShadow: "0 10px 28px rgba(15, 23, 42, 0.12)",
        }
      : {
          background: "#10121d",
          border: "1px solid rgba(99, 102, 241, 0.35)",
          borderRadius: 10,
          color: "#f8fafc",
          fontSize: 12,
        },
    tick: light ? "#475569" : "#94a3b8",
    grid: light ? "rgba(15, 23, 42, 0.1)" : "rgba(148,163,184,0.12)",
    cursor: light ? "rgba(3, 105, 161, 0.08)" : "rgba(99,102,241,0.08)",
    legend: light ? { fontSize: 12, color: "#334155" } : { fontSize: 12 },
    stroke: light ? "#0284c7" : "#06b6d4",
  };
}

function ChartEmpty({ label }: { label: string }) {
  const { t } = useI18n();
  return (
    <div className="cc-chart-empty">
      <span>{label}</span>
      <small>{t("charts.emptyHint")}</small>
    </div>
  );
}

function hasValues(items: NamedCount[] | DayCount[]): boolean {
  return items.some((i) => ("count" in i ? i.count > 0 : false));
}

export function ProductsStatusChart({ data }: { data: NamedCount[] }) {
  const chrome = useChartChrome();
  const { t, n } = useI18n();
  if (!hasValues(data)) return <ChartEmpty label={t("charts.noProducts")} />;
  const rows = data.map((item) => ({
    name: localizedEnumLabel(item.name, statusTranslationKey(item.name), t),
    value: Number(item.count),
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={58}
          outerRadius={88}
          paddingAngle={3}
          stroke={chrome.light ? "#ffffff" : "transparent"}
          strokeWidth={chrome.light ? 2 : 0}
        >
          {rows.map((_, i) => (
            <Cell key={rows[i].name} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={chrome.tooltip} formatter={(value) => [n(Number(value)), t("charts.products")]} />
        <Legend wrapperStyle={chrome.legend} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TasksStatusChart({ data }: { data: NamedCount[] }) {
  const chrome = useChartChrome();
  const { t, n } = useI18n();
  if (!hasValues(data)) return <ChartEmpty label={t("charts.noTasks")} />;
  const rows = data.map((item) => ({
    name: localizedEnumLabel(item.name, statusTranslationKey(item.name), t),
    count: Number(item.count),
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={chrome.grid} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: chrome.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tickFormatter={(value) => n(Number(value))} tick={{ fill: chrome.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={chrome.tooltip} cursor={{ fill: chrome.cursor }} formatter={(value) => [n(Number(value)), t("charts.tasks")]} />
        <Bar dataKey="count" name={t("charts.tasks")} radius={[8, 8, 0, 0]}>
          {rows.map((_, i) => (
            <Cell key={rows[i].name} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TasksPriorityChart({ data }: { data: NamedCount[] }) {
  const chrome = useChartChrome();
  const { t, n } = useI18n();
  if (!hasValues(data)) return <ChartEmpty label={t("charts.noPriorityData")} />;
  const rows = data.map((item) => ({
    name: localizedEnumLabel(item.name, priorityTranslationKey(item.name), t),
    count: Number(item.count),
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={chrome.grid} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickFormatter={(value) => n(Number(value))} tick={{ fill: chrome.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={72} tick={{ fill: chrome.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={chrome.tooltip} cursor={{ fill: chrome.cursor }} formatter={(value) => [n(Number(value)), t("charts.tasks")]} />
        <Bar dataKey="count" name={t("charts.tasks")} radius={[0, 8, 8, 0]}>
          {rows.map((_, i) => (
            <Cell key={rows[i].name} fill={CHART_PALETTE[(i + 2) % CHART_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ActivityTrendChart({ data }: { data: DayCount[] }) {
  const chrome = useChartChrome();
  const { t, n, d } = useI18n();
  if (!data.length) return <ChartEmpty label={t("charts.noActivity")} />;
  const rows = data.map((d) => ({
    day: d.day,
    count: Number(d.count),
  }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) return <ChartEmpty label={t("charts.noRecentActivity")} />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="ccActivityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chrome.stroke} stopOpacity={chrome.light ? 0.35 : 0.55} />
            <stop offset="100%" stopColor={chrome.stroke} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={chrome.grid} vertical={false} />
        <XAxis dataKey="day" tickFormatter={(value) => d(String(value), { month: "short", day: "numeric" })} tick={{ fill: chrome.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tickFormatter={(value) => n(Number(value))} tick={{ fill: chrome.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={chrome.tooltip} labelFormatter={(value) => d(String(value), { dateStyle: "medium" })} formatter={(value) => [n(Number(value)), t("charts.activities")]} />
        <Area type="monotone" dataKey="count" name={t("charts.activities")} stroke={chrome.stroke} strokeWidth={2.5} fill="url(#ccActivityFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DepartmentLoadChart({
  data,
}: {
  data: { department_name: string; product_count: number }[];
}) {
  const chrome = useChartChrome();
  const { t, n } = useI18n();
  if (!data.length) return <ChartEmpty label={t("charts.noDepartments")} />;
  const rows = data.map((d) => ({
    name: d.department_name,
    count: Number(d.product_count),
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={chrome.grid} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: chrome.tick, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={48} />
        <YAxis allowDecimals={false} tickFormatter={(value) => n(Number(value))} tick={{ fill: chrome.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={chrome.tooltip} cursor={{ fill: chrome.cursor }} formatter={(value) => [n(Number(value)), t("charts.products")]} />
        <Bar dataKey="count" name={t("charts.products")} radius={[8, 8, 0, 0]}>
          {rows.map((_, i) => (
            <Cell key={rows[i].name} fill={CHART_PALETTE[(i + 1) % CHART_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StagesStatusChart({ data }: { data: NamedCount[] }) {
  const chrome = useChartChrome();
  const { t, n } = useI18n();
  if (!hasValues(data)) return <ChartEmpty label={t("charts.noStages")} />;
  const rows = data.map((d) => ({ name: d.name, value: Number(d.count) }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={90}
          paddingAngle={2}
          stroke={chrome.light ? "#ffffff" : "transparent"}
          strokeWidth={chrome.light ? 2 : 0}
        >
          {rows.map((_, i) => (
            <Cell key={rows[i].name} fill={CHART_PALETTE[(i + 3) % CHART_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={chrome.tooltip} formatter={(value) => [n(Number(value)), t("charts.records")]} />
        <Legend wrapperStyle={chrome.legend} />
      </PieChart>
    </ResponsiveContainer>
  );
}
