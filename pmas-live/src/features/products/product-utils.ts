import type { Feature, Product, ProductSummary, Project, Stage, StageInstance, Task } from "@/features/vsm/types";

export type ProductDetailTab =
  | "overview"
  | "pipeline"
  | "stages"
  | "features"
  | "projects"
  | "members"
  | "activity"
  | "files"
  | "settings";

export const PRODUCT_DETAIL_TABS: { id: ProductDetailTab }[] = [
  { id: "overview" },
  { id: "pipeline" },
  { id: "stages" },
  { id: "features" },
  { id: "projects" },
  { id: "members" },
  { id: "activity" },
  { id: "files" },
  { id: "settings" },
];

const STAGE_TRANSLATION_KEYS: Record<string, string> = {
  discovery: "discovery",
  analysis: "analysis",
  design: "design",
  development: "development",
  qa: "qa",
  release: "release",
  requirements: "requirements",
  configuration: "configuration",
  integration: "integration",
  uat: "uat",
  "go-live": "goLive",
  "data model": "dataModel",
  workflow: "workflow",
  pilot: "pilot",
  rollout: "rollout",
  concept: "concept",
  ux: "ux",
  build: "build",
  beta: "beta",
  "store release": "storeRelease",
  research: "research",
  strategy: "strategy",
  creative: "creative",
  launch: "launch",
  measure: "measure",
  hypothesis: "hypothesis",
  experiment: "experiment",
  report: "report",
  decision: "decision",
};

export function localizedStageName(name: string, t: (key: string) => string): string {
  const key = STAGE_TRANSLATION_KEYS[name.trim().toLowerCase()];
  return key ? t(`productDetail.stages.${key}`) : name;
}

export function canonicalStageName(name: string, t: (key: string) => string): string {
  const normalized = name.trim().toLocaleLowerCase();
  for (const [canonical, key] of Object.entries(STAGE_TRANSLATION_KEYS)) {
    if (t(`productDetail.stages.${key}`).toLocaleLowerCase() === normalized) {
      if (canonical === "qa" || canonical === "uat" || canonical === "ux") return canonical.toUpperCase();
      return canonical
        .split(" ")
        .map((part) => part.toUpperCase() === part ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(" ");
    }
  }
  return name.trim();
}

export function executionModelLabel(model: string): string {
  switch (model) {
    case "PROJECT_FEATURE_TASK":
      return "Project → Feature → Task";
    case "FEATURE_TASK":
      return "Feature → Task";
    case "DIRECT_TASK":
      return "Direct Task";
    default:
      return model;
  }
}

export function formatProductDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function stageProgressPercent(
  stage: Stage,
  instances: StageInstance[],
): number {
  const inst = instances.find((i) => i.stage_id === stage.id);
  if (!inst) return 0;
  if (inst.status === "COMPLETED") return 100;
  if (inst.status === "ACTIVE") return 55;
  if (inst.status === "REJECTED") return 25;
  return 10;
}

export interface ProductHealth {
  label: "Healthy" | "At risk" | "Critical";
  score: number;
  emoji: string;
}

export function computeProductHealth(
  product: Product,
  stages: Stage[],
  instances: StageInstance[],
  features: Feature[],
  tasks: Task[],
): ProductHealth {
  let score = 72;
  if (product.status === "ON_HOLD") score -= 25;
  if (product.status === "ARCHIVED" || product.deleted_at) score -= 40;
  if (product.status === "ACTIVE") score += 8;

  if (stages.length > 0) {
    const completed = instances.filter((i) => i.status === "COMPLETED").length;
    score += Math.round((completed / stages.length) * 18);
  }

  const delayedFeatures = features.filter((f) => f.status === "BLOCKED").length;
  const openTasks = tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "ARCHIVED").length;
  const doneTasks = tasks.filter((t) => t.status === "COMPLETED").length;
  if (openTasks > 0) score += Math.round((doneTasks / (openTasks + doneTasks || 1)) * 10);
  score -= delayedFeatures * 6;

  score = Math.max(0, Math.min(100, score));

  if (score >= 70) return { label: "Healthy", score, emoji: "🟢" };
  if (score >= 40) return { label: "At risk", score, emoji: "🟡" };
  return { label: "Critical", score, emoji: "🔴" };
}

export interface ProductKPIs {
  featuresTotal: number;
  featuresCompleted: number;
  featuresOpen: number;
  featuresDelayed: number;
  projectsTotal: number;
  tasksTotal: number;
}

export function computeProductKPIs(
  projects: Project[],
  features: Feature[],
  tasks: Task[],
): ProductKPIs {
  const featuresCompleted = features.filter((f) =>
    ["COMPLETED", "DONE", "ARCHIVED"].includes(f.status),
  ).length;
  const featuresOpen = features.filter(
    (f) => !["COMPLETED", "DONE", "ARCHIVED", "CANCELLED"].includes(f.status),
  ).length;
  const featuresDelayed = features.filter((f) =>
    ["BLOCKED", "ON_HOLD"].includes(f.status),
  ).length;

  return {
    featuresTotal: features.length,
    featuresCompleted,
    featuresOpen,
    featuresDelayed,
    projectsTotal: projects.length,
    tasksTotal: tasks.length,
  };
}

