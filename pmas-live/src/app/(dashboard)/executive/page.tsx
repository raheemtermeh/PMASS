"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, optInt, optStr } from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";
import { useI18n } from "@/core/providers/I18nProvider";
import {
  localizedEnumLabel,
  priorityTranslationKey,
  statusTranslationKey,
} from "@/lib/localized-labels";

interface OperationalItem {
  id: number;
  ticket_code: string;
  title: string;
  description?: string | null;
  type: string;
  severity: string;
  status: string;
  origin_subsystem_id?: number | null;
  assigned_to?: string | null;
  linked_pr?: string | null;
}

interface Subsystem {
  id: number;
  name: string;
}

export default function ExecutivePage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["operations-items"],
    queryFn: () => httpClient.get<OperationalItem[]>("/api/v1/operations/items"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: subsystems = [] } = useQuery({
    queryKey: ["subsystems"],
    queryFn: () => httpClient.get<Subsystem[]>("/api/v1/engineering/subsystems"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      httpClient.post("/api/v1/operations/items", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["operations-items"] }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      httpClient.put(`/api/v1/operations/items/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["operations-items"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/operations/items/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["operations-items"] }),
  });
  const resolveMut = useMutation({
    mutationFn: (ticket_code: string) =>
      httpClient.post("/api/v1/operations/resolve", { ticket_code }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["operations-items"] });
      void qc.invalidateQueries({ queryKey: ["subsystems"] });
    },
  });

  function payload(values: Record<string, string>) {
    return {
      ticket_code: values.ticket_code,
      title: values.title,
      description: optStr(values.description),
      type: values.type,
      severity: values.severity,
      status: values.status,
      origin_subsystem_id: optInt(values.origin_subsystem_id),
      assigned_to: optStr(values.assigned_to),
      linked_pr: optStr(values.linked_pr),
    };
  }

  return (
    <div className="page-stack">
      <SectionWorkBoard
        section="executive"
        title={t("executive.workboard.title")}
        description={t("executive.workboard.description")}
      />
    <ResourceManager
      title={t("executive.operations.title")}
      description={t("executive.operations.description")}
      createLabel={t("executive.operations.create")}
      emptyTitle={t("executive.operations.emptyTitle")}
      emptyDescription={t("executive.operations.emptyDescription")}
      isLoading={isLoading}
      items={items}
      columns={[
        { key: "ticket_code", label: t("executive.fields.ticket"), render: (r) => <span className="font-mono">{r.ticket_code}</span> },
        { key: "title", label: t("executive.fields.title") },
        { key: "type", label: t("executive.fields.type"), render: (r) => t(`executive.types.${r.type}`) },
        {
          key: "severity",
          label: t("executive.fields.severity"),
          render: (r) =>
            localizedEnumLabel(r.severity, priorityTranslationKey(r.severity), t),
        },
        {
          key: "status",
          label: t("executive.fields.status"),
          render: (r) =>
            localizedEnumLabel(
              r.status,
              statusTranslationKey(r.status) ??
                `executive.statuses.${r.status.toLowerCase()}`,
              t,
            ),
        },
        { key: "assigned_to", label: t("executive.fields.owner"), render: (r) => r.assigned_to ?? "—" },
      ]}
      fields={[
        { name: "ticket_code", label: t("executive.fields.ticketCode"), required: true, placeholder: t("executive.placeholders.ticketCode") },
        { name: "title", label: t("executive.fields.title"), required: true },
        { name: "description", label: t("executive.fields.description"), type: "textarea" },
        {
          name: "type",
          label: t("executive.fields.type"),
          type: "select",
          required: true,
          options: [
            { value: "blocker", label: t("executive.types.blocker") },
            { value: "task", label: t("executive.types.task") },
            { value: "issue", label: t("executive.types.issue") },
            { value: "handoff", label: t("executive.types.handoff") },
          ],
        },
        {
          name: "severity",
          label: t("executive.fields.severity"),
          type: "select",
          required: true,
          options: [
            { value: "Critical", label: t("priorities.critical") },
            { value: "High", label: t("priorities.high") },
            { value: "Medium", label: t("priorities.medium") },
            { value: "Low", label: t("priorities.low") },
          ],
        },
        {
          name: "status",
          label: t("executive.fields.status"),
          type: "select",
          required: true,
          options: [
            { value: "Blocked", label: t("statuses.blocked") },
            { value: "In Progress", label: t("statuses.inProgress") },
            { value: "Backlog", label: t("statuses.backlog") },
            { value: "Active", label: t("statuses.active") },
            { value: "Completed", label: t("statuses.completed") },
            { value: "Resolved", label: t("executive.statuses.resolved") },
          ],
        },
        {
          name: "origin_subsystem_id",
          label: t("executive.fields.subsystem"),
          type: "select",
          options: subsystems.map((s) => ({ value: String(s.id), label: s.name })),
        },
        { name: "assigned_to", label: t("executive.fields.assignedTo") },
        { name: "linked_pr", label: t("executive.fields.linkedPr") },
      ]}
      toFormValues={(r) => ({
        ticket_code: r.ticket_code,
        title: r.title,
        description: r.description ?? "",
        type: r.type,
        severity: r.severity,
        status: r.status,
        origin_subsystem_id: r.origin_subsystem_id ? String(r.origin_subsystem_id) : "",
        assigned_to: r.assigned_to ?? "",
        linked_pr: r.linked_pr ?? "",
      })}
      extraActions={(r) =>
        r.type === "blocker" && r.status === "Blocked" ? (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={resolveMut.isPending}
            onClick={() => void resolveMut.mutateAsync(r.ticket_code)}
          >
            {t("executive.resolve")}
          </button>
        ) : null
      }
      onCreate={async (v) => {
        await createMut.mutateAsync(payload(v));
      }}
      onUpdate={async (id, v) => {
        await updateMut.mutateAsync({ id: Number(id), body: payload(v) });
      }}
      onDelete={async (id) => {
        await deleteMut.mutateAsync(Number(id));
      }}
    />
    </div>
  );
}
