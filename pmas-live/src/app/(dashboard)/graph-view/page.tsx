"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, num, optInt, optStr } from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";

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
        title="Graph workboard"
        description="Topology tasks, todos, and status updates for network mapping."
      />
      <ResourceManager
        title="Team Members"
        description="People and capacity assigned to subsystems in your topology."
        createLabel="Add member"
        emptyTitle="No team members"
        emptyDescription="Add people to map ownership and capacity on the graph."
        isLoading={membersLoading}
        items={members}
        columns={[
          { key: "name", label: "Name" },
          { key: "role", label: "Role" },
          {
            key: "subsystem_id",
            label: "Subsystem",
            render: (r) => (r.subsystem_id ? subsystemName(r.subsystem_id) : "—"),
          },
          {
            key: "capacity_weight",
            label: "Capacity",
            render: (r) => <span className="font-mono">{r.capacity_weight}</span>,
          },
        ]}
        fields={[
          { name: "name", label: "Name", required: true },
          { name: "role", label: "Role", required: true },
          { name: "avatar_url", label: "Avatar initials", placeholder: "SJ" },
          {
            name: "subsystem_id",
            label: "Subsystem",
            type: "select",
            options: subsystems.map((s) => ({ value: String(s.id), label: s.name })),
          },
          { name: "capacity_weight", label: "Capacity weight", type: "number", step: "0.01" },
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
        title="Dependency Edges"
        description="Connect subsystems to model cross-team dependencies and impact cascades."
        createLabel="Add edge"
        emptyTitle="No graph edges"
        emptyDescription="Link subsystems to visualize dependency flow."
        isLoading={edgesLoading}
        items={edges}
        columns={[
          {
            key: "source_id",
            label: "From",
            render: (r) => subsystemName(r.source_id),
          },
          {
            key: "target_id",
            label: "To",
            render: (r) => subsystemName(r.target_id),
          },
          { key: "edge_type", label: "Type" },
          {
            key: "weight",
            label: "Weight",
            render: (r) => <span className="font-mono">{r.weight}</span>,
          },
        ]}
        fields={[
          {
            name: "source_id",
            label: "Source subsystem",
            type: "select",
            required: true,
            options: subsystems.map((s) => ({ value: String(s.id), label: s.name })),
          },
          {
            name: "target_id",
            label: "Target subsystem",
            type: "select",
            required: true,
            options: subsystems.map((s) => ({ value: String(s.id), label: s.name })),
          },
          {
            name: "edge_type",
            label: "Edge type",
            type: "select",
            options: [
              { value: "subsystem_dependency", label: "Subsystem dependency" },
            ],
          },
          { name: "weight", label: "Weight", type: "number", step: "0.01" },
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
