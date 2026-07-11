"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, num, optStr } from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";

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
        title="Infrastructure workboard"
        description="Ops tasks, todos, and status updates for infra."
      />
    <ResourceManager
      title="Infrastructure Nodes"
      description="Track servers, clusters, and runtime health for your environments."
      createLabel="New node"
      emptyTitle="No infrastructure nodes"
      emptyDescription="Register nodes to monitor CPU/RAM and deployment targets."
      isLoading={isLoading}
      items={items}
      columns={[
        { key: "name", label: "Name" },
        { key: "node_type", label: "Type" },
        {
          key: "status",
          label: "Status",
          render: (r) => <span className={`status-pill status-${r.status}`}>{r.status}</span>,
        },
        {
          key: "cpu_pct",
          label: "CPU",
          render: (r) => <span className="font-mono">{r.cpu_pct}%</span>,
        },
        {
          key: "ram_pct",
          label: "RAM",
          render: (r) => <span className="font-mono">{r.ram_pct}%</span>,
        },
        { key: "region", label: "Region", render: (r) => r.region ?? "—" },
      ]}
      fields={[
        { name: "name", label: "Node name", required: true },
        {
          name: "node_type",
          label: "Type",
          type: "select",
          required: true,
          options: [
            { value: "server", label: "Server" },
            { value: "cluster", label: "Cluster" },
            { value: "database", label: "Database" },
            { value: "edge", label: "Edge" },
            { value: "runner", label: "CI Runner" },
          ],
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "healthy", label: "Healthy" },
            { value: "warning", label: "Warning" },
            { value: "blocked", label: "Blocked" },
          ],
        },
        { name: "cpu_pct", label: "CPU %", type: "number" },
        { name: "ram_pct", label: "RAM %", type: "number" },
        { name: "region", label: "Region", placeholder: "us-east-1" },
        { name: "notes", label: "Notes", type: "textarea" },
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
