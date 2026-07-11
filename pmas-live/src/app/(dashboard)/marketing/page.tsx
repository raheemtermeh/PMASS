"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ResourceManager,
  num,
  optInt,
} from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";

interface Campaign {
  id: number;
  name: string;
  leads: number;
  conversion: number;
  spend: number;
  status: string;
  dependent_subsystem_id?: number | null;
}

interface Subsystem {
  id: number;
  name: string;
}

export default function MarketingPage() {
  const qc = useQueryClient();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => httpClient.get<Campaign[]>("/api/v1/marketing/campaigns"),
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
      httpClient.post("/api/v1/marketing/campaigns", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      httpClient.put(`/api/v1/marketing/campaigns/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/marketing/campaigns/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  function payload(values: Record<string, string>) {
    return {
      name: values.name,
      leads: num(values.leads),
      conversion: num(values.conversion),
      spend: num(values.spend),
      status: values.status || "Active",
      dependent_subsystem_id: optInt(values.dependent_subsystem_id),
    };
  }

  return (
    <div className="page-stack">
      <SectionWorkBoard
        section="marketing"
        title="Marketing workboard"
        description="Campaign tasks, todos, and status updates for your marketing team."
      />
    <ResourceManager
      title="Marketing Campaigns"
      description="Create and manage acquisition campaigns for your company workspace."
      createLabel="New campaign"
      emptyTitle="No campaigns yet"
      emptyDescription="Add your first campaign to start tracking leads, conversion, and spend."
      isLoading={isLoading}
      items={campaigns}
      columns={[
        { key: "name", label: "Name" },
        {
          key: "leads",
          label: "Leads",
          render: (r) => <span className="font-mono">{r.leads.toLocaleString()}</span>,
        },
        {
          key: "conversion",
          label: "Conv.",
          render: (r) => <span className="font-mono">{r.conversion}%</span>,
        },
        {
          key: "spend",
          label: "Spend",
          render: (r) => <span className="font-mono">${r.spend.toLocaleString()}</span>,
        },
        { key: "status", label: "Status" },
      ]}
      fields={[
        { name: "name", label: "Campaign name", required: true },
        { name: "leads", label: "Leads", type: "number" },
        { name: "conversion", label: "Conversion %", type: "number", step: "0.01" },
        { name: "spend", label: "Spend", type: "number", step: "0.01" },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "Active", label: "Active" },
            { value: "Paused", label: "Paused" },
            { value: "Completed", label: "Completed" },
          ],
        },
        {
          name: "dependent_subsystem_id",
          label: "Dependent subsystem",
          type: "select",
          options: subsystems.map((s) => ({ value: String(s.id), label: s.name })),
        },
      ]}
      toFormValues={(r) => ({
        name: r.name,
        leads: String(r.leads),
        conversion: String(r.conversion),
        spend: String(r.spend),
        status: r.status,
        dependent_subsystem_id: r.dependent_subsystem_id
          ? String(r.dependent_subsystem_id)
          : "",
      })}
      onCreate={async (values) => {
        await createMut.mutateAsync(payload(values));
      }}
      onUpdate={async (id, values) => {
        await updateMut.mutateAsync({ id: Number(id), body: payload(values) });
      }}
      onDelete={async (id) => {
        await deleteMut.mutateAsync(Number(id));
      }}
    />
    </div>
  );
}
