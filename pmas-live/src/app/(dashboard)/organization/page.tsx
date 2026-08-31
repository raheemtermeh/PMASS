"use client";

import dynamic from "next/dynamic";
import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageGuide } from "@/components/PageGuide";
import { ResourceManager } from "@/components/ResourceManager";
import { useToast } from "@/components/Toast";
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

const OrgStructureGraph = dynamic(
  () =>
    import("@/components/visual/OrgStructureGraph").then((mod) => ({
      default: mod.OrgStructureGraph,
    })),
  { ssr: false, loading: () => <p className="text-dim">…</p> },
);

type Tab = "structure" | "employees" | "departments" | "teams" | "membership";

export default function OrganizationPage() {
  const { t, d } = useI18n();
  const { showToast } = useToast();
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
  const [assignSearch, setAssignSearch] = useState("");
  const [selectedAssignIds, setSelectedAssignIds] = useState<string[]>([]);
  const [empSort, setEmpSort] = useState<"name_asc" | "name_desc" | "status">("name_asc");
  const [teamDeptFilter, setTeamDeptFilter] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [pendingRemove, setPendingRemove] = useState<TeamMemberView | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [openDeptCreate, setOpenDeptCreate] = useState(false);

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
    mutationFn: ({ id, departmentId }: { id: string; departmentId: string | null }) =>
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
  const independentTeams = useMemo(
    () => teams.filter((team) => !team.department_id && team.status !== "ARCHIVED"),
    [teams],
  );

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

  const filteredAssignable = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    if (!q) return assignableEmployees;
    return assignableEmployees.filter(
      (e) =>
        employeeLabel(e).toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.job_title || "").toLowerCase().includes(q),
    );
  }, [assignableEmployees, assignSearch]);

  /** Employees linked to a department via team membership or manager role. */
  const employeesInDepartment = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const m of memberships) {
      const team = teams.find((t) => t.id === m.team_id);
      if (!team?.department_id) continue;
      const set = map.get(team.department_id) ?? new Set<string>();
      set.add(m.employee_id);
      map.set(team.department_id, set);
    }
    for (const d of departments) {
      if (!d.manager_id) continue;
      const set = map.get(d.id) ?? new Set<string>();
      set.add(d.manager_id);
      map.set(d.id, set);
    }
    return map;
  }, [memberships, teams, departments]);

  const teamLeadOptions = (departmentId: string) => {
    if (!departmentId) return empOptions;
    const ids = employeesInDepartment.get(departmentId);
    if (!ids || ids.size === 0) return empOptions;
    return empOptions.filter((o) => ids.has(o.value));
  };

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    const list = employees.filter((e) => {
      if (empStatus && e.status !== empStatus) return false;
      if (!q) return true;
      return (
        employeeLabel(e).toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.job_title || "").toLowerCase().includes(q)
      );
    });
    return [...list].sort((a, b) => {
      if (empSort === "status") return a.status.localeCompare(b.status);
      const cmp = employeeLabel(a).localeCompare(employeeLabel(b));
      return empSort === "name_desc" ? -cmp : cmp;
    });
  }, [employees, empSearch, empStatus, empSort]);

  const filteredTeams = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    return teams.filter((team) => {
      if (teamDeptFilter && (team.department_id ?? "") !== teamDeptFilter) return false;
      if (!q) return true;
      const dept = departments.find((d) => d.id === team.department_id)?.name ?? "";
      return team.name.toLowerCase().includes(q) || dept.toLowerCase().includes(q);
    });
  }, [teams, teamDeptFilter, teamSearch, departments]);

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
    if (!memberTeamId) {
      setMemberError(t("errors.selectTeamAndEmployee"));
      return;
    }
    const ids = selectedAssignIds.length > 0 ? selectedAssignIds : assignEmployeeId ? [assignEmployeeId] : [];
    if (ids.length === 0) {
      setMemberError(t("errors.selectTeamAndEmployee"));
      return;
    }
    try {
      for (const employeeId of ids) {
        await assignMember.mutateAsync({ employeeId, teamId: memberTeamId });
      }
      setSelectedAssignIds([]);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : t("errors.assignFailed"));
    }
  }

  function toggleAssignSelection(id: string) {
    setSelectedAssignIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
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
      <PageGuide page="organization" />

      <section className="data-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" style={{ marginBottom: "0.35rem" }}>
              {company?.name ?? t("common.company")}
            </h2>
            <p className="text-dim" style={{ fontSize: "0.875rem" }}>
              {t("emptyStates.setupChecklist")}
              {company?.slug ? (
                <>
                  {" "}
                  · <span className="font-mono">{company.slug}</span>
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
            {orgTree.length === 0 && independentTeams.length === 0 ? (
              <EmptyState
                title={t("organization.noStructure")}
                description={t("emptyStates.setupChecklist")}
                action={
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setTab("departments");
                      setOpenDeptCreate(true);
                    }}
                  >
                    {t("org.createDepartmentCta")}
                  </button>
                }
                secondary={
                  <span className="text-dim">{t("emptyStates.departmentRoleExample")}</span>
                }
              />
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
                {independentTeams.length > 0 ? (
                  <article className="org-tree-dept">
                    <header className="org-tree-dept-head">
                      <div>
                        <strong>{t("organization.independentTeams")}</strong>
                        <span className="status-pill" style={{ marginLeft: "0.5rem" }}>
                          {independentTeams.length}
                        </span>
                      </div>
                      <span className="text-dim" style={{ fontSize: "0.8rem" }}>
                        {t("organization.independentTeamsHint")}
                      </span>
                    </header>
                    <ul className="org-tree-teams">
                      {independentTeams.map((team) => (
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
                  </article>
                ) : null}
              </div>
            )}
          </section>
        </section>
      ) : null}

      {tab === "employees" ? (
        <ResourceManager
          title={t("organization.employees")}
          description={t("emptyStates.employeeVsUser")}
          createLabel={t("org.createEmployeeCta")}
          emptyTitle={t("organization.noEmployees")}
          emptyDescription={t("emptyStates.employeeVsUser")}
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
                aria-label={t("users.filterByStatus")}
              >
                <option value="">{t("common.allStatuses")}</option>
                <option value="ACTIVE">{t("statuses.active")}</option>
                <option value="INACTIVE">{t("statuses.inactive")}</option>
              </select>
              <select
                value={empSort}
                onChange={(e) => setEmpSort(e.target.value as typeof empSort)}
                aria-label={t("filters.sortProducts")}
              >
                <option value="name_asc">{t("common.name")} A→Z</option>
                <option value="name_desc">{t("common.name")} Z→A</option>
                <option value="status">{t("common.status")}</option>
              </select>
            </>
          }
          columns={[
            { key: "name", label: t("common.name"), render: (r) => employeeLabel(r) },
            { key: "job_title", label: t("common.jobTitle"), render: (r) => r.job_title || "—" },
            {
              key: "status",
              label: t("common.status"),
              render: (r) => (
                <span className="status-pill">
                  {localizedEnumLabel(r.status, statusTranslationKey(r.status), t)}
                </span>
              ),
            },
          ]}
          fields={[
            {
              name: "first_name",
              label: t("organization.firstName"),
              required: true,
              group: t("org.personalGroup"),
            },
            {
              name: "last_name",
              label: t("organization.lastName"),
              required: true,
              group: t("org.personalGroup"),
            },
            {
              name: "job_title",
              label: t("common.jobTitle"),
              group: t("org.employmentGroup"),
            },
            {
              name: "email",
              label: t("common.email"),
              required: true,
              group: t("org.contactGroup"),
              helperText: t("emptyStates.employeeVsUser"),
            },
            { name: "phone", label: t("common.phone"), group: t("org.contactGroup") },
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
          moreActions={(row) =>
            row.status === "INACTIVE"
              ? [
                  {
                    id: "activate",
                    label: t("users.enableUser"),
                    onClick: () =>
                      void httpClient
                        .post(`/api/v1/employees/${row.id}/activate`)
                        .then(() => qc.invalidateQueries({ queryKey: ["vsm-employees"] })),
                  },
                ]
              : []
          }
        />
      ) : null}

      {tab === "departments" ? (
        <ResourceManager
          title={t("organization.departments")}
          description={t("organization.departmentsHint")}
          createLabel={t("org.createDepartmentCta")}
          emptyTitle={t("organization.noDepartments")}
          emptyDescription={t("emptyStates.needDepartmentFirst")}
          autoOpenCreate={openDeptCreate}
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
              helperText: t("org.managerFromEmployees"),
            },
          ]}
          toFormValues={(r) => ({
            name: r.name,
            description: r.description ?? "",
            manager_id: r.manager_id ?? "",
          })}
          onCreate={async (v) => {
            setOpenDeptCreate(false);
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
          description={`${t("organization.teamsHint")} ${t("emptyStates.setupChecklist")}`}
          createLabel={t("org.createTeamCta")}
          emptyTitle={t("organization.noTeams")}
          emptyDescription={t("emptyStates.needDepartmentFirst")}
          isLoading={teamLoading}
          items={filteredTeams}
          deleteLabel="Archive"
          pageSize={10}
          toolbar={
            <>
              <input
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                placeholder={t("organization.searchTeams")}
                aria-label={t("organization.searchTeams")}
              />
              <select
                value={teamDeptFilter}
                onChange={(e) => setTeamDeptFilter(e.target.value)}
                aria-label={t("organization.department")}
              >
                <option value="">{t("organization.allDepartments")}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {teamError ? (
                <p className="auth-error" style={{ margin: 0, width: "100%" }}>
                  {teamError}
                </p>
              ) : null}
            </>
          }
          columns={[
            { key: "name", label: t("common.name") },
            {
              key: "department",
              label: t("organization.department"),
              render: (r) =>
                r.department_id
                  ? departments.find((d) => d.id === r.department_id)?.name ?? "—"
                  : t("organization.independentTeam"),
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
              emptyOptionLabel: t("organization.noDepartmentIndependent"),
              options: deptOptions,
            },
            {
              name: "lead_id",
              label: t("organization.teamLead"),
              type: "select",
              required: true,
              options: (v) => teamLeadOptions(v.department_id ?? ""),
              helperText: t("org.teamLeadFiltered"),
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
            {
              name: "description",
              label: t("org.descriptionOptional"),
              type: "textarea",
              collapsible: true,
            },
          ]}
          toFormValues={(r) => ({
            name: r.name,
            department_id: r.department_id ?? "",
            lead_id: r.lead_id ?? "",
            capacity: String(r.capacity ?? 0),
            status: r.status,
            description: r.description ?? "",
          })}
          onCreate={async (v) => {
            await teamCreate.mutateAsync({
              name: v.name,
              department_id: v.department_id || null,
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
          moreActions={(row) => {
            const items: { id: string; label: string; onClick: () => void }[] = [];
            if (row.department_id) {
              items.push({
                id: "independent",
                label: t("organization.makeIndependent"),
                onClick: () => teamMove.mutate({ id: row.id, departmentId: null }),
              });
            }
            for (const d of deptOptions.filter((opt) => opt.value !== row.department_id)) {
              items.push({
                id: `move-${d.value}`,
                label: `${t("common.move")} → ${d.label}`,
                onClick: () => teamMove.mutate({ id: row.id, departmentId: d.value }),
              });
            }
            return items;
          }}
        />
      ) : null}

      {tab === "membership" ? (
        <section className="data-panel">
          <h3 className="panel-title" style={{ marginBottom: "0.35rem" }}>
            {t("organization.teamMembership")}
          </h3>
          <p className="text-dim" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
            {t("organization.membershipHint")} {t("emptyStates.setupChecklist")}
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
              <form onSubmit={handleAssign} className="org-assign-row org-assign-multi">
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label htmlFor="assign-search">{t("organization.addEmployee")}</label>
                  <input
                    id="assign-search"
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    placeholder={t("organization.searchEmployees")}
                    aria-label={t("organization.searchEmployees")}
                    style={{ marginBottom: "0.35rem" }}
                  />
                  <ul className="org-assign-checklist">
                    {filteredAssignable.map((e) => (
                      <li key={e.id}>
                        <label className="org-assign-check">
                          <input
                            type="checkbox"
                            checked={selectedAssignIds.includes(e.id)}
                            onChange={() => toggleAssignSelection(e.id)}
                          />
                          <span>
                            {employeeLabel(e)}
                            {e.job_title ? ` · ${e.job_title}` : ""}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {filteredAssignable.length === 0 ? (
                    <p className="text-dim" style={{ fontSize: "0.78rem", marginTop: "0.35rem" }}>
                      {assignableEmployees.length === 0
                        ? t("organization.allEmployeesAssigned")
                        : t("common.noResults")}
                    </p>
                  ) : null}
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={assignMember.isPending || selectedAssignIds.length === 0}
                  style={{ alignSelf: "flex-end" }}
                >
                  {assignMember.isPending
                    ? t("organization.assigning")
                    : selectedAssignIds.length > 1
                      ? `${t("organization.assignToTeam")} (${selectedAssignIds.length})`
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
                              onClick={() => setPendingRemove(m)}
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

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        title={t("common.confirmDelete")}
        description={t("org.removeMemberConfirm")}
        confirmLabel={t("common.remove")}
        tone="danger"
        busy={removeBusy}
        onCancel={() => !removeBusy && setPendingRemove(null)}
        onConfirm={() => {
          if (!pendingRemove || !memberTeamId) return;
          setRemoveBusy(true);
          void removeMember
            .mutateAsync({
              employeeId: pendingRemove.employee_id,
              teamId: memberTeamId,
            })
            .then(() => {
              setPendingRemove(null);
              showToast(t("org.removeMemberUndo"));
            })
            .finally(() => setRemoveBusy(false));
        }}
      />
    </div>
  );
}
