"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { ModalPortal } from "@/components/ModalPortal";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import { useI18n } from "@/core/providers/I18nProvider";
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
  const { t } = useI18n();
  const categoryLabels: Record<string, string> = {
    products: t("products.title"),
    projects: t("dashboard.projects"),
    features: t("dashboard.features"),
    tasks: t("dashboard.assignedTasks"),
    organization: t("organization.title"),
    administration: t("userManagement.title"),
  };
  const permissionLabels: Partial<Record<Permission, string>> = {
    "product.view": t("common.view"),
    "product.create": t("common.create"),
    "product.update": t("common.update"),
    "product.archive": t("statuses.archived"),
    "project.create": t("common.create"),
    "project.update": t("common.update"),
    "feature.create": t("common.create"),
    "feature.update": t("common.update"),
    "task.create": t("common.create"),
    users: t("userManagement.title"),
    settings: t("settings.title"),
  };

  return (
    <div className="um-perm-categories">
      {PERMISSION_CATEGORIES.map((cat) => (
        <div key={cat.id} className="um-perm-category">
          <div className="um-perm-category-head">
            <h4>{categoryLabels[cat.id] ?? cat.label}</h4>
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
                  <span>{permissionLabels[perm] ?? PERMISSION_LABELS[perm]}</span>
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
  const { t } = useI18n();
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
        throw new Error(
          payload?.errors?.[0]?.message || payload?.error || t("errors.loadUsersFailed"),
        );
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
      if (!editingUser?.user_id) throw new Error(t("errors.noLoginAccount"));
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
        title={t("nav.workspace")}
        description={t("userManagement.tenantOnlyHint")}
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

  function localizedStatus(value: string): string {
    const labels: Record<string, string> = {
      ACTIVE: t("statuses.active"),
      INACTIVE: t("statuses.inactive"),
      ARCHIVED: t("statuses.archived"),
      PENDING: t("statuses.pending"),
    };
    return labels[value.toUpperCase()] ?? value;
  }

  return (
    <div className="page-stack um-studio">
      <header className="um-hero">
        <div className="um-hero-glow" aria-hidden />
        <div className="um-hero-scan" aria-hidden />
        <div className="um-hero-copy">
          <p className="um-kicker">{t("settings.access")}</p>
          <h2 className="um-hero-title">{t("userManagement.title")}</h2>
          <p className="um-hero-sub">
            {t("userManagement.heroSub", { path: "/employee/login" })}
          </p>
        </div>
        <div className="um-hero-stats" aria-label={t("organization.employees")}>
          <div className="um-stat">
            <span>{t("dashboard.people")}</span>
            <strong>{rosterStats.people}</strong>
          </div>
          <div className="um-stat">
            <span>{t("statuses.active")} {t("common.signIn")}</span>
            <strong>{rosterStats.activeLogin}</strong>
          </div>
          <div className="um-stat">
            <span>{t("userManagement.role")}</span>
            <strong>{rosterStats.roles}</strong>
          </div>
          <div className="um-stat um-stat-accent">
            <span>{t("statuses.draft")} {t("settings.access")}</span>
            <strong>{rosterStats.grants}</strong>
          </div>
        </div>
      </header>

      <section className="um-panel um-panel-create">
        <div className="um-panel-rail" aria-hidden />
        <div className="um-panel-head">
          <div>
            <p className="um-kicker">{t("common.create")}</p>
            <h2 className="um-panel-title">{t("organization.createEmployee")}</h2>
            <p className="um-panel-sub">{t("userManagement.createHint")}</p>
          </div>
          <div className="um-badge-stack">
            <span className="um-soft-badge">{t("role.employee")} + {t("common.signIn")}</span>
            <span className="um-soft-badge um-soft-badge-cyan">
              {t("userManagement.role")} → {t("settings.access")}
            </span>
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
              <label htmlFor="u-name">{t("userManagement.fullName")}</label>
              <input id="u-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="u-email">{t("userManagement.email")}</label>
              <input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="u-pass">{t("common.password")}</label>
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
              <label htmlFor="u-job">{t("common.jobTitle")}</label>
              <input id="u-job" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div className="form-group um-span-2">
              <label htmlFor="u-role">{t("userManagement.role")}</label>
              <select
                id="u-role"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                required
              >
                <option value="">{t("organization.selectRole")}</option>
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
              {t("settings.access")} <span>— {t("common.edit")}</span>
            </legend>
            <PermCategories
              selected={selectedPerms}
              onToggle={(p) => togglePerm(selectedPerms, p, setSelectedPerms)}
            />
          </fieldset>

          {createMutation.isError ? (
            <p className="auth-error">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : t("errors.createFailed")}
            </p>
          ) : null}

          <div className="um-form-actions">
            <button type="submit" className="btn btn-primary um-cta" disabled={createMutation.isPending}>
              {createMutation.isPending ? t("common.processing") : t("organization.createEmployee")}
            </button>
          </div>
        </form>
      </section>

      <section className="um-panel">
        <div className="um-panel-head um-panel-head-row">
          <div>
            <p className="um-kicker">{t("organization.employees")}</p>
            <h2 className="um-panel-title">{t("organization.employees")}</h2>
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
                placeholder={t("userManagement.searchUsers")}
                aria-label={t("userManagement.searchUsers")}
              />
            </label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              aria-label={t("userManagement.status")}
            >
              <option value="">{t("common.allStatuses")}</option>
              <option value="ACTIVE">{t("statuses.active")}</option>
              <option value="INACTIVE">{t("statuses.inactive")}</option>
              <option value="ARCHIVED">{t("statuses.archived")}</option>
            </select>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              aria-label={t("userManagement.role")}
            >
              <option value="">{t("common.all")} {t("userManagement.role")}</option>
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
          <p className="text-dim um-loading">{t("common.loading")}</p>
        ) : users.length === 0 ? (
          <EmptyState
            title={t("userManagement.noUsers")}
            description={t("emptyStates.noEmployees")}
          />
        ) : (
          <>
            <div className="um-roster">
              {users.map((row, index) => {
                const roleLabel =
                  row.role_name || (row.system_role === "tenant_admin" ? t("role.companyAdmin") : "—");
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
                          ? `${t("common.no")} ${t("common.signIn")}`
                          : loginState === "active"
                            ? `${t("common.signIn")} · ${t("statuses.active")}`
                            : `${t("common.signIn")} · ${t("statuses.inactive")}`}
                      </span>
                    </div>

                    <div className="um-person-meta">
                      <div>
                        <span>{t("common.title")}</span>
                        <strong>{row.job_title || "—"}</strong>
                      </div>
                      <div>
                        <span>{t("userManagement.role")}</span>
                        <strong>{roleLabel}</strong>
                      </div>
                      <div>
                        <span>{t("userManagement.status")}</span>
                        <strong>
                          <span className="status-pill">{localizedStatus(row.status)}</span>
                        </strong>
                      </div>
                      <div>
                        <span>{t("settings.access")}</span>
                        <strong>
                          {row.system_role === "tenant_admin"
                            ? t("userManagement.allPermissions")
                            : row.permissions?.length
                              ? t("userManagement.grantsCount", {
                                  count: row.permissions.length,
                                })
                              : "—"}
                        </strong>
                      </div>
                    </div>

                    <div className="um-person-actions">
                      {row.has_login && row.user_id ? (
                        <>
                          <button type="button" className="btn btn-sm" onClick={() => openEdit(row)}>
                            {t("common.edit")}
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
                            {t("profile.changePassword")}
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
                            {row.is_active ? t("organization.deactivate") : t("statuses.active")}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm um-btn-danger"
                            disabled={row.user_id === currentUser?.id}
                            title={
                              row.user_id === currentUser?.id
                                ? t("userManagement.cannotRemoveOwnLogin")
                                : t("userManagement.deleteLoginHint")
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
                            {t("common.remove")} {t("common.signIn")}
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
                          {t("common.active")} {t("common.signIn")}
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
                  {t("common.previous")}
                </button>
                <span className="text-dim">
                  {t("common.page")} {meta.page} / {meta.total_pages} · {meta.total_items}{" "}
                  {t("dashboard.people")}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={page >= meta.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("common.next")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="um-panel um-panel-roles">
        <div className="um-panel-head um-panel-head-row">
          <div>
            <p className="um-kicker">{t("userManagement.role")}</p>
            <h2 className="um-panel-title">{t("userManagement.role")}</h2>
            <p className="um-panel-sub">{t("userManagement.presetsHint")}</p>
          </div>
          <button type="button" className="btn btn-primary um-cta" onClick={() => openRoleEdit()}>
            {t("common.create")} {t("userManagement.role")}
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
              <p className="um-role-desc">{role.description || t("common.description")}</p>
              <div className="um-role-meter" aria-hidden>
                <i style={{ width: `${Math.min(100, (role.permissions?.length ?? 0) * 6)}%` }} />
              </div>
              <div className="um-role-foot">
                <span>
                  <strong>{role.permissions?.length ?? 0}</strong> {t("settings.access")}
                </span>
                <div className="um-person-actions">
                  <button type="button" className="btn btn-sm" onClick={() => openRoleEdit(role)}>
                    {t("common.edit")}
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
                      {t("common.delete")}
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
        <div
          className="modal-backdrop active um-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${t("common.edit")} ${editingUser.full_name}`}
        >
          <div className="modal-content um-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header um-modal-header">
              <div>
                <p className="um-kicker">{t("profile.identity")}</p>
                <h3 className="modal-title">{t("common.edit")} {editingUser.full_name}</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label={t("common.close")}
                onClick={() => setEditingUser(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-body auth-form">
              <div className="um-create-grid">
                <div className="form-group">
                  <label htmlFor="edit-name">{t("userManagement.fullName")}</label>
                  <input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-job">{t("common.jobTitle")}</label>
                  <input
                    id="edit-job"
                    value={editJobTitle}
                    onChange={(e) => setEditJobTitle(e.target.value)}
                  />
                </div>
                <div className="form-group um-span-2">
                  <label htmlFor="edit-role">{t("userManagement.role")}</label>
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
                  {t("settings.access")}
                  {editDiff.total > 0 ? (
                    <span className="um-diff-badge">
                      {editDiff.added.length > 0 ? `+${editDiff.added.length}` : ""}
                      {editDiff.added.length > 0 && editDiff.removed.length > 0 ? " / " : ""}
                      {editDiff.removed.length > 0 ? `−${editDiff.removed.length}` : ""}{" "}
                      {t("userManagement.vsRole")}
                    </span>
                  ) : null}
                </legend>
                {editRoleId ? (
                  <p className="um-perm-hint">
                    {editDiff.total > 0 ? (
                      <>
                        {t("userManagement.customizedHint")}{" "}
                        <button
                          type="button"
                          className="um-linkish"
                          onClick={() => {
                            const role = roles.find((r) => r.id === editRoleId);
                            if (role) setEditPerms(role.permissions as Permission[]);
                          }}
                        >
                          {t("userManagement.resetToRoleDefaults")}
                        </button>
                      </>
                    ) : (
                      t("userManagement.matchesRoleDefaults")
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
                  {t("common.cancel")}
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
                  {t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      ) : null}

      {roleFormOpen ? (
        <ModalPortal>
        <div
          className="modal-backdrop active um-modal"
          role="dialog"
          aria-modal="true"
          aria-label={
            editingRole
              ? `${t("common.edit")} ${t("userManagement.role")}`
              : `${t("common.create")} ${t("userManagement.role")}`
          }
        >
          <div className="modal-content um-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header um-modal-header">
              <div>
                <p className="um-kicker">{t("userManagement.role")}</p>
                <h3 className="modal-title">
                  {editingRole ? t("common.edit") : t("common.create")} {t("userManagement.role")}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label={t("common.close")}
                onClick={() => setRoleFormOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body auth-form">
              <div className="form-group">
                <label htmlFor="role-name">{t("common.name")}</label>
                <input
                  id="role-name"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  required
                  disabled={Boolean(editingRole?.is_system)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="role-desc">{t("common.description")}</label>
                <input id="role-desc" value={roleDesc} onChange={(e) => setRoleDesc(e.target.value)} />
              </div>
              <fieldset className="um-perm-fieldset">
                <legend>{t("settings.access")}</legend>
                {editingRole && roleMemberCount > 0 ? (
                  <p className="um-perm-hint">
                    {t("userManagement.roleSaveImpact", { count: roleMemberCount })}
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
                    : t("errors.roleSaveFailed")}
                </p>
              ) : null}
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setRoleFormOpen(false)}>
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saveRoleMutation.isPending || !roleName.trim()}
                  onClick={() => saveRoleMutation.mutate()}
                >
                  {t("common.save")} {t("userManagement.role")}
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
