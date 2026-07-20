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
import { CHART_PALETTE, type DayCount, type NamedCount } from "./types";

const tooltipStyle = {
  background: "#10121d",
  border: "1px solid rgba(99, 102, 241, 0.35)",
  borderRadius: 10,
  color: "#f8fafc",
  fontSize: 12,
};

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="cc-chart-empty">
      <span>{label}</span>
      <small>Live company data — charts fill as you create records</small>
    </div>
  );
}

function hasValues(items: NamedCount[] | DayCount[]): boolean {
  return items.some((i) => ("count" in i ? i.count > 0 : false));
}

export function ProductsStatusChart({ data }: { data: NamedCount[] }) {
  if (!hasValues(data)) return <ChartEmpty label="No products yet" />;
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
          innerRadius={58}
          outerRadius={88}
          paddingAngle={3}
          stroke="transparent"
        >
          {rows.map((_, i) => (
            <Cell key={rows[i].name} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TasksStatusChart({ data }: { data: NamedCount[] }) {
  if (!hasValues(data)) return <ChartEmpty label="No tasks yet" />;
  const rows = data.map((d) => ({ name: d.name, count: Number(d.count) }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
        <Bar dataKey="count" radius={[8, 8, 0, 0]}>
          {rows.map((_, i) => (
            <Cell key={rows[i].name} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TasksPriorityChart({ data }: { data: NamedCount[] }) {
  if (!hasValues(data)) return <ChartEmpty label="No priority data yet" />;
  const rows = data.map((d) => ({ name: d.name, count: Number(d.count) }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.12)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={72} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(6,182,212,0.08)" }} />
        <Bar dataKey="count" radius={[0, 8, 8, 0]}>
          {rows.map((_, i) => (
            <Cell key={rows[i].name} fill={CHART_PALETTE[(i + 2) % CHART_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ActivityTrendChart({ data }: { data: DayCount[] }) {
  if (!data.length) return <ChartEmpty label="No activity yet" />;
  const rows = data.map((d) => ({
    day: d.day.slice(5),
    count: Number(d.count),
  }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) return <ChartEmpty label="No activity in the last 14 days" />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="ccActivityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
        <XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey="count" stroke="#06b6d4" strokeWidth={2.5} fill="url(#ccActivityFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DepartmentLoadChart({
  data,
}: {
  data: { department_name: string; product_count: number }[];
}) {
  if (!data.length) return <ChartEmpty label="No departments yet" />;
  const rows = data.map((d) => ({
    name: d.department_name,
    count: Number(d.product_count),
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={48} />
        <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(16,185,129,0.08)" }} />
        <Bar dataKey="count" radius={[8, 8, 0, 0]}>
          {rows.map((_, i) => (
            <Cell key={rows[i].name} fill={CHART_PALETTE[(i + 1) % CHART_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StagesStatusChart({ data }: { data: NamedCount[] }) {
  if (!hasValues(data)) return <ChartEmpty label="No pipeline stages yet" />;
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
          stroke="transparent"
        >
          {rows.map((_, i) => (
            <Cell key={rows[i].name} fill={CHART_PALETTE[(i + 3) % CHART_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
