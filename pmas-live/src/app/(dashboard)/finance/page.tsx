"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, num, optStr } from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";
import { useI18n } from "@/core/providers/I18nProvider";
import { localizedEnumLabel, statusTranslationKey } from "@/lib/localized-labels";

interface FinanceEntry {
  id: number;
  title: string;
  category: string;
  amount: number;
  period?: string | null;
  status: string;
  notes?: string | null;
}

export default function FinancePage() {
  const { t, n } = useI18n();
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["finance-entries"],
    queryFn: () => httpClient.get<FinanceEntry[]>("/api/v1/finance/entries"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      httpClient.post("/api/v1/finance/entries", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["finance-entries"] }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      httpClient.put(`/api/v1/finance/entries/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["finance-entries"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/finance/entries/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["finance-entries"] }),
  });

  const total = items.reduce((sum, i) => sum + (i.amount || 0), 0);

  function payload(values: Record<string, string>) {
    return {
      title: values.title,
      category: values.category,
      amount: num(values.amount),
      period: optStr(values.period),
      status: values.status || "Active",
      notes: optStr(values.notes),
    };
  }

  return (
    <div className="page-stack">
      <SectionWorkBoard
        section="finance"
        title={t("finance.workboard.title")}
        description={t("finance.workboard.description")}
      />
      <div className="grid grid-cols-3">
        <div className="card">
          <div className="card-title">{t("finance.stats.entries")}</div>
          <div className="card-value font-mono">{n(items.length)}</div>
        </div>
        <div className="card">
          <div className="card-title">{t("finance.stats.totalAmount")}</div>
          <div className="card-value font-mono">
            {t("finance.currency", { amount: n(total) })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">{t("statuses.active")}</div>
          <div className="card-value font-mono">
            {n(items.filter((i) => i.status === "Active").length)}
          </div>
        </div>
      </div>

      <ResourceManager
        title={t("finance.ledger.title")}
        description={t("finance.ledger.description")}
        createLabel={t("finance.ledger.create")}
        emptyTitle={t("finance.ledger.emptyTitle")}
        emptyDescription={t("finance.ledger.emptyDescription")}
        isLoading={isLoading}
        items={items}
        columns={[
          { key: "title", label: t("finance.fields.title") },
          {
            key: "category",
            label: t("finance.fields.category"),
            render: (r) => t(`finance.categories.${r.category}`),
          },
          {
            key: "amount",
            label: t("finance.fields.amount"),
            render: (r) => (
              <span className="font-mono">{t("finance.currency", { amount: n(r.amount) })}</span>
            ),
          },
          { key: "period", label: t("finance.fields.period"), render: (r) => r.period ?? "—" },
          {
            key: "status",
            label: t("finance.fields.status"),
            render: (r) =>
              localizedEnumLabel(
                r.status,
                statusTranslationKey(r.status) ?? `finance.statuses.${r.status.toLowerCase()}`,
                t,
              ),
          },
        ]}
        fields={[
          { name: "title", label: t("finance.fields.title"), required: true },
          {
            name: "category",
            label: t("finance.fields.category"),
            type: "select",
            required: true,
            options: [
              { value: "opex", label: t("finance.categories.opex") },
              { value: "capex", label: t("finance.categories.capex") },
              { value: "revenue", label: t("finance.categories.revenue") },
            ],
          },
          { name: "amount", label: t("finance.fields.amount"), type: "number", step: "0.01", required: true },
          { name: "period", label: t("finance.fields.period"), placeholder: t("finance.placeholders.period") },
          {
            name: "status",
            label: t("finance.fields.status"),
            type: "select",
            options: [
              { value: "Active", label: t("statuses.active") },
              { value: "Closed", label: t("finance.statuses.closed") },
              { value: "Forecast", label: t("finance.statuses.forecast") },
            ],
          },
          { name: "notes", label: t("finance.fields.notes"), type: "textarea" },
        ]}
        toFormValues={(r) => ({
          title: r.title,
          category: r.category,
          amount: String(r.amount),
          period: r.period ?? "",
          status: r.status,
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
