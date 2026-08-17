const STATUS_KEYS: Record<string, string> = {
  ACTIVE: "statuses.active",
  INACTIVE: "statuses.inactive",
  PENDING: "statuses.pending",
  APPROVED: "statuses.approved",
  REJECTED: "statuses.rejected",
  DRAFT: "statuses.draft",
  READY: "statuses.ready",
  PLANNED: "statuses.planned",
  PLANNING: "statuses.planning",
  BACKLOG: "statuses.backlog",
  TODO: "statuses.todo",
  REVIEW: "statuses.review",
  NOT_STARTED: "statuses.notStarted",
  IN_PROGRESS: "statuses.inProgress",
  COMPLETED: "statuses.completed",
  DONE: "statuses.done",
  BLOCKED: "statuses.blocked",
  CANCELLED: "statuses.cancelled",
  ON_HOLD: "statuses.onHold",
  DELAYED: "statuses.delayed",
  ARCHIVED: "statuses.archived",
};

const PRIORITY_KEYS: Record<string, string> = {
  LOW: "priorities.low",
  MEDIUM: "priorities.medium",
  HIGH: "priorities.high",
  CRITICAL: "priorities.critical",
};

/** Normalizes "In Progress", "in-progress", "IN_PROGRESS" to a single lookup key. */
function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function statusTranslationKey(status?: string | null): string | null {
  if (!status) return null;
  return STATUS_KEYS[normalize(status)] ?? null;
}

export function priorityTranslationKey(priority?: string | null): string | null {
  if (!priority) return null;
  return PRIORITY_KEYS[normalize(priority)] ?? null;
}

export function localizedEnumLabel(
  value: string | null | undefined,
  translationKey: string | null,
  t: (key: string) => string,
): string {
  return translationKey ? t(translationKey) : (value ?? "—");
}
