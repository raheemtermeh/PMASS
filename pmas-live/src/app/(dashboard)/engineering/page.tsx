"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, num } from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";

interface Subsystem {
  id: number;
  name: string;
  slug: string;
  status: string;
  load_percentage: number;
}

export default function EngineeringPage() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["subsystems"],
    queryFn: () => httpClient.get<Subsystem[]>("/api/v1/engineering/subsystems"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      httpClient.post("/api/v1/engineering/subsystems", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["subsystems"] }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      httpClient.put(`/api/v1/engineering/subsystems/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["subsystems"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/engineering/subsystems/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["subsystems"] }),
  });
  const pipelineMut = useMutation({
    mutationFn: (subsystem_id: number) =>
      httpClient.post("/api/v1/engineering/pipeline/trigger", { subsystem_id }),
  });

  function payload(values: Record<string, string>) {
    return {
      name: values.name,
      slug: values.slug.trim().toLowerCase(),
      status: values.status || "healthy",
      load_percentage: num(values.load_percentage),
    };
  }

  return (
    <div className="page-stack">
      <SectionWorkBoard
        section="engineering"
        title="Engineering workboard"
        description="Delivery tasks, todos, and status updates for engineering."
      />
    <ResourceManager
      title="Engineering Subsystems"
      description="Manage product subsystems, health, and CI pipeline targets."
      createLabel="New subsystem"
      emptyTitle="No subsystems"
      emptyDescription="Create your engineering workspaces (services/modules) to start tracking load and pipelines."
      isLoading={isLoading}
      items={items}
      columns={[
        { key: "name", label: "Name" },
        { key: "slug", label: "Slug", render: (r) => <span className="font-mono">{r.slug}</span> },
        {
          key: "status",
          label: "Status",
          render: (r) => <span className={`status-pill status-${r.status}`}>{r.status}</span>,
        },
        {
          key: "load_percentage",
          label: "Load",
          render: (r) => <span className="font-mono">{r.load_percentage}%</span>,
        },
      ]}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "slug", label: "Slug", required: true, placeholder: "payments-api" },
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
        { name: "load_percentage", label: "Load %", type: "number" },
      ]}
      toFormValues={(r) => ({
        name: r.name,
        slug: r.slug,
        status: r.status,
        load_percentage: String(r.load_percentage),
      })}
      extraActions={(r) => (
        <button
          type="button"
          className="btn btn-sm"
          disabled={pipelineMut.isPending}
          onClick={() => void pipelineMut.mutateAsync(r.id).catch(() => undefined)}
        >
          Trigger CI
        </button>
      )}
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
