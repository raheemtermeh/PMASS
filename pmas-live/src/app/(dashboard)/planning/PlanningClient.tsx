"use client";

import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageGuide } from "@/components/PageGuide";
import { WorkMapGuide } from "@/components/WorkMapGuide";
import { MoreMenu } from "@/components/MoreMenu";
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
import {
  priorityBadgeClass,
  statusBadgeClass,
} from "@/features/planning/badges";
import { useI18n } from "@/core/providers/I18nProvider";
import { localizedEnumLabel, priorityTranslationKey, statusTranslationKey } from "@/lib/localized-labels";
import {
  hasStorage,
  labelForStorage,
  resolveProductConfig,
} from "@/features/products/work-models";
import { useScrollOnDependency } from "@/shared/hooks/useScrollOnDependency";

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

function fromDateInput(value?: string | null): string | null {
  if (value == null || !String(value).trim()) return null;
  return new Date(`${String(value).trim()}T12:00:00.000Z`).toISOString();
}

export default function PlanningClient() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const localizeStatuses = (options: { value: string; label: string }[]) =>
    options.map((option) => ({
      ...option,
      label: localizedEnumLabel(option.value, statusTranslationKey(option.value), t),
    }));
  const projectStatusOptions = localizeStatuses(PROJECT_STATUSES);
  const featureStatusOptions = localizeStatuses(FEATURE_STATUSES);
  const taskStatusOptions = localizeStatuses(TASK_STATUSES);
  const priorityOptions = PRIORITY_OPTIONS.map((option) => ({
    ...option,
    label: localizedEnumLabel(option.value, priorityTranslationKey(option.value), t),
  }));
  const search = useSearchParams();
  const initialProduct = search.get("product_id") ?? "";
  const newIntent = search.get("new");
  const [productId, setProductId] = useState(initialProduct);
  const [projectId, setProjectId] = useState("");
  const [featureId, setFeatureId] = useState("");
  const [taskFilter, setTaskFilter] = useState<"all" | "mine" | "open">("all");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [depsError, setDepsError] = useState("");
  const [checklistTitle, setChecklistTitle] = useState("");
  const [checklistError, setChecklistError] = useState("");
  const [softDeleteTarget, setSoftDeleteTarget] = useState<Project | null>(null);
  const featureSelectSeq = useRef(0);

  const selectProject = (id: string | number) => {
    setProjectId(String(id));
    setFeatureId("");
    setSelectedTaskId("");
  };

  const selectFeature = (id: string | number) => {
    featureSelectSeq.current += 1;
    setFeatureId(String(id));
    setSelectedTaskId("");
  };

  const { data: products = [] } = useQuery({
    queryKey: ["vsm-products", "list", 100],
    queryFn: () => httpClient.get<Product[]>("/api/v1/products?page_size=100"),
    staleTime: 30_000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["vsm-employees", "list", 100],
    queryFn: () => httpClient.get<Employee[]>("/api/v1/employees?page_size=100"),
    staleTime: 60_000,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["vsm-teams", "list", 100],
    queryFn: () => httpClient.get<Team[]>("/api/v1/teams?page_size=100"),
    enabled: Boolean(projectId) || Boolean(productId),
    staleTime: 60_000,
  });

  const selectedProduct = products.find((p) => p.id === productId) ?? null;
  const execConfig = selectedProduct ? resolveProductConfig(selectedProduct) : null;
  const showProjects = !productId || hasStorage(execConfig, "project");
  const showFeatures = !productId || hasStorage(execConfig, "feature");
  const projectLabel = labelForStorage(execConfig, "project", t("planning.projects"));
  const featureLabel = labelForStorage(execConfig, "feature", t("planning.features"));
  const taskLabel = labelForStorage(execConfig, "task", t("planning.tasks"));

  const projectsPath = productId
    ? `/api/v1/projects?product_id=${productId}`
    : "/api/v1/projects";

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["vsm-projects", productId],
    queryFn: () => httpClient.get<Project[]>(projectsPath),
    enabled: showProjects,
    staleTime: 20_000,
  });

  const featuresQueryUrl = (() => {
    if (showFeatures && showProjects && projectId) {
      return `/api/v1/features?project_id=${projectId}&page_size=100`;
    }
    if (showFeatures && !showProjects && productId) {
      return `/api/v1/features?product_id=${productId}&page_size=100`;
    }
    return "";
  })();

  const { data: features = [], isLoading: featuresLoading } = useQuery({
    queryKey: ["vsm-features", projectId, productId, showProjects],
    queryFn: () => httpClient.get<Feature[]>(featuresQueryUrl),
    enabled: Boolean(featuresQueryUrl),
    staleTime: 20_000,
  });

  const tasksQueryUrl = (() => {
    if (showFeatures && featureId) {
      return `/api/v1/tasks?feature_id=${featureId}&page_size=100`;
    }
    if (!showFeatures && showProjects && projectId) {
      return `/api/v1/tasks?project_id=${projectId}&page_size=100`;
    }
    if (!showFeatures && !showProjects && productId) {
      return `/api/v1/tasks?product_id=${productId}&page_size=100`;
    }
    return "";
  })();

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["vsm-tasks", featureId, projectId, productId, showFeatures, showProjects],
    queryFn: () => httpClient.get<Task[]>(tasksQueryUrl),
    enabled: Boolean(tasksQueryUrl),
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
  const selectedFeature = features.find((f) => String(f.id) === featureId) ?? null;

  // Auto-scroll to the next cascade level when a parent selection changes.
  const projectsScrollKey = showProjects && productId ? productId : "";
  const featuresScrollKey =
    showFeatures && (showProjects ? projectId : productId)
      ? showProjects
        ? projectId
        : productId
      : "";
  const tasksScrollKey = showFeatures
    ? featureId
    : showProjects
      ? projectId
      : productId;
  const projectsSectionRef = useScrollOnDependency<HTMLDivElement>(projectsScrollKey, { block: "start" });
  const featuresSectionRef = useScrollOnDependency<HTMLDivElement>(featuresScrollKey, { block: "start" });
  const tasksSectionRef = useScrollOnDependency<HTMLDivElement>(tasksScrollKey, { block: "start" });
  const checklistSectionRef = useScrollOnDependency<HTMLElement>(selectedTaskId, { block: "start" });

  function onAddChecklistItem(e: FormEvent) {
    e.preventDefault();
    setChecklistError("");
    if (!checklistTitle.trim()) return;
    addChecklistItem.mutate(checklistTitle.trim());
  }

  return (
    <div className="page-stack">
      <PageGuide page="planning" />
      <WorkMapGuide
        config={execConfig}
        activeStorage={
          !showProjects && !showFeatures
            ? "task"
            : !showProjects
              ? "feature"
              : "project"
        }
        compact
      />

      <section className="data-panel">
        <h2 className="panel-title" style={{ marginBottom: "0.5rem" }}>
          {t("planning.cascade")}
        </h2>
        <p className="text-dim planning-cascade-hint">
          {execConfig?.levels?.length
            ? `${t("planning.workMapIntro")} · ${execConfig.levels.map((l) => l.label).join(" → ")}`
            : t("planning.workMapIntro")}
        </p>
        {productId && products.find((p) => p.id === productId) ? (
          <p className="text-dim" style={{ fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
            {t("planning.productContext")}:{" "}
            <Link href={`/products/${productId}`} className="planning-product-link">
              {products.find((p) => p.id === productId)?.name}
            </Link>
          </p>
        ) : null}
        <div className="form-group" style={{ maxWidth: 420 }}>
          <label htmlFor="product">{t("products.product")}</label>
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
            <option value="">{t("filters.allProducts")}</option>
            {productOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {showProjects ? (
      <div ref={projectsSectionRef}>
      <ResourceManager
        title={projectLabel}
        description={t("planning.selectProductHint")}
        createLabel={`${t("common.create")} ${projectLabel}`}
        emptyTitle={t("planning.noProjects")}
        emptyDescription={
          productId
            ? t("planning.createFirstProject")
            : t("planning.selectProductFirst")
        }
        isLoading={projectsLoading}
        items={projects}
        selectedRowId={projectId || null}
        onRowSelect={(row) => selectProject(row.id)}
        createDefaults={productId ? { product_id: productId } : undefined}
        autoOpenCreate={newIntent === "project"}
        createFields={[
          {
            name: "product_id",
            label: t("products.product"),
            type: "select",
            required: true,
            options: productOptions,
          },
          { name: "name", label: t("common.name"), required: true },
          { name: "description", label: t("common.description"), type: "textarea" },
        ]}
        columns={[
          {
            key: "name",
            label: t("planning.project"),
            render: (r) => (
              <>
                {r.name}
                {r.code ? <span className="text-dim"> · {r.code}</span> : null}
              </>
            ),
          },
          {
            key: "status",
            label: t("common.status"),
            render: (r) => (
              <span className={`badge ${statusBadgeClass(r.status)}`}>
                {localizedEnumLabel(r.status, statusTranslationKey(r.status), t)}
              </span>
            ),
          },
          {
            key: "priority",
            label: t("planning.priority"),
            render: (r) =>
              r.priority ? (
                <span className={`priority-pill ${priorityBadgeClass(r.priority)}`}>
                  {localizedEnumLabel(r.priority, priorityTranslationKey(r.priority), t)}
                </span>
              ) : (
                "—"
              ),
          },
          {
            key: "owner",
            label: t("common.owner"),
            render: (r) => (r.owner_id ? assigneeName(r.owner_id) : "—"),
          },
          {
            key: "product",
            label: t("products.product"),
            render: (r) => {
              const product = products.find((p) => p.id === r.product_id);
              if (!product) return "—";
              return (
                <Link href={`/products/${product.id}`} className="planning-product-link">
                  {product.name}
                </Link>
              );
            },
          },
        ]}
        fields={[
          {
            name: "product_id",
            label: t("products.product"),
            type: "select",
            required: true,
            options: productOptions,
          },
          { name: "name", label: t("common.name"), required: true },
          { name: "code", label: t("common.code") },
          {
            name: "priority",
            label: t("planning.priority"),
            type: "select",
            options: priorityOptions,
          },
          {
            name: "status",
            label: t("common.status"),
            type: "select",
            options: projectStatusOptions,
          },
          { name: "owner_id", label: t("common.owner"), type: "select", options: empOptions },
          { name: "manager_id", label: t("common.manager"), type: "select", options: empOptions },
          { name: "start_date", label: t("common.startDate"), type: "date" },
          { name: "target_end_date", label: t("planning.targetEndDate"), type: "date" },
          { name: "goal", label: t("planning.goal"), type: "textarea" },
          { name: "description", label: t("common.description"), type: "textarea" },
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
          description: r.description ?? "",
        })}
        onCreate={async (v) => {
          const pid = String(v.product_id || productId || "").trim();
          if (!pid) throw new Error(t("errors.selectProduct"));
          const name = String(v.name ?? "").trim();
          if (!name) throw new Error(t("errors.nameIsRequired"));
          const body: Record<string, unknown> = {
            product_id: pid,
            name,
            description: String(v.description ?? ""),
          };
          if (v.code?.trim()) body.code = v.code.trim();
          if (v.goal?.trim()) body.goal = v.goal.trim();
          if (v.priority?.trim()) body.priority = v.priority.trim();
          if (v.status?.trim()) body.status = v.status.trim();
          if (v.owner_id?.trim()) body.owner_id = v.owner_id.trim();
          if (v.manager_id?.trim()) body.manager_id = v.manager_id.trim();
          const start = fromDateInput(v.start_date);
          const end = fromDateInput(v.target_end_date);
          if (start) body.start_date = start;
          if (end) body.target_end_date = end;
          const created = await createProject.mutateAsync(body);
          setProductId(pid);
          const id = (created as Project | undefined)?.id;
          if (id) {
            selectProject(id);
          }
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
          <MoreMenu
            items={
              row.deleted_at
                ? [
                    {
                      id: "restore",
                      label: t("common.restore"),
                      onClick: () => restoreProject.mutate(row.id),
                    },
                  ]
                : [
                    {
                      id: "soft-delete",
                      label: t("planning.softDelete"),
                      tone: "danger",
                      onClick: () => setSoftDeleteTarget(row),
                    },
                  ]
            }
          />
        )}
      />
      </div>
      ) : null}

      {showFeatures && (showProjects ? Boolean(projectId) : Boolean(productId)) ? (
        <div ref={featuresSectionRef}>
        <ResourceManager
          title={featureLabel}
          description={t("planning.projectQuickHint")}
          createLabel={`${t("common.create")} ${featureLabel}`}
          emptyTitle={t("planning.noFeatures")}
          emptyDescription={t("emptyStates.noFeatures")}
          isLoading={featuresLoading}
          items={features}
          selectedRowId={featureId || null}
          onRowSelect={(row) => selectFeature(row.id)}
          autoOpenCreate={newIntent === "feature"}
          quickCreate={{
            placeholder: t("planning.quickFeaturePlaceholder"),
            fieldName: "title",
            showAddHint: true,
            defaults: { priority: "MEDIUM" },
          }}
          createFields={[
            { name: "title", label: t("common.title"), required: true },
            {
              name: "priority",
              label: t("planning.priority"),
              type: "select",
              options: priorityOptions,
            },
          ]}
          columns={[
            {
              key: "title",
              label: t("planning.feature"),
              render: (r) => (
                <>
                  {r.title}
                  {r.code ? <span className="text-dim"> · {r.code}</span> : null}
                </>
              ),
            },
            {
              key: "priority",
              label: t("planning.priority"),
              render: (r) =>
                r.priority ? (
                  <span className={`priority-pill ${priorityBadgeClass(r.priority)}`}>
                    {localizedEnumLabel(r.priority, priorityTranslationKey(r.priority), t)}
                  </span>
                ) : (
                  "—"
                ),
            },
            {
              key: "owner",
              label: t("common.owner"),
              render: (r) => (r.owner_id ? assigneeName(r.owner_id) : "—"),
            },
            {
              key: "team",
              label: t("organization.team"),
              render: (r) => teams.find((t) => t.id === r.team_id)?.name ?? "—",
            },
            {
              key: "status",
              label: t("common.status"),
              render: (r) => (
                <span className={`badge ${statusBadgeClass(r.status)}`}>
                  {localizedEnumLabel(r.status, statusTranslationKey(r.status), t)}
                </span>
              ),
            },
          ]}
          fields={[
            { name: "title", label: t("common.title"), required: true },
            { name: "code", label: t("common.code") },
            {
              name: "priority",
              label: t("planning.priority"),
              type: "select",
              options: priorityOptions,
            },
            {
              name: "feature_type",
              label: t("planning.featureType"),
              options: [
                { value: "STORY", label: t("planning.featureTypes.story") },
                { value: "BUG", label: t("planning.featureTypes.bug") },
                { value: "IMPROVEMENT", label: t("planning.featureTypes.improvement") },
                { value: "SPIKE", label: t("planning.featureTypes.spike") },
              ],
              type: "select",
            },
            { name: "owner_id", label: t("common.owner"), type: "select", options: empOptions },
            { name: "team_id", label: t("common.team"), type: "select", options: teamOptions },
            {
              name: "parent_feature_id",
              label: t("planning.parentFeature"),
              type: "select",
              options: features.map((f) => ({ value: f.id, label: f.title })),
            },
            { name: "start_date", label: t("common.startDate"), type: "date" },
            { name: "target_end_date", label: t("planning.targetEndDate"), type: "date" },
            { name: "estimated_effort", label: t("planning.estimatedEffort"), type: "number" },
            { name: "goal", label: t("planning.goal"), type: "textarea" },
            { name: "description", label: t("common.description"), type: "textarea" },
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
            const seqAtCreate = featureSelectSeq.current;
            const body: Record<string, unknown> = {
              title: v.title,
              priority: v.priority || "MEDIUM",
            };
            if (showProjects) {
              body.project_id = projectId;
            } else {
              body.product_id = productId;
            }
            const created = await createFeature.mutateAsync(body);
            const id = (created as Feature | undefined)?.id;
            if (id && seqAtCreate === featureSelectSeq.current) {
              setFeatureId(String(id));
              setSelectedTaskId("");
            }
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
            <MoreMenu
              leading={
                <select
                  className="btn btn-sm"
                  aria-label={`${t("common.status")}: ${row.title}`}
                  value={row.status}
                  onChange={(e) =>
                    changeFeatureStatus.mutate({ id: row.id, status: e.target.value })
                  }
                  style={{ maxWidth: 140 }}
                >
                  {featureStatusOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              }
              items={
                row.status === "ARCHIVED" || row.deleted_at
                  ? [
                      {
                        id: "restore",
                        label: t("common.restore"),
                        onClick: () => restoreFeature.mutate(row.id),
                      },
                    ]
                  : []
              }
            />
          )}
        />
        </div>
      ) : null}

      {showFeatures && featureId ? (
        <section className="data-panel">
          <h3 className="panel-title" style={{ marginBottom: "0.5rem" }}>
            {t("planning.featureDependencies")}
          </h3>
          <p className="text-dim" style={{ fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            {t("planning.featureDependenciesHint")}
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
              <p className="text-dim">{t("planning.noOtherFeatures")}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {showFeatures && showProjects && projectId && !featureId ? (
        <section className="data-panel">
          <EmptyState
            title={t("planning.selectFeature")}
            description={t("planning.featureHint")}
          />
        </section>
      ) : null}

      {(showFeatures ? Boolean(featureId) : showProjects ? Boolean(projectId) : Boolean(productId)) ? (
        <div ref={tasksSectionRef} className="page-stack">
          <div className="org-tab-row" style={{ marginBottom: "-0.5rem" }}>
            {(
              [
                ["all", t("planning.allTasks")],
                ["open", t("planning.openTasks")],
                ["mine", t("planning.myTasks")],
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
            title={
              selectedFeature
                ? `${taskLabel} — ${selectedFeature.title}`
                : taskLabel
            }
            description={t("planning.taskHint")}
            createLabel={`${t("common.create")} ${taskLabel}`}
            emptyTitle={t("planning.noTasks")}
            emptyDescription={t("emptyStates.noTasks")}
            isLoading={tasksLoading}
            items={filteredTasks}
            quickCreate={{
              placeholder: t("planning.quickTaskPlaceholder"),
              fieldName: "title",
              defaults: { priority: "MEDIUM" },
              showAddHint: true,
            }}
            autoOpenCreate={newIntent === "task"}
            createFields={[
              { name: "title", label: t("common.title"), required: true },
              {
                name: "priority",
                label: t("planning.priority"),
                type: "select",
                options: priorityOptions,
              },
              {
                name: "assignee_id",
                label: t("planning.assignee"),
                type: "select",
                options: empOptions,
              },
            ]}
            columns={[
              {
                key: "title",
                label: t("planning.task"),
                render: (r) => (
                  <button type="button" className="btn btn-sm" onClick={() => setSelectedTaskId(r.id)}>
                    {r.title}
                  </button>
                ),
              },
              {
                key: "priority",
                label: t("planning.priority"),
                render: (r) =>
                  r.priority ? (
                    <span className={`priority-pill ${priorityBadgeClass(r.priority)}`}>
                      {localizedEnumLabel(r.priority, priorityTranslationKey(r.priority), t)}
                    </span>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "assignee",
                label: t("planning.assignee"),
                render: (r) => assigneeName(r.assignee_id),
              },
              {
                key: "due_date",
                label: t("common.due"),
                render: (r) => (r.due_date ? toDateInput(r.due_date) : "—"),
              },
              {
                key: "status",
                label: t("common.status"),
                render: (r) => (
                  <span className={`badge ${statusBadgeClass(r.status)}`}>
                    {localizedEnumLabel(r.status, statusTranslationKey(r.status), t)}
                  </span>
                ),
              },
            ]}
            fields={[
              { name: "title", label: t("common.title"), required: true },
              {
                name: "priority",
                label: t("planning.priority"),
                type: "select",
                options: priorityOptions,
              },
              {
                name: "task_type",
                label: t("planning.taskType"),
                type: "select",
                options: [
                  { value: "GENERAL", label: t("planning.taskTypes.general") },
                  { value: "BUG", label: t("planning.taskTypes.bug") },
                  { value: "REVIEW", label: t("planning.taskTypes.review") },
                  { value: "DOCS", label: t("planning.taskTypes.docs") },
                ],
              },
              {
                name: "assignee_id",
                label: t("planning.assignee"),
                type: "select",
                options: empOptions,
              },
              { name: "start_date", label: t("common.startDate"), type: "date" },
              { name: "due_date", label: t("common.dueDate"), type: "date" },
              { name: "estimated_minutes", label: t("planning.estimatedMinutes"), type: "number" },
              { name: "actual_minutes", label: t("planning.actualMinutes"), type: "number" },
              {
                name: "status",
                label: t("common.status"),
                type: "select",
                options: taskStatusOptions,
              },
              { name: "description", label: t("common.description"), type: "textarea" },
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
              const body: Record<string, unknown> = {
                title: v.title,
                priority: v.priority || "MEDIUM",
                assignee_id: assignee,
                due_date: fromDateInput(v.due_date ?? ""),
              };
              if (showFeatures) {
                body.feature_id = featureId;
              } else if (showProjects) {
                body.project_id = projectId;
              } else {
                body.product_id = productId;
              }
              const created = await createTask.mutateAsync(body);
              const id = (created as Task | undefined)?.id;
              if (id) setSelectedTaskId(id);
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
            extraActions={(row) => {
              const items: { id: string; label: string; onClick: () => void; tone?: "danger" | "default" }[] = [];
              if (row.status !== "COMPLETED" && row.status !== "ARCHIVED" && row.status !== "DONE") {
                items.push({
                  id: "complete",
                  label: t("planning.completeTask"),
                  onClick: () => completeTask.mutate(row.id),
                });
              }
              if (row.status !== "BLOCKED" && row.status !== "ARCHIVED") {
                items.push({
                  id: "block",
                  label: t("planning.blockTask"),
                  tone: "danger",
                  onClick: () => rejectTask.mutate(row.id),
                });
              }
              if (row.status === "ON_HOLD") {
                items.push({
                  id: "resume",
                  label: t("planning.resumeTask"),
                  onClick: () => resumeTask.mutate(row.id),
                });
              } else if (
                row.status !== "COMPLETED" &&
                row.status !== "CANCELLED" &&
                row.status !== "ARCHIVED"
              ) {
                items.push({
                  id: "pause",
                  label: t("planning.pauseTask"),
                  onClick: () => pauseTask.mutate(row.id),
                });
              }
              if (row.status === "COMPLETED" || row.status === "CANCELLED") {
                items.push({
                  id: "reopen",
                  label: t("planning.reopenTask"),
                  onClick: () => reopenTask.mutate(row.id),
                });
              }
              return <MoreMenu items={items} />;
            }}
          />

          {selectedTask ? (
            <section ref={checklistSectionRef} className="data-panel">
              <div className="panel-header">
                <h3 className="panel-title">Checklist — {selectedTask.title}</h3>
                <button type="button" className="btn btn-sm" onClick={() => setSelectedTaskId("")}>
                  {t("planning.closeChecklist")}
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
                {checklist.length === 0 ? (
                  <li className="text-dim">{t("planning.noChecklistItems")}</li>
                ) : null}
              </ul>
              <form className="auth-form" onSubmit={onAddChecklistItem}>
                <div className="form-group">
                  <label htmlFor="checklist-item">{t("planning.newChecklistItem")}</label>
                  <input
                    id="checklist-item"
                    value={checklistTitle}
                    onChange={(e) => setChecklistTitle(e.target.value)}
                    placeholder={t("planning.checklistPlaceholder")}
                  />
                </div>
                {checklistError ? <p className="auth-error">{checklistError}</p> : null}
                <button type="submit" className="btn btn-sm btn-primary" disabled={addChecklistItem.isPending}>
                  {t("planning.addItem")}
                </button>
              </form>
            </section>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(softDeleteTarget)}
        title={t("common.confirmDelete")}
        description={
          softDeleteTarget
            ? `${t("planning.softDelete")}: «${softDeleteTarget.name}»`
            : undefined
        }
        confirmLabel={t("planning.softDelete")}
        tone="danger"
        busy={softDeleteProject.isPending}
        onCancel={() => !softDeleteProject.isPending && setSoftDeleteTarget(null)}
        onConfirm={() => {
          if (!softDeleteTarget) return;
          softDeleteProject.mutate(softDeleteTarget.id, {
            onSettled: () => setSoftDeleteTarget(null),
          });
        }}
      />
    </div>
  );
}
