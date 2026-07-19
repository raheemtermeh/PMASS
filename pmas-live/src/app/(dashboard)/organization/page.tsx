"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager } from "@/components/ResourceManager";
import { httpClient } from "@/core/api/http-client";
import type { Company, Department, Employee, Team } from "@/features/vsm/types";
import { employeeLabel } from "@/features/vsm/types";

type Tab = "structure" | "employees" | "departments" | "teams" | "membership";

export default function OrganizationPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("structure");
  const [memberTeamId, setMemberTeamId] = useState("");
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [memberError, setMemberError] = useState("");

  const { data: company } = useQuery({
    queryKey: ["vsm-company"],
    queryFn: () => httpClient.get<Company>("/api/v1/company"),
    staleTime: 60_000,
  });

  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ["vsm-employees"],
    queryFn: () => httpClient.get<Employee[]>("/api/v1/employees"),
    staleTime: 30_000,
  });

  const { data: departments = [], isLoading: deptLoading } = useQuery({
    queryKey: ["vsm-departments"],
    queryFn: () => httpClient.get<Department[]>("/api/v1/departments"),
    staleTime: 30_000,
  });

  const { data: teams = [], isLoading: teamLoading } = useQuery({
    queryKey: ["vsm-teams"],
    queryFn: () => httpClient.get<Team[]>("/api/v1/teams"),
    staleTime: 30_000,
  });

  const { data: teamMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: ["vsm-team-members", memberTeamId],
    queryFn: () => httpClient.get<Employee[]>(`/api/v1/teams/${memberTeamId}/members`),
    enabled: Boolean(memberTeamId),
    staleTime: 15_000,
  });

  const empCreate = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/employees", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-employees"] }),
  });
  const empUpdate = useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, unknown> }) =>
      httpClient.patch(`/api/v1/employees/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-employees"] }),
  });
  const empArchive = useMutation({
    mutationFn: (id: string | number) => httpClient.delete(`/api/v1/employees/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-employees"] }),
  });

  const deptCreate = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/departments", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-departments"] }),
  });
  const deptUpdate = useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, unknown> }) =>
      httpClient.patch(`/api/v1/departments/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-departments"] }),
  });
  const deptArchive = useMutation({
    mutationFn: (id: string | number) => httpClient.delete(`/api/v1/departments/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-departments"] }),
  });

  const teamCreate = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/teams", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-teams"] }),
  });
  const teamUpdate = useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, unknown> }) =>
      httpClient.patch(`/api/v1/teams/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-teams"] }),
  });
  const teamArchive = useMutation({
    mutationFn: (id: string | number) => httpClient.delete(`/api/v1/teams/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-teams"] }),
  });

  const assignMember = useMutation({
    mutationFn: ({ employeeId, teamId }: { employeeId: string; teamId: string }) =>
      httpClient.post(`/api/v1/employees/${employeeId}/teams/${teamId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vsm-team-members", memberTeamId] });
      setAssignEmployeeId("");
      setMemberError("");
    },
  });
  const removeMember = useMutation({
    mutationFn: ({ employeeId, teamId }: { employeeId: string; teamId: string }) =>
      httpClient.delete(`/api/v1/employees/${employeeId}/teams/${teamId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-team-members", memberTeamId] }),
  });

  const empOptions = employees.map((e) => ({
    value: e.id,
    label: employeeLabel(e),
  }));
  const deptOptions = departments.map((d) => ({ value: d.id, label: d.name }));
  const empName = (id?: string | null) => {
    const e = employees.find((x) => x.id === id);
    return e ? employeeLabel(e) : "—";
  };

  const orgTree = useMemo(() => {
    return departments
      .filter((d) => d.status !== "ARCHIVED")
      .map((dept) => ({
        dept,
        teams: teams.filter((t) => t.department_id === dept.id && t.status !== "ARCHIVED"),
      }));
  }, [departments, teams]);

  const memberIds = new Set(teamMembers.map((m) => m.id));
  const assignableEmployees = employees.filter(
    (e) => e.status !== "ARCHIVED" && !memberIds.has(e.id),
  );

  async function handleAssign(e: FormEvent) {
    e.preventDefault();
    setMemberError("");
    if (!memberTeamId || !assignEmployeeId) {
      setMemberError("Select a team and an employee.");
      return;
    }
    try {
      await assignMember.mutateAsync({ employeeId: assignEmployeeId, teamId: memberTeamId });
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Assign failed");
    }
  }

  return (
    <div className="page-stack">
      <section className="data-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" style={{ marginBottom: "0.35rem" }}>
              {company?.name ?? "Company"}
            </h2>
            <p className="text-dim" style={{ fontSize: "0.875rem" }}>
              Tenant = Company. Define who owns responsibility before creating Products.
              {company?.slug ? (
                <>
                  {" "}
                  Slug: <span className="font-mono">{company.slug}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="org-tab-row">
          {(
            [
              ["structure", "Structure"],
              ["employees", "Employees"],
              ["departments", "Departments"],
              ["teams", "Teams"],
              ["membership", "Team members"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`btn btn-sm${tab === id ? " btn-primary" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {tab === "structure" ? (
        <section className="data-panel">
          <h3 className="panel-title" style={{ marginBottom: "0.75rem" }}>
            Organization tree
          </h3>
          <p className="text-dim" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
            Department hierarchy with teams and leads — the structural view for MVP.
          </p>
          {deptLoading || teamLoading ? (
            <p className="text-dim">Loading structure…</p>
          ) : orgTree.length === 0 ? (
            <p className="text-dim">
              No departments yet. Create departments and teams to build the tree.
            </p>
          ) : (
            <div className="org-tree">
              {orgTree.map(({ dept, teams: deptTeams }) => (
                <article key={dept.id} className="org-tree-dept">
                  <header className="org-tree-dept-head">
                    <div>
                      <strong>{dept.name}</strong>
                      <span className="status-pill" style={{ marginLeft: "0.5rem" }}>
                        {dept.status}
                      </span>
                    </div>
                    <span className="text-dim" style={{ fontSize: "0.8rem" }}>
                      Manager: {empName(dept.manager_id)}
                    </span>
                  </header>
                  {deptTeams.length === 0 ? (
                    <p className="text-dim org-tree-empty">No teams in this department.</p>
                  ) : (
                    <ul className="org-tree-teams">
                      {deptTeams.map((team) => (
                        <li key={team.id}>
                          <div>
                            <strong>{team.name}</strong>
                            {team.description ? (
                              <p className="text-dim" style={{ fontSize: "0.8rem", marginTop: "0.2rem" }}>
                                {team.description}
                              </p>
                            ) : null}
                          </div>
                          <span className="text-dim" style={{ fontSize: "0.8rem" }}>
                            Lead: {empName(team.lead_id)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "employees" ? (
        <ResourceManager
          title="Employees"
          description="Business people in the company (User Account is separate). Create employees before assigning Product owners or managers."
          createLabel="Add employee"
          emptyTitle="No employees"
          emptyDescription="Add at least one employee to own Products and manage departments."
          isLoading={empLoading}
          items={employees}
          columns={[
            { key: "name", label: "Name", render: (r) => employeeLabel(r) },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
            {
              key: "status",
              label: "Status",
              render: (r) => <span className="status-pill">{r.status}</span>,
            },
          ]}
          fields={[
            { name: "first_name", label: "First name", required: true },
            { name: "last_name", label: "Last name", required: true },
            { name: "email", label: "Email", required: true },
            { name: "phone", label: "Phone" },
          ]}
          toFormValues={(r) => ({
            first_name: r.first_name,
            last_name: r.last_name,
            email: r.email,
            phone: r.phone ?? "",
          })}
          onCreate={async (v) => {
            await empCreate.mutateAsync({
              first_name: v.first_name,
              last_name: v.last_name,
              email: v.email,
              phone: v.phone,
            });
          }}
          onUpdate={async (id, v) => {
            await empUpdate.mutateAsync({
              id,
              body: {
                first_name: v.first_name,
                last_name: v.last_name,
                email: v.email,
                phone: v.phone,
              },
            });
          }}
          onDelete={async (id) => {
            await empArchive.mutateAsync(id);
          }}
        />
      ) : null}

      {tab === "departments" ? (
        <ResourceManager
          title="Departments"
          description="Own Product responsibility at each Stage. Manager is required."
          createLabel="Add department"
          emptyTitle="No departments"
          emptyDescription="Create departments that will own pipeline stages."
          isLoading={deptLoading}
          items={departments}
          columns={[
            { key: "name", label: "Name" },
            { key: "manager", label: "Manager", render: (r) => empName(r.manager_id) },
            {
              key: "status",
              label: "Status",
              render: (r) => <span className="status-pill">{r.status}</span>,
            },
          ]}
          fields={[
            { name: "name", label: "Name", required: true },
            {
              name: "manager_id",
              label: "Manager",
              type: "select",
              required: true,
              options: empOptions,
            },
          ]}
          toFormValues={(r) => ({
            name: r.name,
            manager_id: r.manager_id ?? "",
          })}
          onCreate={async (v) => {
            await deptCreate.mutateAsync({ name: v.name, manager_id: v.manager_id });
          }}
          onUpdate={async (id, v) => {
            await deptUpdate.mutateAsync({
              id,
              body: { name: v.name, manager_id: v.manager_id },
            });
          }}
          onDelete={async (id) => {
            await deptArchive.mutateAsync(id);
          }}
        />
      ) : null}

      {tab === "teams" ? (
        <ResourceManager
          title="Teams"
          description="Execution units under a department. Team lead is required."
          createLabel="Add team"
          emptyTitle="No teams"
          emptyDescription="Create teams after departments and employees exist."
          isLoading={teamLoading}
          items={teams}
          columns={[
            { key: "name", label: "Name" },
            {
              key: "department",
              label: "Department",
              render: (r) => departments.find((d) => d.id === r.department_id)?.name ?? "—",
            },
            { key: "lead", label: "Lead", render: (r) => empName(r.lead_id) },
            {
              key: "status",
              label: "Status",
              render: (r) => <span className="status-pill">{r.status}</span>,
            },
          ]}
          fields={[
            { name: "name", label: "Name", required: true },
            {
              name: "department_id",
              label: "Department",
              type: "select",
              required: true,
              options: deptOptions,
            },
            {
              name: "lead_id",
              label: "Team lead",
              type: "select",
              required: true,
              options: empOptions,
            },
            { name: "description", label: "Description", type: "textarea" },
          ]}
          toFormValues={(r) => ({
            name: r.name,
            department_id: r.department_id,
            lead_id: r.lead_id ?? "",
            description: r.description ?? "",
          })}
          onCreate={async (v) => {
            await teamCreate.mutateAsync({
              name: v.name,
              department_id: v.department_id,
              lead_id: v.lead_id,
              description: v.description,
            });
          }}
          onUpdate={async (id, v) => {
            await teamUpdate.mutateAsync({
              id,
              body: {
                name: v.name,
                description: v.description,
                lead_id: v.lead_id,
              },
            });
          }}
          onDelete={async (id) => {
            await teamArchive.mutateAsync(id);
          }}
        />
      ) : null}

      {tab === "membership" ? (
        <section className="data-panel">
          <h3 className="panel-title" style={{ marginBottom: "0.35rem" }}>
            Team membership
          </h3>
          <p className="text-dim" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
            Assign employees to teams, change membership, and review who executes work.
          </p>

          <div className="form-group" style={{ maxWidth: 420, marginBottom: "1rem" }}>
            <label htmlFor="member-team">Team</label>
            <select
              id="member-team"
              value={memberTeamId}
              onChange={(e) => {
                setMemberTeamId(e.target.value);
                setMemberError("");
              }}
            >
              <option value="">Select a team…</option>
              {teams
                .filter((t) => t.status !== "ARCHIVED")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {departments.find((d) => d.id === t.department_id)
                      ? ` · ${departments.find((d) => d.id === t.department_id)!.name}`
                      : ""}
                  </option>
                ))}
            </select>
          </div>

          {memberTeamId ? (
            <>
              <form onSubmit={handleAssign} className="org-assign-row">
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label htmlFor="assign-employee">Add employee</label>
                  <select
                    id="assign-employee"
                    value={assignEmployeeId}
                    onChange={(e) => setAssignEmployeeId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {assignableEmployees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {employeeLabel(e)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={assignMember.isPending}
                  style={{ alignSelf: "flex-end" }}
                >
                  {assignMember.isPending ? "Assigning…" : "Assign to team"}
                </button>
              </form>
              {memberError ? <p className="auth-error">{memberError}</p> : null}

              <div className="table-scroll" style={{ marginTop: "1.25rem" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {membersLoading ? (
                      <tr>
                        <td colSpan={4} className="text-dim">
                          Loading members…
                        </td>
                      </tr>
                    ) : teamMembers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-dim">
                          No members assigned yet.
                        </td>
                      </tr>
                    ) : (
                      teamMembers.map((m) => (
                        <tr key={m.id}>
                          <td>{employeeLabel(m)}</td>
                          <td>{m.email}</td>
                          <td>
                            <span className="status-pill">{m.status}</span>
                          </td>
                          <td className="actions-cell">
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() =>
                                removeMember.mutate({ employeeId: m.id, teamId: memberTeamId })
                              }
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-dim">Select a team to manage members.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
