"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager } from "@/components/ResourceManager";
import { httpClient } from "@/core/api/http-client";
import type { Employee, Product } from "@/features/vsm/types";
import { employeeLabel } from "@/features/vsm/types";

const PRIORITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const VISIBILITY_OPTIONS = [
  { value: "ORGANIZATION", label: "Organization" },
  { value: "PRIVATE", label: "Private" },
  { value: "PUBLIC", label: "Public" },
];

const ARCHIVED_STATUSES = new Set(["ARCHIVED"]);

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
  const holdMut = useMutation({
    mutationFn: (id: string | number) => httpClient.post(`/api/v1/products/${id}/hold`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-products"] }),
  });
  const resumeMut = useMutation({
    mutationFn: (id: string | number) => httpClient.post(`/api/v1/products/${id}/resume`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-products"] }),
  });
  const restoreMut = useMutation({
    mutationFn: (id: string | number) => httpClient.post(`/api/v1/products/${id}/restore`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-products"] }),
  });
  const softDeleteMut = useMutation({
    mutationFn: (id: string | number) => httpClient.post(`/api/v1/products/${id}/soft-delete`),
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
              {r.deleted_at ? <span className="text-dim"> (deleted)</span> : null}
            </Link>
          ),
        },
        {
          key: "status",
          label: "Status",
          render: (r) => <span className="status-pill">{r.status}</span>,
        },
        { key: "code", label: "Code", render: (r) => <span className="font-mono">{r.code || "—"}</span> },
        { key: "execution_model", label: "Execution model", render: (r) => <span className="font-mono">{r.execution_model}</span> },
        { key: "priority", label: "Priority", render: (r) => r.priority || "—" },
        { key: "owner", label: "Owner", render: (r) => ownerName(r.owner_id) },
        {
          key: "manager",
          label: "Manager",
          render: (r) => (r.manager_id ? ownerName(r.manager_id) : "—"),
        },
        { key: "category", label: "Category" },
      ]}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "code", label: "Code" },
        {
          name: "owner_id",
          label: "Owner (employee)",
          type: "select",
          required: true,
          options: employees.map((e) => ({ value: e.id, label: employeeLabel(e) })),
        },
        {
          name: "manager_id",
          label: "Manager (employee)",
          type: "select",
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
        { name: "product_type", label: "Product type" },
        { name: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
        { name: "visibility", label: "Visibility", type: "select", options: VISIBILITY_OPTIONS },
        { name: "description", label: "Description", type: "textarea" },
        { name: "vision", label: "Vision", type: "textarea" },
        { name: "goal", label: "Goal", type: "textarea" },
        { name: "success_metrics", label: "Success metrics", type: "textarea" },
        { name: "business_value", label: "Business value", type: "textarea" },
      ]}
      toFormValues={(r) => ({
        name: r.name,
        code: r.code ?? "",
        owner_id: r.owner_id,
        manager_id: r.manager_id ?? "",
        execution_model: r.execution_model,
        category: r.category,
        product_type: r.product_type ?? "",
        priority: r.priority ?? "",
        visibility: r.visibility ?? "",
        description: r.description,
        vision: r.vision ?? "",
        goal: r.goal ?? "",
        success_metrics: r.success_metrics ?? "",
        business_value: r.business_value ?? "",
      })}
      onCreate={async (v) => {
        await createMut.mutateAsync({
          name: v.name,
          code: v.code,
          owner_id: v.owner_id,
          manager_id: v.manager_id || undefined,
          execution_model: v.execution_model || "PROJECT_FEATURE_TASK",
          category: v.category,
          product_type: v.product_type,
          priority: v.priority,
          visibility: v.visibility,
          description: v.description,
          vision: v.vision,
          goal: v.goal,
          success_metrics: v.success_metrics,
          business_value: v.business_value,
        });
      }}
      onUpdate={async (id, v) => {
        await updateMut.mutateAsync({
          id,
          body: {
            name: v.name,
            code: v.code,
            category: v.category,
            product_type: v.product_type,
            priority: v.priority,
            visibility: v.visibility,
            description: v.description,
            vision: v.vision,
            goal: v.goal,
            success_metrics: v.success_metrics,
            business_value: v.business_value,
          },
        });
        if (v.manager_id !== undefined) {
          await httpClient.put(`/api/v1/products/${id}/manager`, {
            manager_id: v.manager_id || null,
          });
        }
      }}
      onDelete={async (id) => {
        await archiveMut.mutateAsync(id);
      }}
      extraActions={(row) => (
        <>
          <Link href={`/products/${row.id}`} className="btn btn-sm">
            Open
          </Link>
          {row.status === "ON_HOLD" ? (
            <button type="button" className="btn btn-sm" onClick={() => resumeMut.mutate(row.id)}>
              Resume
            </button>
          ) : !ARCHIVED_STATUSES.has(row.status) && !row.deleted_at ? (
            <button type="button" className="btn btn-sm" onClick={() => holdMut.mutate(row.id)}>
              Hold
            </button>
          ) : null}
          {row.deleted_at ? (
            <button type="button" className="btn btn-sm" onClick={() => restoreMut.mutate(row.id)}>
              Restore
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => softDeleteMut.mutate(row.id)}>
              Soft delete
            </button>
          )}
        </>
      )}
    />
  );
}
