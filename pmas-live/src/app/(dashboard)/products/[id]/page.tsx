"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CollaborationPanel } from "@/components/CollaborationPanel";
import { EmptyState } from "@/components/EmptyState";
import { httpClient } from "@/core/api/http-client";
import type {
  Department,
  Pipeline,
  Product,
  Stage,
  StageInstance,
} from "@/features/vsm/types";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const qc = useQueryClient();
  const [rejectReason, setRejectReason] = useState("");
  const [exitMet, setExitMet] = useState(true);
  const [pipeName, setPipeName] = useState("Default pipeline");
  const [stageDraft, setStageDraft] = useState("Discovery, Delivery, Launch");
  const [error, setError] = useState("");

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

  if (isLoading) return <p className="text-dim">Loading product…</p>;
  if (!product) {
    return (
      <EmptyState title="Product not found" description="It may belong to another company or was archived." />
    );
  }

  const stages = pipelineBundle?.stages ?? [];
  const active = instances.find((i) => i.status === "ACTIVE");
  const activeStage = stages.find((s) => s.id === active?.stage_id);

  function onCreatePipeline(e: FormEvent) {
    e.preventDefault();
    setError("");
    createPipeline.mutate();
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
            </h2>
            <p className="text-dim" style={{ fontSize: "0.875rem" }}>
              {product.description || "No description"} · Model{" "}
              <span className="font-mono">{product.execution_model}</span>
            </p>
          </div>
          <span className="status-pill">{product.status}</span>
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
      </section>

      {!pipelineId ? (
        <section className="data-panel">
          <h3 className="panel-title">Assign dedicated pipeline</h3>
          <p className="text-dim" style={{ marginBottom: "1rem", fontSize: "0.875rem" }}>
            Each Product has its own Pipeline (never shared). Stages are immutable definitions;
            runtime lives in Stage Instances.
          </p>
          <form className="auth-form" onSubmit={onCreatePipeline}>
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
              />
            </div>
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

      <CollaborationPanel entityType="product" entityID={product.id} />
    </div>
  );
}
