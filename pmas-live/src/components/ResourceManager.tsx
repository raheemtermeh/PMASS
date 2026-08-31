"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { FormStepper } from "@/components/FormStepper";
import { ModalPortal } from "@/components/ModalPortal";
import { MoreMenu, type MoreMenuItem } from "@/components/MoreMenu";
import { SkeletonTable } from "@/components/Skeleton";
import { sanitizeDisplayText } from "@/shared/security";
import { useI18n } from "@/core/providers/I18nProvider";

export type FieldType = "text" | "number" | "select" | "textarea" | "password" | "date";

export interface FieldDef {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[] | ((values: Record<string, string>) => { value: string; label: string }[]);
  emptyOptionLabel?: string;
  step?: string;
  /** Helper / glossary text under the field. */
  helperText?: string;
  /**
   * Create-wizard step (1 = basics, 2 = details, 3 = strategy).
   * Fields without createStep appear in step 1.
   */
  createStep?: 1 | 2 | 3;
  /** Collapse optional long text areas behind a toggle. */
  collapsible?: boolean;
  /** Disable the control (e.g. dependent dropdowns). */
  disabled?: boolean;
  /** Optional field group label (Personal, Contact, etc.). */
  group?: string;
}

interface ResourceManagerProps<T extends { id: string | number }> {
  title: string;
  description?: string;
  columns: { key: string; label: string; render?: (row: T) => ReactNode }[];
  /** Fields shown when editing an existing row. */
  fields: FieldDef[];
  /**
   * Fields shown in the create modal. Defaults to `fields`.
   * Pass a short list (e.g. title + priority) to keep creation light.
   */
  createFields?: FieldDef[];
  /** Initial values merged into the create form when opening the modal. */
  createDefaults?: Record<string, string>;
  items: T[];
  isLoading?: boolean;
  emptyTitle: string;
  emptyDescription: string;
  createLabel?: string;
  hideEdit?: boolean;
  hideDelete?: boolean;
  /** Label for the destructive row action (default: Delete). */
  deleteLabel?: string;
  /** Confirm dialog verb (default: deleteLabel). */
  deleteConfirmVerb?: string;
  /** Optional confirm body explaining soft-archive / deactivate semantics. */
  deleteConfirmDescription?: string;
  /** Put destructive action in the ⋮ menu; keep Edit as primary. */
  destructiveInMenu?: boolean;
  /** Optional toolbar above the table (search/filters). */
  toolbar?: ReactNode;
  /** Client-side page size; 0/undefined = show all. */
  pageSize?: number;
  /** Inline one-line composer above the table (Enter to create). */
  quickCreate?: {
    placeholder: string;
    fieldName?: string;
    disabled?: boolean;
    disabledHint?: string;
    defaults?: Record<string, string>;
    /** Explicit Add button label (defaults to common.add). */
    addLabel?: string;
    /** Show Enter / Add shortcut hint under the composer. */
    showAddHint?: boolean;
  };
  /** Widen modal for multi-step / dense forms. */
  wideModal?: boolean;
  /** Open create modal when true (e.g. deep-link ?new=1). */
  autoOpenCreate?: boolean;
  /** Optional hint shown at the top of each create-wizard step. */
  createStepHints?: Partial<Record<1 | 2 | 3, string>>;
  /**
   * Extra UI injected into the create modal (e.g. execution model picker).
   * Called with current form values so the slot can read/write fields.
   */
  createSlot?: (ctx: {
    values: Record<string, string>;
    setValue: (name: string, value: string) => void;
    step: number;
    editing: boolean;
  }) => ReactNode;
  onCreate: (values: Record<string, string>) => Promise<void> | void;
  onUpdate?: (id: string | number, values: Record<string, string>) => Promise<void> | void;
  onDelete?: (id: string | number) => Promise<void> | void;
  toFormValues?: (row: T) => Record<string, string>;
  /** Primary row action (e.g. Open). Shown before the ⋮ menu when compactActions. */
  primaryAction?: (row: T) => ReactNode;
  /** Secondary / destructive items for the ⋮ overflow menu. */
  moreActions?: (row: T) => MoreMenuItem[];
  /** Group Edit / Delete / extras in ⋮ (default true). */
  compactActions?: boolean;
  /** Skip built-in create modal — use onRequestCreate instead. */
  externalCreate?: boolean;
  /** Called when user clicks create; return false to cancel opening. */
  onRequestCreate?: () => boolean | void;
  extraActions?: (row: T) => ReactNode;
  /** Highlights and enables click-to-select on table rows. */
  selectedRowId?: string | number | null;
  onRowSelect?: (row: T) => void;
}

