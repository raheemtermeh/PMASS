/** Shared status / priority badge helpers for Planning (and similar tables). */

const STATUS_LABELS: Record<string, string> = {
  BACKLOG: "Backlog",
  DRAFT: "Draft",
  PLANNING: "Planning",
  TODO: "To do",
  ACTIVE: "Active",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  REVIEW: "Review",
  BLOCKED: "Blocked",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  DONE: "Done",
  CANCELLED: "Cancelled",
  ARCHIVED: "Archived",
  REJECTED: "Rejected",
  PENDING: "Pending",
};

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export function statusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (["ACTIVE", "IN_PROGRESS", "READY", "DONE", "COMPLETED"].includes(s)) return "badge-success";
  if (["BLOCKED", "CANCELLED", "REJECTED"].includes(s)) return "badge-danger";
  if (["ON_HOLD", "REVIEW"].includes(s)) return "badge-info";
  if (["DRAFT", "PENDING", "BACKLOG", "PLANNING", "TODO"].includes(s)) return "badge-warning";
  return "badge-info";
}

export function statusLabel(status: string): string {
  const key = status.toUpperCase();
  return STATUS_LABELS[key] ?? status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function priorityBadgeClass(priority: string): string {
  switch (priority.toUpperCase()) {
    case "CRITICAL":
      return "priority-critical";
    case "HIGH":
      return "priority-high";
    case "MEDIUM":
      return "priority-medium";
    case "LOW":
      return "priority-low";
    default:
      return "priority-medium";
  }
}

export function priorityLabel(priority: string): string {
  const key = priority.toUpperCase();
  return PRIORITY_LABELS[key] ?? priority;
}
