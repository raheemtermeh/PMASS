"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager, optInt } from "@/components/ResourceManager";
import { httpClient } from "@/core/api/http-client";
import type {
  ChecklistItem,
  Employee,
  Feature,
  Product,
  Project,
  Task,
  Team,
} from "@/features/vsm/types";
import { employeeLabel } from "@/features/vsm/types";

// MVP Feature Planning additions layered on top of the original lifecycle —
// existing statuses keep working exactly as before.
const NEW_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "PLANNING", label: "Planning" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "REVIEW", label: "Review" },
  { value: "TODO", label: "To do" },
  { value: "DONE", label: "Done" },
];

const PROJECT_STATUSES = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "ACTIVE", label: "Active" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ARCHIVED", label: "Archived" },
  ...NEW_STATUSES,
];

const FEATURE_STATUSES = [
  { value: "BACKLOG", label: "Backlog / Draft" },
  { value: "ACTIVE", label: "Planned / Active" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Review / Blocked" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
  ...NEW_STATUSES,
];

const TASK_STATUSES = [
  { value: "BACKLOG", label: "Todo" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETED", label: "Done" },
  { value: "ARCHIVED", label: "Archived" },
  ...NEW_STATUSES,
];

const PRIORITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
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
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [depsError, setDepsError] = useState("");
  const [checklistTitle, setChecklistTitle] = useState("");
  const [checklistError, setChecklistError] = useState("");

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

  const { data: teams = [] } = useQuery({
    queryKey: ["vsm-teams"],
    queryFn: () => httpClient.get<Team[]>("/api/v1/teams"),
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

  const { data: featureDeps = [] } = useQuery({
    queryKey: ["vsm-feature-deps", featureId],
    queryFn: () => httpClient.get<string[]>(`/api/v1/features/${featureId}/dependencies`),
    enabled: Boolean(featureId),
    staleTime: 20_000,
  });

  const { data: checklist = [] } = useQuery({
    queryKey: ["vsm-checklist", selectedTaskId],
    queryFn: () => httpClient.get<ChecklistItem[]>(`/api/v1/tasks/${selectedTaskId}/checklist`),
    enabled: Boolean(selectedTaskId),
    staleTime: 10_000,
  });

  const createProject = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/projects", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-projects"] }),
  });
  const updateProject = useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, unknown> }) =>
      httpClient.patch(`/api/v1/projects/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-projects"] }),
  });
  const archiveProject = useMutation({
    mutationFn: (id: string | number) => httpClient.delete(`/api/v1/projects/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-projects"] }),
  });
  const softDeleteProject = useMutation({
    mutationFn: (id: string) => httpClient.post(`/api/v1/projects/${id}/soft-delete`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-projects"] }),
  });
  const restoreProject = useMutation({
    mutationFn: (id: string) => httpClient.post(`/api/v1/projects/${id}/restore`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-projects"] }),
  });

  const createFeature = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/features", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-features"] }),
  });
  const updateFeature = useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, unknown> }) =>
      httpClient.patch(`/api/v1/features/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-features"] }),
  });
  const changeFeatureStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      httpClient.put(`/api/v1/features/${id}/status`, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-features"] }),
  });
  const archiveFeature = useMutation({
    mutationFn: (id: string | number) => httpClient.delete(`/api/v1/features/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-features"] }),
  });
  const restoreFeature = useMutation({
    mutationFn: (id: string) => httpClient.post(`/api/v1/features/${id}/restore`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-features"] }),
  });
  const setFeatureDeps = useMutation({
    mutationFn: ({ id, dependsOn }: { id: string; dependsOn: string[] }) =>
      httpClient.put(`/api/v1/features/${id}/dependencies`, { depends_on: dependsOn }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-feature-deps", featureId] }),
    onError: (e: Error) => setDepsError(e.message),
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
  const pauseTask = useMutation({
    mutationFn: (id: string) => httpClient.post(`/api/v1/tasks/${id}/pause`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-tasks"] }),
  });
  const resumeTask = useMutation({
    mutationFn: (id: string) => httpClient.post(`/api/v1/tasks/${id}/resume`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-tasks"] }),
  });
  const reopenTask = useMutation({
    mutationFn: (id: string) => httpClient.post(`/api/v1/tasks/${id}/reopen`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-tasks"] }),
  });
  const archiveTask = useMutation({
    mutationFn: (id: string | number) => httpClient.delete(`/api/v1/tasks/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-tasks"] }),
  });

  const addChecklistItem = useMutation({
    mutationFn: (title: string) =>
      httpClient.post(`/api/v1/tasks/${selectedTaskId}/checklist`, { title }),
    onSuccess: () => {
      setChecklistTitle("");
      void qc.invalidateQueries({ queryKey: ["vsm-checklist", selectedTaskId] });
    },
    onError: (e: Error) => setChecklistError(e.message),
  });
  const toggleChecklistItem = useMutation({
    mutationFn: ({ id, isDone }: { id: string; isDone: boolean }) =>
      httpClient.patch(`/api/v1/tasks/${selectedTaskId}/checklist/${id}`, { is_done: isDone }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-checklist", selectedTaskId] }),
  });
  const deleteChecklistItem = useMutation({
    mutationFn: (id: string) => httpClient.delete(`/api/v1/tasks/${selectedTaskId}/checklist/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-checklist", selectedTaskId] }),
  });

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: `${p.name} (${p.status})` })),
    [products],
  );
  const empOptions = useMemo(
    () => employees.map((e) => ({ value: e.id, label: employeeLabel(e) })),
    [employees],
  );
  const teamOptions = useMemo(() => teams.map((t) => ({ value: t.id, label: t.name })), [teams]);

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (taskFilter === "open") {
      list = list.filter((t) => !["COMPLETED", "ARCHIVED", "CANCELLED", "DONE"].includes(t.status));
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

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  function onAddChecklistItem(e: FormEvent) {
    e.preventDefault();
    setChecklistError("");
    if (!checklistTitle.trim()) return;
    addChecklistItem.mutate(checklistTitle.trim());
  }

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
              setSelectedTaskId("");
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
                  setSelectedTaskId("");
                }}
              >
                {r.name}
                {r.code ? <span className="text-dim"> · {r.code}</span> : null}
              </button>
            ),
          },
          {
            key: "status",
            label: "Status",
            render: (r) => <span className="status-pill">{r.status}</span>,
          },
          { key: "priority", label: "Priority", render: (r) => r.priority || "—" },
          {
            key: "owner",
            label: "Owner",
            render: (r) => (r.owner_id ? assigneeName(r.owner_id) : "—"),
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
          { name: "code", label: "Code" },
          {
            name: "priority",
            label: "Priority",
            type: "select",
            options: PRIORITY_OPTIONS,
          },
          {
            name: "status",
            label: "Status",
            type: "select",
            options: PROJECT_STATUSES,
          },
          { name: "owner_id", label: "Owner", type: "select", options: empOptions },
          { name: "manager_id", label: "Manager", type: "select", options: empOptions },
          { name: "start_date", label: "Start date", type: "date" },
          { name: "target_end_date", label: "Target end date", type: "date" },
          { name: "goal", label: "Goal", type: "textarea" },
          { name: "description", label: "Description", type: "textarea" },
        ]}
        toFormValues={(r) => ({
          product_id: r.product_id,
          name: r.name,
          code: r.code ?? "",
          priority: r.priority ?? "",
          status: r.status,
          owner_id: r.owner_id ?? "",
          manager_id: r.manager_id ?? "",
          start_date: toDateInput(r.start_date),
          target_end_date: toDateInput(r.target_end_date),
          goal: r.goal ?? "",
          description: r.description,
        })}
        onCreate={async (v) => {
          const pid = v.product_id || productId;
          if (!pid) throw new Error("Select a product");
          await createProject.mutateAsync({
            product_id: pid,
            name: v.name,
            code: v.code,
            description: v.description,
          });
          setProductId(pid);
        }}
        onUpdate={async (id, v) => {
          await updateProject.mutateAsync({
            id,
            body: {
              name: v.name,
              code: v.code,
              priority: v.priority,
              status: v.status,
              owner_id: v.owner_id || null,
              manager_id: v.manager_id || null,
              start_date: fromDateInput(v.start_date),
              target_end_date: fromDateInput(v.target_end_date),
              goal: v.goal,
              description: v.description,
            },
          });
        }}
        onDelete={async (id) => {
          await archiveProject.mutateAsync(id);
        }}
        extraActions={(row) => (
          <>
            {row.deleted_at ? (
              <button type="button" className="btn btn-sm" onClick={() => restoreProject.mutate(row.id)}>
                Restore
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => softDeleteProject.mutate(row.id)}
              >
                Soft delete
              </button>
            )}
          </>
        )}
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
          columns={[
            {
              key: "title",
              label: "Feature",
              render: (r) => (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setFeatureId(r.id);
                    setSelectedTaskId("");
                  }}
                >
                  {r.title}
                  {r.code ? <span className="text-dim"> · {r.code}</span> : null}
                </button>
              ),
            },
            { key: "priority", label: "Priority" },
            {
              key: "owner",
              label: "Owner",
              render: (r) => (r.owner_id ? assigneeName(r.owner_id) : "—"),
            },
            {
              key: "team",
              label: "Team",
              render: (r) => teams.find((t) => t.id === r.team_id)?.name ?? "—",
            },
            {
              key: "status",
              label: "Status",
              render: (r) => <span className="status-pill">{r.status}</span>,
            },
          ]}
          fields={[
            { name: "title", label: "Title", required: true },
            { name: "code", label: "Code" },
            {
              name: "priority",
              label: "Priority",
              type: "select",
              options: PRIORITY_OPTIONS,
            },
            {
              name: "feature_type",
              label: "Feature type",
              options: [
                { value: "STORY", label: "Story" },
                { value: "BUG", label: "Bug" },
                { value: "IMPROVEMENT", label: "Improvement" },
                { value: "SPIKE", label: "Spike" },
              ],
              type: "select",
            },
            { name: "owner_id", label: "Owner", type: "select", options: empOptions },
            { name: "team_id", label: "Team", type: "select", options: teamOptions },
            {
              name: "parent_feature_id",
              label: "Parent feature",
              type: "select",
              options: features.map((f) => ({ value: f.id, label: f.title })),
            },
            { name: "start_date", label: "Start date", type: "date" },
            { name: "target_end_date", label: "Target end date", type: "date" },
            { name: "estimated_effort", label: "Estimated effort (points)", type: "number" },
            { name: "goal", label: "Goal", type: "textarea" },
            { name: "description", label: "Description", type: "textarea" },
          ]}
          toFormValues={(r) => ({
            title: r.title,
            code: r.code ?? "",
            priority: r.priority,
            feature_type: r.feature_type ?? "",
            owner_id: r.owner_id ?? "",
            team_id: r.team_id ?? "",
            parent_feature_id: r.parent_feature_id ?? "",
            start_date: toDateInput(r.start_date),
            target_end_date: toDateInput(r.target_end_date),
            estimated_effort: r.estimated_effort != null ? String(r.estimated_effort) : "",
            goal: r.goal ?? "",
            description: r.description ?? "",
          })}
          onCreate={async (v) => {
            await createFeature.mutateAsync({
              project_id: projectId,
              title: v.title,
              priority: v.priority || "MEDIUM",
            });
          }}
          onUpdate={async (id, v) => {
            await updateFeature.mutateAsync({
              id,
              body: {
                title: v.title,
                code: v.code,
                priority: v.priority,
                feature_type: v.feature_type,
                owner_id: v.owner_id || null,
                team_id: v.team_id || null,
                parent_feature_id: v.parent_feature_id || null,
                start_date: fromDateInput(v.start_date),
                target_end_date: fromDateInput(v.target_end_date),
                estimated_effort: optInt(v.estimated_effort),
                goal: v.goal,
                description: v.description,
              },
            });
          }}
          onDelete={async (id) => {
            await archiveFeature.mutateAsync(id);
          }}
          extraActions={(row) => (
            <>
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
              {row.status === "ARCHIVED" || row.deleted_at ? (
                <button type="button" className="btn btn-sm" onClick={() => restoreFeature.mutate(row.id)}>
                  Restore
                </button>
              ) : null}
            </>
          )}
        />
      ) : null}

      {featureId ? (
        <section className="data-panel">
          <h3 className="panel-title" style={{ marginBottom: "0.5rem" }}>
            Feature dependencies
          </h3>
          <p className="text-dim" style={{ fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            This feature is blocked until the selected features complete.
          </p>
          {depsError ? <p className="auth-error">{depsError}</p> : null}
          <div className="flex" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
            {features
              .filter((f) => f.id !== featureId)
              .map((f) => {
                const active = featureDeps.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`btn btn-sm${active ? " btn-primary" : ""}`}
                    disabled={setFeatureDeps.isPending}
                    onClick={() => {
                      setDepsError("");
                      const next = active
                        ? featureDeps.filter((id) => id !== f.id)
                        : [...featureDeps, f.id];
                      setFeatureDeps.mutate({ id: featureId, dependsOn: next });
                    }}
                  >
                    {f.title}
                  </button>
                );
              })}
            {features.filter((f) => f.id !== featureId).length === 0 ? (
              <p className="text-dim">No other features in this project yet.</p>
            ) : null}
          </div>
        </section>
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
              {
                key: "title",
                label: "Task",
                render: (r) => (
                  <button type="button" className="btn btn-sm" onClick={() => setSelectedTaskId(r.id)}>
                    {r.title}
                  </button>
                ),
              },
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
                options: PRIORITY_OPTIONS,
              },
              {
                name: "task_type",
                label: "Task type",
                type: "select",
                options: [
                  { value: "GENERAL", label: "General" },
                  { value: "BUG", label: "Bug" },
                  { value: "REVIEW", label: "Review" },
                  { value: "DOCS", label: "Docs" },
                ],
              },
              {
                name: "assignee_id",
                label: "Assignee",
                type: "select",
                options: empOptions,
              },
              { name: "start_date", label: "Start date", type: "date" },
              { name: "due_date", label: "Due date", type: "date" },
              { name: "estimated_minutes", label: "Estimated minutes", type: "number" },
              { name: "actual_minutes", label: "Actual minutes", type: "number" },
              {
                name: "status",
                label: "Status",
                type: "select",
                options: TASK_STATUSES,
              },
              { name: "description", label: "Description", type: "textarea" },
            ]}
            toFormValues={(r) => ({
              title: r.title,
              priority: r.priority,
              task_type: r.task_type ?? "",
              assignee_id: r.assignee_id ?? "",
              start_date: toDateInput(r.start_date),
              due_date: toDateInput(r.due_date),
              estimated_minutes: r.estimated_minutes != null ? String(r.estimated_minutes) : "",
              actual_minutes: r.actual_minutes != null ? String(r.actual_minutes) : "",
              status: r.status,
              description: r.description ?? "",
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
                  task_type: v.task_type,
                  status: v.status || "BACKLOG",
                  start_date: fromDateInput(v.start_date),
                  due_date: fromDateInput(v.due_date),
                  estimated_minutes: optInt(v.estimated_minutes),
                  actual_minutes: optInt(v.actual_minutes),
                  description: v.description,
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
                {row.status !== "COMPLETED" && row.status !== "ARCHIVED" && row.status !== "DONE" ? (
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
                {row.status === "ON_HOLD" ? (
                  <button type="button" className="btn btn-sm" onClick={() => resumeTask.mutate(row.id)}>
                    Resume
                  </button>
                ) : row.status !== "COMPLETED" && row.status !== "CANCELLED" && row.status !== "ARCHIVED" ? (
                  <button type="button" className="btn btn-sm" onClick={() => pauseTask.mutate(row.id)}>
                    Pause
                  </button>
                ) : null}
                {row.status === "COMPLETED" || row.status === "CANCELLED" ? (
                  <button type="button" className="btn btn-sm" onClick={() => reopenTask.mutate(row.id)}>
                    Reopen
                  </button>
                ) : null}
              </>
            )}
          />

          {selectedTask ? (
            <section className="data-panel">
              <div className="panel-header">
                <h3 className="panel-title">Checklist — {selectedTask.title}</h3>
                <button type="button" className="btn btn-sm" onClick={() => setSelectedTaskId("")}>
                  Close
                </button>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem" }}>
                {checklist.map((item) => (
                  <li
                    key={item.id}
                    className="flex"
                    style={{
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.4rem 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <label className="flex" style={{ alignItems: "center", gap: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={item.is_done}
                        onChange={(e) =>
                          toggleChecklistItem.mutate({ id: item.id, isDone: e.target.checked })
                        }
                      />
                      <span style={{ textDecoration: item.is_done ? "line-through" : undefined }}>
                        {item.title}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => deleteChecklistItem.mutate(item.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {checklist.length === 0 ? <li className="text-dim">No checklist items yet.</li> : null}
              </ul>
              <form className="auth-form" onSubmit={onAddChecklistItem}>
                <div className="form-group">
                  <label htmlFor="checklist-item">New checklist item</label>
                  <input
                    id="checklist-item"
                    value={checklistTitle}
                    onChange={(e) => setChecklistTitle(e.target.value)}
                    placeholder="e.g. Write tests"
                  />
                </div>
                {checklistError ? <p className="auth-error">{checklistError}</p> : null}
                <button type="submit" className="btn btn-sm btn-primary" disabled={addChecklistItem.isPending}>
                  Add item
                </button>
              </form>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
