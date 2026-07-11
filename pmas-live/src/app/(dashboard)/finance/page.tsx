"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, num, optStr } from "@/components/ResourceManager";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";

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
        title="Finance workboard"
        description="Budget tasks, todos, and status updates for finance operations."
      />
      <div className="grid grid-cols-3">
        <div className="card">
          <div className="card-title">Entries</div>
          <div className="card-value font-mono">{items.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Total amount</div>
          <div className="card-value font-mono">${total.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="card-title">Active</div>
          <div className="card-value font-mono">
            {items.filter((i) => i.status === "Active").length}
          </div>
        </div>
      </div>

      <ResourceManager
        title="Finance Ledger"
        description="Track OpEx, CapEx, and revenue entries for your company."
        createLabel="New entry"
        emptyTitle="No finance entries"
        emptyDescription="Add burn and expenditure records to populate finance telemetry."
        isLoading={isLoading}
        items={items}
        columns={[
          { key: "title", label: "Title" },
          { key: "category", label: "Category" },
          {
            key: "amount",
            label: "Amount",
            render: (r) => <span className="font-mono">${r.amount.toLocaleString()}</span>,
          },
          { key: "period", label: "Period", render: (r) => r.period ?? "—" },
          { key: "status", label: "Status" },
        ]}
        fields={[
          { name: "title", label: "Title", required: true },
          {
            name: "category",
            label: "Category",
            type: "select",
            required: true,
            options: [
              { value: "opex", label: "OpEx" },
              { value: "capex", label: "CapEx" },
              { value: "revenue", label: "Revenue" },
            ],
          },
          { name: "amount", label: "Amount", type: "number", step: "0.01", required: true },
          { name: "period", label: "Period", placeholder: "2026-Q3" },
          {
            name: "status",
            label: "Status",
            type: "select",
            options: [
              { value: "Active", label: "Active" },
              { value: "Closed", label: "Closed" },
              { value: "Forecast", label: "Forecast" },
            ],
          },
          { name: "notes", label: "Notes", type: "textarea" },
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
