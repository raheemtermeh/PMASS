"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, optInt, optStr } from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";

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
        title="Executive workboard"
        description="Leadership tasks, todos, and status checkpoints for the company."
      />
    <ResourceManager
      title="Executive Operations"
      description="Track blockers, tasks, and operational tickets across your portfolio."
      createLabel="New item"
      emptyTitle="No operational items"
      emptyDescription="Create blockers and tasks to drive Executive telemetry for your company."
      isLoading={isLoading}
      items={items}
      columns={[
        { key: "ticket_code", label: "Ticket", render: (r) => <span className="font-mono">{r.ticket_code}</span> },
        { key: "title", label: "Title" },
        { key: "type", label: "Type" },
        { key: "severity", label: "Severity" },
        { key: "status", label: "Status" },
        { key: "assigned_to", label: "Owner", render: (r) => r.assigned_to ?? "—" },
      ]}
      fields={[
        { name: "ticket_code", label: "Ticket code", required: true, placeholder: "BLK-101" },
        { name: "title", label: "Title", required: true },
        { name: "description", label: "Description", type: "textarea" },
        {
          name: "type",
          label: "Type",
          type: "select",
          required: true,
          options: [
            { value: "blocker", label: "Blocker" },
            { value: "task", label: "Task" },
            { value: "issue", label: "Issue" },
            { value: "handoff", label: "Handoff" },
          ],
        },
        {
          name: "severity",
          label: "Severity",
          type: "select",
          required: true,
          options: [
            { value: "Critical", label: "Critical" },
            { value: "High", label: "High" },
            { value: "Medium", label: "Medium" },
            { value: "Low", label: "Low" },
          ],
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          required: true,
          options: [
            { value: "Blocked", label: "Blocked" },
            { value: "In Progress", label: "In Progress" },
            { value: "Backlog", label: "Backlog" },
            { value: "Active", label: "Active" },
            { value: "Completed", label: "Completed" },
            { value: "Resolved", label: "Resolved" },
          ],
        },
        {
          name: "origin_subsystem_id",
          label: "Subsystem",
          type: "select",
          options: subsystems.map((s) => ({ value: String(s.id), label: s.name })),
        },
        { name: "assigned_to", label: "Assigned to" },
        { name: "linked_pr", label: "Linked PR" },
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
            Resolve
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
