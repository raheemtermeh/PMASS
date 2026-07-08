"use client";

import { FormEvent, ReactNode, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { sanitizeDisplayText } from "@/shared/security";

export type FieldType = "text" | "number" | "select" | "textarea" | "password";

export interface FieldDef {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  step?: string;
}

interface ResourceManagerProps<T extends { id: number }> {
  title: string;
  description?: string;
  columns: { key: string; label: string; render?: (row: T) => ReactNode }[];
  fields: FieldDef[];
  items: T[];
  isLoading?: boolean;
  emptyTitle: string;
  emptyDescription: string;
  createLabel?: string;
  onCreate: (values: Record<string, string>) => Promise<void> | void;
  onUpdate: (id: number, values: Record<string, string>) => Promise<void> | void;
  onDelete: (id: number) => Promise<void> | void;
  toFormValues?: (row: T) => Record<string, string>;
  extraActions?: (row: T) => ReactNode;
}

function blankValues(fields: FieldDef[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.name, ""]));
}

export function ResourceManager<T extends { id: number }>({
  title,
  description,
  columns,
  fields,
  items,
  isLoading,
  emptyTitle,
  emptyDescription,
  createLabel = "Add",
  onCreate,
  onUpdate,
  onDelete,
  toFormValues,
  extraActions,
}: ResourceManagerProps<T>) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [values, setValues] = useState<Record<string, string>>(blankValues(fields));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const safeItems = Array.isArray(items) ? items : [];

  function openCreate() {
    setEditing(null);
    setValues(blankValues(fields));
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
      if (editing) await onUpdate(editing.id, values);
      else await onCreate(values);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row: T) {
    if (!window.confirm(`Delete “${String((row as { title?: string; name?: string }).title ?? (row as { name?: string }).name ?? `#${row.id}`)}”?`)) {
      return;
    }
    setDeleteError("");
    try {
      await onDelete(row.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
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
            {createLabel}
          </button>
        </div>

        {deleteError ? <p className="auth-error" style={{ marginBottom: "0.75rem" }}>{deleteError}</p> : null}

        {isLoading ? (
          <p className="text-dim">Loading…</p>
        ) : safeItems.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
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
                {safeItems.map((row) => (
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
                      <button type="button" className="btn btn-sm" onClick={() => openEdit(row)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => void handleDelete(row)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && (
        <div
          className="modal-backdrop active"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setOpen(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? "Edit" : createLabel}</h3>
              <button type="button" className="modal-close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body auth-form">
              <div className="grid grid-cols-2">
                {fields.map((field) => (
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
                        <option value="">Select…</option>
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
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function num(v: string, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function optInt(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function optStr(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}
