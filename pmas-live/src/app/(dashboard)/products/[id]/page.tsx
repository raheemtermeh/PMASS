"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager } from "@/components/ResourceManager";
import { httpClient } from "@/core/api/http-client";
import type {
  Department,
  Employee,
  Feature,
  Pipeline,
  Product,
  Project,
  Stage,
  StageInstance,
  Task,
} from "@/features/vsm/types";
import { employeeLabel } from "@/features/vsm/types";

type DetailTab = "pipeline" | "execution" | "projects";

export default function ProductDetailPage() {
  const params = useParams();
  const productId = String(params.id ?? "");
  const qc = useQueryClient();
  const [tab, setTab] = useState<DetailTab>("pipeline");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedFeature, setSelectedFeature] = useState<string>("");
  const [rejectReason, setRejectReason] = useState("");
  const [exitOk, setExitOk] = useState(true);
  const [actionError, setActionError] = useState("");
  const [pipelineForm, setPipelineForm] = useState({
    name: "",
    description: "",
    stages: "Discovery\nBuild\nLaunch",
  });

  const { data: product, isLoading } = useQuery({
    queryKey: ["vsm-product", productId],
    queryFn: () => httpClient.get<Product>(`/api/v1/products/${productId}`),
    enabled: Boolean(productId),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["vsm-employees"],
    queryFn: () => httpClient.get<Employee[]>("/api/v1/employees"),
    staleTime: 60_000,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["vsm-departments"],
    queryFn: () => httpClient.get<Department[]>("/api/v1/departments"),
    staleTime: 60_000,
  });

  const pipelineId = product?.pipeline_id ?? "";

  const { data: pipelineBundle } = useQuery({
    queryKey: ["vsm-pipeline", pipelineId],
    queryFn: () =>
      httpClient.get<{ pipeline: Pipeline; stages: Stage[] }>(`/api/v1/pipelines/${pipelineId}`),
    enabled: Boolean(pipelineId),
  });

  const { data: instances = [], refetch: refetchInstances } = useQuery({
    queryKey: ["vsm-stage-instances", productId],
    queryFn: () => httpClient.get<StageInstance[]>(`/api/v1/products/${productId}/stage-instances`),
    enabled: Boolean(productId),
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["vsm-projects", productId],
    queryFn: () =>
      httpClient.get<Project[]>(`/api/v1/projects?product_id=${encodeURIComponent(productId)}`),
    enabled: Boolean(productId) && tab === "projects",
  });

  const { data: features = [] } = useQuery({
    queryKey: ["vsm-features", selectedProject],
    queryFn: () =>
      httpClient.get<Feature[]>(
        `/api/v1/features?project_id=${encodeURIComponent(selectedProject)}`,
      ),
    enabled: Boolean(selectedProject),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["vsm-tasks", selectedFeature],
    queryFn: () =>
      httpClient.get<Task[]>(`/api/v1/tasks?feature_id=${encodeURIComponent(selectedFeature)}`),
    enabled: Boolean(selectedFeature),
  });

  const createPipeline = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/pipelines", body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["vsm-product", productId] });
      await qc.invalidateQueries({ queryKey: ["vsm-pipeline"] });
    },
  });

  const startExec = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/start`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["vsm-product", productId] });
      await refetchInstances();
    },
  });

  const moveNext = useMutation({
    mutationFn: (exit_criteria_met: boolean) =>
      httpClient.post(`/api/v1/products/${productId}/move-next`, { exit_criteria_met }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["vsm-product", productId] });
      await refetchInstances();
    },
  });

  const completeStage = useMutation({
    mutationFn: (exit_criteria_met: boolean) =>
      httpClient.post(`/api/v1/products/${productId}/complete-stage`, { exit_criteria_met }),
    onSuccess: () => void refetchInstances(),
  });

  const rejectStage = useMutation({
    mutationFn: (reason: string) =>
      httpClient.post(`/api/v1/products/${productId}/reject-stage`, { reason }),
    onSuccess: () => void refetchInstances(),
  });

  const createProject = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/projects", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-projects", productId] }),
  });

  const createFeature = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/features", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-features", selectedProject] }),
  });

  const createTask = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/tasks", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-tasks", selectedFeature] }),
  });

  const completeTask = useMutation({
    mutationFn: (id: string) => httpClient.post(`/api/v1/tasks/${id}/complete`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-tasks", selectedFeature] }),
  });

  const stages = pipelineBundle?.stages ?? [];
  const stageName = (id: string) => stages.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  const active = instances.find((i) => i.status === "ACTIVE");
  const owner = employees.find((e) => e.id === product?.owner_id);

  const deptOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  async function runAction(fn: () => Promise<unknown>) {
    setActionError("");
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function submitPipeline(e: FormEvent) {
    e.preventDefault();
    const stageNames = pipelineForm.stages
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    await runAction(() =>
      createPipeline.mutateAsync({
        product_id: productId,
        name: pipelineForm.name || `${product?.name ?? "Product"} Pipeline`,
        description: pipelineForm.description,
        stages: stageNames.map((name, order) => ({
          name,
          order,
          description: "",
          entry_criteria: "",
          exit_criteria: "manual_confirm",
          department_id: deptOptions[0]?.value || null,
        })),
      }),
    );
  }

  if (isLoading) {
    return <p className="text-dim">Loading product…</p>;
  }
  if (!product) {
    return (
      <div className="page-stack">
        <p className="auth-error">Product not found</p>
        <Link href="/products" className="btn">
          Back to products
        </Link>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="pm-hero">
        <div>
          <p className="wizard-kicker">
            <Link href="/products">Products</Link> / {product.status}
          </p>
          <h2 className="pm-hero-title">{product.name}</h2>
          <p className="text-dim" style={{ maxWidth: "44rem", marginTop: "0.5rem" }}>
            {product.description || "No description"} · Owner:{" "}
            {owner ? employeeLabel(owner) : "—"} · Model:{" "}
            <span className="font-mono">{product.execution_model}</span>
          </p>
        </div>
        <div className="pm-hero-actions">
          <span className="status-pill">{product.status}</span>
        </div>
      </section>

      <div className="flex" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
        {(
          [
            ["pipeline", "Pipeline"],
            ["execution", "Execution"],
            ["projects", "Projects → Features → Tasks"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`btn btn-sm${tab === id ? " btn-primary" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {actionError ? <p className="auth-error">{actionError}</p> : null}

      {tab === "pipeline" ? (
        <section className="data-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Dedicated pipeline</h2>
              <p className="text-dim" style={{ fontSize: "0.875rem" }}>
                Each Product has exactly one Pipeline. Stages are immutable definitions; runtime
                lives in Stage Instances.
              </p>
            </div>
          </div>

          {!pipelineId ? (
            <form onSubmit={submitPipeline} className="auth-form" style={{ maxWidth: "36rem" }}>
              <div className="form-group">
                <label htmlFor="pl-name">Pipeline name</label>
                <input
                  id="pl-name"
                  value={pipelineForm.name}
                  onChange={(e) => setPipelineForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={`${product.name} delivery`}
                />
              </div>
              <div className="form-group">
                <label htmlFor="pl-desc">Description</label>
                <textarea
                  id="pl-desc"
                  rows={2}
                  value={pipelineForm.description}
                  onChange={(e) => setPipelineForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="pl-stages">Stages (one per line, in order)</label>
                <textarea
                  id="pl-stages"
                  rows={5}
                  required
                  value={pipelineForm.stages}
                  onChange={(e) => setPipelineForm((f) => ({ ...f, stages: e.target.value }))}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={createPipeline.isPending}>
                {createPipeline.isPending ? "Creating…" : "Assign pipeline"}
              </button>
            </form>
          ) : (
            <div className="table-scroll">
              <p className="text-dim" style={{ marginBottom: "0.75rem" }}>
                {pipelineBundle?.pipeline.name} — {stages.length} stages
              </p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Stage</th>
                    <th>Exit criteria</th>
                    <th>Department</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((s) => (
                    <tr key={s.id}>
                      <td className="font-mono">{s.order}</td>
                      <td>{s.name}</td>
                      <td>{s.exit_criteria || "—"}</td>
                      <td>
                        {departments.find((d) => d.id === s.department_id)?.name ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "execution" ? (
        <section className="data-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Stage execution</h2>
              <p className="text-dim" style={{ fontSize: "0.875rem" }}>
                Only one Active Stage Instance at a time. Moving stages transfers department
                responsibility atomically.
              </p>
            </div>
          </div>

          {!pipelineId ? (
            <p className="text-dim">Assign a pipeline before starting execution.</p>
          ) : (
            <div className="page-stack" style={{ gap: "1rem" }}>
              <div className="flex" style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                {product.status !== "ACTIVE" && product.status !== "COMPLETED" ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={startExec.isPending}
                    onClick={() => void runAction(() => startExec.mutateAsync())}
                  >
                    Start execution
                  </button>
                ) : null}

                {active ? (
                  <>
                    <label className="flex" style={{ gap: "0.35rem", alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={exitOk}
                        onChange={(e) => setExitOk(e.target.checked)}
                      />
                      Exit criteria met
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={moveNext.isPending}
                      onClick={() => void runAction(() => moveNext.mutateAsync(exitOk))}
                    >
                      Move to next stage
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={completeStage.isPending}
                      onClick={() => void runAction(() => completeStage.mutateAsync(exitOk))}
                    >
                      Complete current
                    </button>
                    <input
                      placeholder="Reject reason (required)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      style={{ minWidth: "14rem" }}
                    />
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={rejectStage.isPending}
                      onClick={() =>
                        void runAction(() => rejectStage.mutateAsync(rejectReason.trim()))
                      }
                    >
                      Reject stage
                    </button>
                  </>
                ) : null}
              </div>

              {active ? (
                <p>
                  Active stage: <strong>{stageName(active.stage_id)}</strong>{" "}
                  <span className="status-pill status-warning">ACTIVE</span>
                </p>
              ) : (
                <p className="text-dim">No active stage instance.</p>
              )}

              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Status</th>
                      <th>Started</th>
                      <th>Finished</th>
                      <th>Reject reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instances.map((si) => (
                      <tr key={si.id}>
                        <td>{stageName(si.stage_id)}</td>
                        <td>
                          <span className="status-pill">{si.status}</span>
                        </td>
                        <td className="font-mono">
                          {si.started_at ? new Date(si.started_at).toLocaleString() : "—"}
                        </td>
                        <td className="font-mono">
                          {si.finished_at ? new Date(si.finished_at).toLocaleString() : "—"}
                        </td>
                        <td>{si.reject_reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {tab === "projects" ? (
        <div className="page-stack">
          <ResourceManager
            title="Projects"
            description="Planning layer between Product and Features."
            createLabel="New project"
            emptyTitle="No projects"
            emptyDescription="Break this product into projects, then features and tasks."
            isLoading={projectsLoading}
            items={projects}
            hideEdit
            hideDelete
            columns={[
              {
                key: "name",
                label: "Name",
                render: (r) => (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setSelectedProject(r.id);
                      setSelectedFeature("");
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
            ]}
            fields={[
              { name: "name", label: "Name", required: true },
              { name: "description", label: "Description", type: "textarea" },
            ]}
            onCreate={async (v) => {
              await createProject.mutateAsync({
                product_id: productId,
                name: v.name,
                description: v.description,
              });
            }}
          />

          {selectedProject ? (
            <ResourceManager
              title="Features"
              description={`Features for selected project`}
              createLabel="New feature"
              emptyTitle="No features"
              emptyDescription="Add features under this project."
              items={features}
              hideEdit
              hideDelete
              columns={[
                {
                  key: "title",
                  label: "Title",
                  render: (r) => (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setSelectedFeature(r.id)}
                    >
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
                  project_id: selectedProject,
                  title: v.title,
                  priority: v.priority || "MEDIUM",
                });
              }}
            />
          ) : null}

          {selectedFeature ? (
            <ResourceManager
              title="Tasks"
              description="Tasks may be unassigned. Complete when done."
              createLabel="New task"
              emptyTitle="No tasks"
              emptyDescription="Add tasks under this feature."
              items={tasks}
              hideEdit
              hideDelete
              columns={[
                { key: "title", label: "Title" },
                { key: "priority", label: "Priority" },
                {
                  key: "status",
                  label: "Status",
                  render: (r) => <span className="status-pill">{r.status}</span>,
                },
                {
                  key: "assignee",
                  label: "Assignee",
                  render: (r) => {
                    const e = employees.find((x) => x.id === r.assignee_id);
                    return e ? employeeLabel(e) : "Unassigned";
                  },
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
                {
                  name: "assignee_id",
                  label: "Assignee (optional)",
                  type: "select",
                  options: employees.map((e) => ({
                    value: e.id,
                    label: employeeLabel(e),
                  })),
                },
              ]}
              onCreate={async (v) => {
                await createTask.mutateAsync({
                  feature_id: selectedFeature,
                  title: v.title,
                  priority: v.priority || "MEDIUM",
                  assignee_id: v.assignee_id || null,
                });
              }}
              extraActions={(r) =>
                r.status !== "COMPLETED" ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => void completeTask.mutateAsync(r.id)}
                  >
                    Complete
                  </button>
                ) : null
              }
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
