export type WidgetSize = "half" | "full";

export type WidgetId =
  | "kpis"
  | "charts"
  | "myWork"
  | "deadlines"
  | "teamWorkload"
  | "pipelineAlerts"
  | "aiSummary"
  | "quickActions"
  | "assignments"
  | "workflow"
  | "departmentLoad"
  | "activities";

export interface WidgetDef {
  id: WidgetId;
  defaultVisible: boolean;
  defaultSize: WidgetSize;
}

export interface CommandCenterLayout {
  order: WidgetId[];
  hidden: WidgetId[];
  sizes: Partial<Record<WidgetId, WidgetSize>>;
}

export const WIDGET_REGISTRY: WidgetDef[] = [
  { id: "kpis", defaultVisible: true, defaultSize: "full" },
  { id: "charts", defaultVisible: true, defaultSize: "full" },
  { id: "myWork", defaultVisible: true, defaultSize: "half" },
  { id: "deadlines", defaultVisible: true, defaultSize: "half" },
  { id: "teamWorkload", defaultVisible: true, defaultSize: "half" },
  { id: "pipelineAlerts", defaultVisible: true, defaultSize: "half" },
  { id: "aiSummary", defaultVisible: false, defaultSize: "half" },
  { id: "quickActions", defaultVisible: true, defaultSize: "full" },
  { id: "assignments", defaultVisible: true, defaultSize: "full" },
  { id: "workflow", defaultVisible: true, defaultSize: "full" },
  { id: "departmentLoad", defaultVisible: false, defaultSize: "full" },
  { id: "activities", defaultVisible: true, defaultSize: "full" },
];

const ALL_IDS = WIDGET_REGISTRY.map((w) => w.id);

export function defaultCommandCenterLayout(): CommandCenterLayout {
  return {
    order: [...ALL_IDS],
    hidden: WIDGET_REGISTRY.filter((w) => !w.defaultVisible).map((w) => w.id),
    sizes: Object.fromEntries(WIDGET_REGISTRY.map((w) => [w.id, w.defaultSize])) as Record<
      WidgetId,
      WidgetSize
    >,
  };
}

function isWidgetId(v: unknown): v is WidgetId {
  return typeof v === "string" && (ALL_IDS as string[]).includes(v);
}

/** Merge persisted layout with registry so new widgets appear after deploy. */
export function mergeCommandCenterLayout(raw: unknown): CommandCenterLayout {
  const defaults = defaultCommandCenterLayout();
  if (!raw || typeof raw !== "object") return defaults;

  const blob = raw as Partial<CommandCenterLayout>;
  const orderFromRaw = Array.isArray(blob.order) ? blob.order.filter(isWidgetId) : [];
  const order: WidgetId[] = [];
  for (const id of orderFromRaw) {
    if (!order.includes(id)) order.push(id);
  }
  for (const id of ALL_IDS) {
    if (!order.includes(id)) order.push(id);
  }

  const hiddenRaw = Array.isArray(blob.hidden) ? blob.hidden.filter(isWidgetId) : defaults.hidden;
  const knownHidden = new Set(hiddenRaw);
  // Newly added widgets that are default-hidden stay hidden if never seen in order before.
  for (const def of WIDGET_REGISTRY) {
    if (!def.defaultVisible && !orderFromRaw.includes(def.id) && !knownHidden.has(def.id)) {
      knownHidden.add(def.id);
    }
  }

  const sizes: Partial<Record<WidgetId, WidgetSize>> = { ...defaults.sizes };
  if (blob.sizes && typeof blob.sizes === "object") {
    for (const [key, value] of Object.entries(blob.sizes)) {
      if (isWidgetId(key) && (value === "half" || value === "full")) {
        sizes[key] = value;
      }
    }
  }

  return {
    order,
    hidden: ALL_IDS.filter((id) => knownHidden.has(id)),
    sizes,
  };
}

export function isWidgetVisible(layout: CommandCenterLayout, id: WidgetId): boolean {
  return !layout.hidden.includes(id);
}

export function widgetSize(layout: CommandCenterLayout, id: WidgetId): WidgetSize {
  return layout.sizes[id] ?? WIDGET_REGISTRY.find((w) => w.id === id)?.defaultSize ?? "full";
}

export function toggleWidgetHidden(layout: CommandCenterLayout, id: WidgetId): CommandCenterLayout {
  const hidden = layout.hidden.includes(id)
    ? layout.hidden.filter((h) => h !== id)
    : [...layout.hidden, id];
  return { ...layout, hidden };
}

export function toggleWidgetSize(layout: CommandCenterLayout, id: WidgetId): CommandCenterLayout {
  const current = widgetSize(layout, id);
  return {
    ...layout,
    sizes: { ...layout.sizes, [id]: current === "full" ? "half" : "full" },
  };
}

export function moveWidget(
  layout: CommandCenterLayout,
  id: WidgetId,
  direction: "up" | "down",
): CommandCenterLayout {
  const order = [...layout.order];
  const idx = order.indexOf(id);
  if (idx < 0) return layout;
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= order.length) return layout;
  [order[idx], order[swap]] = [order[swap], order[idx]];
  return { ...layout, order };
}

export function reorderWidget(
  layout: CommandCenterLayout,
  fromId: WidgetId,
  toId: WidgetId,
): CommandCenterLayout {
  if (fromId === toId) return layout;
  const order = layout.order.filter((id) => id !== fromId);
  const toIdx = order.indexOf(toId);
  if (toIdx < 0) return layout;
  order.splice(toIdx, 0, fromId);
  return { ...layout, order };
}

export function layoutKeyFor(companyId?: string | null, userId?: number | null): string {
  const company = companyId || "default";
  const user = userId != null ? String(userId) : "anon";
  return `command-center:${company}:${user}`;
}
