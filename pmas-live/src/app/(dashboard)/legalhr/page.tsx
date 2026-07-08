"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, optStr } from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";

interface Control {
  id: number;
  code: string;
  title: string;
  framework?: string | null;
  status: string;
  owner_name?: string | null;
  notes?: string | null;
}

export default function LegalHRPage() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["compliance-controls"],
    queryFn: () => httpClient.get<Control[]>("/api/v1/legalhr/controls"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      httpClient.post("/api/v1/legalhr/controls", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["compliance-controls"] }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      httpClient.put(`/api/v1/legalhr/controls/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["compliance-controls"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/legalhr/controls/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["compliance-controls"] }),
  });

  function payload(values: Record<string, string>) {
    return {
      code: values.code,
      title: values.title,
      framework: optStr(values.framework),
      status: values.status || "Pending",
      owner_name: optStr(values.owner_name),
      notes: optStr(values.notes),
    };
  }

  return (
    <div className="page-stack">
      <SectionWorkBoard
        section="legalhr"
        title="Legal & HR workboard"
        description="Compliance tasks, todos, and status checkpoints."
      />
    <ResourceManager
      title="Legal & HR Compliance"
      description="Maintain GDPR/SOC2 style controls and ownership for your organization."
      createLabel="New control"
      emptyTitle="No compliance controls"
      emptyDescription="Add compliance checklist items and assign owners for audits."
      isLoading={isLoading}
      items={items}
      columns={[
        { key: "code", label: "Code", render: (r) => <span className="font-mono">{r.code}</span> },
        { key: "title", label: "Title" },
        { key: "framework", label: "Framework", render: (r) => r.framework ?? "—" },
        { key: "status", label: "Status" },
        { key: "owner_name", label: "Owner", render: (r) => r.owner_name ?? "—" },
      ]}
      fields={[
        { name: "code", label: "Code", required: true, placeholder: "SOC2-CC6.1" },
        { name: "title", label: "Title", required: true },
        {
          name: "framework",
          label: "Framework",
          type: "select",
          options: [
            { value: "SOC2", label: "SOC2" },
            { value: "GDPR", label: "GDPR" },
            { value: "ISO27001", label: "ISO27001" },
            { value: "Internal", label: "Internal" },
          ],
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "Pending", label: "Pending" },
            { value: "In Progress", label: "In Progress" },
            { value: "Compliant", label: "Compliant" },
            { value: "At Risk", label: "At Risk" },
          ],
        },
        { name: "owner_name", label: "Owner" },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      toFormValues={(r) => ({
        code: r.code,
        title: r.title,
        framework: r.framework ?? "",
        status: r.status,
        owner_name: r.owner_name ?? "",
        notes: r.notes ?? "",
      })}
      onCreate={async (v) => {
        await createMut.mutateAsync(payload(v));
      }}
      onUpdate={async (id, v) => {
        await updateMut.mutateAsync({ id, body: payload(v) });
      }}
      onDelete={async (id) => {
        await deleteMut.mutateAsync(id);
      }}
    />
    </div>
  );
}
