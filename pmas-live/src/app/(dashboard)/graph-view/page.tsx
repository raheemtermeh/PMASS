"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, num, optInt, optStr } from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";
import { useI18n } from "@/core/providers/I18nProvider";

interface Subsystem {
  id: number;
  name: string;
}

interface TeamMember {
  id: number;
  name: string;
  avatar_url?: string | null;
  role: string;
  subsystem_id?: number | null;
  capacity_weight: number;
}

interface GraphEdge {
  id: number;
  source_id: number;
  target_id: number;
  edge_type: string;
  weight: number;
}

export default function GraphViewPage() {
  const { t, n } = useI18n();
  const qc = useQueryClient();

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: () => httpClient.get<TeamMember[]>("/api/v1/graph/members"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: edges = [], isLoading: edgesLoading } = useQuery({
    queryKey: ["graph-edges"],
    queryFn: () => httpClient.get<GraphEdge[]>("/api/v1/graph/edges"),
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

  const createMember = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/graph/members", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["team-members"] }),
  });
  const updateMember = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      httpClient.put(`/api/v1/graph/members/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["team-members"] }),
  });
  const deleteMember = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/graph/members/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["team-members"] }),
  });

  const createEdge = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/graph/edges", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["graph-edges"] }),
  });
  const updateEdge = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      httpClient.put(`/api/v1/graph/edges/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["graph-edges"] }),
  });
  const deleteEdge = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/graph/edges/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["graph-edges"] }),
  });

  const subsystemName = (id: number) =>
    subsystems.find((s) => s.id === id)?.name ?? `#${id}`;

  return (
    <div className="page-stack">
      <SectionWorkBoard
        section="graph-view"
        title={t("graphView.workboard.title")}
        description={t("graphView.workboard.description")}
      />
      <ResourceManager
        title={t("graphView.members.title")}
        description={t("graphView.members.description")}
        createLabel={t("graphView.members.create")}
        emptyTitle={t("graphView.members.emptyTitle")}
        emptyDescription={t("graphView.members.emptyDescription")}
        isLoading={membersLoading}
        items={members}
        columns={[
          { key: "name", label: t("graphView.fields.name") },
          { key: "role", label: t("graphView.fields.role") },
          {
            key: "subsystem_id",
            label: t("graphView.fields.subsystem"),
            render: (r) => (r.subsystem_id ? subsystemName(r.subsystem_id) : "—"),
          },
          {
            key: "capacity_weight",
            label: t("graphView.fields.capacity"),
            render: (r) => <span className="font-mono">{n(r.capacity_weight)}</span>,
          },
        ]}
        fields={[
          { name: "name", label: t("graphView.fields.name"), required: true },
          { name: "role", label: t("graphView.fields.role"), required: true },
          { name: "avatar_url", label: t("graphView.fields.avatarInitials"), placeholder: t("graphView.placeholders.initials") },
          {
            name: "subsystem_id",
            label: t("graphView.fields.subsystem"),
            type: "select",
            options: subsystems.map((s) => ({ value: String(s.id), label: s.name })),
          },
          { name: "capacity_weight", label: t("graphView.fields.capacityWeight"), type: "number", step: "0.01" },
        ]}
        toFormValues={(r) => ({
          name: r.name,
          role: r.role,
          avatar_url: r.avatar_url ?? "",
          subsystem_id: r.subsystem_id ? String(r.subsystem_id) : "",
          capacity_weight: String(r.capacity_weight),
        })}
        onCreate={async (v) => {
          await createMember.mutateAsync({
            name: v.name,
            role: v.role,
            avatar_url: optStr(v.avatar_url),
            subsystem_id: optInt(v.subsystem_id),
            capacity_weight: num(v.capacity_weight, 1),
          });
        }}
        onUpdate={async (id, v) => {
          await updateMember.mutateAsync({
            id: Number(id),
            body: {
              name: v.name,
              role: v.role,
              avatar_url: optStr(v.avatar_url),
              subsystem_id: optInt(v.subsystem_id),
              capacity_weight: num(v.capacity_weight, 1),
            },
          });
        }}
        onDelete={async (id) => {
          await deleteMember.mutateAsync(Number(id));
        }}
      />

      <ResourceManager
        title={t("graphView.edges.title")}
        description={t("graphView.edges.description")}
        createLabel={t("graphView.edges.create")}
        emptyTitle={t("graphView.edges.emptyTitle")}
        emptyDescription={t("graphView.edges.emptyDescription")}
        isLoading={edgesLoading}
        items={edges}
        columns={[
          {
            key: "source_id",
            label: t("graphView.fields.from"),
            render: (r) => subsystemName(r.source_id),
          },
          {
            key: "target_id",
            label: t("graphView.fields.to"),
            render: (r) => subsystemName(r.target_id),
          },
          { key: "edge_type", label: t("graphView.fields.type"), render: (r) => t(`graphView.edgeTypes.${r.edge_type}`) },
          {
            key: "weight",
            label: t("graphView.fields.weight"),
            render: (r) => <span className="font-mono">{n(r.weight)}</span>,
          },
        ]}
        fields={[
          {
            name: "source_id",
            label: t("graphView.fields.sourceSubsystem"),
            type: "select",
            required: true,
            options: subsystems.map((s) => ({ value: String(s.id), label: s.name })),
          },
          {
            name: "target_id",
            label: t("graphView.fields.targetSubsystem"),
            type: "select",
            required: true,
            options: subsystems.map((s) => ({ value: String(s.id), label: s.name })),
          },
          {
            name: "edge_type",
            label: t("graphView.fields.edgeType"),
            type: "select",
            options: [
              { value: "subsystem_dependency", label: t("graphView.edgeTypes.subsystem_dependency") },
            ],
          },
          { name: "weight", label: t("graphView.fields.weight"), type: "number", step: "0.01" },
        ]}
        toFormValues={(r) => ({
          source_id: String(r.source_id),
          target_id: String(r.target_id),
          edge_type: r.edge_type,
          weight: String(r.weight),
        })}
        onCreate={async (v) => {
          await createEdge.mutateAsync({
            source_id: num(v.source_id),
            target_id: num(v.target_id),
            edge_type: v.edge_type || "subsystem_dependency",
            weight: num(v.weight, 1),
          });
        }}
        onUpdate={async (id, v) => {
          await updateEdge.mutateAsync({
            id: Number(id),
            body: {
              source_id: num(v.source_id),
              target_id: num(v.target_id),
              edge_type: v.edge_type || "subsystem_dependency",
              weight: num(v.weight, 1),
            },
          });
        }}
        onDelete={async (id) => {
          await deleteEdge.mutateAsync(Number(id));
        }}
      />
    </div>
  );
}
