"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager } from "@/components/ResourceManager";
import { httpClient } from "@/core/api/http-client";
import type { Feature, Product, Project, Task } from "@/features/vsm/types";

export default function PlanningClient() {
  const qc = useQueryClient();
  const search = useSearchParams();
  const initialProduct = search.get("product_id") ?? "";
  const [productId, setProductId] = useState(initialProduct);
  const [projectId, setProjectId] = useState("");
  const [featureId, setFeatureId] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: ["vsm-products"],
    queryFn: () => httpClient.get<Product[]>("/api/v1/products"),
    staleTime: 30_000,
  });

  const projectsPath = productId
    ? `/api/v1/projects?product_id=${productId}`
    : "/api/v1/projects";

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["vsm-projects", productId],
    queryFn: () => httpClient.get<Project[]>(projectsPath),
    staleTime: 20_000,
  });

  const { data: features = [], isLoading: featuresLoading } = useQuery({
    queryKey: ["vsm-features", projectId],
    queryFn: () => httpClient.get<Feature[]>(`/api/v1/features?project_id=${projectId}`),
    enabled: Boolean(projectId),
    staleTime: 20_000,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["vsm-tasks", featureId],
    queryFn: () => httpClient.get<Task[]>(`/api/v1/tasks?feature_id=${featureId}`),
    enabled: Boolean(featureId),
    staleTime: 20_000,
  });

  const createProject = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/projects", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-projects"] }),
  });
  const archiveProject = useMutation({
    mutationFn: (id: string | number) => httpClient.delete(`/api/v1/projects/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-projects"] }),
  });
  const createFeature = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/features", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-features"] }),
  });
  const createTask = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/tasks", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-tasks"] }),
  });
  const completeTask = useMutation({
    mutationFn: (id: string) => httpClient.post(`/api/v1/tasks/${id}/complete`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-tasks"] }),
  });

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: `${p.name} (${p.status})` })),
    [products],
  );

  return (
    <div className="page-stack">
      <section className="data-panel">
        <h2 className="panel-title" style={{ marginBottom: "0.5rem" }}>
          Planning cascade
        </h2>
        <p className="text-dim" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
          Product → Project → Feature → Task. Pick a product, then drill down.
        </p>
        <div className="form-group" style={{ maxWidth: 420 }}>
          <label htmlFor="product">Product</label>
          <select
            id="product"
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setProjectId("");
              setFeatureId("");
            }}
          >
            <option value="">All products</option>
            {productOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <ResourceManager
        title="Projects"
        description="Mid-layer between Product and Feature."
        createLabel="New project"
        emptyTitle="No projects"
        emptyDescription={productId ? "Create a project under this product." : "Select a product (required to create)."}
        isLoading={projectsLoading}
        items={projects}
        hideEdit
        columns={[
          {
            key: "name",
            label: "Project",
            render: (r) => (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setProjectId(r.id);
                  setFeatureId("");
                }}
              >
                {r.name}
              </button>
            ),
          },
          { key: "status", label: "Status", render: (r) => <span className="status-pill">{r.status}</span> },
          {
            key: "product",
            label: "Product",
            render: (r) => products.find((p) => p.id === r.product_id)?.name ?? "—",
          },
        ]}
        fields={[
          {
            name: "product_id",
            label: "Product",
            type: "select",
            required: true,
            options: productOptions,
          },
          { name: "name", label: "Name", required: true },
          { name: "description", label: "Description", type: "textarea" },
        ]}
        onCreate={async (v) => {
          const pid = v.product_id || productId;
          if (!pid) throw new Error("Select a product");
          await createProject.mutateAsync({
            product_id: pid,
            name: v.name,
            description: v.description,
          });
          setProductId(pid);
        }}
        onDelete={async (id) => {
          await archiveProject.mutateAsync(id);
        }}
      />

      {projectId ? (
        <ResourceManager
          title="Features"
          description="Features for selected project"
          createLabel="New feature"
          emptyTitle="No features"
          emptyDescription="Break the project into features."
          isLoading={featuresLoading}
          items={features}
          hideEdit
          hideDelete
          columns={[
            {
              key: "title",
              label: "Feature",
              render: (r) => (
                <button type="button" className="btn btn-sm" onClick={() => setFeatureId(r.id)}>
                  {r.title}
                </button>
              ),
            },
            { key: "priority", label: "Priority" },
            { key: "status", label: "Status", render: (r) => <span className="status-pill">{r.status}</span> },
          ]}
          fields={[
            { name: "title", label: "Title", required: true },
            {
              name: "priority",
              label: "Priority",
              type: "select",
              options: [
                { value: "CRITICAL", label: "Critical" },
                { value: "HIGH", label: "High" },
                { value: "MEDIUM", label: "Medium" },
                { value: "LOW", label: "Low" },
              ],
            },
          ]}
          onCreate={async (v) => {
            await createFeature.mutateAsync({
              project_id: projectId,
              title: v.title,
              priority: v.priority || "MEDIUM",
            });
          }}
        />
      ) : null}

      {featureId ? (
        <ResourceManager
          title="Tasks"
          description="Tasks may be unassigned (assignee optional)."
          createLabel="New task"
          emptyTitle="No tasks"
          emptyDescription="Add execution tasks under this feature."
          isLoading={tasksLoading}
          items={tasks}
          hideEdit
          hideDelete
          columns={[
            { key: "title", label: "Task" },
            { key: "priority", label: "Priority" },
            { key: "status", label: "Status", render: (r) => <span className="status-pill">{r.status}</span> },
          ]}
          fields={[
            { name: "title", label: "Title", required: true },
            {
              name: "priority",
              label: "Priority",
              type: "select",
              options: [
                { value: "HIGH", label: "High" },
                { value: "MEDIUM", label: "Medium" },
                { value: "LOW", label: "Low" },
              ],
            },
          ]}
          onCreate={async (v) => {
            await createTask.mutateAsync({
              feature_id: featureId,
              title: v.title,
              priority: v.priority || "MEDIUM",
            });
          }}
          extraActions={(row) =>
            row.status !== "COMPLETED" ? (
              <button type="button" className="btn btn-sm" onClick={() => completeTask.mutate(row.id)}>
                Complete
              </button>
            ) : null
          }
        />
      ) : null}
    </div>
  );
}
