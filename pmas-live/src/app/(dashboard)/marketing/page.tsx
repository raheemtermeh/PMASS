"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ResourceManager,
  num,
  optInt,
} from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";
import { useI18n } from "@/core/providers/I18nProvider";
import { localizedEnumLabel, statusTranslationKey } from "@/lib/localized-labels";

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
  const { t, n } = useI18n();
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
        title={t("marketing.workboard.title")}
        description={t("marketing.workboard.description")}
      />
    <ResourceManager
      title={t("marketing.campaigns.title")}
      description={t("marketing.campaigns.description")}
      createLabel={t("marketing.campaigns.create")}
      emptyTitle={t("marketing.campaigns.emptyTitle")}
      emptyDescription={t("marketing.campaigns.emptyDescription")}
      isLoading={isLoading}
      items={campaigns}
      columns={[
        { key: "name", label: t("marketing.fields.name") },
        {
          key: "leads",
          label: t("marketing.fields.leads"),
          render: (r) => <span className="font-mono">{n(r.leads)}</span>,
        },
        {
          key: "conversion",
          label: t("marketing.fields.conversionShort"),
          render: (r) => <span className="font-mono">{t("marketing.percent", { value: n(r.conversion) })}</span>,
        },
        {
          key: "spend",
          label: t("marketing.fields.spend"),
          render: (r) => <span className="font-mono">{t("marketing.currency", { amount: n(r.spend) })}</span>,
        },
        {
          key: "status",
          label: t("marketing.fields.status"),
          render: (r) =>
            localizedEnumLabel(
              r.status,
              statusTranslationKey(r.status) ?? `marketing.statuses.${r.status.toLowerCase()}`,
              t,
            ),
        },
      ]}
      fields={[
        { name: "name", label: t("marketing.fields.campaignName"), required: true },
        { name: "leads", label: t("marketing.fields.leads"), type: "number" },
        { name: "conversion", label: t("marketing.fields.conversion"), type: "number", step: "0.01" },
        { name: "spend", label: t("marketing.fields.spend"), type: "number", step: "0.01" },
        {
          name: "status",
          label: t("marketing.fields.status"),
          type: "select",
          options: [
            { value: "Active", label: t("statuses.active") },
            { value: "Paused", label: t("marketing.statuses.paused") },
            { value: "Completed", label: t("statuses.completed") },
          ],
        },
        {
          name: "dependent_subsystem_id",
          label: t("marketing.fields.dependentSubsystem"),
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
