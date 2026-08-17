"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, optStr } from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";
import { useI18n } from "@/core/providers/I18nProvider";
import { localizedEnumLabel, statusTranslationKey } from "@/lib/localized-labels";

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
  const { t } = useI18n();
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
        title={t("legalhr.workboard.title")}
        description={t("legalhr.workboard.description")}
      />
    <ResourceManager
      title={t("legalhr.controls.title")}
      description={t("legalhr.controls.description")}
      createLabel={t("legalhr.controls.create")}
      emptyTitle={t("legalhr.controls.emptyTitle")}
      emptyDescription={t("legalhr.controls.emptyDescription")}
      isLoading={isLoading}
      items={items}
      columns={[
        { key: "code", label: t("legalhr.fields.code"), render: (r) => <span className="font-mono">{r.code}</span> },
        { key: "title", label: t("legalhr.fields.title") },
        {
          key: "framework",
          label: t("legalhr.fields.framework"),
          render: (r) => r.framework ? t(`legalhr.frameworks.${r.framework.toLowerCase()}`) : "—",
        },
        {
          key: "status",
          label: t("legalhr.fields.status"),
          render: (r) =>
            localizedEnumLabel(
              r.status,
              statusTranslationKey(r.status) ??
                `legalhr.statuses.${r.status.toLowerCase().replace(/\s+/g, "")}`,
              t,
            ),
        },
        { key: "owner_name", label: t("legalhr.fields.owner"), render: (r) => r.owner_name ?? "—" },
      ]}
      fields={[
        { name: "code", label: t("legalhr.fields.code"), required: true, placeholder: t("legalhr.placeholders.code") },
        { name: "title", label: t("legalhr.fields.title"), required: true },
        {
          name: "framework",
          label: t("legalhr.fields.framework"),
          type: "select",
          options: [
            { value: "SOC2", label: t("legalhr.frameworks.soc2") },
            { value: "GDPR", label: t("legalhr.frameworks.gdpr") },
            { value: "ISO27001", label: t("legalhr.frameworks.iso27001") },
            { value: "Internal", label: t("legalhr.frameworks.internal") },
          ],
        },
        {
          name: "status",
          label: t("legalhr.fields.status"),
          type: "select",
          options: [
            { value: "Pending", label: t("statuses.pending") },
            { value: "In Progress", label: t("statuses.inProgress") },
            { value: "Compliant", label: t("legalhr.statuses.compliant") },
            { value: "At Risk", label: t("legalhr.statuses.atrisk") },
          ],
        },
        { name: "owner_name", label: t("legalhr.fields.owner") },
        { name: "notes", label: t("legalhr.fields.notes"), type: "textarea" },
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
        await updateMut.mutateAsync({ id: Number(id), body: payload(v) });
      }}
      onDelete={async (id) => {
        await deleteMut.mutateAsync(Number(id));
      }}
    />
    </div>
  );
}
