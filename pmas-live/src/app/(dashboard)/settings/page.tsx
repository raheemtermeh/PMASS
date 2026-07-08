"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { SectionWorkBoard } from "@/components/SectionWorkBoard";
import { httpClient } from "@/core/api/http-client";

interface Credential {
  id: number;
  name: string;
  value: string;
  description: string;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");

  const { data: credentials = [], isLoading } = useQuery({
    queryKey: ["credentials"],
    queryFn: () => httpClient.get<Credential[]>("/api/v1/credentials"),
  });

  const saveMutation = useMutation({
    mutationFn: (body: { name: string; value: string; description: string }) =>
      httpClient.post("/api/v1/credentials", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["credentials"] });
      setName("");
      setValue("");
      setDescription("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      httpClient.delete(`/api/v1/credentials?id=${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["credentials"] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    saveMutation.mutate({ name, value, description });
  }

  return (
    <div className="page-stack">
      <SectionWorkBoard
        section="settings"
        title="Settings workboard"
        description="Integration tasks, todos, and status updates for credentials & setup."
      />
      <section className="data-panel">
        <h2 className="panel-title">Add Integration Credential</h2>
        <form onSubmit={handleSubmit} className="inline-form grid grid-cols-2">
          <div className="form-group">
            <label htmlFor="cred-name">Name</label>
            <input id="cred-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="cred-value">Secret value</label>
            <input id="cred-value" type="password" value={value} onChange={(e) => setValue(e.target.value)} required />
          </div>
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="cred-desc">Description</label>
            <input id="cred-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
            Save credential
          </button>
        </form>
      </section>

      <section className="data-panel">
        <h2 className="panel-title">Credential Vault</h2>
        {isLoading ? (
          <p className="text-dim">Loading…</p>
        ) : credentials.length === 0 ? (
          <EmptyState
            title="No credentials stored"
            description="Add API keys and integration secrets above. Values are masked after save."
          />
        ) : (
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
              {credentials.map((cred) => (
                <tr key={cred.id}>
                  <td className="font-mono">{cred.name}</td>
                  <td>{cred.value}</td>
                  <td>{cred.description || "—"}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => deleteMutation.mutate(cred.id)}
                    >
                      Delete
                    </button>
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
