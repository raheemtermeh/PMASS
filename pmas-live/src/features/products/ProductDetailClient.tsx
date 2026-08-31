"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CollaborationPanel } from "@/components/CollaborationPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { FormStepper } from "@/components/FormStepper";
import { PageGuide } from "@/components/PageGuide";
import { ExecutionModelPicker } from "@/components/ExecutionModelPicker";
import { WorkMapGuide } from "@/components/WorkMapGuide";
import { httpClient } from "@/core/api/http-client";
import { isSafeResourceId } from "@/shared/security";
import { PRODUCT_MEMBER_ROLES } from "@/features/products/product-roles";
import { COMPANY_PIPELINE_TEMPLATES } from "@/features/products/product-templates";
import {
  PRODUCT_DETAIL_TABS,
  canonicalStageName,
  computeProductHealth,
  computeProductKPIs,
  executionModelLabel,
  inferProductRisks,
  localizedStageName,
  stageProgressPercent,
  type ProductDetailTab,
} from "@/features/products/product-utils";
import { cascadeLabels, hasStorage, resolveProductConfig } from "@/features/products/work-models";
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
import { useI18n } from "@/core/providers/I18nProvider";
import { localizedEnumLabel, priorityTranslationKey, statusTranslationKey } from "@/lib/localized-labels";

