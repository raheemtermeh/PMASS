"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CollaborationPanel } from "@/components/CollaborationPanel";
import { EmptyState } from "@/components/EmptyState";
import { httpClient } from "@/core/api/http-client";
import { isSafeResourceId } from "@/shared/security";
import { PRODUCT_MEMBER_ROLES, productRoleLabel } from "@/features/products/product-roles";
import { COMPANY_PIPELINE_TEMPLATES } from "@/features/products/product-templates";
import {
  PRODUCT_DETAIL_TABS,
  computeProductHealth,
  computeProductKPIs,
  executionModelLabel,
  formatProductDate,
  inferProductRisks,
  stageProgressPercent,
  type ProductDetailTab,
} from "@/features/products/product-utils";
import type {
  Department,
  Employee,
  Feature,
  Pipeline,
  Product,
  ProductMember,
  Project,
  Stage,
  StageInstance,
  Task,
  Team,
  TeamMemberView,
} from "@/features/vsm/types";
import { employeeLabel } from "@/features/vsm/types";

const PRIORITY_OPTIONS = ["", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
const VISIBILITY_OPTIONS = ["ORGANIZATION", "PRIVATE", "PUBLIC"];

export function ProductDetailClient({ productId }: { productId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const qc = useQueryClient();
  const tab = (search.get("tab") as ProductDetailTab) || "overview";

  const [error, setError] = useState("");
  const [pipeName, setPipeName] = useState("Default pipeline");
  const [stageDraft, setStageDraft] = useState("Discovery, Analysis, Design, Development, QA, Release");
  const [newStageName, setNewStageName] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [movePrevReason, setMovePrevReason] = useState("");
  const [exitMet, setExitMet] = useState(true);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [memberEmployeeId, setMemberEmployeeId] = useState("");
  const [memberRole, setMemberRole] = useState("CONTRIBUTOR");
  const [memberError, setMemberError] = useState("");

  useEffect(() => {
    if (!isSafeResourceId(productId)) router.replace("/products");
  }, [productId, router]);

  const { data: product, isLoading } = useQuery({
    queryKey: ["vsm-product", productId],
    queryFn: () => httpClient.get<Product>(`/api/v1/products/${productId}`),
    enabled: isSafeResourceId(productId),
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

  const { data: teams = [] } = useQuery({
    queryKey: ["vsm-teams"],
    queryFn: () => httpClient.get<Team[]>("/api/v1/teams?page_size=100"),
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

  const { data: projects = [] } = useQuery({
    queryKey: ["vsm-product-projects", productId],
    queryFn: () => httpClient.get<Project[]>(`/api/v1/projects?product_id=${productId}&page_size=100`),
    enabled: Boolean(productId),
  });

  const projectIds = projects.map((p) => p.id).join(",");

  const { data: features = [] } = useQuery({
    queryKey: ["vsm-product-features", projectIds],
    queryFn: async () => {
      const all: Feature[] = [];
      for (const p of projects) {
        const rows = await httpClient.get<Feature[]>(`/api/v1/features?project_id=${p.id}&page_size=100`);
        all.push(...rows);
      }
      return all;
    },
    enabled: projects.length > 0,
  });

  const featureIds = features.map((f) => f.id).join(",");

  const { data: tasks = [] } = useQuery({
    queryKey: ["vsm-product-tasks", featureIds],
    queryFn: async () => {
      const all: Task[] = [];
      for (const f of features) {
        const rows = await httpClient.get<Task[]>(`/api/v1/tasks?feature_id=${f.id}&page_size=100`);
        all.push(...rows);
      }
      return all;
    },
    enabled: features.length > 0,
  });

  const { data: commentCount = 0 } = useQuery({
    queryKey: ["vsm-comments-count", productId],
    queryFn: async () => {
      const rows = await httpClient.get<{ id: string }[]>(
        `/api/v1/comments?entity_type=product&entity_id=${productId}`,
      );
      return rows.length;
    },
    enabled: Boolean(productId),
  });

  const { data: attachmentCount = 0 } = useQuery({
    queryKey: ["vsm-attachments-count", productId],
    queryFn: async () => {
      const rows = await httpClient.get<{ id: string }[]>(
        `/api/v1/attachments?entity_type=product&entity_id=${productId}`,
      );
      return rows.length;
    },
    enabled: Boolean(productId),
  });

  const { data: teamMemberships = [] } = useQuery({
    queryKey: ["vsm-all-team-members", teams.map((t) => t.id).join(",")],
    queryFn: async () => {
      const rows: (TeamMemberView & { team_id: string })[] = [];
      for (const team of teams) {
        const membersInTeam = await httpClient.get<TeamMemberView[]>(`/api/v1/teams/${team.id}/members`);
        for (const m of membersInTeam) rows.push({ ...m, team_id: team.id });
      }
      return rows;
    },
    enabled: teams.length > 0 && tab === "members",
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
    setPipeName(`${product.name} pipeline`);
  }, [product]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["vsm-product", productId] });
    void qc.invalidateQueries({ queryKey: ["vsm-products"] });
    void qc.invalidateQueries({ queryKey: ["vsm-pipeline"] });
    void qc.invalidateQueries({ queryKey: ["vsm-stage-instances", productId] });
  };

  const createPipeline = useMutation({
    mutationFn: async () => {
      const names = stageDraft.split(",").map((s) => s.trim()).filter(Boolean);
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
        department_id: departments[currentStages.length % Math.max(departments.length, 1)]?.id ?? null,
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
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/move-next`, { exit_criteria_met: exitMet }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });
  const movePrev = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/move-prev`, { reason: movePrevReason }),
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
      httpClient.post(`/api/v1/products/${productId}/complete-stage`, { exit_criteria_met: exitMet }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });
  const rejectStage = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/reject-stage`, { reason: rejectReason }),
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
  const archiveMut = useMutation({
    mutationFn: () => httpClient.delete(`/api/v1/products/${productId}`),
    onSuccess: () => router.push("/products"),
    onError: (e: Error) => setError(e.message),
  });

  const updateProduct = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.patch(`/api/v1/products/${productId}`, body),
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error) => setSaveError(e.message),
  });

  const changeOwner = useMutation({
    mutationFn: (ownerId: string) =>
      httpClient.put(`/api/v1/products/${productId}/owner`, { owner_id: ownerId }),
    onSuccess: invalidate,
    onError: (e: Error) => setSaveError(e.message),
  });

  const changeManager = useMutation({
    mutationFn: (managerId: string | null) =>
      httpClient.put(`/api/v1/products/${productId}/manager`, {
        manager_id: managerId || null,
      }),
    onSuccess: invalidate,
    onError: (e: Error) => setSaveError(e.message),
  });

  const duplicateProduct = useMutation({
    mutationFn: async (): Promise<Product> => {
      if (!product) throw new Error("No product");
      return httpClient.post<Product>("/api/v1/products", {
        owner_id: product.owner_id,
        manager_id: product.manager_id,
        name: `${product.name} (copy)`,
        description: product.description,
        category: product.category,
        execution_model: product.execution_model,
        code: product.code ? `${product.code}-copy` : "",
        product_type: product.product_type,
        priority: product.priority,
        vision: product.vision,
        goal: product.goal,
        success_metrics: product.success_metrics,
        business_value: product.business_value,
        visibility: product.visibility,
      });
    },
    onSuccess: (created: Product) => router.push(`/products/${created.id}?tab=overview`),
    onError: (e: Error) => setError(e.message),
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

  const stages = pipelineBundle?.stages ?? [];
  const pipeline = pipelineBundle?.pipeline;
  const active = instances.find((i) => i.status === "ACTIVE");
  const activeStage = stages.find((s) => s.id === active?.stage_id);
  const canReopen = !active && instances.length > 0;

  const employeeName = (id?: string | null) => {
    if (!id) return "—";
    const e = employees.find((x) => x.id === id);
    return e ? employeeLabel(e) : id.slice(0, 8);
  };

  const employeeContext = useMemo(() => {
    const map = new Map<string, { department: string; team: string }>();
    for (const tm of teamMemberships) {
      const team = teams.find((t) => t.id === tm.team_id);
      const dept = departments.find((d) => d.id === team?.department_id);
      map.set(tm.employee_id, {
        team: team?.name ?? "—",
        department: dept?.name ?? "—",
      });
    }
    return map;
  }, [teamMemberships, teams, departments]);

  const health = product
    ? computeProductHealth(product, stages, instances, features, tasks)
    : null;
  const kpis = computeProductKPIs(projects, features, tasks);
  const risks = inferProductRisks(features, tasks, stages, instances);

  function setTab(next: ProductDetailTab) {
    router.replace(`/products/${productId}?tab=${next}`);
  }

  function exportProductJson() {
    if (!product) return;
    const payload = { product, pipeline, stages, members, projects, features, tasks };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${product.code || product.name}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) return <p className="text-dim">Loading product…</p>;
  if (!product) {
    return <EmptyState title="Product not found" description="It may belong to another company or was archived." />;
  }

  const memberIds = new Set(members.map((m) => m.employee_id));
  const assignableEmployees = employees.filter((e) => !memberIds.has(e.id));

  return (
    <div className="page-stack product-detail-page">
      <section className="data-panel product-header-panel">
        <div className="product-header-top">
          <div>
            <p className="text-dim product-back-link">
              <Link href="/products">← Products</Link>
            </p>
            <h2 className="product-title">{product.name}</h2>
            {product.code ? <p className="product-code">Code {product.code}</p> : null}
            {product.description ? <p className="product-desc">{product.description}</p> : null}
          </div>
          <div className="product-header-actions">
            <span className="status-pill">{product.status}</span>
            {pipeline?.status ? <span className="status-pill">{pipeline.status}</span> : null}
            {product.deleted_at ? <span className="status-pill">DELETED</span> : null}
          </div>
        </div>

        <div className="product-meta-grid">
          <div className="product-meta-item">
            <span className="product-meta-label">Owner</span>
            <strong>{employeeName(product.owner_id)}</strong>
          </div>
          <div className="product-meta-item">
            <span className="product-meta-label">Manager</span>
            <strong>{employeeName(product.manager_id)}</strong>
          </div>
          <div className="product-meta-item">
            <span className="product-meta-label">Priority</span>
            <strong>{product.priority || "—"}</strong>
          </div>
          <div className="product-meta-item">
            <span className="product-meta-label">Execution</span>
            <strong>{executionModelLabel(product.execution_model)}</strong>
          </div>
          <div className="product-meta-item">
            <span className="product-meta-label">Pipeline status</span>
            <strong>{pipeline?.status ?? (pipelineId ? "ACTIVE" : "Not created")}</strong>
          </div>
          <div className="product-meta-item">
            <span className="product-meta-label">Created</span>
            <strong>{formatProductDate(product.created_at)}</strong>
          </div>
          <div className="product-meta-item">
            <span className="product-meta-label">Last updated</span>
            <strong>{formatProductDate(product.updated_at)}</strong>
          </div>
          <div className="product-meta-item">
            <span className="product-meta-label">Active stage</span>
            <strong>{activeStage?.name ?? "—"}</strong>
          </div>
        </div>

        <div className="product-action-row">
          <button type="button" className="btn btn-sm" onClick={() => setTab("settings")}>
            Edit
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
          {product.status === "ARCHIVED" || product.deleted_at ? (
            <button type="button" className="btn btn-sm" onClick={() => restoreMut.mutate()} disabled={restoreMut.isPending}>
              Restore
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={archiveMut.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Archive “${product.name}”?\nProjects, features and tasks are kept.`,
                  )
                ) {
                  archiveMut.mutate();
                }
              }}
            >
              Archive
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => duplicateProduct.mutate()} disabled={duplicateProduct.isPending}>
            Duplicate
          </button>
          <button type="button" className="btn btn-sm" onClick={exportProductJson}>
            Export
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setTab("settings")}>
            Settings
          </button>
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
      </section>

      <nav className="org-tab-row product-tab-row" aria-label="Product sections">
        {PRODUCT_DETAIL_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`btn btn-sm${tab === id ? " btn-primary" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <section className="data-panel">
          <div className="product-overview-grid">
            <div className="product-stat-card">
              <h4>Product health</h4>
              {health ? (
                <>
                  <p className="product-health-line">
                    {health.emoji} {health.label}
                  </p>
                  <div className="product-progress-bar">
                    <span style={{ width: `${health.score}%` }} />
                  </div>
                  <p className="text-dim">{health.score}%</p>
                </>
              ) : null}
            </div>
            <div className="product-stat-card">
              <h4>KPIs</h4>
              <ul className="product-kpi-list">
                <li><span>Features</span><strong>{kpis.featuresTotal}</strong></li>
                <li><span>Completed</span><strong>{kpis.featuresCompleted}</strong></li>
                <li><span>Open</span><strong>{kpis.featuresOpen}</strong></li>
                <li><span>Delayed</span><strong>{kpis.featuresDelayed}</strong></li>
              </ul>
            </div>
            <div className="product-stat-card">
              <h4>Statistics</h4>
              <ul className="product-kpi-list">
                <li><span>Tasks</span><strong>{kpis.tasksTotal}</strong></li>
                <li><span>Projects</span><strong>{kpis.projectsTotal}</strong></li>
                <li><span>Members</span><strong>{members.length + 2}</strong></li>
                <li><span>Comments</span><strong>{commentCount}</strong></li>
                <li><span>Attachments</span><strong>{attachmentCount}</strong></li>
              </ul>
            </div>
            <div className="product-stat-card product-stat-wide">
              <h4>Stage progress</h4>
              {stages.length === 0 ? (
                <p className="text-dim">Create a pipeline to track stage progress.</p>
              ) : (
                <ul className="product-stage-progress-list">
                  {stages.map((s) => {
                    const pct = stageProgressPercent(s, instances);
                    return (
                      <li key={s.id}>
                        <span>{s.name}</span>
                        <div className="product-progress-bar">
                          <span style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="product-stat-card product-stat-wide">
              <h4>Risks</h4>
              {risks.length === 0 ? (
                <p className="text-dim">No risks detected.</p>
              ) : (
                <ul className="product-risk-list">
                  {risks.map((r) => (
                    <li key={r.id} className={`product-risk-${r.severity}`}>
                      {r.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {!pipelineId ? (
            <p className="text-dim" style={{ marginTop: "1rem" }}>
              No pipeline yet.{" "}
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setTab("pipeline")}>
                Set up pipeline
              </button>
            </p>
          ) : (
            <div className="product-pipeline-rail" style={{ marginTop: "1rem" }}>
              <h4>Current pipeline</h4>
              <div className="product-vertical-pipeline">
                {stages.map((s, i) => (
                  <div key={s.id} className="product-vertical-stage">
                    <span className={`pipeline-stage-dot${activeStage?.id === s.id ? " active" : ""}`} />
                    <span>{s.name}</span>
                    {i < stages.length - 1 ? <span className="product-vertical-arrow">↓</span> : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "pipeline" && (
        <section className="data-panel">
          {!pipelineId ? (
            <>
              <h3 className="panel-title">Create pipeline</h3>
              <p className="text-dim product-section-lead">
                Each product has one pipeline. Pick a company template or customize stages.
              </p>
              <p className="text-dim" style={{ fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
                Company templates
              </p>
              <div className="pipeline-templates">
                {COMPANY_PIPELINE_TEMPLATES.map((tpl) => (
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
                    <span className="text-dim pipeline-template-stages">
                      {tpl.stages.join(" → ")}
                    </span>
                  </button>
                ))}
              </div>
              <form
                className="auth-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  setError("");
                  createPipeline.mutate();
                }}
                style={{ marginTop: "1rem" }}
              >
                <div className="form-group">
                  <label htmlFor="pipeName">Pipeline name</label>
                  <input id="pipeName" value={pipeName} onChange={(e) => setPipeName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label htmlFor="stages">Stages (comma-separated)</label>
                  <input id="stages" value={stageDraft} onChange={(e) => setStageDraft(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-primary" disabled={createPipeline.isPending}>
                  {createPipeline.isPending ? "Creating…" : "Create pipeline"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h3 className="panel-title">Pipeline</h3>
              <p className="text-dim">{pipeline?.name ?? "Current pipeline"}</p>
              <div className="product-vertical-pipeline product-vertical-pipeline-large">
                {stages.map((s, i) => (
                  <div key={s.id} className="product-vertical-stage">
                    <span className={`pipeline-stage-dot${activeStage?.id === s.id ? " active" : ""}`} />
                    <div>
                      <strong>{s.name}</strong>
                      <p className="text-dim" style={{ fontSize: "0.8125rem", margin: 0 }}>
                        {departments.find((d) => d.id === s.department_id)?.name ?? "No department"}
                      </p>
                    </div>
                    {i < stages.length - 1 ? <span className="product-vertical-arrow">↓</span> : null}
                  </div>
                ))}
              </div>
              <div className="product-action-row" style={{ marginTop: "1.25rem" }}>
                <Link href={`/planning?product_id=${product.id}`} className="btn btn-sm btn-primary">
                  Plan work
                </Link>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "stages" && (
        <section className="data-panel">
          {!pipelineId ? (
            <EmptyState title="No pipeline" description="Create a pipeline first." />
          ) : (
            <>
              <h3 className="panel-title">Stages</h3>
              <p className="text-dim product-section-lead">
                Stage bible fields (department, manager, entry/exit criteria, auto rules, responsible team) will expand in a future release.
              </p>
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
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="Add stage name…"
                  aria-label="New stage name"
                />
                <button type="submit" className="btn btn-primary" disabled={addStage.isPending}>
                  Add stage
                </button>
              </form>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Name</th>
                      <th>Department</th>
                      <th>Entry criteria</th>
                      <th>Exit criteria</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((s) => {
                      const inst = instances.find((i) => i.stage_id === s.id);
                      return (
                        <tr key={s.id}>
                          <td className="font-mono">{s.order + 1}</td>
                          <td>{s.name}</td>
                          <td>{departments.find((d) => d.id === s.department_id)?.name ?? "—"}</td>
                          <td>{s.entry_criteria || "—"}</td>
                          <td>{s.exit_criteria || "—"}</td>
                          <td><span className="status-pill">{inst?.status ?? "PENDING"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="data-panel" style={{ marginTop: "1rem", padding: "1rem" }}>
                <h4 className="panel-title">Execution controls</h4>
                <p className="text-dim">
                  Active: <strong>{activeStage?.name ?? "Not started"}</strong>
                </p>
                <label className="flex" style={{ alignItems: "center", gap: "0.35rem", fontSize: "0.875rem" }}>
                  <input type="checkbox" checked={exitMet} onChange={(e) => setExitMet(e.target.checked)} />
                  Exit criteria met
                </label>
                <div className="product-action-row">
                  {(product.status === "READY" || product.status === "DRAFT") && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => start.mutate()} disabled={start.isPending}>
                      Start execution
                    </button>
                  )}
                  {product.status === "ACTIVE" && (
                    <>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => moveNext.mutate()} disabled={moveNext.isPending}>
                        Next stage
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => completeStage.mutate()} disabled={completeStage.isPending}>
                        Complete stage
                      </button>
                    </>
                  )}
                  {canReopen ? (
                    <button type="button" className="btn btn-sm" onClick={() => reopenStage.mutate()} disabled={reopenStage.isPending}>
                      Reopen last
                    </button>
                  ) : null}
                </div>
                {product.status === "ACTIVE" ? (
                  <div className="auth-form" style={{ marginTop: "1rem" }}>
                    <div className="form-group">
                      <label htmlFor="reject">Reject reason</label>
                      <input id="reject" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                    </div>
                    <button type="button" className="btn btn-sm btn-danger" disabled={!rejectReason.trim() || rejectStage.isPending} onClick={() => rejectStage.mutate()}>
                      Reject stage
                    </button>
                    <div className="form-group" style={{ marginTop: "0.75rem" }}>
                      <label htmlFor="move-prev">Move back reason</label>
                      <input id="move-prev" value={movePrevReason} onChange={(e) => setMovePrevReason(e.target.value)} />
                    </div>
                    <button type="button" className="btn btn-sm" disabled={movePrev.isPending} onClick={() => movePrev.mutate()}>
                      Move to previous
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      )}

      {tab === "projects" && (
        <section className="data-panel">
          <div className="panel-header">
            <h3 className="panel-title">Projects</h3>
            <Link href={`/planning?product_id=${product.id}`} className="btn btn-sm btn-primary">
              Open planning
            </Link>
          </div>
          {projects.length === 0 ? (
            <EmptyState title="No projects" description="Create projects from the planning workspace." />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td><span className="status-pill">{p.status}</span></td>
                      <td>{p.priority ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "features" && (
        <section className="data-panel">
          <div className="panel-header">
            <h3 className="panel-title">Features</h3>
            <Link href={`/planning?product_id=${product.id}`} className="btn btn-sm btn-primary">
              Manage in planning
            </Link>
          </div>
          {features.length === 0 ? (
            <EmptyState title="No features" description="Add features under projects in planning." />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Status</th>
                    <th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((f) => (
                    <tr key={f.id}>
                      <td>{f.title}</td>
                      <td><span className="status-pill">{f.status}</span></td>
                      <td>{f.priority ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "members" && (
        <section className="data-panel">
          <h3 className="panel-title">Members</h3>
          <p className="text-dim product-section-lead">
            Product roles (Owner, Manager, Contributor, …) are separate from workspace roles (Admin, Employee, Viewer).
          </p>
          <div className="product-owner-manager-row">
            <div className="product-meta-item">
              <span className="product-meta-label">Product owner</span>
              <select
                value={product.owner_id}
                onChange={(e) => changeOwner.mutate(e.target.value)}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{employeeLabel(e)}</option>
                ))}
              </select>
            </div>
            <div className="product-meta-item">
              <span className="product-meta-label">Product manager</span>
              <select
                value={product.manager_id ?? ""}
                onChange={(e) => changeManager.mutate(e.target.value || null)}
              >
                <option value="">—</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{employeeLabel(e)}</option>
                ))}
              </select>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setMemberError("");
              if (!memberEmployeeId) {
                setMemberError("Select an employee.");
                return;
              }
              addMember.mutate();
            }}
            className="org-assign-row"
          >
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label htmlFor="member-emp">Employee</label>
              <select id="member-emp" value={memberEmployeeId} onChange={(e) => setMemberEmployeeId(e.target.value)}>
                <option value="">Select…</option>
                {assignableEmployees.map((e) => (
                  <option key={e.id} value={e.id}>{employeeLabel(e)}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="member-role">Product role</label>
              <select id="member-role" value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
                {PRODUCT_MEMBER_ROLES.map((r) => (
                  <option key={r} value={r}>{productRoleLabel(r)}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={addMember.isPending} style={{ alignSelf: "flex-end" }}>
              Add member
            </button>
          </form>
          {memberError ? <p className="auth-error">{memberError}</p> : null}
          <div className="table-scroll" style={{ marginTop: "1.25rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Team</th>
                  <th>Product role</th>
                  <th>Assigned</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{employeeName(product.owner_id)}</td>
                  <td>{employeeContext.get(product.owner_id)?.department ?? "—"}</td>
                  <td>{employeeContext.get(product.owner_id)?.team ?? "—"}</td>
                  <td><span className="status-pill">OWNER</span></td>
                  <td className="font-mono">{formatProductDate(product.created_at)}</td>
                  <td />
                </tr>
                {product.manager_id ? (
                  <tr>
                    <td>{employeeName(product.manager_id)}</td>
                    <td>{employeeContext.get(product.manager_id)?.department ?? "—"}</td>
                    <td>{employeeContext.get(product.manager_id)?.team ?? "—"}</td>
                    <td><span className="status-pill">MANAGER</span></td>
                    <td className="font-mono">{formatProductDate(product.updated_at)}</td>
                    <td />
                  </tr>
                ) : null}
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>{employeeName(m.employee_id)}</td>
                    <td>{employeeContext.get(m.employee_id)?.department ?? "—"}</td>
                    <td>{employeeContext.get(m.employee_id)?.team ?? "—"}</td>
                    <td><span className="status-pill">{m.role}</span></td>
                    <td className="font-mono">{formatProductDate(m.created_at)}</td>
                    <td className="actions-cell">
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => removeMember.mutate(m.employee_id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "activity" && (
        <CollaborationPanel entityType="product" entityID={product.id} variant="activity" />
      )}

      {tab === "files" && (
        <CollaborationPanel entityType="product" entityID={product.id} variant="files" />
      )}

      {tab === "settings" && (
        <section className="data-panel">
          <h3 className="panel-title">Settings</h3>
          <form
              className="auth-form"
              onSubmit={(e) => {
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
              }}
            >
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
                      <option key={p} value={p}>{p || "—"}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p-visibility">Visibility</label>
                  <select id="p-visibility" value={form.visibility ?? ""} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))}>
                    {VISIBILITY_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v}</option>
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
                {updateProduct.isPending ? "Saving…" : "Save settings"}
              </button>
            </form>
          <div style={{ marginTop: "1.5rem" }}>
            <CollaborationPanel entityType="product" entityID={product.id} variant="comments" />
          </div>
        </section>
      )}
    </div>
  );
}
