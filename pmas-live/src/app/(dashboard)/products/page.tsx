"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager } from "@/components/ResourceManager";
import { httpClient } from "@/core/api/http-client";
import type { Employee, Product } from "@/features/vsm/types";
import { employeeLabel } from "@/features/vsm/types";

export default function ProductsPage() {
  const qc = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["vsm-products"],
    queryFn: () => httpClient.get<Product[]>("/api/v1/products"),
    staleTime: 30_000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["vsm-employees"],
    queryFn: () => httpClient.get<Employee[]>("/api/v1/employees"),
    staleTime: 60_000,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post<Product>("/api/v1/products", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-products"] }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, unknown> }) =>
      httpClient.patch(`/api/v1/products/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-products"] }),
  });
  const archiveMut = useMutation({
    mutationFn: (id: string | number) => httpClient.delete(`/api/v1/products/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-products"] }),
  });

  const ownerName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? employeeLabel(e) : id.slice(0, 8);
  };

  return (
    <ResourceManager
      title="Products"
      description="Product is the aggregate root. Lifecycle: Draft → Ready → Active → Completed → Archived. Execution model is locked after create."
      createLabel="New product"
      emptyTitle="No products yet"
      emptyDescription="Create a Product after you have at least one Employee to own it. Then open it to attach a Pipeline and start execution."
      isLoading={isLoading}
      items={products}
      columns={[
        {
          key: "name",
          label: "Product",
          render: (r) => (
            <Link href={`/products/${r.id}`} style={{ fontWeight: 600, color: "var(--color-accent)" }}>
              {r.name}
            </Link>
          ),
        },
        {
          key: "status",
          label: "Status",
          render: (r) => <span className="status-pill">{r.status}</span>,
        },
        { key: "execution_model", label: "Execution model", render: (r) => <span className="font-mono">{r.execution_model}</span> },
        { key: "owner", label: "Owner", render: (r) => ownerName(r.owner_id) },
        { key: "category", label: "Category" },
      ]}
      fields={[
        { name: "name", label: "Name", required: true },
        {
          name: "owner_id",
          label: "Owner (employee)",
          type: "select",
          required: true,
          options: employees.map((e) => ({ value: e.id, label: employeeLabel(e) })),
        },
        {
          name: "execution_model",
          label: "Execution model",
          type: "select",
          required: true,
          options: [
            { value: "PROJECT_FEATURE_TASK", label: "Project → Feature → Task" },
            { value: "FEATURE_TASK", label: "Feature → Task" },
            { value: "DIRECT_TASK", label: "Direct Task" },
          ],
        },
        { name: "category", label: "Category" },
        { name: "description", label: "Description", type: "textarea" },
      ]}
      toFormValues={(r) => ({
        name: r.name,
        owner_id: r.owner_id,
        execution_model: r.execution_model,
        category: r.category,
        description: r.description,
      })}
      onCreate={async (v) => {
        await createMut.mutateAsync({
          name: v.name,
          owner_id: v.owner_id,
          execution_model: v.execution_model || "PROJECT_FEATURE_TASK",
          category: v.category,
          description: v.description,
        });
      }}
      onUpdate={async (id, v) => {
        await updateMut.mutateAsync({
          id,
          body: {
            name: v.name,
            category: v.category,
            description: v.description,
          },
        });
      }}
      onDelete={async (id) => {
        await archiveMut.mutateAsync(id);
      }}
      extraActions={(row) => (
        <Link href={`/products/${row.id}`} className="btn btn-sm">
          Open
        </Link>
      )}
    />
  );
}
