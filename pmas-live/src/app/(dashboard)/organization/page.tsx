"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResourceManager } from "@/components/ResourceManager";
import { httpClient } from "@/core/api/http-client";
import type { Company, Department, Employee, Team } from "@/features/vsm/types";
import { employeeLabel } from "@/features/vsm/types";

type Tab = "employees" | "departments" | "teams";

export default function OrganizationPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("employees");

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

  const empCreate = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/employees", body),
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
  const deptArchive = useMutation({
    mutationFn: (id: string | number) => httpClient.delete(`/api/v1/departments/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-departments"] }),
  });

  const teamCreate = useMutation({
    mutationFn: (body: Record<string, unknown>) => httpClient.post("/api/v1/teams", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-teams"] }),
  });
  const teamArchive = useMutation({
    mutationFn: (id: string | number) => httpClient.delete(`/api/v1/teams/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-teams"] }),
  });

  const empOptions = employees.map((e) => ({
    value: String(e.id),
    label: employeeLabel(e),
  }));
  const deptOptions = departments.map((d) => ({ value: String(d.id), label: d.name }));
  const empName = (id?: string | null) => {
    const e = employees.find((x) => x.id === id);
    return e ? employeeLabel(e) : "—";
  };

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
        <div className="flex" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          {(
            [
              ["employees", "Employees"],
              ["departments", "Departments"],
              ["teams", "Teams"],
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

      {tab === "employees" ? (
        <ResourceManager
          title="Employees"
          description="Business people in the company (User Account is separate). Create employees before assigning Product owners or managers."
          createLabel="Add employee"
          emptyTitle="No employees"
          emptyDescription="Add at least one employee to own Products and manage departments."
          isLoading={empLoading}
          items={employees}
          hideEdit
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
          onCreate={async (v) => {
            await empCreate.mutateAsync({
              first_name: v.first_name,
              last_name: v.last_name,
              email: v.email,
              phone: v.phone,
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
          hideEdit
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
          onCreate={async (v) => {
            await deptCreate.mutateAsync({ name: v.name, manager_id: v.manager_id });
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
          hideEdit
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
          onCreate={async (v) => {
            await teamCreate.mutateAsync({
              name: v.name,
              department_id: v.department_id,
              lead_id: v.lead_id,
              description: v.description,
            });
          }}
          onDelete={async (id) => {
            await teamArchive.mutateAsync(id);
          }}
        />
      ) : null}
    </div>
  );
}