function blankValues(fields: FieldDef[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.name, ""]));
}

export function ResourceManager<T extends { id: string | number }>({
  title,
  description,
  columns,
  fields,
  createFields,
  createDefaults,
  items,
  isLoading,
  emptyTitle,
  emptyDescription,
  createLabel,
  hideEdit,
  hideDelete,
  deleteLabel,
  deleteConfirmDescription,
  destructiveInMenu,
  toolbar,
  pageSize,
  quickCreate,
  wideModal,
  autoOpenCreate,
  createStepHints,
  createSlot,
  onCreate,
  onUpdate,
  onDelete,
  toFormValues,
  primaryAction,
  moreActions,
  compactActions = true,
  externalCreate,
  onRequestCreate,
  extraActions,
  selectedRowId,
  onRowSelect,
}: ResourceManagerProps<T>) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [values, setValues] = useState<Record<string, string>>(blankValues(fields));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState("");
  const [page, setPage] = useState(1);
  const [createStepIndex, setCreateStepIndex] = useState(0);
  const [expandedOptional, setExpandedOptional] = useState<Record<string, boolean>>({});
  const [pendingDelete, setPendingDelete] = useState<T | null>(null);
  const [pendingUnsaved, setPendingUnsaved] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const safeItems = Array.isArray(items) ? items : [];
  const activeFields = editing ? fields : createFields ?? fields;
  const quickField = quickCreate?.fieldName ?? "title";
  const resolvedCreateLabel = createLabel ?? t("common.add");
  const resolvedDeleteLabel = deleteLabel ?? t("common.delete");

  const maxCreateStep = useMemo(() => {
    const defs = createFields ?? fields;
    return Math.max(1, ...defs.map((f) => f.createStep ?? 1));
  }, [createFields, fields]);

  const createUsesWizard = useMemo(() => {
    if (editing) return false;
    return maxCreateStep > 1;
  }, [editing, maxCreateStep]);

  const wizardSteps = useMemo(() => {
    const steps: { id: string; label: string }[] = [
      { id: "basics", label: t("productWizard.stepBasics") },
    ];
    if (maxCreateStep >= 2) steps.push({ id: "details", label: t("productWizard.stepDetails") });
    if (maxCreateStep >= 3) steps.push({ id: "strategy", label: t("productWizard.stepStrategy") });
    return steps;
  }, [maxCreateStep, t]);

  const isLastWizardStep = createStepIndex >= wizardSteps.length - 1;

  const visibleFormFields = useMemo(() => {
    if (!createUsesWizard || editing) return activeFields;
    const stepNum = (createStepIndex + 1) as 1 | 2 | 3;
    return activeFields.filter((f) => (f.createStep ?? 1) === stepNum);
  }, [activeFields, createUsesWizard, createStepIndex, editing]);

  const paged = useMemo(() => {
    if (!pageSize || pageSize <= 0) return { rows: safeItems, totalPages: 1 };
    const totalPages = Math.max(1, Math.ceil(safeItems.length / pageSize));
    const current = Math.min(page, totalPages);
    const start = (current - 1) * pageSize;
    return { rows: safeItems.slice(start, start + pageSize), totalPages, current };
  }, [safeItems, pageSize, page]);

  const visibleRows = paged.rows;
  const totalPages = paged.totalPages;
  const currentPage = "current" in paged && paged.current ? paged.current : page;

  useEffect(() => {
    if (autoOpenCreate) openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenCreate]);

  function openCreate() {
    if (onRequestCreate) {
      const ok = onRequestCreate();
      if (ok === false) return;
    }
    if (externalCreate) return;
    setEditing(null);
    setValues({ ...blankValues(createFields ?? fields), ...(createDefaults ?? {}) });
    setError("");
    setCreateStepIndex(0);
    setExpandedOptional({});
    setDirty(false);
    setOpen(true);
  }

  function openEdit(row: T) {
    setEditing(row);
    setValues(toFormValues ? toFormValues(row) : blankValues(fields));
    setError("");
    setCreateStepIndex(0);
    setExpandedOptional({});
    setDirty(false);
    setOpen(true);
  }

  function requestClose() {
    if (busy) return;
    if (dirty) {
      setPendingUnsaved(true);
      return;
    }
    setOpen(false);
  }

  function forceClose() {
    setPendingUnsaved(false);
    setDirty(false);
    setOpen(false);
  }

  function setField(name: string, value: string) {
    setDirty(true);
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (createUsesWizard && !editing && !isLastWizardStep) {
      const stepNum = (createStepIndex + 1) as 1 | 2 | 3;
      const stepFields = activeFields.filter((f) => (f.createStep ?? 1) === stepNum);
      const missing = stepFields.find((f) => f.required && !String(values[f.name] ?? "").trim());
      if (missing) {
        setError(`${missing.label}: ${t("common.required")}`);
        return;
      }
      setError("");
      setCreateStepIndex((i) => i + 1);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing) {
        if (!onUpdate) throw new Error(t("errors.updateNotSupported"));
        await onUpdate(editing.id, values);
      } else await onCreate(values);
      setDirty(false);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickCreate(e: FormEvent) {
    e.preventDefault();
    if (!quickCreate || quickCreate.disabled) return;
    const title = quickTitle.trim();
    if (!title) return;
    setQuickBusy(true);
    setQuickError("");
    try {
      await onCreate({
        ...(quickCreate.defaults ?? {}),
        [quickField]: title,
      });
      setQuickTitle("");
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : t("errors.createFailed"));
    } finally {
      setQuickBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || !onDelete) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : `${resolvedDeleteLabel} failed`);
      setPendingDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  function resolveOptions(field: FieldDef) {
    if (!field.options) return [];
    return typeof field.options === "function" ? field.options(values) : field.options;
  }

  function renderField(field: FieldDef) {
    const collapsed = field.collapsible && !expandedOptional[field.name];
    if (collapsed) {
      return (
        <div key={field.name} className="form-group" style={{ gridColumn: "1 / -1" }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setExpandedOptional((s) => ({ ...s, [field.name]: true }))}
          >
            + {field.label} ({t("common.optional")})
          </button>
        </div>
      );
    }

    return (
      <div
        key={field.name}
        className="form-group"
        style={field.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}
      >
        <label htmlFor={field.name}>
          {field.label}
          {field.required ? (
            <span className="field-required" title={t("common.required")}>
              {" "}
              *
            </span>
          ) : (
            <span className="field-optional"> ({t("common.optional")})</span>
          )}
        </label>
        {field.type === "select" ? (
          <select
            id={field.name}
            value={values[field.name] ?? ""}
            required={field.required}
            disabled={field.disabled || busy}
            onChange={(e) => setField(field.name, e.target.value)}
          >
            <option value="">{field.emptyOptionLabel ?? `${t("common.select")}…`}</option>
            {resolveOptions(field).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : field.type === "textarea" ? (
          <textarea
            id={field.name}
            value={values[field.name] ?? ""}
            required={field.required}
            placeholder={field.placeholder}
            rows={field.collapsible ? 3 : 4}
            disabled={busy}
            onChange={(e) => setField(field.name, e.target.value)}
          />
        ) : (
          <input
            id={field.name}
            type={field.type ?? "text"}
            value={values[field.name] ?? ""}
            required={field.required}
            placeholder={field.placeholder}
            step={field.step}
            disabled={field.disabled || busy}
            onChange={(e) => setField(field.name, e.target.value)}
          />
        )}
        {field.helperText ? <p className="field-helper">{field.helperText}</p> : null}
      </div>
    );
  }

  const emptyCta = (
    <button type="button" className="btn btn-primary" onClick={openCreate}>
      {resolvedCreateLabel}
    </button>
  );

  function renderFormFields(fieldList: FieldDef[]) {
    const grouped = new Map<string, FieldDef[]>();
    const ungrouped: FieldDef[] = [];
    for (const field of fieldList) {
      if (field.group) {
        const list = grouped.get(field.group) ?? [];
        list.push(field);
        grouped.set(field.group, list);
      } else {
        ungrouped.push(field);
      }
    }

    const sections: ReactNode[] = [];
    if (ungrouped.length > 0) {
      sections.push(
        <div key="ungrouped" className="grid grid-cols-2">
          {ungrouped.map(renderField)}
        </div>,
      );
    }
    for (const [group, groupFields] of grouped) {
      sections.push(
        <fieldset key={group} className="form-field-group">
          <legend>{group}</legend>
          <div className="grid grid-cols-2">{groupFields.map(renderField)}</div>
        </fieldset>,
      );
    }
    return sections;
  }

  function rowMenuItems(row: T): MoreMenuItem[] {
    const items: MoreMenuItem[] = [];
    if (moreActions) items.push(...moreActions(row));
    if (!hideDelete && onDelete) {
      items.push({
        id: "delete",
        label: resolvedDeleteLabel,
        tone: "danger",
        onClick: () => setPendingDelete(row),
      });
    }
    return items;
  }

  function renderRowActions(row: T) {
    const menuItems = rowMenuItems(row);
    const primary = primaryAction?.(row);
    const legacyExtra = extraActions?.(row);

    if (compactActions) {
      const leading: ReactNode[] = [];
      if (primary) leading.push(<span key="primary">{primary}</span>);
      if (!hideEdit && onUpdate) {
        leading.push(
          <button key="edit" type="button" className="btn btn-sm" onClick={() => openEdit(row)}>
            {t("common.edit")}
          </button>,
        );
      }
      if (legacyExtra) leading.push(<span key="extra">{legacyExtra}</span>);
      if (menuItems.length > 0 || leading.length > 0) {
        return <MoreMenu items={menuItems} leading={leading.length ? <>{leading}</> : undefined} />;
      }
      return null;
    }

    return (
      <>
        {legacyExtra}
        {primary}
        {!hideEdit && onUpdate ? (
          <button type="button" className="btn btn-sm" onClick={() => openEdit(row)}>
            {t("common.edit")}
          </button>
        ) : null}
        {!hideDelete && onDelete ? (
          destructiveInMenu ? (
            <MoreMenu items={menuItems.filter((i) => i.id === "delete")} />
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => setPendingDelete(row)}
            >
              {resolvedDeleteLabel}
            </button>
          )
        ) : null}
        {moreActions ? <MoreMenu items={moreActions(row)} /> : null}
      </>
    );
  }

  return (
    <div className="page-stack">
      <section className="data-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" style={{ marginBottom: description ? "0.35rem" : 0 }}>
              {title}
            </h2>
            {description ? (
              <p className="text-dim" style={{ fontSize: "0.875rem" }}>
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            {resolvedCreateLabel}
          </button>
        </div>

        {toolbar ? <div className="resource-toolbar">{toolbar}</div> : null}

        {quickCreate ? (
          <form className="quick-create" onSubmit={(e) => void handleQuickCreate(e)}>
            <input
              type="text"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder={
                quickCreate.disabled
                  ? quickCreate.disabledHint ?? quickCreate.placeholder
                  : quickCreate.placeholder
              }
              disabled={quickCreate.disabled || quickBusy}
              aria-label={quickCreate.placeholder}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={quickCreate.disabled || quickBusy || !quickTitle.trim()}
            >
              {quickBusy
                ? t("common.adding")
                : quickCreate.addLabel ?? t("common.add")}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={openCreate}
              title={t("planning.quickVsFull")}
            >
              {t("common.create")}…
            </button>
          </form>
        ) : null}
        {quickCreate?.showAddHint ? (
          <p className="text-dim" style={{ fontSize: "0.78rem", margin: "-0.35rem 0 0.75rem" }}>
            {t("planning.enterShortcut")}
          </p>
        ) : null}
        {quickError ? (
          <p className="auth-error" style={{ marginBottom: "0.75rem" }}>
            {quickError}
          </p>
        ) : null}
        {deleteError ? (
          <p className="auth-error" style={{ marginBottom: "0.75rem" }}>
            {deleteError}
          </p>
        ) : null}

        {isLoading ? (
          <SkeletonTable columns={columns.length} withActions={!hideEdit || !hideDelete} />
        ) : safeItems.length === 0 ? (
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            action={emptyCta}
            secondary={<span className="text-dim">{t("emptyStates.createHere")}</span>}
          />
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const isSelected =
                      selectedRowId != null && String(row.id) === String(selectedRowId);
                    const rowClass = [
                      onRowSelect ? "row-selectable" : "",
                      isSelected ? "row-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <tr
                        key={row.id}
                        className={rowClass || undefined}
                        onClick={onRowSelect ? () => onRowSelect(row) : undefined}
                      >
                        {columns.map((c) => (
                          <td key={c.key}>
                            {c.render
                              ? c.render(row)
                              : sanitizeDisplayText(
                                  String(
                                    (row as unknown as Record<string, unknown>)[c.key] ?? "—",
                                  ),
                                )}
                          </td>
                        ))}
                        <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                          {renderRowActions(row)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pageSize && pageSize > 0 && totalPages > 1 ? (
              <div className="pager-row">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("common.previous")}
                </button>
                <span className="text-dim">
                  {t("common.page")} {currentPage} {t("common.of")} {totalPages} ·{" "}
                  {safeItems.length} {t("common.items")}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t("common.next")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {open && (
        <ModalPortal>
          <div
            className="modal-backdrop active"
            role="dialog"
            aria-modal="true"
            onClick={requestClose}
          >
            <div
              className={`modal-content${wideModal || createUsesWizard ? " modal-wide" : ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3 className="modal-title">
                  {editing ? t("common.edit") : resolvedCreateLabel}
                </h3>
                <button type="button" className="modal-close" onClick={requestClose}>
                  ×
                </button>
              </div>
              <form onSubmit={(e) => void handleSubmit(e)} className="modal-body auth-form">
                {createUsesWizard && !editing ? (
                  <FormStepper
                    steps={wizardSteps}
                    current={createStepIndex}
                    onStepClick={(i) => i <= createStepIndex && setCreateStepIndex(i)}
                  />
                ) : null}
                {createUsesWizard && !editing && createStepHints?.[(createStepIndex + 1) as 1 | 2 | 3] ? (
                  <p className="text-dim wizard-step-hint" style={{ fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
                    {createStepHints[(createStepIndex + 1) as 1 | 2 | 3]}
                  </p>
                ) : null}
                {!editing && createFields && createFields.length < fields.length && !createUsesWizard ? (
                  <p className="text-dim" style={{ fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
                    {t("common.quickCreateHint")}
                  </p>
                ) : null}
                {createUsesWizard && !editing && createStepIndex === 0 ? (
                  <p className="text-dim" style={{ fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
                    {t("common.quickCreateHint")}
                  </p>
                ) : null}
                {createSlot && !editing
                  ? createSlot({
                      values,
                      setValue: (name, value) => setValues((prev) => ({ ...prev, [name]: value })),
                      step: createStepIndex + 1,
                      editing: false,
                    })
                  : null}
                {renderFormFields(visibleFormFields)}
                {error && <p className="auth-error">{error}</p>}
                <div className="modal-footer">
                  {createUsesWizard && !editing && createStepIndex > 0 ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setCreateStepIndex((i) => Math.max(0, i - 1))}
                      disabled={busy}
                    >
                      {t("common.back")}
                    </button>
                  ) : (
                    <button type="button" className="btn" onClick={requestClose} disabled={busy}>
                      {t("common.cancel")}
                    </button>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy
                      ? t("common.saving")
                      : createUsesWizard && !editing && !isLastWizardStep
                        ? t("common.continue")
                        : t("common.save")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      <ConfirmDialog
        open={pendingUnsaved}
        title={t("common.unsavedChanges")}
        description={t("common.unsavedChanges")}
        confirmLabel={t("common.close")}
        tone="danger"
        onCancel={() => setPendingUnsaved(false)}
        onConfirm={forceClose}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={
          pendingDelete
            ? `${resolvedDeleteLabel} «${String(
                (pendingDelete as { title?: string; name?: string }).title ??
                  (pendingDelete as { name?: string }).name ??
                  `#${pendingDelete.id}`,
              )}»`
            : resolvedDeleteLabel
        }
        description={deleteConfirmDescription}
        confirmLabel={resolvedDeleteLabel}
        tone="danger"
        busy={deleteBusy}
        onCancel={() => !deleteBusy && setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

export function num(v: string, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function optInt(v?: string | null): number | null {
  if (v == null || !String(v).trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function optStr(v?: string | null): string | null {
  const t = String(v ?? "").trim();
  return t ? t : null;
}
