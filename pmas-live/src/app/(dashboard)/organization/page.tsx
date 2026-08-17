"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager } from "@/components/ResourceManager";
import { OrgStructureGraph } from "@/components/visual/OrgStructureGraph";
import { httpClient } from "@/core/api/http-client";
import type {
  Company,
  Department,
  Employee,
  Team,
  TeamMemberView,
  TeamMembership,
} from "@/features/vsm/types";
import { employeeLabel } from "@/features/vsm/types";
import { useI18n } from "@/core/providers/I18nProvider";
import { localizedEnumLabel, statusTranslationKey } from "@/lib/localized-labels";

type Tab = "structure" | "employees" | "departments" | "teams" | "membership";

export default function OrganizationPage() {
  const { t, d } = useI18n();
  const qc = useQueryClient();
  const statusOptions = ["ACTIVE", "INACTIVE", "ARCHIVED"].map((value) => ({
    value,
    label: localizedEnumLabel(value, statusTranslationKey(value), t),
  }));
  const [tab, setTab] = useState<Tab>("structure");
  const [memberTeamId, setMemberTeamId] = useState("");
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [memberError, setMemberError] = useState("");
  const [teamError, setTeamError] = useState("");

  const [empSearch, setEmpSearch] = useState("");
  const [empStatus, setEmpStatus] = useState("");
  const [deptSearch, setDeptSearch] = useState("");
  const [jumpDept, setJumpDept] = useState("");
  const [jumpTeam, setJumpTeam] = useState("");
  const [highlightId, setHighlightId] = useState("");

  const { data: company } = useQuery({
    queryKey: ["vsm-company"],
    queryFn: () => httpClient.get<Company>("/api/v1/company"),
    staleTime: 60_000,
  });

  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ["vsm-employees", "list", 100],
    queryFn: () => httpClient.get<Employee[]>("/api/v1/employees?page_size=100"),
    staleTime: 30_000,
  });

  const { data: departments = [], isLoading: deptLoading } = useQuery({
    queryKey: ["vsm-departments", "list", 100],
    queryFn: () => httpClient.get<Department[]>("/api/v1/departments?page_size=100"),
    staleTime: 30_000,
  });

  const { data: teams = [], isLoading: teamLoading } = useQuery({
    queryKey: ["vsm-teams", "list", 100],
    queryFn: () => httpClient.get<Team[]>("/api/v1/teams?page_size=100"),
    staleTime: 30_000,
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ["vsm-team-memberships"],
    queryFn: () => httpClient.get<TeamMembership[]>("/api/v1/teams/memberships"),
    enabled: tab === "teams" || tab === "membership",
    staleTime: 15_000,
  });

  const { data: teamMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: ["vsm-team-members", memberTeamId],
    queryFn: () => httpClient.get<TeamMemberView[]>(`/api/v1/teams/${memberTeamId}/members`),
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
  const empDeactivate = useMutation({
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

  const refreshTeams = () => {
    void qc.invalidateQueries({ queryKey: ["vsm-teams"] });
    void qc.invalidateQueries({ queryKey: ["vsm-team-members"] });
    void qc.invalidateQueries({ queryKey: ["vsm-team-memberships"] });
  };

  const teamCreate = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/teams", body),
    onSuccess: refreshTeams,
  });
  const teamUpdate = useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: Record<string, unknown> }) =>
      httpClient.patch(`/api/v1/teams/${id}`, body),
    onSuccess: refreshTeams,
  });
  const teamArchive = useMutation({
    mutationFn: (id: string | number) => httpClient.delete(`/api/v1/teams/${id}`),
    onSuccess: refreshTeams,
  });
  const teamMove = useMutation({
    mutationFn: ({ id, departmentId }: { id: string; departmentId: string }) =>
      httpClient.post(`/api/v1/teams/${id}/move`, { department_id: departmentId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-teams"] }),
  });
  const teamStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      httpClient.post(`/api/v1/teams/${id}/status`, { status }),
    onSuccess: () => {
      setTeamError("");
      refreshTeams();
    },
    onError: (e: Error) => setTeamError(e.message),
  });

  const assignMember = useMutation({
    mutationFn: ({ employeeId, teamId }: { employeeId: string; teamId: string }) =>
      httpClient.post(`/api/v1/employees/${employeeId}/teams/${teamId}`),
    onSuccess: () => {
      refreshTeams();
      setAssignEmployeeId("");
      setMemberError("");
    },
  });
  const removeMember = useMutation({
    mutationFn: ({ employeeId, teamId }: { employeeId: string; teamId: string }) =>
      httpClient.delete(`/api/v1/employees/${employeeId}/teams/${teamId}`),
    onSuccess: refreshTeams,
  });

  const empOptions = employees
    .filter((e) => e.status === "ACTIVE")
    .map((e) => ({
      value: e.id,
      label: employeeLabel(e),
    }));
  const deptOptions = departments
    .filter((d) => d.status !== "ARCHIVED")
    .map((d) => ({ value: d.id, label: d.name }));
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

  /** employee id → team id they already belong to (one team per employee). */
  const teamByEmployee = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of memberships) map.set(m.employee_id, m.team_id);
    return map;
  }, [memberships]);

  const memberCountByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of memberships) map.set(m.team_id, (map.get(m.team_id) ?? 0) + 1);
    return map;
  }, [memberships]);

  // Anyone already placed on a team is unavailable — the backend rejects a second
  // membership, so filtering here avoids offering a choice that always fails.
  const assignableEmployees = employees.filter(
    (e) => e.status === "ACTIVE" && !teamByEmployee.has(e.id),
  );

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    return employees.filter((e) => {
      if (empStatus && e.status !== empStatus) return false;
      if (!q) return true;
      return (
        employeeLabel(e).toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.job_title || "").toLowerCase().includes(q)
      );
    });
  }, [employees, empSearch, empStatus]);

  const filteredDepartments = useMemo(() => {
    const q = deptSearch.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.description || "").toLowerCase().includes(q),
    );
  }, [departments, deptSearch]);

  async function handleAssign(e: FormEvent) {
    e.preventDefault();
    setMemberError("");
    if (!memberTeamId || !assignEmployeeId) {
      setMemberError(t("errors.selectTeamAndEmployee"));
      return;
    }
    try {
      await assignMember.mutateAsync({ employeeId: assignEmployeeId, teamId: memberTeamId });
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : t("errors.assignFailed"));
    }
  }

  function jumpToDepartment(id: string) {
    setJumpDept(id);
    setHighlightId(id);
    setTab("structure");
    requestAnimationFrame(() => {
      document.getElementById(`dept-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function jumpToTeam(id: string) {
    setJumpTeam(id);
    setHighlightId(id);
    setTab("structure");
    requestAnimationFrame(() => {
      document.getElementById(`team-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <div className="page-stack">
      <section className="data-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" style={{ marginBottom: "0.35rem" }}>
              {company?.name ?? t("common.company")}
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
              ["structure", t("organization.structure")],
              ["employees", t("organization.employees")],
              ["departments", t("organization.departments")],
              ["teams", t("organization.teams")],
              ["membership", t("organization.teamMembers")],
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
        <section className="page-stack">
          {deptLoading || teamLoading ? (
            <p className="text-dim">{t("organization.loadingStructure")}</p>
          ) : (
            <OrgStructureGraph
              company={company}
              departments={departments.filter((d) => d.status !== "ARCHIVED")}
              teams={teams.filter((t) => t.status !== "ARCHIVED")}
              empName={empName}
              highlightId={highlightId}
              onMoveTeam={async (teamId, departmentId) => {
                await teamMove.mutateAsync({ id: teamId, departmentId });
              }}
            />
          )}

          <section className="data-panel">
            <h3 className="panel-title" style={{ marginBottom: "0.75rem" }}>
              {t("organization.listView")}
            </h3>
            <div className="resource-toolbar">
              <select
                value={jumpDept}
                onChange={(e) => e.target.value && jumpToDepartment(e.target.value)}
                aria-label={t("organization.jumpToDepartment")}
              >
                <option value="">{t("organization.jumpToDepartment")}</option>
                {departments
                  .filter((d) => d.status !== "ARCHIVED")
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
              <select
                value={jumpTeam}
                onChange={(e) => e.target.value && jumpToTeam(e.target.value)}
                aria-label={t("organization.jumpToTeam")}
              >
                <option value="">{t("organization.jumpToTeam")}</option>
                {teams
                  .filter((t) => t.status !== "ARCHIVED")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
            {orgTree.length === 0 ? (
              <p className="text-dim">
                {t("organization.noStructure")}
              </p>
            ) : (
              <div className="org-tree">
                {orgTree.map(({ dept, teams: deptTeams }) => (
                  <article
                    key={dept.id}
                    id={`dept-list-${dept.id}`}
                    className={`org-tree-dept${highlightId === dept.id ? " is-highlight" : ""}`}
                  >
                    <header className="org-tree-dept-head">
                      <div>
                        <strong>{dept.name}</strong>
                        <span className="status-pill" style={{ marginLeft: "0.5rem" }}>
                          {localizedEnumLabel(dept.status, statusTranslationKey(dept.status), t)}
                        </span>
                      </div>
                      <span className="text-dim" style={{ fontSize: "0.8rem" }}>
                        {t("common.manager")}: {empName(dept.manager_id)}
                      </span>
                    </header>
                    {deptTeams.length === 0 ? (
                      <p className="text-dim org-tree-empty">{t("organization.noTeamsInDepartment")}</p>
                    ) : (
                      <ul className="org-tree-teams">
                        {deptTeams.map((team) => (
                          <li
                            key={team.id}
                            id={`team-list-${team.id}`}
                            className={highlightId === team.id ? "is-highlight" : undefined}
                          >
                            <div>
                              <strong>{team.name}</strong>
                              {team.description ? (
                                <p className="text-dim" style={{ fontSize: "0.8rem", marginTop: "0.2rem" }}>
                                  {team.description}
                                </p>
                              ) : null}
                            </div>
                            <span className="text-dim" style={{ fontSize: "0.8rem" }}>
                              {t("common.lead")}: {empName(team.lead_id)}
                              {typeof team.capacity === "number"
                                ? ` · ${t("common.capacity")} ${team.capacity}`
                                : ""}
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
        </section>
      ) : null}

      {tab === "employees" ? (
        <ResourceManager
          title={t("organization.employees")}
          description={t("organization.employeesHint")}
          createLabel={t("organization.addEmployee")}
          emptyTitle={t("organization.noEmployees")}
          emptyDescription={t("emptyStates.noEmployees")}
          isLoading={empLoading}
          items={filteredEmployees}
          deleteLabel={t("organization.deactivate")}
          pageSize={10}
          toolbar={
            <>
              <input
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                placeholder={t("organization.searchEmployees")}
                aria-label={t("organization.searchEmployees")}
              />
              <select
                value={empStatus}
                onChange={(e) => setEmpStatus(e.target.value)}
                aria-label={t("filters.byStatus")}
              >
                <option value="">{t("common.allStatuses")}</option>
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </>
          }
          columns={[
            { key: "name", label: t("common.name"), render: (r) => employeeLabel(r) },
            { key: "job_title", label: t("common.jobTitle"), render: (r) => r.job_title || "—" },
            { key: "email", label: t("common.email") },
            { key: "phone", label: t("common.phone") },
            {
              key: "status",
              label: t("common.status"),
              render: (r) => <span className="status-pill">{r.status}</span>,
            },
          ]}
          fields={[
            { name: "first_name", label: t("organization.firstName"), required: true },
            { name: "last_name", label: t("organization.lastName"), required: true },
            { name: "email", label: t("common.email"), required: true },
            { name: "job_title", label: t("common.jobTitle") },
            { name: "phone", label: t("common.phone") },
          ]}
          toFormValues={(r) => ({
            first_name: r.first_name,
            last_name: r.last_name,
            email: r.email,
            job_title: r.job_title ?? "",
            phone: r.phone ?? "",
          })}
          onCreate={async (v) => {
            await empCreate.mutateAsync({
              first_name: v.first_name,
              last_name: v.last_name,
              email: v.email,
              job_title: v.job_title,
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
                job_title: v.job_title,
                phone: v.phone,
              },
            });
          }}
          onDelete={async (id) => {
            await empDeactivate.mutateAsync(id);
          }}
          extraActions={(row) =>
            row.status === "INACTIVE" ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  void httpClient
                    .post(`/api/v1/employees/${row.id}/activate`)
                    .then(() => qc.invalidateQueries({ queryKey: ["vsm-employees"] }))
                }
              >
                Activate
              </button>
            ) : null
          }
        />
      ) : null}

      {tab === "departments" ? (
        <ResourceManager
          title={t("organization.departments")}
          description={t("organization.departmentsHint")}
          createLabel={t("organization.addDepartment")}
          emptyTitle={t("organization.noDepartments")}
          emptyDescription={t("emptyStates.noDepartments")}
          isLoading={deptLoading}
          items={filteredDepartments}
          deleteLabel="Archive"
          pageSize={10}
          toolbar={
            <input
              value={deptSearch}
              onChange={(e) => setDeptSearch(e.target.value)}
              placeholder={t("organization.searchDepartments")}
              aria-label={t("filters.searchDepartments")}
            />
          }
          columns={[
            { key: "name", label: t("common.name") },
            {
              key: "description",
              label: t("common.description"),
              render: (r) => {
                const d = (r.description || "").trim();
                if (!d) return "—";
                return d.length > 60 ? `${d.slice(0, 60)}…` : d;
              },
            },
            { key: "manager", label: t("common.manager"), render: (r) => empName(r.manager_id) },
            {
              key: "member_count",
              label: t("common.members"),
              render: (r) => String(r.member_count ?? 0),
            },
            {
              key: "team_count",
              label: t("organization.teams"),
              render: (r) => String(r.team_count ?? 0),
            },
            {
              key: "status",
              label: t("common.status"),
              render: (r) => <span className="status-pill">{r.status}</span>,
            },
          ]}
          fields={[
            { name: "name", label: t("common.name"), required: true },
            { name: "description", label: t("common.description"), type: "textarea" },
            {
              name: "manager_id",
              label: t("common.manager"),
              type: "select",
              required: true,
              options: empOptions,
            },
          ]}
          toFormValues={(r) => ({
            name: r.name,
            description: r.description ?? "",
            manager_id: r.manager_id ?? "",
          })}
          onCreate={async (v) => {
            await deptCreate.mutateAsync({
              name: v.name,
              description: v.description,
              manager_id: v.manager_id,
            });
          }}
          onUpdate={async (id, v) => {
            await deptUpdate.mutateAsync({
              id,
              body: { name: v.name, description: v.description, manager_id: v.manager_id },
            });
          }}
          onDelete={async (id) => {
            await deptArchive.mutateAsync(id);
          }}
        />
      ) : null}

      {tab === "teams" ? (
        <ResourceManager
          title={t("organization.teams")}
          description={t("organization.teamsHint")}
          createLabel={t("organization.addTeam")}
          emptyTitle={t("organization.noTeams")}
          emptyDescription={t("emptyStates.noTeams")}
          isLoading={teamLoading}
          items={teams}
          deleteLabel="Archive"
          pageSize={10}
          toolbar={
            teamError ? (
              <p className="auth-error" style={{ margin: 0, width: "100%" }}>
                {teamError}
              </p>
            ) : null
          }
          columns={[
            { key: "name", label: t("common.name") },
            {
              key: "department",
              label: t("organization.department"),
              render: (r) => departments.find((d) => d.id === r.department_id)?.name ?? "—",
            },
            { key: "lead", label: t("common.lead"), render: (r) => empName(r.lead_id) },
            {
              key: "members",
              label: t("common.members"),
              render: (r) => {
                const count = memberCountByTeam.get(r.id) ?? 0;
                const capacity = r.capacity ?? 0;
                const over = capacity > 0 && count > capacity;
                return (
                  <span
                    className="font-mono"
                    style={over ? { color: "#fda4af" } : undefined}
                    title={over ? `Over planned capacity by ${count - capacity}` : undefined}
                  >
                    {count}
                    {capacity > 0 ? ` / ${capacity}` : ""}
                  </span>
                );
              },
            },
            {
              key: "capacity",
              label: t("common.capacity"),
              render: (r) => <span className="font-mono">{r.capacity ?? 0}</span>,
            },
            {
              key: "status",
              label: t("common.status"),
              render: (r) => (
                <select
                  className="team-status-select"
                  aria-label={`Change status of ${r.name}`}
                  value={r.status}
                  disabled={teamStatus.isPending}
                  onChange={(e) => teamStatus.mutate({ id: r.id, status: e.target.value })}
                >
                  {statusOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              ),
            },
          ]}
          fields={[
            { name: "name", label: t("common.name"), required: true },
            {
              name: "department_id",
              label: t("organization.department"),
              type: "select",
              required: true,
              options: deptOptions,
            },
            {
              name: "lead_id",
              label: t("organization.teamLead"),
              type: "select",
              required: true,
              options: empOptions,
            },
            {
              name: "capacity",
              label: "Capacity (planned headcount, used by reports)",
              type: "number",
            },
            {
              name: "status",
              label: t("common.status"),
              type: "select",
              options: statusOptions,
            },
            { name: "description", label: t("common.description"), type: "textarea" },
          ]}
          toFormValues={(r) => ({
            name: r.name,
            department_id: r.department_id,
            lead_id: r.lead_id ?? "",
            capacity: String(r.capacity ?? 0),
            status: r.status,
            description: r.description ?? "",
          })}
          onCreate={async (v) => {
            await teamCreate.mutateAsync({
              name: v.name,
              department_id: v.department_id,
              lead_id: v.lead_id,
              capacity: Number(v.capacity) || 0,
              status: v.status,
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
                capacity: Number(v.capacity) || 0,
                status: v.status,
              },
            });
          }}
          onDelete={async (id) => {
            await teamArchive.mutateAsync(id);
          }}
          extraActions={(row) => (
            <select
              className="btn btn-sm"
              aria-label={t("organization.moveToDepartment", { name: row.name })}
              value=""
              disabled={teamMove.isPending}
              onChange={(e) => {
                if (!e.target.value) return;
                teamMove.mutate({ id: row.id, departmentId: e.target.value });
                e.target.value = "";
              }}
            >
              <option value="">{t("organization.moveTo")}</option>
              {deptOptions
                .filter((d) => d.value !== row.department_id)
                .map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
            </select>
          )}
        />
      ) : null}

      {tab === "membership" ? (
        <section className="data-panel">
          <h3 className="panel-title" style={{ marginBottom: "0.35rem" }}>
            {t("organization.teamMembership")}
          </h3>
          <p className="text-dim" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
            {t("organization.membershipHint")}
          </p>

          <div className="form-group" style={{ maxWidth: 420, marginBottom: "1rem" }}>
            <label htmlFor="member-team">{t("common.team")}</label>
            <select
              id="member-team"
              value={memberTeamId}
              onChange={(e) => {
                setMemberTeamId(e.target.value);
                setMemberError("");
              }}
            >
              <option value="">{t("organization.selectTeam")}</option>
              {teams
                .filter((team) => team.status !== "ARCHIVED")
                .map((team) => {
                  const dept = departments.find((d) => d.id === team.department_id);
                  const count = memberCountByTeam.get(team.id) ?? 0;
                  const members = team.capacity
                    ? t("organization.membersSuffixCapacity", {
                        count,
                        capacity: team.capacity,
                      })
                    : t("organization.membersSuffix", { count });
                  return (
                    <option key={team.id} value={team.id}>
                      {team.name}
                      {dept ? ` · ${dept.name}` : ""}
                      {` · ${members}`}
                    </option>
                  );
                })}
            </select>
          </div>

          {memberTeamId ? (
            <>
              <form onSubmit={handleAssign} className="org-assign-row">
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label htmlFor="assign-employee">{t("organization.addEmployee")}</label>
                  <select
                    id="assign-employee"
                    value={assignEmployeeId}
                    onChange={(e) => setAssignEmployeeId(e.target.value)}
                  >
                    <option value="">{t("welcome.select")}</option>
                    {assignableEmployees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {employeeLabel(e)}
                        {e.job_title ? ` · ${e.job_title}` : ""}
                      </option>
                    ))}
                  </select>
                  {assignableEmployees.length === 0 ? (
                    <p className="text-dim" style={{ fontSize: "0.78rem", marginTop: "0.35rem" }}>
                      {t("organization.allEmployeesAssigned")}
                    </p>
                  ) : null}
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={assignMember.isPending}
                  style={{ alignSelf: "flex-end" }}
                >
                  {assignMember.isPending
                    ? t("organization.assigning")
                    : t("organization.assignToTeam")}
                </button>
              </form>
              {memberError ? <p className="auth-error">{memberError}</p> : null}

              <div className="table-scroll" style={{ marginTop: "1.25rem" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("organization.member")}</th>
                      <th>{t("organization.jobTitle")}</th>
                      <th>{t("common.email")}</th>
                      <th>{t("common.status")}</th>
                      <th>{t("organization.assignedAt")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {membersLoading ? (
                      <tr>
                        <td colSpan={6} className="text-dim">
                          {t("organization.loadingMembers")}
                        </td>
                      </tr>
                    ) : teamMembers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-dim">
                          {t("organization.noMembersAssigned")}
                        </td>
                      </tr>
                    ) : (
                      teamMembers.map((m) => (
                        <tr key={m.employee_id}>
                          <td>
                            {`${m.first_name} ${m.last_name}`.trim()}
                            {m.team_role === "LEAD" ? (
                              <span className="status-pill" style={{ marginInlineStart: "0.35rem" }}>
                                {t("organization.lead")}
                              </span>
                            ) : null}
                          </td>
                          <td>{m.job_title || "—"}</td>
                          <td>{m.email}</td>
                          <td>
                            <span className="status-pill">
                              {localizedEnumLabel(m.status, statusTranslationKey(m.status), t)}
                            </span>
                          </td>
                          <td className="text-dim" style={{ fontSize: "0.8rem" }}>
                            {m.assigned_at
                              ? d(m.assigned_at, {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                          <td className="actions-cell">
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() =>
                                removeMember.mutate({
                                  employeeId: m.employee_id,
                                  teamId: memberTeamId,
                                })
                              }
                            >
                              {t("common.remove")}
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
            <p className="text-dim">{t("organization.selectTeamToManage")}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
