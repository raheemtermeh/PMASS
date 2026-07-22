"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CollaborationPanel } from "@/components/CollaborationPanel";
import { EmptyState } from "@/components/EmptyState";
import { httpClient } from "@/core/api/http-client";
import type {
  Department,
  Employee,
  Pipeline,
  Product,
  ProductMember,
  Stage,
  StageInstance,
} from "@/features/vsm/types";
import { employeeLabel } from "@/features/vsm/types";

const PRIORITY_OPTIONS = ["", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
const VISIBILITY_OPTIONS = ["ORGANIZATION", "PRIVATE", "PUBLIC"];
const MEMBER_ROLES = ["CONTRIBUTOR", "VIEWER"];

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const qc = useQueryClient();
  const [rejectReason, setRejectReason] = useState("");
  const [movePrevReason, setMovePrevReason] = useState("");
  const [exitMet, setExitMet] = useState(true);
  const [pipeName, setPipeName] = useState("Default pipeline");
  const [stageDraft, setStageDraft] = useState("Discovery, Delivery, Launch");
  const [newStageName, setNewStageName] = useState("");
  const [error, setError] = useState("");

  // Editable detail fields
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");

  // Members
  const [memberEmployeeId, setMemberEmployeeId] = useState("");
  const [memberRole, setMemberRole] = useState("CONTRIBUTOR");
  const [memberError, setMemberError] = useState("");

  const { data: product, isLoading } = useQuery({
    queryKey: ["vsm-product", productId],
    queryFn: () => httpClient.get<Product>(`/api/v1/products/${productId}`),
    enabled: Boolean(productId),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["vsm-departments"],
    queryFn: () => httpClient.get<Department[]>("/api/v1/departments"),
    staleTime: 60_000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["vsm-employees"],
    queryFn: () => httpClient.get<Employee[]>("/api/v1/employees"),
    staleTime: 60_000,
  });

  const pipelineId = product?.pipeline_id ?? null;

  const { data: pipelineBundle } = useQuery({
    queryKey: ["vsm-pipeline", pipelineId],
    queryFn: () =>
      httpClient.get<{ pipeline: Pipeline; stages: Stage[] }>(`/api/v1/pipelines/${pipelineId}`),
    enabled: Boolean(pipelineId),
  });

  const { data: instances = [] } = useQuery({
    queryKey: ["vsm-stage-instances", productId],
    queryFn: () => httpClient.get<StageInstance[]>(`/api/v1/products/${productId}/stage-instances`),
    enabled: Boolean(productId),
  });

  const { data: members = [] } = useQuery({
    queryKey: ["vsm-product-members", productId],
    queryFn: () => httpClient.get<ProductMember[]>(`/api/v1/products/${productId}/members`),
    enabled: Boolean(productId),
  });

  useEffect(() => {
    if (!product) return;
    setForm({
      name: product.name,
      code: product.code ?? "",
      category: product.category ?? "",
      product_type: product.product_type ?? "",
      priority: product.priority ?? "",
      visibility: product.visibility ?? "",
      description: product.description ?? "",
      vision: product.vision ?? "",
      goal: product.goal ?? "",
      success_metrics: product.success_metrics ?? "",
      business_value: product.business_value ?? "",
    });
  }, [product]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["vsm-product", productId] });
    void qc.invalidateQueries({ queryKey: ["vsm-products"] });
    void qc.invalidateQueries({ queryKey: ["vsm-pipeline"] });
    void qc.invalidateQueries({ queryKey: ["vsm-stage-instances", productId] });
  };

  const createPipeline = useMutation({
    mutationFn: async () => {
      const names = stageDraft
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const stages = names.map((name, order) => ({
        name,
        order,
        description: "",
        entry_criteria: "",
        exit_criteria: "manual_confirm",
        department_id: departments[order % Math.max(departments.length, 1)]?.id ?? null,
      }));
      return httpClient.post("/api/v1/pipelines", {
        product_id: productId,
        name: pipeName,
        description: "Product-dedicated pipeline",
        stages,
      });
    },
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  const addStage = useMutation({
    mutationFn: async (name: string) => {
      if (!pipelineId) throw new Error("No pipeline");
      const currentStages = pipelineBundle?.stages ?? [];
      return httpClient.post(`/api/v1/pipelines/${pipelineId}/stages`, {
        name,
        order: currentStages.length,
        description: "",
        entry_criteria: "",
        exit_criteria: "manual_confirm",
        department_id:
          departments[currentStages.length % Math.max(departments.length, 1)]?.id ?? null,
      });
    },
    onSuccess: () => {
      setNewStageName("");
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const start = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/start`),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });
  const moveNext = useMutation({
    mutationFn: () =>
      httpClient.post(`/api/v1/products/${productId}/move-next`, {
        exit_criteria_met: exitMet,
      }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });
  const movePrev = useMutation({
    mutationFn: () =>
      httpClient.post(`/api/v1/products/${productId}/move-prev`, {
        reason: movePrevReason,
      }),
    onSuccess: () => {
      setMovePrevReason("");
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });
  const reopenStage = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/reopen-stage`),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });
  const completeStage = useMutation({
    mutationFn: () =>
      httpClient.post(`/api/v1/products/${productId}/complete-stage`, {
        exit_criteria_met: exitMet,
      }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });
  const rejectStage = useMutation({
    mutationFn: () =>
      httpClient.post(`/api/v1/products/${productId}/reject-stage`, {
        reason: rejectReason,
      }),
    onSuccess: () => {
      setRejectReason("");
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const holdMut = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/hold`),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });
  const resumeMut = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/resume`),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });
  const restoreMut = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/restore`),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });
  const softDeleteMut = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/soft-delete`),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  const updateProduct = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.patch(`/api/v1/products/${productId}`, body),
    onSuccess: () => {
      setEditOpen(false);
      invalidate();
    },
    onError: (e: Error) => setSaveError(e.message),
  });

  const addMember = useMutation({
    mutationFn: () =>
      httpClient.post(`/api/v1/products/${productId}/members`, {
        employee_id: memberEmployeeId,
        role: memberRole,
      }),
    onSuccess: () => {
      setMemberEmployeeId("");
      setMemberError("");
      void qc.invalidateQueries({ queryKey: ["vsm-product-members", productId] });
    },
    onError: (e: Error) => setMemberError(e.message),
  });
  const removeMember = useMutation({
    mutationFn: (employeeId: string) => httpClient.delete(`/api/v1/products/${productId}/members/${employeeId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-product-members", productId] }),
  });

  if (isLoading) return <p className="text-dim">Loading product…</p>;
  if (!product) {
    return (
      <EmptyState title="Product not found" description="It may belong to another company or was archived." />
    );
  }

  const stages = pipelineBundle?.stages ?? [];
  const active = instances.find((i) => i.status === "ACTIVE");
  const activeStage = stages.find((s) => s.id === active?.stage_id);
  const canReopen = !active && instances.length > 0;

  const memberIds = new Set(members.map((m) => m.employee_id));
  const assignableEmployees = employees.filter((e) => !memberIds.has(e.id));

  const employeeName = (id?: string | null) => {
    if (!id) return "—";
    const e = employees.find((x) => x.id === id);
    return e ? employeeLabel(e) : id.slice(0, 8);
  };

  function onCreatePipeline(e: FormEvent) {
    e.preventDefault();
    setError("");
    createPipeline.mutate();
  }

  function onSaveDetails(e: FormEvent) {
    e.preventDefault();
    setSaveError("");
    updateProduct.mutate({
      name: form.name,
      code: form.code,
      category: form.category,
      product_type: form.product_type,
      priority: form.priority,
      visibility: form.visibility,
      description: form.description,
      vision: form.vision,
      goal: form.goal,
      success_metrics: form.success_metrics,
      business_value: form.business_value,
    });
  }

  function onAddMember(e: FormEvent) {
    e.preventDefault();
    setMemberError("");
    if (!memberEmployeeId) {
      setMemberError("Select an employee to add.");
      return;
    }
    addMember.mutate();
  }

  return (
    <div className="page-stack">
      <section className="data-panel">
        <div className="panel-header">
          <div>
            <p className="text-dim" style={{ fontSize: "0.75rem", marginBottom: "0.35rem" }}>
              <Link href="/products">← Products</Link>
            </p>
            <h2 className="panel-title" style={{ marginBottom: "0.35rem" }}>
              {product.name}
              {product.code ? <span className="text-dim font-mono"> · {product.code}</span> : null}
            </h2>
            <p className="text-dim" style={{ fontSize: "0.875rem" }}>
              {product.description || "No description"} · Model{" "}
              <span className="font-mono">{product.execution_model}</span>
              {product.priority ? <> · Priority {product.priority}</> : null}
            </p>
          </div>
          <div className="flex" style={{ gap: "0.5rem", alignItems: "center" }}>
            <span className="status-pill">{product.status}</span>
            {product.deleted_at ? <span className="status-pill">DELETED</span> : null}
          </div>
        </div>
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="flex" style={{ gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
          <button type="button" className="btn btn-sm" onClick={() => setEditOpen((v) => !v)}>
            {editOpen ? "Close editor" : "Edit details"}
          </button>
          {product.status === "ON_HOLD" ? (
            <button type="button" className="btn btn-sm" onClick={() => resumeMut.mutate()} disabled={resumeMut.isPending}>
              Resume
            </button>
          ) : product.status !== "ARCHIVED" && !product.deleted_at ? (
            <button type="button" className="btn btn-sm" onClick={() => holdMut.mutate()} disabled={holdMut.isPending}>
              Hold
            </button>
          ) : null}
          {product.deleted_at ? (
            <button type="button" className="btn btn-sm" onClick={() => restoreMut.mutate()} disabled={restoreMut.isPending}>
              Restore
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => softDeleteMut.mutate()} disabled={softDeleteMut.isPending}>
              Soft delete
            </button>
          )}
        </div>

        {editOpen ? (
          <form className="auth-form" onSubmit={onSaveDetails} style={{ marginTop: "1.25rem" }}>
            <div className="grid grid-cols-2">
              <div className="form-group">
                <label htmlFor="p-name">Name</label>
                <input id="p-name" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label htmlFor="p-code">Code</label>
                <input id="p-code" value={form.code ?? ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
              </div>
              <div className="form-group">
                <label htmlFor="p-category">Category</label>
                <input id="p-category" value={form.category ?? ""} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
              </div>
              <div className="form-group">
                <label htmlFor="p-type">Product type</label>
                <input id="p-type" value={form.product_type ?? ""} onChange={(e) => setForm((f) => ({ ...f, product_type: e.target.value }))} />
              </div>
              <div className="form-group">
                <label htmlFor="p-priority">Priority</label>
                <select id="p-priority" value={form.priority ?? ""} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p || "—"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p-visibility">Visibility</label>
                <select id="p-visibility" value={form.visibility ?? ""} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))}>
                  {VISIBILITY_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="p-desc">Description</label>
                <textarea id="p-desc" rows={3} value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="p-vision">Vision</label>
                <textarea id="p-vision" rows={2} value={form.vision ?? ""} onChange={(e) => setForm((f) => ({ ...f, vision: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="p-goal">Goal</label>
                <textarea id="p-goal" rows={2} value={form.goal ?? ""} onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="p-metrics">Success metrics</label>
                <textarea id="p-metrics" rows={2} value={form.success_metrics ?? ""} onChange={(e) => setForm((f) => ({ ...f, success_metrics: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="p-value">Business value</label>
                <textarea id="p-value" rows={2} value={form.business_value ?? ""} onChange={(e) => setForm((f) => ({ ...f, business_value: e.target.value }))} />
              </div>
            </div>
            {saveError ? <p className="auth-error">{saveError}</p> : null}
            <button type="submit" className="btn btn-primary" disabled={updateProduct.isPending}>
              {updateProduct.isPending ? "Saving…" : "Save details"}
            </button>
          </form>
        ) : null}
      </section>

      {!pipelineId ? (
        <section className="data-panel">
          <h3 className="panel-title">Create pipeline</h3>
          <p className="text-dim" style={{ marginBottom: "1rem", fontSize: "0.875rem" }}>
            Pick a ready-made flow or edit the stages. One click creates the pipeline for this product.
          </p>

          <div className="pipeline-templates">
            {(
              [
                {
                  id: "standard",
                  label: "Standard",
                  stages: ["Discovery", "Delivery", "Launch"],
                },
                {
                  id: "agile",
                  label: "Agile",
                  stages: ["Backlog", "Development", "QA", "Done"],
                },
                {
                  id: "simple",
                  label: "Simple",
                  stages: ["Plan", "Build", "Ship"],
                },
              ] as const
            ).map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className="btn btn-sm pipeline-template-btn"
                onClick={() => {
                  setPipeName(`${product.name} · ${tpl.label}`);
                  setStageDraft(tpl.stages.join(", "));
                }}
              >
                {tpl.label}
                <span className="text-dim" style={{ display: "block", fontSize: "0.75rem", fontWeight: 400 }}>
                  {tpl.stages.join(" → ")}
                </span>
              </button>
            ))}
          </div>

          <form className="auth-form" onSubmit={onCreatePipeline} style={{ marginTop: "1rem" }}>
            <div className="form-group">
              <label htmlFor="pipeName">Pipeline name</label>
              <input id="pipeName" value={pipeName} onChange={(e) => setPipeName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="stages">Stages (comma-separated, in order)</label>
              <input
                id="stages"
                value={stageDraft}
                onChange={(e) => setStageDraft(e.target.value)}
                required
                placeholder="Discovery, Delivery, Launch"
              />
            </div>
            {stageDraft.trim() ? (
              <div className="pipeline-stage-preview" aria-label="Stage preview">
                {stageDraft
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((name, i, arr) => (
                    <span key={`${name}-${i}`} className="pipeline-stage-chip">
                      <span className="font-mono text-dim">{i + 1}</span> {name}
                      {i < arr.length - 1 ? <span className="pipeline-stage-arrow">→</span> : null}
                    </span>
                  ))}
              </div>
            ) : null}
            {error ? <p className="auth-error">{error}</p> : null}
            <button type="submit" className="btn btn-primary" disabled={createPipeline.isPending}>
              {createPipeline.isPending ? "Creating…" : "Create pipeline"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="data-panel">
            <h3 className="panel-title" style={{ marginBottom: "0.75rem" }}>
              Stage definitions
            </h3>
            <form
              className="quick-create"
              onSubmit={(e) => {
                e.preventDefault();
                const name = newStageName.trim();
                if (!name) return;
                setError("");
                addStage.mutate(name);
              }}
            >
              <input
                type="text"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="Add a stage name and press Enter…"
                disabled={addStage.isPending}
                aria-label="New stage name"
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={addStage.isPending || !newStageName.trim()}
              >
                {addStage.isPending ? "Adding…" : "Add stage"}
              </button>
            </form>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Name</th>
                    <th>Exit criteria</th>
                    <th>Department</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((s) => (
                    <tr key={s.id}>
                      <td className="font-mono">{s.order}</td>
                      <td>{s.name}</td>
                      <td className="font-mono">{s.exit_criteria || "—"}</td>
                      <td>
                        {departments.find((d) => d.id === s.department_id)?.name ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="data-panel">
            <h3 className="panel-title" style={{ marginBottom: "0.75rem" }}>
              Execution
            </h3>
            <p className="text-dim" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
              Active stage:{" "}
              <strong>{activeStage?.name ?? (product.status === "DRAFT" || product.status === "READY" ? "Not started" : "None")}</strong>
              {active ? (
                <>
                  {" "}
                  · instance <span className="font-mono">{active.status}</span>
                </>
              ) : null}
            </p>

            <div className="flex" style={{ gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              <label className="flex" style={{ alignItems: "center", gap: "0.35rem", fontSize: "0.875rem" }}>
                <input
                  type="checkbox"
                  checked={exitMet}
                  onChange={(e) => setExitMet(e.target.checked)}
                />
                Exit criteria met
              </label>
            </div>

            <div className="flex" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
              {(product.status === "READY" || product.status === "DRAFT") && (
                <button type="button" className="btn btn-primary" onClick={() => start.mutate()} disabled={start.isPending}>
                  Start execution
                </button>
              )}
              {product.status === "ACTIVE" && (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => moveNext.mutate()} disabled={moveNext.isPending}>
                    Move to next stage
                  </button>
                  <button type="button" className="btn" onClick={() => completeStage.mutate()} disabled={completeStage.isPending}>
                    Complete current stage
                  </button>
                </>
              )}
              {canReopen ? (
                <button type="button" className="btn" onClick={() => reopenStage.mutate()} disabled={reopenStage.isPending}>
                  Reopen last stage
                </button>
              ) : null}
            </div>

            {product.status === "ACTIVE" ? (
              <div style={{ marginTop: "1.25rem" }} className="auth-form">
                <div className="form-group">
                  <label htmlFor="reject">Reject current stage (reason required)</label>
                  <input
                    id="reject"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Why is this stage rejected?"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={!rejectReason.trim() || rejectStage.isPending}
                  onClick={() => rejectStage.mutate()}
                >
                  Reject stage
                </button>

                <div className="form-group" style={{ marginTop: "1rem" }}>
                  <label htmlFor="move-prev">Move to previous stage (optional reason)</label>
                  <input
                    id="move-prev"
                    value={movePrevReason}
                    onChange={(e) => setMovePrevReason(e.target.value)}
                    placeholder="Why move back?"
                  />
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={movePrev.isPending}
                  onClick={() => movePrev.mutate()}
                >
                  Move to previous stage
                </button>
              </div>
            ) : null}
          </section>

          <section className="data-panel">
            <div className="panel-header">
              <h3 className="panel-title">Stage instances</h3>
              <Link href={`/planning?product_id=${product.id}`} className="btn btn-sm">
                Plan work
              </Link>
            </div>
            {instances.length === 0 ? (
              <EmptyState title="No instances yet" description="Start execution to open the first stage instance." />
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Status</th>
                      <th>Started</th>
                      <th>Finished</th>
                      <th>Duration</th>
                      <th>Reject reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instances.map((i) => (
                      <tr key={i.id}>
                        <td>{stages.find((s) => s.id === i.stage_id)?.name ?? i.stage_id.slice(0, 8)}</td>
                        <td>
                          <span className="status-pill">{i.status}</span>
                        </td>
                        <td className="font-mono">{i.started_at ? new Date(i.started_at).toLocaleString() : "—"}</td>
                        <td className="font-mono">{i.finished_at ? new Date(i.finished_at).toLocaleString() : "—"}</td>
                        <td className="font-mono">
                          {i.duration_seconds != null ? `${Math.round(i.duration_seconds / 60)}m` : "—"}
                        </td>
                        <td>{i.reject_reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <section className="data-panel">
        <div className="panel-header">
          <h3 className="panel-title">Members</h3>
        </div>
        <p className="text-dim" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
          Collaborators beyond the single owner/manager. Members can be added as contributors or viewers.
        </p>
        <form onSubmit={onAddMember} className="org-assign-row">
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="member-emp">Employee</label>
            <select id="member-emp" value={memberEmployeeId} onChange={(e) => setMemberEmployeeId(e.target.value)}>
              <option value="">Select…</option>
              {assignableEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {employeeLabel(e)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="member-role">Role</label>
            <select id="member-role" value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={addMember.isPending} style={{ alignSelf: "flex-end" }}>
            {addMember.isPending ? "Adding…" : "Add member"}
          </button>
        </form>
        {memberError ? <p className="auth-error">{memberError}</p> : null}

        <div className="table-scroll" style={{ marginTop: "1.25rem" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-dim">
                    No members yet.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id}>
                    <td>{employeeName(m.employee_id)}</td>
                    <td>
                      <span className="status-pill">{m.role}</span>
                    </td>
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => removeMember.mutate(m.employee_id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <CollaborationPanel entityType="product" entityID={product.id} />
    </div>
  );
}
