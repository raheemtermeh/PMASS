"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager } from "@/components/ResourceManager";
import { httpClient } from "@/core/api/http-client";
import type { Employee, Feature, Product, Project, Task } from "@/features/vsm/types";
import { employeeLabel } from "@/features/vsm/types";

const FEATURE_STATUSES = [
  { value: "BACKLOG", label: "Backlog / Draft" },
  { value: "ACTIVE", label: "Planned / Active" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Review / Blocked" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

const TASK_STATUSES = [
  { value: "BACKLOG", label: "Todo" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETED", label: "Done" },
  { value: "ARCHIVED", label: "Archived" },
];

function toDateInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function fromDateInput(value: string): string | null {
  if (!value.trim()) return null;
  return new Date(`${value}T12:00:00.000Z`).toISOString();
}

export default function PlanningClient() {
  const qc = useQueryClient();
  const search = useSearchParams();
  const initialProduct = search.get("product_id") ?? "";
  const [productId, setProductId] = useState(initialProduct);
  const [projectId, setProjectId] = useState("");
  const [featureId, setFeatureId] = useState("");
  const [taskFilter, setTaskFilter] = useState<"all" | "mine" | "open">("all");

  const { data: products = [] } = useQuery({
    queryKey: ["vsm-products"],
    queryFn: () => httpClient.get<Product[]>("/api/v1/products"),
    staleTime: 30_000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["vsm-employees"],
    queryFn: () => httpClient.get<Employee[]>("/api/v1/employees"),
    staleTime: 60_000,
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
  const changeFeatureStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      httpClient.put(`/api/v1/features/${id}/status`, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-features"] }),
  });
  const createTask = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/tasks", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-tasks"] }),
  });
  const updateTask = useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, unknown> }) =>
      httpClient.patch(`/api/v1/tasks/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-tasks"] }),
  });
  const assignTask = useMutation({
    mutationFn: ({ id, assignee_id }: { id: string; assignee_id: string | null }) =>
      httpClient.put(`/api/v1/tasks/${id}/assign`, { assignee_id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-tasks"] }),
  });
  const completeTask = useMutation({
    mutationFn: (id: string) => httpClient.post(`/api/v1/tasks/${id}/complete`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-tasks"] }),
  });
  const rejectTask = useMutation({
    mutationFn: (id: string) => httpClient.post(`/api/v1/tasks/${id}/reject`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-tasks"] }),
  });
  const archiveTask = useMutation({
    mutationFn: (id: string | number) => httpClient.delete(`/api/v1/tasks/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-tasks"] }),
  });

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: `${p.name} (${p.status})` })),
    [products],
  );
  const empOptions = useMemo(
    () => employees.map((e) => ({ value: e.id, label: employeeLabel(e) })),
    [employees],
  );

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (taskFilter === "open") {
      list = list.filter((t) => !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(t.status));
    }
    if (taskFilter === "mine") {
      // Prefer first active employee as workspace identity when login user ≠ employee.
      const me = employees.find((e) => e.status === "ACTIVE")?.id;
      list = me ? list.filter((t) => t.assignee_id === me) : [];
    }
    return list;
  }, [tasks, taskFilter, employees]);

  const assigneeName = (id?: string | null) => {
    const e = employees.find((x) => x.id === id);
    return e ? employeeLabel(e) : "Unassigned";
  };

  return (
    <div className="page-stack">
      <section className="data-panel">
        <h2 className="panel-title" style={{ marginBottom: "0.5rem" }}>
          Planning cascade
        </h2>
        <p className="text-dim" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
          Product → Project → Feature → Task. Assign owners, set due dates, and track status through
          the MVP execution chain.
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
        description="Mid-layer between Product and Feature. Search and filter by selecting a product above."
        createLabel="New project"
        emptyTitle="No projects"
        emptyDescription={
          productId ? "Create a project under this product." : "Select a product (required to create)."
        }
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
          {
            key: "status",
            label: "Status",
            render: (r) => <span className="status-pill">{r.status}</span>,
          },
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
          description="Capabilities under the selected project. Change status as work progresses."
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
            {
              key: "status",
              label: "Status",
              render: (r) => <span className="status-pill">{r.status}</span>,
            },
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
          extraActions={(row) => (
            <select
              className="btn btn-sm"
              aria-label={`Change status for ${row.title}`}
              value={row.status}
              onChange={(e) =>
                changeFeatureStatus.mutate({ id: row.id, status: e.target.value })
              }
              style={{ maxWidth: 140 }}
            >
              {FEATURE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        />
      ) : null}

      {featureId ? (
        <>
          <div className="org-tab-row" style={{ marginBottom: "-0.5rem" }}>
            {(
              [
                ["all", "All tasks"],
                ["open", "Open"],
                ["mine", "My tasks"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`btn btn-sm${taskFilter === id ? " btn-primary" : ""}`}
                onClick={() => setTaskFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <ResourceManager
            title="Tasks"
            description="Smallest execution unit. Assign people, set due dates, complete or reopen work."
            createLabel="New task"
            emptyTitle="No tasks"
            emptyDescription="Add execution tasks under this feature."
            isLoading={tasksLoading}
            items={filteredTasks}
            columns={[
              { key: "title", label: "Task" },
              { key: "priority", label: "Priority" },
              {
                key: "assignee",
                label: "Assignee",
                render: (r) => assigneeName(r.assignee_id),
              },
              {
                key: "due_date",
                label: "Due",
                render: (r) => (r.due_date ? toDateInput(r.due_date) : "—"),
              },
              {
                key: "status",
                label: "Status",
                render: (r) => <span className="status-pill">{r.status}</span>,
              },
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
              {
                name: "assignee_id",
                label: "Assignee",
                type: "select",
                options: empOptions,
              },
              { name: "due_date", label: "Due date", type: "date" },
              {
                name: "status",
                label: "Status",
                type: "select",
                options: TASK_STATUSES,
              },
            ]}
            toFormValues={(r) => ({
              title: r.title,
              priority: r.priority,
              assignee_id: r.assignee_id ?? "",
              due_date: toDateInput(r.due_date),
              status: r.status,
            })}
            onCreate={async (v) => {
              const assignee = v.assignee_id?.trim() ? v.assignee_id : null;
              await createTask.mutateAsync({
                feature_id: featureId,
                title: v.title,
                priority: v.priority || "MEDIUM",
                assignee_id: assignee,
                due_date: fromDateInput(v.due_date),
              });
            }}
            onUpdate={async (id, v) => {
              await updateTask.mutateAsync({
                id,
                body: {
                  title: v.title,
                  priority: v.priority || "MEDIUM",
                  status: v.status || "BACKLOG",
                  due_date: fromDateInput(v.due_date),
                },
              });
              const assignee = v.assignee_id?.trim() ? v.assignee_id : null;
              await assignTask.mutateAsync({ id: String(id), assignee_id: assignee });
            }}
            onDelete={async (id) => {
              await archiveTask.mutateAsync(id);
            }}
            extraActions={(row) => (
              <>
                {row.status !== "COMPLETED" && row.status !== "ARCHIVED" ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => completeTask.mutate(row.id)}
                  >
                    Complete
                  </button>
                ) : null}
                {row.status !== "BLOCKED" && row.status !== "ARCHIVED" ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => rejectTask.mutate(row.id)}
                  >
                    Block
                  </button>
                ) : null}
              </>
            )}
          />
        </>
      ) : null}
    </div>
  );
}