const DAY_MS = 86_400_000;

/** "3 hours ago" style label for the product list Last Activity column. */
export function relativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export type ListHealthLevel = "healthy" | "warning" | "critical" | "idle";

export interface ListHealth {
  level: ListHealthLevel;
  label: string;
  emoji: string;
}

/**
 * Health for a product row, derived from lifecycle state, pipeline progress and
 * how long the product has been silent.
 */
export function listHealth(product: Product, summary?: ProductSummary): ListHealth {
  if (product.status === "ARCHIVED") {
    return { level: "idle", label: "Archived", emoji: "⚪" };
  }
  if (product.status === "COMPLETED") {
    return { level: "healthy", label: "Completed", emoji: "🟢" };
  }
  if (product.status === "ON_HOLD") {
    return { level: "critical", label: "On hold", emoji: "🔴" };
  }
  if (product.status === "ACTIVE" && !product.pipeline_id) {
    return { level: "critical", label: "No pipeline", emoji: "🔴" };
  }

  const lastAt = summary?.last_activity_at ? new Date(summary.last_activity_at).getTime() : NaN;
  const idleDays = Number.isNaN(lastAt) ? null : (Date.now() - lastAt) / DAY_MS;

  if (idleDays !== null && idleDays > 21) {
    return { level: "critical", label: "Stalled", emoji: "🔴" };
  }
  if (idleDays !== null && idleDays > 7) {
    return { level: "warning", label: "Slowing down", emoji: "🟡" };
  }
  if (product.status === "ACTIVE" && (summary?.progress ?? 0) < 25) {
    return { level: "warning", label: "Early stage", emoji: "🟡" };
  }
  if (product.status === "DRAFT" || product.status === "PLANNING") {
    return { level: "idle", label: "Not started", emoji: "⚪" };
  }
  return { level: "healthy", label: "Healthy", emoji: "🟢" };
}

export const PRODUCT_SORT_OPTIONS = [
  { value: "updated_desc", label: "Recently updated" },
  { value: "name_asc", label: "Name (A→Z)" },
  { value: "name_desc", label: "Name (Z→A)" },
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "priority_desc", label: "Priority (high→low)" },
  { value: "status_asc", label: "Status" },
] as const;

export type ProductSortValue = (typeof PRODUCT_SORT_OPTIONS)[number]["value"];

const PRIORITY_RANK: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const STATUS_RANK: Record<string, number> = {
  ACTIVE: 1,
  PLANNING: 2,
  READY: 3,
  DRAFT: 4,
  ON_HOLD: 5,
  COMPLETED: 6,
  ARCHIVED: 7,
};

export function sortProducts(rows: Product[], sort: ProductSortValue): Product[] {
  const time = (iso?: string | null) => (iso ? new Date(iso).getTime() || 0 : 0);
  const copy = [...rows];
  switch (sort) {
    case "name_asc":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case "name_desc":
      return copy.sort((a, b) => b.name.localeCompare(a.name));
    case "created_asc":
      return copy.sort((a, b) => time(a.created_at) - time(b.created_at));
    case "created_desc":
      return copy.sort((a, b) => time(b.created_at) - time(a.created_at));
    case "priority_desc":
      return copy.sort(
        (a, b) => (PRIORITY_RANK[b.priority ?? ""] ?? 0) - (PRIORITY_RANK[a.priority ?? ""] ?? 0),
      );
    case "status_asc":
      return copy.sort(
        (a, b) => (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99),
      );
    default:
      return copy.sort((a, b) => time(b.updated_at) - time(a.updated_at));
  }
}

export interface ProductRisk {
  id: string;
  title: string;
  severity: "low" | "medium" | "high";
}

export function inferProductRisks(
  features: Feature[],
  tasks: Task[],
  stages: Stage[],
  instances: StageInstance[],
): ProductRisk[] {
  const risks: ProductRisk[] = [];
  const blocked = features.filter((f) => f.status === "BLOCKED").length;
  if (blocked > 0) {
    risks.push({ id: "blocked-features", title: `${blocked} feature(s) blocked`, severity: "high" });
  }
  const openTasks = tasks.filter((t) => !["COMPLETED", "ARCHIVED"].includes(t.status)).length;
  const qaStage = stages.find((s) => /qa|quality|test/i.test(s.name));
  if (qaStage) {
    const qaInst = instances.find((i) => i.stage_id === qaStage.id && i.status === "ACTIVE");
    if (qaInst && openTasks > 5) {
      risks.push({ id: "qa-load", title: "QA overloaded", severity: "medium" });
    }
  }
  const active = instances.find((i) => i.status === "ACTIVE");
  if (active?.started_at) {
    const days = (Date.now() - new Date(active.started_at).getTime()) / 86400000;
    if (days > 14) {
      risks.push({ id: "timeline", title: "Timeline delayed on current stage", severity: "medium" });
    }
  }
  if (features.length > 0 && tasks.length === 0) {
    risks.push({ id: "execution", title: "Features without task breakdown", severity: "low" });
  }
  return risks;
}
