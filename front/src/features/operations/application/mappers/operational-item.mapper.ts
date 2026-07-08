import type { OperationalItemDto } from "../../domain/entities/operational-item";
import type { WorkspaceItem, WorkspaceId } from "@/features/shell/domain/types";

const SUBSYSTEM_WORKSPACE_MAP: Record<number, WorkspaceId> = {
  1: "executive",
  2: "uiux",
  3: "engineering",
  4: "infrastructure",
  5: "marketing",
  6: "finance",
  7: "legalhr",
};

export function mapOperationalItemToWorkspaceItem(
  item: OperationalItemDto,
): WorkspaceItem {
  const workspace =
    item.origin_subsystem_id !== null
      ? (SUBSYSTEM_WORKSPACE_MAP[item.origin_subsystem_id] ?? "engineering")
      : "engineering";

  return {
    id: `item-${item.id}`,
    type: item.type,
    title: item.title,
    severity: item.severity,
    workspace,
    owner: item.assigned_to || "General",
    status: item.status,
    details: item.description || "No additional details.",
    createdAt: item.created_at,
    completedAt: item.completed_at ?? undefined,
  };
}
