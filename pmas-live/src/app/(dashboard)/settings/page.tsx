"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { httpClient } from "@/core/api/http-client";
import type { Company } from "@/features/vsm/types";

interface Credential {
  id: number;
  name: string;
  value: string;
  description: string;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [credName, setCredName] = useState("");
  const [credValue, setCredValue] = useState("");
  const [credDesc, setCredDesc] = useState("");
  const [msg, setMsg] = useState("");

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ["vsm-company"],
    queryFn: () => httpClient.get<Company>("/api/v1/company"),
  });

  useEffect(() => {
    if (!company) return;
    setName(company.name ?? "");
  }, [company]);

  const saveCompany = useMutation({
    mutationFn: () =>
      httpClient.put<Company>("/api/v1/company", {
        name,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vsm-company"] });
      setMsg("Company profile saved.");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const { data: credentials = [], isLoading } = useQuery({
    queryKey: ["credentials"],
    queryFn: () => httpClient.get<Credential[]>("/api/v1/credentials"),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (body: { name: string; value: string; description: string }) =>
      httpClient.post("/api/v1/credentials", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["credentials"] });
      setCredName("");
      setCredValue("");
      setCredDesc("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => httpClient.delete(`/api/v1/credentials?id=${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["credentials"] }),
  });

  function handleCompany(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    saveCompany.mutate();
  }

  function handleCred(e: FormEvent) {
    e.preventDefault();
    saveMutation.mutate({ name: credName, value: credValue, description: credDesc });
  }

  return (
    <div className="page-stack">
      <section className="data-panel">
        <h2 className="panel-title" style={{ marginBottom: "0.5rem" }}>
          Company profile
        </h2>
        <p className="text-dim" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
          Tenant = Company. Company delete is forbidden; you can update the display name.
        </p>
        {companyLoading ? (
          <p className="text-dim">Loading…</p>
        ) : (
          <form className="auth-form" onSubmit={handleCompany}>
            <div className="form-group">
              <label htmlFor="co-name">Company name</label>
              <input id="co-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            {company?.slug ? (
              <p className="text-dim" style={{ fontSize: "0.875rem" }}>
                Slug: <span className="font-mono">{company.slug}</span>
              </p>
            ) : null}
            {msg ? <p className="text-dim">{msg}</p> : null}
            <button type="submit" className="btn btn-primary" disabled={saveCompany.isPending}>
              {saveCompany.isPending ? "Saving…" : "Save company name"}
            </button>
          </form>
        )}
      </section>

      <section className="data-panel">
        <h2 className="panel-title">Integration credentials</h2>
        <form onSubmit={handleCred} className="inline-form grid grid-cols-2">
          <div className="form-group">
            <label htmlFor="cred-name">Name</label>
            <input id="cred-name" value={credName} onChange={(e) => setCredName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="cred-value">Secret value</label>
            <input
              id="cred-value"
              type="password"
              value={credValue}
              onChange={(e) => setCredValue(e.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="cred-desc">Description</label>
            <input id="cred-desc" value={credDesc} onChange={(e) => setCredDesc(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
            Save credential
          </button>
        </form>
      </section>

      <section className="data-panel">
        <h2 className="panel-title">Credential vault</h2>
        {isLoading ? (
          <p className="text-dim">Loading…</p>
        ) : credentials.length === 0 ? (
          <EmptyState title="No credentials" description="Optional vault for integration secrets." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Value</th>
                  <th>Description</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {credentials.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="font-mono">{c.value}</td>
                    <td>{c.description}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => deleteMutation.mutate(c.id)}
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
    </div>
  );
}
