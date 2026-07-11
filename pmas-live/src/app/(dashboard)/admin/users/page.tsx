"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  type Permission,
} from "@/shared/permissions";

interface AppUser {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  permissions: string[];
}

export default function AdminUsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<Permission[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPerms, setEditPerms] = useState<Permission[]>([]);

  const tenantId = currentUser?.tenant_id;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users", tenantId],
    queryFn: () => httpClient.get<AppUser[]>("/api/v1/users"),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      httpClient.post<AppUser>("/api/v1/users", {
        email,
        password,
        full_name: fullName,
        role: "user",
        permissions: selectedPerms,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
      setEmail("");
      setFullName("");
      setPassword("");
      setSelectedPerms([]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, permissions }: { id: number; permissions: string[] }) =>
      httpClient.put<AppUser>(`/api/v1/users/${id}`, { permissions }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
      setEditingId(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      httpClient.put(`/api/v1/users/${id}`, { is_active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users", tenantId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/users/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users", tenantId] }),
  });

  if (!tenantId) {
    return (
      <EmptyState
        title="Company workspace required"
        description="User management is available inside a company account. Platform admins should provision companies first."
      />
    );
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  function togglePerm(
    list: Permission[],
    perm: Permission,
    setter: (v: Permission[]) => void,
  ) {
    setter(list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm]);
  }

  const assignablePerms = PERMISSIONS;

  return (
    <div className="page-stack">
      <section className="data-panel">
        <h2 className="panel-title">Create Employee</h2>
        <form onSubmit={handleCreate} className="user-form">
          <div className="grid grid-cols-2">
            <div className="form-group">
              <label htmlFor="u-email">Email</label>
              <input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="u-name">Full name</label>
              <input id="u-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="u-pass">Password</label>
              <input id="u-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
          </div>

          <fieldset className="perm-fieldset">
            <legend>Workspace permissions</legend>
            <div className="perm-grid">
              {assignablePerms.map((perm) => (
                <label key={perm} className="perm-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedPerms.includes(perm)}
                    onChange={() => togglePerm(selectedPerms, perm, setSelectedPerms)}
                  />
                  {PERMISSION_LABELS[perm]}
                </label>
              ))}
            </div>
          </fieldset>

          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            Create user
          </button>
        </form>
      </section>

      <section className="data-panel">
        <h2 className="panel-title">Company Users</h2>
        {isLoading ? (
          <p className="text-dim">Loading users…</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Permissions</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((userRow) => (
                <tr key={userRow.id}>
                  <td>{userRow.full_name}</td>
                  <td>{userRow.email}</td>
                  <td>
                    {userRow.role === "tenant_admin"
                      ? "Company Admin"
                      : userRow.role === "platform_admin"
                        ? "Platform Admin"
                        : "User"}
                  </td>
                  <td>{userRow.is_active ? "Active" : "Inactive"}</td>
                  <td>
                    {userRow.role === "tenant_admin" || userRow.role === "platform_admin" ? (
                      <span className="text-dim">All permissions</span>
                    ) : editingId === userRow.id ? (
                      <div className="perm-grid perm-grid-compact">
                        {assignablePerms.map((perm) => (
                          <label key={perm} className="perm-checkbox">
                            <input
                              type="checkbox"
                              checked={editPerms.includes(perm)}
                              onChange={() => togglePerm(editPerms, perm, setEditPerms)}
                            />
                            {PERMISSION_LABELS[perm]}
                          </label>
                        ))}
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() =>
                            updateMutation.mutate({ id: userRow.id, permissions: editPerms })
                          }
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <span>{userRow.permissions.join(", ") || "—"}</span>
                    )}
                  </td>
                  <td className="actions-cell">
                    {userRow.role === "user" && (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            setEditingId(userRow.id);
                            setEditPerms(userRow.permissions as Permission[]);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() =>
                            toggleMutation.mutate({
                              id: userRow.id,
                              is_active: !userRow.is_active,
                            })
                          }
                        >
                          {userRow.is_active ? "Deactivate" : "Activate"}
                        </button>
                        {userRow.id !== currentUser?.id && (
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => deleteMutation.mutate(userRow.id)}
                          >
                            Delete
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
