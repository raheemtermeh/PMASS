import type { AppState, BlockerItem } from "../domain/types";

export function deriveBlockers(workspaceItems: AppState["workspaceItems"]): BlockerItem[] {
  return workspaceItems
    .filter((item) => item.type === "blocker")
    .map((item) => ({
      id: parseInt(item.id.replace("item-", ""), 10) || item.id,
      title: item.title,
      severity: item.severity,
      owner:
        item.owner ||
        (item.workspace === "infrastructure"
          ? "Infra Team"
          : item.workspace === "legalhr"
            ? "Legal Team"
            : item.workspace === "uiux"
              ? "UI/UX Team"
              : item.workspace === "engineering"
                ? "Engineering Core"
                : item.workspace === "finance"
                  ? "Finance Team"
                  : "General"),
      status: item.status === "Resolved" ? "Resolved" : "Blocked",
      details: item.details,
    }));
}
