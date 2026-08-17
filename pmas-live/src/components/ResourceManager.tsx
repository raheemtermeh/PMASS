"use client";

import { FormEvent, ReactNode, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { ModalPortal } from "@/components/ModalPortal";
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
  options?: { value: string; label: string }[];
  emptyOptionLabel?: string;
  step?: string;
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
  };
  onCreate: (values: Record<string, string>) => Promise<void> | void;
  onUpdate?: (id: string | number, values: Record<string, string>) => Promise<void> | void;
  onDelete?: (id: string | number) => Promise<void> | void;
  toFormValues?: (row: T) => Record<string, string>;
  extraActions?: (row: T) => ReactNode;
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
  toolbar,
  pageSize,
  quickCreate,
  onCreate,
  onUpdate,
  onDelete,
  toFormValues,
  extraActions,
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

  const safeItems = Array.isArray(items) ? items : [];
  const activeFields = editing ? fields : createFields ?? fields;
  const quickField = quickCreate?.fieldName ?? "title";
  const resolvedCreateLabel = createLabel ?? t("common.add");
  const resolvedDeleteLabel = deleteLabel ?? t("common.delete");

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

  function openCreate() {
    setEditing(null);
    setValues({ ...blankValues(createFields ?? fields), ...(createDefaults ?? {}) });
    setError("");
    setOpen(true);
  }

  function openEdit(row: T) {
    setEditing(row);
    setValues(toFormValues ? toFormValues(row) : blankValues(fields));
    setError("");
    setOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editing) {
        if (!onUpdate) throw new Error(t("errors.updateNotSupported"));
        await onUpdate(editing.id, values);
      } else await onCreate(values);
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

  async function handleDelete(row: T) {
    if (!onDelete) return;
    const label = String(
      (row as { title?: string; name?: string }).title ??
        (row as { name?: string }).name ??
        `#${row.id}`,
    );
    if (!window.confirm(`${resolvedDeleteLabel} «${label}»؟`)) {
      return;
    }
    setDeleteError("");
    try {
      await onDelete(row.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : `${resolvedDeleteLabel} failed`);
    }
  }

  return (
    <div className="page-stack">
      <section className="data-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" style={{ marginBottom: description ? "0.35rem" : 0 }}>
              {title}
            </h2>
            {description ? <p className="text-dim" style={{ fontSize: "0.875rem" }}>{description}</p> : null}
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
              {quickBusy ? t("common.adding") : t("common.add")}
            </button>
          </form>
        ) : null}
        {quickError ? <p className="auth-error" style={{ marginBottom: "0.75rem" }}>{quickError}</p> : null}
        {deleteError ? <p className="auth-error" style={{ marginBottom: "0.75rem" }}>{deleteError}</p> : null}

        {isLoading ? (
          <SkeletonTable columns={columns.length} withActions={!hideEdit || !hideDelete} />
        ) : safeItems.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
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
                  {visibleRows.map((row) => (
                    <tr key={row.id}>
                      {columns.map((c) => (
                        <td key={c.key}>
                          {c.render
                            ? c.render(row)
                            : sanitizeDisplayText(
                                String(
                                  (row as unknown as Record<string, unknown>)[c.key] ??
                                    "—",
                                ),
                              )}
                        </td>
                      ))}
                      <td className="actions-cell">
                        {extraActions?.(row)}
                        {!hideEdit && onUpdate ? (
                          <button type="button" className="btn btn-sm" onClick={() => openEdit(row)}>
                            {t("common.edit")}
                          </button>
                        ) : null}
                        {!hideDelete && onDelete ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => void handleDelete(row)}
                          >
                            {resolvedDeleteLabel}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
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
          onClick={() => !busy && setOpen(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? t("common.edit") : resolvedCreateLabel}</h3>
              <button type="button" className="modal-close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body auth-form">
              {!editing && createFields && createFields.length < fields.length ? (
                <p className="text-dim" style={{ fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
                  {t("common.quickCreateHint")}
                </p>
              ) : null}
              <div className="grid grid-cols-2">
                {activeFields.map((field) => (
                  <div
                    key={field.name}
                    className="form-group"
                    style={field.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}
                  >
                    <label htmlFor={field.name}>{field.label}</label>
                    {field.type === "select" ? (
                      <select
                        id={field.name}
                        value={values[field.name] ?? ""}
                        required={field.required}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [field.name]: e.target.value }))
                        }
                      >
                        <option value="">
                          {field.emptyOptionLabel ?? `${t("common.select")}…`}
                        </option>
                        {field.options?.map((o) => (
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
                        rows={4}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [field.name]: e.target.value }))
                        }
                      />
                    ) : (
                      <input
                        id={field.name}
                        type={field.type ?? "text"}
                        value={values[field.name] ?? ""}
                        required={field.required}
                        placeholder={field.placeholder}
                        step={field.step}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [field.name]: e.target.value }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
              {error && <p className="auth-error">{error}</p>}
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
                  {t("common.cancel")}
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}
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
