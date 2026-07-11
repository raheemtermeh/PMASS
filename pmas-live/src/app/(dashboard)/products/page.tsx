"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager } from "@/components/ResourceManager";
import { httpClient } from "@/core/api/http-client";
import type { Employee, Product } from "@/features/vsm/types";
import { EXECUTION_MODELS, employeeLabel } from "@/features/vsm/types";

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

  const archiveMut = useMutation({
    mutationFn: (id: string | number) => httpClient.delete(`/api/v1/products/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-products"] }),
  });

  const ownerName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? employeeLabel(e) : id.slice(0, 8);
  };

  return (
    <div className="page-stack">
      <section className="pm-hero">
        <div>
          <p className="wizard-kicker">Aggregate root</p>
          <h2 className="pm-hero-title">Products</h2>
          <p className="text-dim" style={{ maxWidth: "42rem", marginTop: "0.5rem" }}>
            Every value stream starts here. A Product owns its Pipeline, Stage Instances, Projects,
            Features, and Tasks — never shared across products.
          </p>
        </div>
        <Link href="/organization" className="btn">
          Set up organization first
        </Link>
      </section>

      <ResourceManager
        title="Company products"
        description="Lifecycle: Draft → Ready → Active → Completed → Archived. Execution model is locked after create."
        createLabel="New product"
        emptyTitle="No products yet"
        emptyDescription="Create an employee (owner), then add your first Product."
        isLoading={isLoading}
        items={products}
        hideEdit
        columns={[
          {
            key: "name",
            label: "Name",
            render: (r) => (
              <Link href={`/products/${r.id}`} className="link-strong">
                {r.name}
              </Link>
            ),
          },
          { key: "category", label: "Category" },
          {
            key: "status",
            label: "Status",
            render: (r) => <span className="status-pill">{r.status}</span>,
          },
          {
            key: "execution_model",
            label: "Execution",
            render: (r) => <span className="font-mono">{r.execution_model}</span>,
          },
          {
            key: "owner",
            label: "Owner",
            render: (r) => ownerName(r.owner_id),
          },
        ]}
        fields={[
          { name: "name", label: "Name", required: true },
          { name: "description", label: "Description", type: "textarea" },
          { name: "category", label: "Category", placeholder: "platform / service / …" },
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
            options: EXECUTION_MODELS.map((m) => ({ value: m.value, label: m.label })),
          },
        ]}
        onCreate={async (v) => {
          await createMut.mutateAsync({
            name: v.name,
            description: v.description,
            category: v.category,
            owner_id: v.owner_id,
            execution_model: v.execution_model || "PROJECT_FEATURE_TASK",
          });
        }}
        onDelete={async (id) => {
          await archiveMut.mutateAsync(id);
        }}
        extraActions={(r) => (
          <Link href={`/products/${r.id}`} className="btn btn-sm">
            Open
          </Link>
        )}
      />
    </div>
  );
}
