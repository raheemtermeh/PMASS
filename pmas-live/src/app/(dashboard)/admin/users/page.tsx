"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { ModalPortal } from "@/components/ModalPortal";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import {
  PERMISSION_CATEGORIES,
  PERMISSION_LABELS,
  type Permission,
} from "@/shared/permissions";

interface WorkspaceUser {
  employee_id: string;
  user_id?: number | null;
  full_name: string;
  email: string;
  job_title: string;
  status: string;
  is_active?: boolean | null;
  has_login: boolean;
  system_role?: string;
  role_id?: string | null;
  role_name?: string;
  permissions: string[];
}

interface CompanyRole {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions: string[];
}

interface ListMeta {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function avatarTone(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * 17) % 5;
  return h;
}

function PermCategories({
  selected,
  onToggle,
}: {
  selected: Permission[];
  onToggle: (perm: Permission) => void;
}) {
  return (
    <div className="um-perm-categories">
      {PERMISSION_CATEGORIES.map((cat) => (
        <div key={cat.id} className="um-perm-category">
          <div className="um-perm-category-head">
            <h4>{cat.label}</h4>
            <span>
              {cat.permissions.filter((p) => selected.includes(p)).length}/
              {cat.permissions.length}
            </span>
          </div>
          <div className="um-perm-chips">
            {cat.permissions.map((perm) => {
              const on = selected.includes(perm);
              return (
                <label key={perm} className={`um-perm-chip${on ? " is-on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(perm)}
                  />
                  <i aria-hidden />
                  <span>{PERMISSION_LABELS[perm]}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminUsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const tenantId = currentUser?.tenant_id;

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [roleId, setRoleId] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<Permission[]>([]);

  const [editingUser, setEditingUser] = useState<WorkspaceUser | null>(null);
  const [editPerms, setEditPerms] = useState<Permission[]>([]);
  const [editRoleId, setEditRoleId] = useState("");
  const [editName, setEditName] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");

  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CompanyRole | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [rolePerms, setRolePerms] = useState<Permission[]>([]);

  const { data: roles = [] } = useQuery({
    queryKey: ["company-roles", tenantId],
    queryFn: () => httpClient.get<CompanyRole[]>("/api/v1/roles"),
    enabled: Boolean(tenantId),
    staleTime: 30_000,
  });

  const listPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (roleFilter) params.set("role_id", roleFilter);
    return `/api/v1/users?${params.toString()}`;
  }, [page, q, status, roleFilter]);

  const { data: usersPage, isLoading: usersLoading } = useQuery({
    queryKey: ["workspace-users-meta", tenantId, listPath],
    queryFn: async () => {
      const { getApiBaseUrl } = await import("@/shared/config/env");
      const token = useAuthStore.getState().token;
      const response = await fetch(`${getApiBaseUrl()}${listPath}`, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.errors?.[0]?.message || payload?.error || "Failed to load users");
      }
      const data = (payload?.data ?? payload) as WorkspaceUser[];
      const meta = (payload?.meta ?? null) as ListMeta | null;
      return { data: Array.isArray(data) ? data : [], meta };
    },
    enabled: Boolean(tenantId),
  });

  const users = usersPage?.data ?? [];
  const meta = usersPage?.meta;

  useEffect(() => {
    if (!roleId) return;
    const role = roles.find((r) => r.id === roleId);
    if (role) setSelectedPerms(role.permissions as Permission[]);
  }, [roleId, roles]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-users-meta"] });
    void queryClient.invalidateQueries({ queryKey: ["company-roles"] });
    void queryClient.invalidateQueries({ queryKey: ["vsm-employees"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      httpClient.post<WorkspaceUser>("/api/v1/users", {
        email,
        password,
        full_name: fullName,
        job_title: jobTitle,
        role_id: roleId || undefined,
        permissions: selectedPerms,
      }),
    onSuccess: () => {
      invalidate();
      setEmail("");
      setFullName("");
      setPassword("");
      setJobTitle("");
      setRoleId("");
      setSelectedPerms([]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (!editingUser?.user_id) throw new Error("No login account");
      return httpClient.put(`/api/v1/users/${editingUser.user_id}`, body);
    },
    onSuccess: () => {
      invalidate();
      setEditingUser(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      httpClient.put(`/api/v1/users/${id}`, { is_active }),
    onSuccess: invalidate,
  });

  const removeLoginMutation = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/users/${id}`),
    onSuccess: invalidate,
  });

  const setPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      httpClient.put(`/api/v1/users/${id}`, { password }),
    onSuccess: invalidate,
  });

  // Starts everyone on the baseline Employee role rather than whatever is half-typed
  // in the create form above; the admin can widen access right after via Edit.
  const enableLoginMutation = useMutation({
    mutationFn: ({ row, password }: { row: WorkspaceUser; password: string }) => {
      const baseline = roles.find((r) => r.name === "Employee");
      return httpClient.post("/api/v1/users", {
        employee_id: row.employee_id,
        email: row.email,
        full_name: row.full_name,
        job_title: row.job_title,
        password,
        role_id: baseline?.id,
        permissions: baseline?.permissions ?? [],
      });
    },
    onSuccess: invalidate,
  });

  // Row buttons act outside any form, so their failures need a visible home.
  const rowActionError = [
    removeLoginMutation,
    toggleMutation,
    setPasswordMutation,
    enableLoginMutation,
  ]
    .map((m) => (m.error instanceof Error ? m.error.message : ""))
    .find(Boolean);

  const saveRoleMutation = useMutation({
    mutationFn: async () => {
      const body = { name: roleName, description: roleDesc, permissions: rolePerms };
      if (editingRole) return httpClient.put(`/api/v1/roles/${editingRole.id}`, body);
      return httpClient.post("/api/v1/roles", body);
    },
    onSuccess: () => {
      invalidate();
      setRoleFormOpen(false);
      setEditingRole(null);
      setRoleName("");
      setRoleDesc("");
      setRolePerms([]);
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: string) => httpClient.delete(`/api/v1/roles/${id}`),
    onSuccess: invalidate,
  });

  // How far this person's grants drift from their role — surfaced so an admin knows
  // the tweak survives future role edits instead of being silently overwritten.
  const editDiff = useMemo(() => {
    const role = roles.find((r) => r.id === editRoleId);
    if (!role) return { added: [] as string[], removed: [] as string[], total: 0 };
    const added = editPerms.filter((p) => !role.permissions.includes(p));
    const removed = role.permissions.filter((p) => !editPerms.includes(p as Permission));
    return { added, removed, total: added.length + removed.length };
  }, [editPerms, editRoleId, roles]);

  const roleMemberCount = useMemo(() => {
    if (!editingRole) return 0;
    return users.filter((u) => u.role_id === editingRole.id).length;
  }, [users, editingRole]);

  const rosterStats = useMemo(() => {
    const withLogin = users.filter((u) => u.has_login).length;
    const activeLogin = users.filter((u) => u.has_login && u.is_active).length;
    return {
      people: meta?.total_items ?? users.length,
      withLogin,
      activeLogin,
      roles: roles.length,
      grants: selectedPerms.length,
    };
  }, [users, meta, roles.length, selectedPerms.length]);

  if (!tenantId) {
    return (
      <EmptyState
        title="Company workspace required"
        description="User management is available inside a company account. Platform admins should provision companies first."
      />
    );
  }

  function togglePerm(list: Permission[], perm: Permission, setter: (v: Permission[]) => void) {
    setter(list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm]);
  }

  function openEdit(row: WorkspaceUser) {
    setEditingUser(row);
    setEditName(row.full_name);
    setEditJobTitle(row.job_title || "");
    setEditRoleId(row.role_id || "");
    setEditPerms((row.permissions || []) as Permission[]);
  }

  function openRoleEdit(role?: CompanyRole) {
    setEditingRole(role ?? null);
    setRoleName(role?.name ?? "");
    setRoleDesc(role?.description ?? "");
    setRolePerms((role?.permissions ?? []) as Permission[]);
    setRoleFormOpen(true);
  }

  return (
    <div className="page-stack um-studio">
      <header className="um-hero">
        <div className="um-hero-glow" aria-hidden />
        <div className="um-hero-scan" aria-hidden />
        <div className="um-hero-copy">
          <p className="um-kicker">Access studio</p>
          <h2 className="um-hero-title">
            People, roles &amp; <span>keys</span>
          </h2>
          <p className="um-hero-sub">
            Provision logins, shape permission sets, and keep the company roster in sync with
            Organization — same power, clearer stage. Employees sign in at{" "}
            <code>/employee/login</code> with the Company ID and credentials you set here.
          </p>
        </div>
        <div className="um-hero-stats" aria-label="Roster snapshot">
          <div className="um-stat">
            <span>People</span>
            <strong>{rosterStats.people}</strong>
          </div>
          <div className="um-stat">
            <span>Live logins</span>
            <strong>{rosterStats.activeLogin}</strong>
          </div>
          <div className="um-stat">
            <span>Roles</span>
            <strong>{rosterStats.roles}</strong>
          </div>
          <div className="um-stat um-stat-accent">
            <span>Draft grants</span>
            <strong>{rosterStats.grants}</strong>
          </div>
        </div>
      </header>

      <section className="um-panel um-panel-create">
        <div className="um-panel-rail" aria-hidden />
        <div className="um-panel-head">
          <div>
            <p className="um-kicker">Provision</p>
            <h2 className="um-panel-title">Create employee login</h2>
            <p className="um-panel-sub">
              Creates an Organization employee and a login account linked together. Pick a Role to
              pre-select permissions, then adjust manually if needed.
            </p>
          </div>
          <div className="um-badge-stack">
            <span className="um-soft-badge">Employee + login</span>
            <span className="um-soft-badge um-soft-badge-cyan">Role → grants</span>
          </div>
        </div>

        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="um-create-form"
        >
          <div className="um-create-grid">
            <div className="form-group">
              <label htmlFor="u-name">Full name</label>
              <input id="u-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="u-email">Email</label>
              <input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="u-pass">Password</label>
              <input
                id="u-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="form-group">
              <label htmlFor="u-job">Job title</label>
              <input id="u-job" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div className="form-group um-span-2">
              <label htmlFor="u-role">Role</label>
              <select
                id="u-role"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                required
              >
                <option value="">Select role…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="um-perm-fieldset">
            <legend>
              Permissions <span>from role — editable</span>
            </legend>
            <PermCategories
              selected={selectedPerms}
              onToggle={(p) => togglePerm(selectedPerms, p, setSelectedPerms)}
            />
          </fieldset>

          {createMutation.isError ? (
            <p className="auth-error">
              {createMutation.error instanceof Error ? createMutation.error.message : "Create failed"}
            </p>
          ) : null}

          <div className="um-form-actions">
            <button type="submit" className="btn btn-primary um-cta" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create employee"}
            </button>
          </div>
        </form>
      </section>

      <section className="um-panel">
        <div className="um-panel-head um-panel-head-row">
          <div>
            <p className="um-kicker">Roster</p>
            <h2 className="um-panel-title">Company people</h2>
          </div>
          <div className="um-filters">
            <label className="um-search">
              <span className="um-search-icon" aria-hidden />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name, email, title…"
                aria-label="Search users"
              />
            </label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {rowActionError ? <p className="auth-error">{rowActionError}</p> : null}

        {usersLoading ? (
          <p className="text-dim um-loading">Loading users…</p>
        ) : users.length === 0 ? (
          <EmptyState
            title="No people yet"
            description="Create an employee here or in Organization — both lists stay in sync."
          />
        ) : (
          <>
            <div className="um-roster">
              {users.map((row, index) => {
                const roleLabel =
                  row.role_name || (row.system_role === "tenant_admin" ? "Company Admin" : "—");
                const loginState = !row.has_login
                  ? "none"
                  : row.is_active
                    ? "active"
                    : "disabled";
                return (
                  <article
                    key={row.employee_id}
                    className={`um-person um-tone-${avatarTone(row.employee_id)}`}
                    style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
                  >
                    <div className="um-person-stripe" aria-hidden />
                    <div className="um-person-top">
                      <div className={`um-avatar um-tone-${avatarTone(row.employee_id)}`}>
                        {initials(row.full_name || "?")}
                      </div>
                      <div className="um-person-id">
                        <strong>{row.full_name}</strong>
                        <span>{row.email}</span>
                      </div>
                      <span className={`um-login-pill is-${loginState}`}>
                        {loginState === "none"
                          ? "No login"
                          : loginState === "active"
                            ? "Login on"
                            : "Login off"}
                      </span>
                    </div>

                    <div className="um-person-meta">
                      <div>
                        <span>Title</span>
                        <strong>{row.job_title || "—"}</strong>
                      </div>
                      <div>
                        <span>Role</span>
                        <strong>{roleLabel}</strong>
                      </div>
                      <div>
                        <span>Status</span>
                        <strong>
                          <span className="status-pill">{row.status}</span>
                        </strong>
                      </div>
                      <div>
                        <span>Access</span>
                        <strong>
                          {row.system_role === "tenant_admin"
                            ? "All permissions"
                            : row.permissions?.length
                              ? `${row.permissions.length} grants`
                              : "—"}
                        </strong>
                      </div>
                    </div>

                    <div className="um-person-actions">
                      {row.has_login && row.user_id ? (
                        <>
                          <button type="button" className="btn btn-sm" onClick={() => openEdit(row)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => {
                              const next = window.prompt(
                                `New password for ${row.full_name}\n(min 12 chars, upper/lower/digit/symbol)`,
                              );
                              if (!next) return;
                              setPasswordMutation.mutate({ id: row.user_id!, password: next });
                            }}
                          >
                            Set password
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              toggleMutation.mutate({
                                id: row.user_id!,
                                is_active: !row.is_active,
                              })
                            }
                          >
                            {row.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm um-btn-danger"
                            disabled={row.user_id === currentUser?.id}
                            title={
                              row.user_id === currentUser?.id
                                ? "You cannot remove your own login"
                                : "Deletes the login. The employee stays in Organization."
                            }
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Remove the login for ${row.full_name}?\n\nThey keep their employee record in Organization and can be given a new login later.`,
                                )
                              ) {
                                return;
                              }
                              removeLoginMutation.mutate(row.user_id!);
                            }}
                          >
                            Remove login
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            const password = window.prompt(
                              `Initial password for ${row.full_name}\n(min 12 chars, upper/lower/digit/symbol)`,
                            );
                            if (!password) return;
                            enableLoginMutation.mutate({ row, password });
                          }}
                        >
                          Enable login
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {meta && meta.total_pages > 1 ? (
              <div className="um-pager">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="text-dim">
                  Page {meta.page} / {meta.total_pages} · {meta.total_items} people
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={page >= meta.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="um-panel um-panel-roles">
        <div className="um-panel-head um-panel-head-row">
          <div>
            <p className="um-kicker">Blueprints</p>
            <h2 className="um-panel-title">Roles</h2>
            <p className="um-panel-sub">Reusable access kits applied when provisioning people.</p>
          </div>
          <button type="button" className="btn btn-primary um-cta" onClick={() => openRoleEdit()}>
            New role
          </button>
        </div>

        <div className="um-role-grid">
          {roles.map((role, index) => (
            <article
              key={role.id}
              className={`um-role-card${role.is_system ? " is-system" : ""}`}
              style={{ animationDelay: `${Math.min(index, 8) * 0.045}s` }}
            >
              <div className="um-role-keyhole" aria-hidden />
              <div className="um-role-top">
                <h3>{role.name}</h3>
                <span className={`um-role-type${role.is_system ? " is-system" : ""}`}>
                  {role.is_system ? "System" : "Custom"}
                </span>
              </div>
              <p className="um-role-desc">{role.description || "No description"}</p>
              <div className="um-role-meter" aria-hidden>
                <i style={{ width: `${Math.min(100, (role.permissions?.length ?? 0) * 6)}%` }} />
              </div>
              <div className="um-role-foot">
                <span>
                  <strong>{role.permissions?.length ?? 0}</strong> permissions
                </span>
                <div className="um-person-actions">
                  <button type="button" className="btn btn-sm" onClick={() => openRoleEdit(role)}>
                    Edit
                  </button>
                  {!role.is_system ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        if (window.confirm(`Delete role “${role.name}”?`)) {
                          deleteRoleMutation.mutate(role.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {editingUser ? (
        <ModalPortal>
        <div className="modal-backdrop active um-modal" role="dialog" aria-modal="true">
          <div className="modal-content um-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header um-modal-header">
              <div>
                <p className="um-kicker">Identity</p>
                <h3 className="modal-title">Edit {editingUser.full_name}</h3>
              </div>
              <button type="button" className="modal-close" onClick={() => setEditingUser(null)}>
                ×
              </button>
            </div>
            <div className="modal-body auth-form">
              <div className="um-create-grid">
                <div className="form-group">
                  <label htmlFor="edit-name">Full name</label>
                  <input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-job">Job title</label>
                  <input
                    id="edit-job"
                    value={editJobTitle}
                    onChange={(e) => setEditJobTitle(e.target.value)}
                  />
                </div>
                <div className="form-group um-span-2">
                  <label htmlFor="edit-role">Role</label>
                  <select
                    id="edit-role"
                    value={editRoleId}
                    onChange={(e) => {
                      setEditRoleId(e.target.value);
                      const role = roles.find((r) => r.id === e.target.value);
                      if (role) setEditPerms(role.permissions as Permission[]);
                    }}
                  >
                    <option value="">—</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <fieldset className="um-perm-fieldset">
                <legend>
                  Permissions
                  {editDiff.total > 0 ? (
                    <span className="um-diff-badge">
                      {editDiff.added.length > 0 ? `+${editDiff.added.length}` : ""}
                      {editDiff.added.length > 0 && editDiff.removed.length > 0 ? " / " : ""}
                      {editDiff.removed.length > 0 ? `−${editDiff.removed.length}` : ""} vs role
                    </span>
                  ) : null}
                </legend>
                {editRoleId ? (
                  <p className="um-perm-hint">
                    {editDiff.total > 0 ? (
                      <>
                        Customized for this person. Their extra grants and removals are kept when
                        the role itself is edited later.{" "}
                        <button
                          type="button"
                          className="um-linkish"
                          onClick={() => {
                            const role = roles.find((r) => r.id === editRoleId);
                            if (role) setEditPerms(role.permissions as Permission[]);
                          }}
                        >
                          Reset to role defaults
                        </button>
                      </>
                    ) : (
                      "Exactly matches the role defaults — future role edits apply automatically."
                    )}
                  </p>
                ) : null}
                <PermCategories
                  selected={editPerms}
                  onToggle={(p) => togglePerm(editPerms, p, setEditPerms)}
                />
              </fieldset>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setEditingUser(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({
                      full_name: editName,
                      job_title: editJobTitle,
                      role_id: editRoleId || "",
                      permissions: editPerms,
                    })
                  }
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      ) : null}

      {roleFormOpen ? (
        <ModalPortal>
        <div className="modal-backdrop active um-modal" role="dialog" aria-modal="true">
          <div className="modal-content um-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header um-modal-header">
              <div>
                <p className="um-kicker">Blueprint</p>
                <h3 className="modal-title">{editingRole ? "Edit role" : "New role"}</h3>
              </div>
              <button type="button" className="modal-close" onClick={() => setRoleFormOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body auth-form">
              <div className="form-group">
                <label htmlFor="role-name">Name</label>
                <input
                  id="role-name"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  required
                  disabled={Boolean(editingRole?.is_system)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="role-desc">Description</label>
                <input id="role-desc" value={roleDesc} onChange={(e) => setRoleDesc(e.target.value)} />
              </div>
              <fieldset className="um-perm-fieldset">
                <legend>Default permissions</legend>
                {editingRole && roleMemberCount > 0 ? (
                  <p className="um-perm-hint">
                    Saving updates {roleMemberCount}{" "}
                    {roleMemberCount === 1 ? "person" : "people"} on this page who hold this role.
                    Their individually added or removed permissions stay untouched.
                  </p>
                ) : null}
                <PermCategories
                  selected={rolePerms}
                  onToggle={(p) => togglePerm(rolePerms, p, setRolePerms)}
                />
              </fieldset>
              {saveRoleMutation.isError ? (
                <p className="auth-error">
                  {saveRoleMutation.error instanceof Error
                    ? saveRoleMutation.error.message
                    : "Saving the role failed"}
                </p>
              ) : null}
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setRoleFormOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saveRoleMutation.isPending || !roleName.trim()}
                  onClick={() => saveRoleMutation.mutate()}
                >
                  Save role
                </button>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}
