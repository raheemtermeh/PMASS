"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, optStr } from "@/components/ResourceManager";
import { StatusKanbanBoard } from "@/components/visual/StatusKanbanBoard";
import { httpClient } from "@/core/api/http-client";
import { useI18n } from "@/core/providers/I18nProvider";
import {
  localizedEnumLabel,
  priorityTranslationKey,
  statusTranslationKey,
} from "@/lib/localized-labels";
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

type Translate = (key: string) => string;

function kindOptions(t: Translate) {
  return [
    { value: "task", label: t("workboard.kinds.task") },
    { value: "todo", label: t("workboard.kinds.todo") },
    { value: "status", label: t("workboard.kinds.status") },
  ];
}

function statusOptions(t: Translate) {
  return ["Backlog", "Todo", "In Progress", "Blocked", "Done", "Cancelled"].map(
    (value) => ({
      value,
      label: localizedEnumLabel(value, statusTranslationKey(value), t),
    }),
  );
}

function priorityOptions(t: Translate) {
  return ["Critical", "High", "Medium", "Low"].map((value) => ({
    value,
    label: localizedEnumLabel(value, priorityTranslationKey(value), t),
  }));
}

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
  title,
  description,
}: SectionWorkBoardProps) {
  const { t, n, d } = useI18n();
  const qc = useQueryClient();
  const queryKey = ["work-items", section];
  const displayedTitle = title ?? t("workboard.defaultTitle");
  const displayedDescription = description ?? t("workboard.defaultDescription");
  const kinds = kindOptions(t);
  const statuses = statusOptions(t);
  const priorities = priorityOptions(t);
  const kindLabel = (value: string) =>
    kinds.find((option) => option.value === value)?.label ?? value;

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
          <span className="stat-label">{t("workboard.stats.open")}</span>
          <strong className="stat-value">{n(openCount)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t("workboard.stats.todos")}</span>
          <strong className="stat-value">{n(todoCount)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">{t("workboard.stats.blocked")}</span>
          <strong className="stat-value">{n(blockedCount)}</strong>
        </div>
      </section>

      <StatusKanbanBoard
        layoutKey={`workboard:${section}`}
        title={t("workboard.visualTitle", { title: displayedTitle })}
        hint={t("workboard.visualHint")}
        columns={statuses.map((s) => ({ id: s.value, label: s.label }))}
        cards={items.map((item) => ({
          id: String(item.id),
          title: item.title,
          status: item.status,
          subtitle: `${kindLabel(item.kind)} · ${localizedEnumLabel(item.priority, priorityTranslationKey(item.priority), t)}`,
        }))}
        onStatusChange={async (id, status) => {
          await updateMut.mutateAsync({ id: Number(id), body: { status } });
        }}
      />

      <ResourceManager
        title={displayedTitle}
        description={displayedDescription}
        createLabel={t("workboard.addItem")}
        emptyTitle={t("workboard.emptyTitle")}
        emptyDescription={t("workboard.emptyDescription")}
        isLoading={isLoading}
        items={items}
        columns={[
          {
            key: "kind",
            label: t("workboard.fields.kind"),
            render: (r) => <span className="kind-chip">{kindLabel(r.kind)}</span>,
          },
          { key: "title", label: t("workboard.fields.title") },
          {
            key: "status",
            label: t("workboard.fields.status"),
            render: (r) => (
              <span className={`status-pill ${statusClass(r.status)}`}>
                {localizedEnumLabel(r.status, statusTranslationKey(r.status), t)}
              </span>
            ),
          },
          {
            key: "priority",
            label: t("workboard.fields.priority"),
            render: (r) =>
              localizedEnumLabel(r.priority, priorityTranslationKey(r.priority), t),
          },
          {
            key: "assignee",
            label: t("workboard.fields.assignee"),
            render: (r) => r.assignee ?? "—",
          },
          {
            key: "due_date",
            label: t("workboard.fields.due"),
            render: (r) => (r.due_date ? d(r.due_date) : "—"),
          },
        ]}
        fields={[
          {
            name: "kind",
            label: t("workboard.fields.kind"),
            type: "select",
            required: true,
            options: kinds,
          },
          { name: "title", label: t("workboard.fields.title"), required: true },
          { name: "description", label: t("workboard.fields.description"), type: "textarea" },
          {
            name: "status",
            label: t("workboard.fields.status"),
            type: "select",
            required: true,
            options: statuses,
          },
          {
            name: "priority",
            label: t("workboard.fields.priority"),
            type: "select",
            required: true,
            options: priorities,
          },
          {
            name: "assignee",
            label: t("workboard.fields.assignee"),
            placeholder: t("workboard.placeholders.ownerName"),
          },
          {
            name: "due_date",
            label: t("workboard.fields.dueDate"),
            placeholder: t("workboard.placeholders.dueDate"),
          },
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
              {t("workboard.markDone")}
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
