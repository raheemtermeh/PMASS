"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, num, optStr } from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";
import { useI18n } from "@/core/providers/I18nProvider";

interface InfraNode {
  id: number;
  name: string;
  node_type: string;
  status: string;
  cpu_pct: number;
  ram_pct: number;
  region?: string | null;
  notes?: string | null;
}

export default function InfrastructurePage() {
  const { t, n } = useI18n();
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["infra-nodes"],
    queryFn: () => httpClient.get<InfraNode[]>("/api/v1/infrastructure/nodes"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      httpClient.post("/api/v1/infrastructure/nodes", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["infra-nodes"] }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      httpClient.put(`/api/v1/infrastructure/nodes/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["infra-nodes"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/infrastructure/nodes/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["infra-nodes"] }),
  });

  function payload(values: Record<string, string>) {
    return {
      name: values.name,
      node_type: values.node_type,
      status: values.status || "healthy",
      cpu_pct: num(values.cpu_pct),
      ram_pct: num(values.ram_pct),
      region: optStr(values.region),
      notes: optStr(values.notes),
    };
  }

  return (
    <div className="page-stack">
      <SectionWorkBoard
        section="infrastructure"
        title={t("infrastructure.workboard.title")}
        description={t("infrastructure.workboard.description")}
      />
    <ResourceManager
      title={t("infrastructure.nodes.title")}
      description={t("infrastructure.nodes.description")}
      createLabel={t("infrastructure.nodes.create")}
      emptyTitle={t("infrastructure.nodes.emptyTitle")}
      emptyDescription={t("infrastructure.nodes.emptyDescription")}
      isLoading={isLoading}
      items={items}
      columns={[
        { key: "name", label: t("infrastructure.fields.name") },
        { key: "node_type", label: t("infrastructure.fields.type"), render: (r) => t(`infrastructure.types.${r.node_type}`) },
        {
          key: "status",
          label: t("infrastructure.fields.status"),
          render: (r) => <span className={`status-pill status-${r.status}`}>{t(`infrastructure.statuses.${r.status}`)}</span>,
        },
        {
          key: "cpu_pct",
          label: t("infrastructure.fields.cpu"),
          render: (r) => <span className="font-mono">{t("infrastructure.percent", { value: n(r.cpu_pct) })}</span>,
        },
        {
          key: "ram_pct",
          label: t("infrastructure.fields.ram"),
          render: (r) => <span className="font-mono">{t("infrastructure.percent", { value: n(r.ram_pct) })}</span>,
        },
        { key: "region", label: t("infrastructure.fields.region"), render: (r) => r.region ?? "—" },
      ]}
      fields={[
        { name: "name", label: t("infrastructure.fields.nodeName"), required: true },
        {
          name: "node_type",
          label: t("infrastructure.fields.type"),
          type: "select",
          required: true,
          options: [
            { value: "server", label: t("infrastructure.types.server") },
            { value: "cluster", label: t("infrastructure.types.cluster") },
            { value: "database", label: t("infrastructure.types.database") },
            { value: "edge", label: t("infrastructure.types.edge") },
            { value: "runner", label: t("infrastructure.types.runner") },
          ],
        },
        {
          name: "status",
          label: t("infrastructure.fields.status"),
          type: "select",
          options: [
            { value: "healthy", label: t("infrastructure.statuses.healthy") },
            { value: "warning", label: t("infrastructure.statuses.warning") },
            { value: "blocked", label: t("statuses.blocked") },
          ],
        },
        { name: "cpu_pct", label: t("infrastructure.fields.cpuPercent"), type: "number" },
        { name: "ram_pct", label: t("infrastructure.fields.ramPercent"), type: "number" },
        { name: "region", label: t("infrastructure.fields.region"), placeholder: t("infrastructure.placeholders.region") },
        { name: "notes", label: t("infrastructure.fields.notes"), type: "textarea" },
      ]}
      toFormValues={(r) => ({
        name: r.name,
        node_type: r.node_type,
        status: r.status,
        cpu_pct: String(r.cpu_pct),
        ram_pct: String(r.ram_pct),
        region: r.region ?? "",
        notes: r.notes ?? "",
      })}
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
