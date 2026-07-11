"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, optStr } from "@/components/ResourceManager";
import { httpClient } from "@/core/api/http-client";
import type { Permission } from "@/shared/permissions";

export interface SectionWorkItem {
  id: number;
  section: string;
  kind: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assignee?: string | null;
  due_date?: string | null;
}

const KIND_OPTIONS = [
  { value: "task", label: "Task" },
  { value: "todo", label: "Todo" },
  { value: "status", label: "Status update" },
];

const STATUS_OPTIONS = [
  { value: "Backlog", label: "Backlog" },
  { value: "Todo", label: "Todo" },
  { value: "In Progress", label: "In Progress" },
  { value: "Blocked", label: "Blocked" },
  { value: "Done", label: "Done" },
  { value: "Cancelled", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
  { value: "Critical", label: "Critical" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

function statusClass(status: string): string {
  const key = status.toLowerCase().replace(/\s+/g, "-");
  if (key === "done") return "status-healthy";
  if (key === "blocked" || key === "cancelled") return "status-blocked";
  if (key === "in-progress") return "status-warning";
  return "status-healthy";
}

interface SectionWorkBoardProps {
  section: Permission;
  title?: string;
  description?: string;
}

export function SectionWorkBoard({
  section,
  title = "Section workboard",
  description = "Tasks, todos, and status updates defined for this department.",
}: SectionWorkBoardProps) {
  const qc = useQueryClient();
  const queryKey = ["work-items", section];

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.get<SectionWorkItem[]>(
        `/api/v1/work-items?section=${encodeURIComponent(section)}`,
      ),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      httpClient.post("/api/v1/work-items", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      httpClient.put(`/api/v1/work-items/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/work-items/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
  });

  function payload(values: Record<string, string>) {
    return {
      section,
      kind: values.kind || "task",
      title: values.title,
      description: optStr(values.description),
      status: values.status || "Backlog",
      priority: values.priority || "Medium",
      assignee: optStr(values.assignee),
      due_date: optStr(values.due_date),
    };
  }

  const openCount = items.filter((i) => !["Done", "Cancelled"].includes(i.status)).length;
  const blockedCount = items.filter((i) => i.status === "Blocked").length;
  const todoCount = items.filter((i) => i.kind === "todo" && i.status !== "Done").length;

  return (
    <div className="page-stack">
      <section className="stats-row">
        <div className="stat-card">
          <span className="stat-label">Open</span>
          <strong className="stat-value">{openCount}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Todos</span>
          <strong className="stat-value">{todoCount}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Blocked</span>
          <strong className="stat-value">{blockedCount}</strong>
        </div>
      </section>

      <ResourceManager
        title={title}
        description={description}
        createLabel="Add work item"
        emptyTitle="No work items yet"
        emptyDescription="Create tasks, todos, or status checkpoints your team should track in this section."
        isLoading={isLoading}
        items={items}
        columns={[
          {
            key: "kind",
            label: "Kind",
            render: (r) => <span className="kind-chip">{r.kind}</span>,
          },
          { key: "title", label: "Title" },
          {
            key: "status",
            label: "Status",
            render: (r) => (
              <span className={`status-pill ${statusClass(r.status)}`}>{r.status}</span>
            ),
          },
          { key: "priority", label: "Priority" },
          {
            key: "assignee",
            label: "Assignee",
            render: (r) => r.assignee ?? "—",
          },
          {
            key: "due_date",
            label: "Due",
            render: (r) => r.due_date ?? "—",
          },
        ]}
        fields={[
          {
            name: "kind",
            label: "Kind",
            type: "select",
            required: true,
            options: KIND_OPTIONS,
          },
          { name: "title", label: "Title", required: true },
          { name: "description", label: "Description", type: "textarea" },
          {
            name: "status",
            label: "Status",
            type: "select",
            required: true,
            options: STATUS_OPTIONS,
          },
          {
            name: "priority",
            label: "Priority",
            type: "select",
            required: true,
            options: PRIORITY_OPTIONS,
          },
          { name: "assignee", label: "Assignee", placeholder: "Owner name" },
          { name: "due_date", label: "Due date", placeholder: "2026-07-15" },
        ]}
        toFormValues={(r) => ({
          kind: r.kind,
          title: r.title,
          description: r.description ?? "",
          status: r.status,
          priority: r.priority,
          assignee: r.assignee ?? "",
          due_date: r.due_date ?? "",
        })}
        extraActions={(r) =>
          r.status !== "Done" && r.status !== "Cancelled" ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() =>
                void updateMut.mutateAsync({
                  id: r.id,
                  body: { status: "Done" },
                })
              }
            >
              Mark done
            </button>
          ) : null
        }
        onCreate={async (v) => {
          await createMut.mutateAsync(payload(v));
        }}
        onUpdate={async (id, v) => {
          const body = payload(v);
          const { section: _s, ...rest } = body;
          await updateMut.mutateAsync({ id: Number(id), body: rest });
        }}
        onDelete={async (id) => {
          await deleteMut.mutateAsync(Number(id));
        }}
      />
    </div>
  );
}