const PRIORITY_OPTIONS = ["", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
const VISIBILITY_OPTIONS = ["ORGANIZATION", "PRIVATE", "PUBLIC"];

export function ProductDetailClient({ productId }: { productId: string }) {
  const { t, n, d, lang } = useI18n();
  const router = useRouter();
  const search = useSearchParams();
  const qc = useQueryClient();
  const tab = (search.get("tab") as ProductDetailTab) || "overview";

  const [error, setError] = useState("");
  const [pipeName, setPipeName] = useState(() => t("productDetail.defaultPipeline"));
  const [stageDraft, setStageDraft] = useState(() =>
    ["discovery", "analysis", "design", "development", "qa", "release"]
      .map((key) => t(`productDetail.stages.${key}`))
      .join(lang === "fa" ? "، " : ", "),
  );
  const [newStageName, setNewStageName] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [movePrevReason, setMovePrevReason] = useState("");
  const [exitMet, setExitMet] = useState(true);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [modelKey, setModelKey] = useState("PROJECT_FEATURE_TASK");
  const [customLevelsJson, setCustomLevelsJson] = useState(
    JSON.stringify([{ label: "Theme" }, { label: "Ticket" }]),
  );
  const [memberEmployeeId, setMemberEmployeeId] = useState("");
  const [memberRole, setMemberRole] = useState("CONTRIBUTOR");
  const [memberError, setMemberError] = useState("");
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [pipeStep, setPipeStep] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

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
  const productCfg = product ? resolveProductConfig(product) : null;
  const detailShowProjects = !product || hasStorage(productCfg, "project");
  const detailShowFeatures = !product || hasStorage(productCfg, "feature");

  const { data: features = [] } = useQuery({
    queryKey: ["vsm-product-features", productId, projectIds, detailShowProjects],
    queryFn: async () => {
      if (!detailShowProjects && productId) {
        return httpClient.get<Feature[]>(`/api/v1/features?product_id=${productId}&page_size=100`);
      }
      const all: Feature[] = [];
      for (const p of projects) {
        const rows = await httpClient.get<Feature[]>(`/api/v1/features?project_id=${p.id}&page_size=100`);
        all.push(...rows);
      }
      return all;
    },
    enabled: Boolean(productId) && detailShowFeatures && (detailShowProjects ? projects.length > 0 : true),
  });

  const featureIds = features.map((f) => f.id).join(",");

  const { data: tasks = [] } = useQuery({
    queryKey: ["vsm-product-tasks", productId, featureIds, detailShowFeatures, detailShowProjects],
    queryFn: async () => {
      if (!detailShowFeatures && productId) {
        if (detailShowProjects) {
          const all: Task[] = [];
          for (const p of projects) {
            const rows = await httpClient.get<Task[]>(`/api/v1/tasks?project_id=${p.id}&page_size=100`);
            all.push(...rows);
          }
          return all;
        }
        return httpClient.get<Task[]>(`/api/v1/tasks?product_id=${productId}&page_size=100`);
      }
      const all: Task[] = [];
      for (const f of features) {
        const rows = await httpClient.get<Task[]>(`/api/v1/tasks?feature_id=${f.id}&page_size=100`);
        all.push(...rows);
      }
      return all;
    },
    enabled: Boolean(productId) && (detailShowFeatures ? features.length > 0 : true),
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
    setModelKey(product.execution_model || "PROJECT_FEATURE_TASK");
    if (product.execution_model === "CUSTOM" && product.execution_config?.levels?.length) {
      setCustomLevelsJson(
        JSON.stringify(product.execution_config.levels.map((l) => ({ label: l.label }))),
      );
    }
    setPipeName(t("productDetail.namedPipeline", { name: product.name }));
  }, [product, t]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["vsm-product", productId] });
    void qc.invalidateQueries({ queryKey: ["vsm-products"] });
    void qc.invalidateQueries({ queryKey: ["vsm-pipeline"] });
    void qc.invalidateQueries({ queryKey: ["vsm-stage-instances", productId] });
  };

  const createPipeline = useMutation({
    mutationFn: async () => {
      const names = stageDraft.split(/[,،]/).map((s) => canonicalStageName(s, t)).filter(Boolean);
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
    onError: () => setError(t("productDetail.errors.actionFailed")),
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
    onError: () => setError(t("productDetail.errors.actionFailed")),
  });

  const start = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/start`),
    onSuccess: invalidate,
    onError: () => setError(t("productDetail.errors.actionFailed")),
  });
  const moveNext = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/move-next`, { exit_criteria_met: exitMet }),
    onSuccess: invalidate,
    onError: () => setError(t("productDetail.errors.actionFailed")),
  });
  const movePrev = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/move-prev`, { reason: movePrevReason }),
    onSuccess: () => {
      setMovePrevReason("");
      invalidate();
    },
    onError: () => setError(t("productDetail.errors.actionFailed")),
  });
  const reopenStage = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/reopen-stage`),
    onSuccess: invalidate,
    onError: () => setError(t("productDetail.errors.actionFailed")),
  });
  const completeStage = useMutation({
    mutationFn: () =>
      httpClient.post(`/api/v1/products/${productId}/complete-stage`, { exit_criteria_met: exitMet }),
    onSuccess: invalidate,
    onError: () => setError(t("productDetail.errors.actionFailed")),
  });
  const rejectStage = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/reject-stage`, { reason: rejectReason }),
    onSuccess: () => {
      setRejectReason("");
      invalidate();
    },
    onError: () => setError(t("productDetail.errors.actionFailed")),
  });

  const holdMut = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/hold`),
    onSuccess: invalidate,
    onError: () => setError(t("productDetail.errors.actionFailed")),
  });
  const resumeMut = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/resume`),
    onSuccess: invalidate,
    onError: () => setError(t("productDetail.errors.actionFailed")),
  });
  const restoreMut = useMutation({
    mutationFn: () => httpClient.post(`/api/v1/products/${productId}/restore`),
    onSuccess: invalidate,
    onError: () => setError(t("productDetail.errors.actionFailed")),
  });
  const archiveMut = useMutation({
    mutationFn: () => httpClient.delete(`/api/v1/products/${productId}`),
    onSuccess: () => router.push("/products"),
    onError: () => setError(t("productDetail.errors.actionFailed")),
  });

  const updateProduct = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.patch(`/api/v1/products/${productId}`, body),
    onSuccess: () => {
      invalidate();
    },
    onError: () => setSaveError(t("productDetail.errors.saveFailed")),
  });

  const changeOwner = useMutation({
    mutationFn: (ownerId: string) =>
      httpClient.put(`/api/v1/products/${productId}/owner`, { owner_id: ownerId }),
    onSuccess: invalidate,
    onError: () => setSaveError(t("productDetail.errors.saveFailed")),
  });

  const changeManager = useMutation({
    mutationFn: (managerId: string | null) =>
      httpClient.put(`/api/v1/products/${productId}/manager`, {
        manager_id: managerId || null,
      }),
    onSuccess: invalidate,
    onError: () => setSaveError(t("productDetail.errors.saveFailed")),
  });

  const duplicateProduct = useMutation({
    mutationFn: async (): Promise<Product> => {
      if (!product) throw new Error("No product");
      return httpClient.post<Product>("/api/v1/products", {
        owner_id: product.owner_id,
        manager_id: product.manager_id,
        name: t("productDetail.copyName", { name: product.name }),
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
    onError: () => setError(t("productDetail.errors.duplicateFailed")),
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
    onError: () => setMemberError(t("productDetail.errors.memberFailed")),
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
  const statusLabel = (value?: string | null) =>
    value ? localizedEnumLabel(value, statusTranslationKey(value), t) : "—";
  const priorityLabel = (value?: string | null) =>
    value ? localizedEnumLabel(value, priorityTranslationKey(value), t) : "—";
  const stageLabel = (value?: string | null) => value ? localizedStageName(value, t) : "—";
  const dateLabel = (value?: string | null) =>
    value ? d(value, { year: "numeric", month: "short", day: "numeric" }) : "—";
  const executionLabel = (value: string) => {
    const keys: Record<string, string> = {
      PROJECT_FEATURE_TASK: "projectFeatureTask",
      FEATURE_TASK: "featureTask",
      DIRECT_TASK: "directTask",
      SCRUM: "scrum",
      KANBAN: "kanban",
      OKRS: "okrs",
      CUSTOM: "custom",
    };
    const named = keys[value] ? t(`productDetail.executionModels.${keys[value]}`) : "";
    if (named && !named.startsWith("productDetail.")) return named;
    const i18n = t(`workModels.${value}.name`);
    if (i18n && !i18n.startsWith("workModels.")) return i18n;
    return executionModelLabel(value);
  };
  const productRole = (value: string) =>
    t(`productDetail.roles.${value.toLowerCase()}`);

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

  if (isLoading) return <p className="text-dim">{t("productDetail.loading")}</p>;
  if (!product) {
    return <EmptyState title={t("productDetail.notFound")} description={t("productDetail.notFoundHint")} />;
  }

  const memberIds = new Set(members.map((m) => m.employee_id));
  const assignableEmployees = employees.filter((e) => !memberIds.has(e.id));

  return (
    <div className="page-stack product-detail-page">
      <PageGuide page="productDetail" />
      <WorkMapGuide config={resolveProductConfig(product)} activeStorage="product" compact />

      <section className="data-panel product-header-panel">
        <div className="product-header-top">
          <div>
            <p className="text-dim product-back-link">
              <Link href="/products">{t("productDetail.backToProducts")}</Link>
            </p>
            <h2 className="product-title">{product.name}</h2>
            {product.code ? <p className="product-code">{t("productDetail.codeValue", { code: product.code })}</p> : null}
            {product.description ? <p className="product-desc">{product.description}</p> : null}
          </div>
          <div className="product-header-actions">
            <span className="status-pill">{statusLabel(product.status)}</span>
            {pipeline?.status ? <span className="status-pill">{statusLabel(pipeline.status)}</span> : null}
            {product.deleted_at ? <span className="status-pill">{t("productDetail.deleted")}</span> : null}
          </div>
        </div>

        <div className="product-meta-grid">
          <div className="product-meta-item">
            <span className="product-meta-label">{t("common.owner")}</span>
            <strong>{employeeName(product.owner_id)}</strong>
          </div>
          <div className="product-meta-item">
            <span className="product-meta-label">{t("common.manager")}</span>
            <strong>{employeeName(product.manager_id)}</strong>
          </div>
          <div className="product-meta-item">
            <span className="product-meta-label">{t("products.priority")}</span>
            <strong>{priorityLabel(product.priority)}</strong>
          </div>
          <div className="product-meta-item">
            <span className="product-meta-label">{t("productDetail.execution")}</span>
            <strong>
              {executionLabel(product.execution_model)}
              {product.execution_config?.levels?.length ? (
                <span className="text-dim" style={{ display: "block", fontSize: "0.75rem", fontWeight: 400 }}>
                  {cascadeLabels(product.execution_config)}
                </span>
              ) : null}
            </strong>
          </div>
          <div className="product-meta-item">
            <span className="product-meta-label">{t("productDetail.pipelineStatus")}</span>
            <strong>{pipeline?.status ? statusLabel(pipeline.status) : pipelineId ? t("statuses.active") : t("productDetail.notCreated")}</strong>
          </div>
          <div className="product-meta-item">
            <span className="product-meta-label">{t("productDetail.created")}</span>
            <strong>{dateLabel(product.created_at)}</strong>
          </div>
          <div className="product-meta-item">
            <span className="product-meta-label">{t("productDetail.lastUpdated")}</span>
            <strong>{dateLabel(product.updated_at)}</strong>
          </div>
          <div className="product-meta-item">
            <span className="product-meta-label">{t("productDetail.activeStage")}</span>
            <strong>{stageLabel(activeStage?.name)}</strong>
          </div>
        </div>

        <div className="product-action-row">
          <button type="button" className="btn btn-sm" onClick={() => setTab("settings")}>
            {t("common.edit")}
          </button>
          {product.status === "ON_HOLD" ? (
            <button type="button" className="btn btn-sm" onClick={() => resumeMut.mutate()} disabled={resumeMut.isPending}>
              {t("productDetail.resume")}
            </button>
          ) : product.status !== "ARCHIVED" && !product.deleted_at ? (
            <button type="button" className="btn btn-sm" onClick={() => holdMut.mutate()} disabled={holdMut.isPending}>
              {t("productDetail.hold")}
            </button>
          ) : null}
          {product.status === "ARCHIVED" || product.deleted_at ? (
            <button type="button" className="btn btn-sm" onClick={() => restoreMut.mutate()} disabled={restoreMut.isPending}>
              {t("productDetail.restore")}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={archiveMut.isPending}
              onClick={() => setArchiveConfirmOpen(true)}
            >
              {t("productDetail.archive")}
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => duplicateProduct.mutate()} disabled={duplicateProduct.isPending}>
            {t("productDetail.duplicate")}
          </button>
          <button type="button" className="btn btn-sm" onClick={exportProductJson}>
            {t("productDetail.export")}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setTab("settings")}>
            {t("settings.title")}
          </button>
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
      </section>

      <nav className="org-tab-row product-tab-row" aria-label={t("productDetail.sections")}>
        {PRODUCT_DETAIL_TABS.map(({ id }) => (
          <button
            key={id}
            type="button"
            className={`btn btn-sm${tab === id ? " btn-primary" : ""}`}
            onClick={() => setTab(id)}
          >
            {t(`productDetail.tabs.${id}`)}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <section className="data-panel">
          <div className="product-overview-grid">
            <div className="product-stat-card">
              <h4>{t("productDetail.productHealth")}</h4>
              {health ? (
                <>
                  <p className="product-health-line">
                    {health.emoji} {t(`productDetail.health.${health.label === "Healthy" ? "healthy" : health.label === "At risk" ? "atRisk" : "critical"}`)}
                  </p>
                  <div className="product-progress-bar">
                    <span style={{ width: `${health.score}%` }} />
                  </div>
                  <p className="text-dim">{n(health.score)}{lang === "fa" ? "٪" : "%"}</p>
                </>
              ) : null}
            </div>
            <div className="product-stat-card">
              <h4>{t("productDetail.kpis")}</h4>
              <ul className="product-kpi-list">
                <li><span>{t("products.features")}</span><strong>{n(kpis.featuresTotal)}</strong></li>
                <li><span>{t("statuses.completed")}</span><strong>{n(kpis.featuresCompleted)}</strong></li>
                <li><span>{t("productDetail.open")}</span><strong>{n(kpis.featuresOpen)}</strong></li>
                <li><span>{t("statuses.delayed")}</span><strong>{n(kpis.featuresDelayed)}</strong></li>
              </ul>
            </div>
            <div className="product-stat-card">
              <h4>{t("productDetail.statistics")}</h4>
              <ul className="product-kpi-list">
                <li><span>{t("products.tasks")}</span><strong>{n(kpis.tasksTotal)}</strong></li>
                <li><span>{t("products.projects")}</span><strong>{n(kpis.projectsTotal)}</strong></li>
                <li><span>{t("common.members")}</span><strong>{n(members.length + 2)}</strong></li>
                <li><span>{t("productDetail.comments")}</span><strong>{n(commentCount)}</strong></li>
                <li><span>{t("productDetail.attachments")}</span><strong>{n(attachmentCount)}</strong></li>
              </ul>
            </div>
            <div className="product-stat-card product-stat-wide">
              <h4>{t("productDetail.stageProgress")}</h4>
              {stages.length === 0 ? (
                <p className="text-dim">{t("productDetail.createPipelineForProgress")}</p>
              ) : (
                <ul className="product-stage-progress-list">
                  {stages.map((s) => {
                    const pct = stageProgressPercent(s, instances);
                    return (
                      <li key={s.id}>
                        <span>{stageLabel(s.name)}</span>
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
              <h4>{t("productDetail.risks")}</h4>
              {risks.length === 0 ? (
                <p className="text-dim">{t("productDetail.noRisks")}</p>
              ) : (
                <ul className="product-risk-list">
                  {risks.map((r) => (
                    <li key={r.id} className={`product-risk-${r.severity}`}>
                      {r.id === "blocked-features"
                        ? t("productDetail.risk.blockedFeatures", { count: Number.parseInt(r.title, 10) || 0 })
                        : t(`productDetail.risk.${r.id === "qa-load" ? "qaLoad" : r.id}`)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {!pipelineId ? (
            <p className="text-dim" style={{ marginTop: "1rem" }}>
              {t("productDetail.noPipelineYet")}{" "}
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setTab("pipeline")}>
                {t("productDetail.setupPipeline")}
              </button>
            </p>
          ) : (
            <div className="product-pipeline-rail" style={{ marginTop: "1rem" }}>
              <h4>{t("productDetail.currentPipeline")}</h4>
              <div className="product-vertical-pipeline">
                {stages.map((s, i) => (
                  <div key={s.id} className="product-vertical-stage">
                    <span className={`pipeline-stage-dot${activeStage?.id === s.id ? " active" : ""}`} />
                    <span>{stageLabel(s.name)}</span>
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
              <h3 className="panel-title">{t("productDetail.createPipeline")}</h3>
              <p className="text-dim product-section-lead">{t("productDetail.pipelineLead")}</p>

              <FormStepper
                steps={[
                  { id: "template", label: t("productDetail.companyTemplates") },
                  { id: "name", label: t("productDetail.pipelineName") },
                  { id: "stages", label: t("productDetail.tabs.stages") },
                  { id: "preview", label: t("common.confirm") },
                ]}
                current={pipeStep}
                onStepClick={(i) => i <= pipeStep && setPipeStep(i)}
              />

              {pipeStep === 0 ? (
                <div className="pipeline-templates" style={{ marginTop: "1rem" }}>
                  {COMPANY_PIPELINE_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      className={`btn btn-sm pipeline-template-btn${selectedTemplateId === tpl.id ? " btn-primary" : ""}`}
                      onClick={() => {
                        setSelectedTemplateId(tpl.id);
                        setPipeName(`${product.name} · ${t(`productDetail.templates.${tpl.id}`)}`);
                        setStageDraft(tpl.stages.map(stageLabel).join(lang === "fa" ? "، " : ", "));
                      }}
                    >
                      {t(`productDetail.templates.${tpl.id}`)}
                      <span className="text-dim pipeline-template-stages">
                        {tpl.stages.map(stageLabel).join(lang === "fa" ? " ← " : " → ")}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {pipeStep === 1 ? (
                <div className="form-group" style={{ marginTop: "1rem" }}>
                  <label htmlFor="pipeName">{t("productDetail.pipelineName")}</label>
                  <input id="pipeName" value={pipeName} onChange={(e) => setPipeName(e.target.value)} required />
                </div>
              ) : null}

              {pipeStep === 2 ? (
                <div className="form-group" style={{ marginTop: "1rem" }}>
                  <label htmlFor="stages">{t("productDetail.stagesCommaSeparated")}</label>
                  <input id="stages" value={stageDraft} onChange={(e) => setStageDraft(e.target.value)} required />
                </div>
              ) : null}

              {pipeStep === 3 ? (
                <div className="pipeline-preview" style={{ marginTop: "1rem" }}>
                  <p className="text-dim">{t("productDetail.pipelineName")}: <strong>{pipeName}</strong></p>
                  <ol className="pipeline-preview-stages">
                    {stageDraft
                      .split(/[,،]/)
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((name, i) => (
                        <li key={`${name}-${i}`}>{name}</li>
                      ))}
                  </ol>
                </div>
              ) : null}

              <div className="modal-footer" style={{ marginTop: "1.25rem", paddingInline: 0 }}>
                {pipeStep > 0 ? (
                  <button type="button" className="btn" onClick={() => setPipeStep((s) => s - 1)}>
                    {t("common.back")}
                  </button>
                ) : (
                  <span />
                )}
                {pipeStep < 3 ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pipeStep === 0 && !selectedTemplateId}
                    onClick={() => {
                      if (pipeStep === 1 && !pipeName.trim()) return;
                      if (pipeStep === 2 && !stageDraft.trim()) return;
                      setPipeStep((s) => s + 1);
                    }}
                  >
                    {t("common.continue")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={createPipeline.isPending}
                    onClick={() => {
                      setError("");
                      createPipeline.mutate();
                    }}
                  >
                    {createPipeline.isPending ? t("productDetail.creating") : t("productDetail.createPipeline")}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <h3 className="panel-title">{t("products.pipeline")}</h3>
              <p className="text-dim">{pipeline?.name ?? t("productDetail.currentPipeline")}</p>
              <div className="product-vertical-pipeline product-vertical-pipeline-large">
                {stages.map((s, i) => (
                  <div key={s.id} className="product-vertical-stage">
                    <span className={`pipeline-stage-dot${activeStage?.id === s.id ? " active" : ""}`} />
                    <div>
                      <strong>{stageLabel(s.name)}</strong>
                      <p className="text-dim" style={{ fontSize: "0.8125rem", margin: 0 }}>
                        {departments.find((d) => d.id === s.department_id)?.name ?? t("productDetail.noDepartment")}
                      </p>
                    </div>
                    {i < stages.length - 1 ? <span className="product-vertical-arrow">↓</span> : null}
                  </div>
                ))}
              </div>
              <div className="product-action-row" style={{ marginTop: "1.25rem" }}>
                <Link href={`/planning?product_id=${product.id}`} className="btn btn-sm btn-primary">
                  {t("productDetail.planWork")}
                </Link>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "stages" && (
        <section className="data-panel">
          {!pipelineId ? (
            <EmptyState title={t("productCells.noPipeline")} description={t("productDetail.createPipelineFirst")} />
          ) : (
            <>
              <h3 className="panel-title">{t("productDetail.tabs.stages")}</h3>
              <p className="text-dim product-section-lead">
                {t("productDetail.stageBibleHint")}
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
                  placeholder={t("productDetail.addStagePlaceholder")}
                  aria-label={t("productDetail.newStageName")}
                />
                <button type="submit" className="btn btn-primary" disabled={addStage.isPending}>
                  {t("productDetail.addStage")}
                </button>
              </form>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("productDetail.order")}</th>
                      <th>{t("common.name")}</th>
                      <th>{t("profile.department")}</th>
                      <th>{t("productDetail.entryCriteria")}</th>
                      <th>{t("productDetail.exitCriteria")}</th>
                      <th>{t("common.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((s) => {
                      const inst = instances.find((i) => i.stage_id === s.id);
                      return (
                        <tr key={s.id}>
                          <td className="font-mono">{n(s.order + 1)}</td>
                          <td>{stageLabel(s.name)}</td>
                          <td>{departments.find((d) => d.id === s.department_id)?.name ?? "—"}</td>
                          <td>{s.entry_criteria || "—"}</td>
                          <td>{s.exit_criteria || "—"}</td>
                          <td><span className="status-pill">{statusLabel(inst?.status ?? "PENDING")}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="data-panel" style={{ marginTop: "1rem", padding: "1rem" }}>
                <h4 className="panel-title">{t("productDetail.executionControls")}</h4>
                <p className="text-dim">
                  {t("common.active")}: <strong>{activeStage ? stageLabel(activeStage.name) : t("productCells.notStarted")}</strong>
                </p>
                <label className="flex" style={{ alignItems: "center", gap: "0.35rem", fontSize: "0.875rem" }}>
                  <input type="checkbox" checked={exitMet} onChange={(e) => setExitMet(e.target.checked)} />
                  {t("productDetail.exitCriteriaMet")}
                </label>
                <div className="product-action-row">
                  {(product.status === "READY" || product.status === "DRAFT") && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => start.mutate()} disabled={start.isPending}>
                      {t("productDetail.startExecution")}
                    </button>
                  )}
                  {product.status === "ACTIVE" && (
                    <>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => moveNext.mutate()} disabled={moveNext.isPending}>
                        {t("productDetail.nextStage")}
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => completeStage.mutate()} disabled={completeStage.isPending}>
                        {t("productDetail.completeStage")}
                      </button>
                    </>
                  )}
                  {canReopen ? (
                    <button type="button" className="btn btn-sm" onClick={() => reopenStage.mutate()} disabled={reopenStage.isPending}>
                      {t("productDetail.reopenLast")}
                    </button>
                  ) : null}
                </div>
                {product.status === "ACTIVE" ? (
                  <div className="auth-form" style={{ marginTop: "1rem" }}>
                    <div className="form-group">
                      <label htmlFor="reject">{t("productDetail.rejectReason")}</label>
                      <input id="reject" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                    </div>
                    <button type="button" className="btn btn-sm btn-danger" disabled={!rejectReason.trim() || rejectStage.isPending} onClick={() => rejectStage.mutate()}>
                      {t("productDetail.rejectStage")}
                    </button>
                    <div className="form-group" style={{ marginTop: "0.75rem" }}>
                      <label htmlFor="move-prev">{t("productDetail.moveBackReason")}</label>
                      <input id="move-prev" value={movePrevReason} onChange={(e) => setMovePrevReason(e.target.value)} />
                    </div>
                    <button type="button" className="btn btn-sm" disabled={movePrev.isPending} onClick={() => movePrev.mutate()}>
                      {t("productDetail.movePrevious")}
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
            <h3 className="panel-title">{t("products.projects")}</h3>
            <Link href={`/planning?product_id=${product.id}`} className="btn btn-sm btn-primary">
              {t("productDetail.openPlanning")}
            </Link>
          </div>
          {projects.length === 0 ? (
            <EmptyState title={t("productDetail.noProjects")} description={t("productDetail.noProjectsHint")} />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("common.name")}</th>
                    <th>{t("common.status")}</th>
                    <th>{t("products.priority")}</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td><span className="status-pill">{statusLabel(p.status)}</span></td>
                      <td>{priorityLabel(p.priority)}</td>
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
            <h3 className="panel-title">{t("products.features")}</h3>
            <Link href={`/planning?product_id=${product.id}`} className="btn btn-sm btn-primary">
              {t("productDetail.managePlanning")}
            </Link>
          </div>
          {features.length === 0 ? (
            <EmptyState title={t("productDetail.noFeatures")} description={t("productDetail.noFeaturesHint")} />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("planning.feature")}</th>
                    <th>{t("common.status")}</th>
                    <th>{t("products.priority")}</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((f) => (
                    <tr key={f.id}>
                      <td>{f.title}</td>
                      <td><span className="status-pill">{statusLabel(f.status)}</span></td>
                      <td>{priorityLabel(f.priority)}</td>
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
          <h3 className="panel-title">{t("common.members")}</h3>
          <p className="text-dim product-section-lead">
            {t("productDetail.rolesHint")}
          </p>
          <div className="product-owner-manager-row">
            <div className="product-meta-item">
              <span className="product-meta-label">{t("products.productOwner")}</span>
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
              <span className="product-meta-label">{t("products.productManager")}</span>
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
                setMemberError(t("productDetail.selectEmployeeError"));
                return;
              }
              addMember.mutate();
            }}
            className="org-assign-row"
          >
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label htmlFor="member-emp">{t("organization.employee")}</label>
              <select id="member-emp" value={memberEmployeeId} onChange={(e) => setMemberEmployeeId(e.target.value)}>
                <option value="">{t("common.select")}</option>
                {assignableEmployees.map((e) => (
                  <option key={e.id} value={e.id}>{employeeLabel(e)}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="member-role">{t("productDetail.productRole")}</label>
              <select id="member-role" value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
                {PRODUCT_MEMBER_ROLES.map((r) => (
                  <option key={r} value={r}>{productRole(r)}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={addMember.isPending} style={{ alignSelf: "flex-end" }}>
              {t("productDetail.addMember")}
            </button>
          </form>
          {memberError ? <p className="auth-error">{memberError}</p> : null}
          <div className="table-scroll" style={{ marginTop: "1.25rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("organization.employee")}</th>
                  <th>{t("profile.department")}</th>
                  <th>{t("profile.team")}</th>
                  <th>{t("productDetail.productRole")}</th>
                  <th>{t("productDetail.assigned")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{employeeName(product.owner_id)}</td>
                  <td>{employeeContext.get(product.owner_id)?.department ?? "—"}</td>
                  <td>{employeeContext.get(product.owner_id)?.team ?? "—"}</td>
                  <td><span className="status-pill">{productRole("OWNER")}</span></td>
                  <td className="font-mono">{dateLabel(product.created_at)}</td>
                  <td />
                </tr>
                {product.manager_id ? (
                  <tr>
                    <td>{employeeName(product.manager_id)}</td>
                    <td>{employeeContext.get(product.manager_id)?.department ?? "—"}</td>
                    <td>{employeeContext.get(product.manager_id)?.team ?? "—"}</td>
                    <td><span className="status-pill">{productRole("MANAGER")}</span></td>
                    <td className="font-mono">{dateLabel(product.updated_at)}</td>
                    <td />
                  </tr>
                ) : null}
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>{employeeName(m.employee_id)}</td>
                    <td>{employeeContext.get(m.employee_id)?.department ?? "—"}</td>
                    <td>{employeeContext.get(m.employee_id)?.team ?? "—"}</td>
                    <td><span className="status-pill">{productRole(m.role)}</span></td>
                    <td className="font-mono">{dateLabel(m.created_at)}</td>
                    <td className="actions-cell">
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => removeMember.mutate(m.employee_id)}>
                        {t("common.remove")}
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
          <h3 className="panel-title">{t("settings.title")}</h3>
          <div style={{ marginBottom: "1.25rem" }}>
            <ExecutionModelPicker
              model={modelKey}
              customLevelsJson={customLevelsJson}
              onModelChange={setModelKey}
              onCustomLevelsChange={setCustomLevelsJson}
              locked={!product.execution_model_unlocked}
            />
            {product.execution_model_unlocked ? (
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginTop: "0.75rem" }}
                disabled={updateProduct.isPending || modelKey === product.execution_model}
                onClick={() => {
                  setSaveError("");
                  let execution_levels: { label: string }[] | undefined;
                  if (modelKey === "CUSTOM") {
                    try {
                      execution_levels = JSON.parse(customLevelsJson) as { label: string }[];
                    } catch {
                      execution_levels = [{ label: "Theme" }, { label: "Ticket" }];
                    }
                  }
                  updateProduct.mutate({
                    execution_model: modelKey,
                    execution_levels,
                  });
                }}
              >
                {t("workModels.saveModel")}
              </button>
            ) : null}
          </div>
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
                  <label htmlFor="p-name">{t("common.name")}</label>
                  <input id="p-name" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label htmlFor="p-code">{t("productDetail.code")}</label>
                  <input id="p-code" value={form.code ?? ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label htmlFor="p-category">{t("products.category")}</label>
                  <input id="p-category" value={form.category ?? ""} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label htmlFor="p-type">{t("products.productType")}</label>
                  <input id="p-type" value={form.product_type ?? ""} onChange={(e) => setForm((f) => ({ ...f, product_type: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label htmlFor="p-priority">{t("products.priority")}</label>
                  <select id="p-priority" value={form.priority ?? ""} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>{priorityLabel(p)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p-visibility">{t("products.visibility")}</label>
                  <select id="p-visibility" value={form.visibility ?? ""} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))}>
                    {VISIBILITY_OPTIONS.map((v) => (
                      <option key={v} value={v}>{t(`productDetail.visibility.${v.toLowerCase()}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="p-desc">{t("common.description")}</label>
                  <textarea id="p-desc" rows={3} value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="p-vision">{t("products.vision")}</label>
                  <textarea id="p-vision" rows={2} value={form.vision ?? ""} onChange={(e) => setForm((f) => ({ ...f, vision: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="p-goal">{t("products.goal")}</label>
                  <textarea id="p-goal" rows={2} value={form.goal ?? ""} onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="p-metrics">{t("products.successMetrics")}</label>
                  <textarea id="p-metrics" rows={2} value={form.success_metrics ?? ""} onChange={(e) => setForm((f) => ({ ...f, success_metrics: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="p-value">{t("products.businessValue")}</label>
                  <textarea id="p-value" rows={2} value={form.business_value ?? ""} onChange={(e) => setForm((f) => ({ ...f, business_value: e.target.value }))} />
                </div>
              </div>
              {saveError ? <p className="auth-error">{saveError}</p> : null}
              <button type="submit" className="btn btn-primary" disabled={updateProduct.isPending}>
                {updateProduct.isPending ? t("common.saving") : t("settings.saveSettings")}
              </button>
            </form>
          <div style={{ marginTop: "1.5rem" }}>
            <CollaborationPanel entityType="product" entityID={product.id} variant="comments" />
          </div>
        </section>
      )}

      <ConfirmDialog
        open={archiveConfirmOpen}
        title={t("common.confirmArchive")}
        description={t("productDetail.archiveConfirm", { name: product.name })}
        confirmLabel={t("productDetail.archive")}
        tone="danger"
        busy={archiveMut.isPending}
        onCancel={() => !archiveMut.isPending && setArchiveConfirmOpen(false)}
        onConfirm={() => {
          archiveMut.mutate(undefined, { onSettled: () => setArchiveConfirmOpen(false) });
        }}
      />
    </div>
  );
}
