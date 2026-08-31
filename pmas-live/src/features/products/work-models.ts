import type { ExecutionConfig, WorkLevel, WorkModelDefinition } from "@/features/vsm/types";

export type StorageKind = "project" | "feature" | "task";

export function hasStorage(cfg: ExecutionConfig | null | undefined, storage: StorageKind): boolean {
  return Boolean(cfg?.levels?.some((l) => l.storage === storage));
}

export function labelForStorage(
  cfg: ExecutionConfig | null | undefined,
  storage: StorageKind,
  fallback: string,
): string {
  const hit = cfg?.levels?.find((l) => l.storage === storage);
  return hit?.label || fallback;
}

export function cascadeLabels(cfg: ExecutionConfig | null | undefined): string {
  if (!cfg?.levels?.length) return "";
  return cfg.levels.map((l) => l.label).join(" → ");
}

/** Derive a config client-side when API has not yet returned execution_config. */
export function fallbackConfig(model: string): ExecutionConfig {
  const presets: Record<string, WorkLevel[]> = {
    PROJECT_FEATURE_TASK: [
      { key: "project", label: "Project", storage: "project" },
      { key: "feature", label: "Feature", storage: "feature" },
      { key: "task", label: "Task", storage: "task" },
    ],
    SCRUM: [
      { key: "epic", label: "Epic", storage: "project" },
      { key: "story", label: "Story", storage: "feature" },
      { key: "task", label: "Task", storage: "task" },
    ],
    KANBAN: [
      { key: "initiative", label: "Initiative", storage: "project" },
      { key: "work_item", label: "Work Item", storage: "task" },
    ],
    FEATURE_TASK: [
      { key: "feature", label: "Feature", storage: "feature" },
      { key: "task", label: "Task", storage: "task" },
    ],
    DIRECT_TASK: [{ key: "task", label: "Task", storage: "task" }],
    OKRS: [
      { key: "objective", label: "Objective", storage: "project" },
      { key: "key_result", label: "Key Result", storage: "feature" },
      { key: "initiative", label: "Initiative", storage: "task" },
    ],
  };
  return { levels: presets[model] ?? presets.PROJECT_FEATURE_TASK };
}

export function resolveProductConfig(product: {
  execution_model: string;
  execution_config?: ExecutionConfig | null;
}): ExecutionConfig {
  if (product.execution_config?.levels?.length) return product.execution_config;
  return fallbackConfig(product.execution_model);
}

export function modelDisplayName(
  def: WorkModelDefinition | undefined,
  modelKey: string,
  t: (key: string) => string,
): string {
  const i18n = t(`workModels.${modelKey}.name`);
  if (i18n && !i18n.startsWith("workModels.")) return i18n;
  return def?.name || modelKey;
}
