"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, num } from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";
import { useI18n } from "@/core/providers/I18nProvider";

interface Subsystem {
  id: number;
  name: string;
  slug: string;
  status: string;
  load_percentage: number;
}

export default function EngineeringPage() {
  const { t, n } = useI18n();
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
        title={t("engineering.workboard.title")}
        description={t("engineering.workboard.description")}
      />
    <ResourceManager
      title={t("engineering.subsystems.title")}
      description={t("engineering.subsystems.description")}
      createLabel={t("engineering.subsystems.create")}
      emptyTitle={t("engineering.subsystems.emptyTitle")}
      emptyDescription={t("engineering.subsystems.emptyDescription")}
      isLoading={isLoading}
      items={items}
      columns={[
        { key: "name", label: t("engineering.fields.name") },
        { key: "slug", label: t("engineering.fields.slug"), render: (r) => <span className="font-mono">{r.slug}</span> },
        {
          key: "status",
          label: t("engineering.fields.status"),
          render: (r) => <span className={`status-pill status-${r.status}`}>{t(`engineering.statuses.${r.status}`)}</span>,
        },
        {
          key: "load_percentage",
          label: t("engineering.fields.load"),
          render: (r) => <span className="font-mono">{t("engineering.percent", { value: n(r.load_percentage) })}</span>,
        },
      ]}
      fields={[
        { name: "name", label: t("engineering.fields.name"), required: true },
        { name: "slug", label: t("engineering.fields.slug"), required: true, placeholder: t("engineering.placeholders.slug") },
        {
          name: "status",
          label: t("engineering.fields.status"),
          type: "select",
          options: [
            { value: "healthy", label: t("engineering.statuses.healthy") },
            { value: "warning", label: t("engineering.statuses.warning") },
            { value: "blocked", label: t("statuses.blocked") },
          ],
        },
        { name: "load_percentage", label: t("engineering.fields.loadPercent"), type: "number" },
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
          {t("engineering.triggerCi")}
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
