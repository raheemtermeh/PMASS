"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, type FieldDef } from "@/components/ResourceManager";
import { httpClient } from "@/core/api/http-client";
import {
  HealthCell,
  ProductPulseStrip,
  ProgressCell,
  StageCell,
  type PulseMetric,
} from "@/features/products/ProductCells";
import {
  PRODUCT_SORT_OPTIONS,
  formatProductDate,
  listHealth,
  relativeTime,
  sortProducts,
  type ProductSortValue,
} from "@/features/products/product-utils";
import type { Employee, Product, ProductSummary } from "@/features/vsm/types";
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

const STATUS_OPTIONS = [
  "DRAFT",
  "READY",
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "ARCHIVED",
];

export default function ProductsPage() {
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [sort, setSort] = useState<ProductSortValue>("updated_desc");
  const [showArchived, setShowArchived] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["vsm-products"],
    queryFn: () => httpClient.get<Product[]>("/api/v1/products?page_size=100"),
    staleTime: 30_000,
  });

  const { data: summaries = [] } = useQuery({
    queryKey: ["vsm-product-summaries"],
    queryFn: () => httpClient.get<ProductSummary[]>("/api/v1/products/summary"),
    staleTime: 30_000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["vsm-employees"],
    queryFn: () => httpClient.get<Employee[]>("/api/v1/employees"),
    staleTime: 60_000,
  });

  const summaryById = useMemo(() => {
    const map = new Map<string, ProductSummary>();
    for (const s of summaries) map.set(s.product_id, s);
    return map;
  }, [summaries]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["vsm-products"] });
    void qc.invalidateQueries({ queryKey: ["vsm-product-summaries"] });
  };

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post<Product>("/api/v1/products", body),
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, unknown> }) =>
      httpClient.patch(`/api/v1/products/${id}`, body),
    onSuccess: invalidate,
  });
  const archiveMut = useMutation({
    mutationFn: (id: string | number) => httpClient.delete(`/api/v1/products/${id}`),
    onSuccess: invalidate,
  });
  const holdMut = useMutation({
    mutationFn: (id: string | number) => httpClient.post(`/api/v1/products/${id}/hold`),
    onSuccess: invalidate,
  });
  const resumeMut = useMutation({
    mutationFn: (id: string | number) => httpClient.post(`/api/v1/products/${id}/resume`),
    onSuccess: invalidate,
  });
  const restoreMut = useMutation({
    mutationFn: (id: string | number) => httpClient.post(`/api/v1/products/${id}/restore`),
    onSuccess: invalidate,
  });

  const employeeName = (id?: string | null) => {
    if (!id) return "—";
    const e = employees.find((x) => x.id === id);
    return e ? employeeLabel(e) : id.slice(0, 8);
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.category?.trim()) set.add(p.category.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [products]);

  const visibleProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = products.filter((p) => {
      if (!showArchived && p.status === "ARCHIVED") return false;
      if (statusFilter && p.status !== statusFilter) return false;
      if (ownerFilter && p.owner_id !== ownerFilter) return false;
      if (managerFilter && (p.manager_id ?? "") !== managerFilter) return false;
      if (categoryFilter && (p.category ?? "").trim() !== categoryFilter) return false;
      if (priorityFilter && (p.priority ?? "") !== priorityFilter) return false;
      if (needle) {
        const haystack = [p.name, p.code, p.category, p.product_type, p.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    return sortProducts(filtered, sort);
  }, [
    products,
    search,
    statusFilter,
    ownerFilter,
    managerFilter,
    categoryFilter,
    priorityFilter,
    sort,
    showArchived,
  ]);

  const pulseMetrics: PulseMetric[] = useMemo(() => {
    const scope = visibleProducts;
    const active = scope.filter((p) => p.status === "ACTIVE").length;
    const atRisk = scope.filter((p) => listHealth(p, summaryById.get(p.id)).level === "critical").length;
    const avgProgress = scope.length
      ? Math.round(
          scope.reduce((sum, p) => sum + (summaryById.get(p.id)?.progress ?? 0), 0) / scope.length,
        )
      : 0;
    return [
      { label: "In view", value: scope.length, tone: "neutral" },
      { label: "Active", value: active, tone: "good" },
      { label: "At risk", value: atRisk, tone: atRisk > 0 ? "bad" : "neutral" },
      { label: "Avg progress", value: avgProgress, suffix: "%", tone: "warn" },
    ];
  }, [visibleProducts, summaryById]);

  const filtersActive =
    Boolean(search.trim()) ||
    Boolean(statusFilter || ownerFilter || managerFilter || categoryFilter || priorityFilter);

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setOwnerFilter("");
    setManagerFilter("");
    setCategoryFilter("");
    setPriorityFilter("");
  }

  const employeeOptions = employees.map((e) => ({ value: e.id, label: employeeLabel(e) }));

  // Execution model is only offered at creation — Rule 3 locks it afterwards.
  const editFields: FieldDef[] = [
    { name: "name", label: "Name", required: true },
    { name: "code", label: "Code (unique per company)" },
    { name: "owner_id", label: "Owner (employee)", type: "select", required: true, options: employeeOptions },
    { name: "manager_id", label: "Manager (employee)", type: "select", required: true, options: employeeOptions },
    { name: "category", label: "Category" },
    { name: "product_type", label: "Product type" },
    { name: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
    { name: "visibility", label: "Visibility", type: "select", options: VISIBILITY_OPTIONS },
    { name: "description", label: "Description", type: "textarea" },
    { name: "vision", label: "Vision", type: "textarea" },
    { name: "goal", label: "Goal", type: "textarea" },
    { name: "success_metrics", label: "Success metrics", type: "textarea" },
    { name: "business_value", label: "Business value", type: "textarea" },
  ];

  const createFieldDefs: FieldDef[] = [
    ...editFields.slice(0, 4),
    {
      name: "execution_model",
      label: "Execution model (locked after create)",
      type: "select",
      required: true,
      options: [
        { value: "PROJECT_FEATURE_TASK", label: "Project → Feature → Task" },
        { value: "FEATURE_TASK", label: "Feature → Task" },
        { value: "DIRECT_TASK", label: "Direct Task" },
      ],
    },
    ...editFields.slice(4),
  ];

  const toolbar = (
    <div className="pl-toolbar">
      <label className="pl-search">
        <span className="pl-search-icon" aria-hidden />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, code, category…"
          aria-label="Search products"
        />
      </label>

      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} aria-label="Filter by owner">
        <option value="">All owners</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {employeeLabel(e)}
          </option>
        ))}
      </select>

      <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)} aria-label="Filter by manager">
        <option value="">All managers</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {employeeLabel(e)}
          </option>
        ))}
      </select>

      <select
        value={categoryFilter}
        onChange={(e) => setCategoryFilter(e.target.value)}
        aria-label="Filter by category"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        value={priorityFilter}
        onChange={(e) => setPriorityFilter(e.target.value)}
        aria-label="Filter by priority"
      >
        <option value="">All priorities</option>
        {PRIORITY_OPTIONS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as ProductSortValue)}
        aria-label="Sort products"
        className="pl-sort"
      >
        {PRODUCT_SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <label className="pl-archived-toggle">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Show archived
      </label>

      {filtersActive ? (
        <button type="button" className="btn btn-sm" onClick={resetFilters}>
          Clear
        </button>
      ) : null}

      <span className="pl-result-count text-dim">
        {visibleProducts.length} of {products.length}
      </span>
    </div>
  );

  return (
    <div className="page-stack products-page">
      {isLoading ? null : <ProductPulseStrip metrics={pulseMetrics} />}

      <ResourceManager
        title="Products"
        description="Product is the aggregate root. Lifecycle: Draft → Ready → Active → Completed → Archived. Execution model is locked after create; products are archived, never deleted."
        createLabel="New product"
        emptyTitle={filtersActive ? "No matches" : "No products yet"}
        emptyDescription={
          filtersActive
            ? "No product matches the current search and filters. Clear them to see the full list."
            : "Create a Product after you have at least one Employee to own it. Then open it to attach a Pipeline and start execution."
        }
        isLoading={isLoading}
        items={visibleProducts}
        toolbar={toolbar}
        pageSize={12}
        hideDelete
        columns={[
          {
            key: "name",
            label: "Product",
            render: (r) => (
              <div className="pl-name-cell">
                <Link href={`/products/${r.id}`} className="pl-name-link">
                  {r.name}
                </Link>
                <span className="text-dim font-mono pl-name-code">{r.code || "—"}</span>
              </div>
            ),
          },
          {
            key: "current_stage",
            label: "Current stage",
            render: (r) => (
              <StageCell
                stage={summaryById.get(r.id)?.current_stage}
                hasPipeline={Boolean(r.pipeline_id)}
              />
            ),
          },
          {
            key: "health",
            label: "Health",
            render: (r) => <HealthCell health={listHealth(r, summaryById.get(r.id))} />,
          },
          {
            key: "progress",
            label: "Progress",
            render: (r) => <ProgressCell percent={summaryById.get(r.id)?.progress ?? 0} />,
          },
          {
            key: "status",
            label: "Status",
            render: (r) => <span className="status-pill">{r.status}</span>,
          },
          { key: "priority", label: "Priority", render: (r) => r.priority || "—" },
          { key: "owner", label: "Owner", render: (r) => employeeName(r.owner_id) },
          { key: "manager", label: "Manager", render: (r) => employeeName(r.manager_id) },
          {
            key: "last_activity",
            label: "Last activity",
            render: (r) => (
              <span className="text-dim">{relativeTime(summaryById.get(r.id)?.last_activity_at)}</span>
            ),
          },
          {
            key: "created_at",
            label: "Created",
            render: (r) => <span className="font-mono">{formatProductDate(r.created_at)}</span>,
          },
          {
            key: "archived",
            label: "Archived",
            render: (r) =>
              r.status === "ARCHIVED" ? (
                <span className="status-pill">Archived</span>
              ) : (
                <span className="text-dim">—</span>
              ),
          },
        ]}
        fields={editFields}
        createFields={createFieldDefs}
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
            manager_id: v.manager_id,
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
        extraActions={(row) => (
          <>
            <Link href={`/products/${row.id}`} className="btn btn-sm">
              Open
            </Link>
            {row.status === "ON_HOLD" ? (
              <button type="button" className="btn btn-sm" onClick={() => resumeMut.mutate(row.id)}>
                Resume
              </button>
            ) : row.status !== "ARCHIVED" ? (
              <button type="button" className="btn btn-sm" onClick={() => holdMut.mutate(row.id)}>
                Hold
              </button>
            ) : null}
            {row.status === "ARCHIVED" ? (
              <button type="button" className="btn btn-sm" onClick={() => restoreMut.mutate(row.id)}>
                Restore
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => {
                  if (
                    window.confirm(
                      `Archive “${row.name}”?\nProjects, features and tasks are kept — the product is only moved out of the active list.`,
                    )
                  ) {
                    archiveMut.mutate(row.id);
                  }
                }}
              >
                Archive
              </button>
            )}
          </>
        )}
      />
    </div>
  );
}
