"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { httpClient } from "@/core/api/http-client";
import type { Employee } from "@/features/vsm/types";
import { employeeLabel } from "@/features/vsm/types";

interface Comment {
  id: string;
  author_id: string;
  body: string;
  parent_id?: string | null;
  created_at: string;
}

interface Attachment {
  id: string;
  file_name: string;
  path: string;
  category: string;
  size: number;
}

interface Activity {
  id: string;
  action: string;
  created_at: string;
}

export function CollaborationPanel({
  entityType,
  entityID,
}: {
  entityType: string;
  entityID: string;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [fileName, setFileName] = useState("");
  const [filePath, setFilePath] = useState("");
  const [error, setError] = useState("");

  const { data: employees = [] } = useQuery({
    queryKey: ["vsm-employees"],
    queryFn: () => httpClient.get<Employee[]>("/api/v1/employees"),
    staleTime: 60_000,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["vsm-comments", entityType, entityID],
    queryFn: () =>
      httpClient.get<Comment[]>(
        `/api/v1/comments?entity_type=${entityType}&entity_id=${entityID}`,
      ),
    enabled: Boolean(entityID),
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["vsm-attachments", entityType, entityID],
    queryFn: () =>
      httpClient.get<Attachment[]>(
        `/api/v1/attachments?entity_type=${entityType}&entity_id=${entityID}`,
      ),
    enabled: Boolean(entityID),
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["vsm-activities", entityType, entityID],
    queryFn: () =>
      httpClient.get<Activity[]>(
        `/api/v1/activities?entity_type=${entityType}&entity_id=${entityID}`,
      ),
    enabled: Boolean(entityID),
  });

  const authorID = employees[0]?.id;

  const addComment = useMutation({
    mutationFn: () =>
      httpClient.post("/api/v1/comments", {
        entity_type: entityType,
        entity_id: entityID,
        author_id: authorID,
        body,
      }),
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: ["vsm-comments", entityType, entityID] });
      void qc.invalidateQueries({ queryKey: ["vsm-activities", entityType, entityID] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const addAttachment = useMutation({
    mutationFn: () =>
      httpClient.post("/api/v1/attachments", {
        entity_type: entityType,
        entity_id: entityID,
        file_name: fileName,
        path: filePath,
        mime_type: "application/octet-stream",
        category: "general",
        size: 0,
      }),
    onSuccess: () => {
      setFileName("");
      setFilePath("");
      void qc.invalidateQueries({ queryKey: ["vsm-attachments", entityType, entityID] });
      void qc.invalidateQueries({ queryKey: ["vsm-activities", entityType, entityID] });
    },
    onError: (e: Error) => setError(e.message),
  });

  function onComment(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!authorID) {
      setError("Create an employee first (comment author).");
      return;
    }
    addComment.mutate();
  }

  function onAttach(e: FormEvent) {
    e.preventDefault();
    setError("");
    addAttachment.mutate();
  }

  const authorName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? employeeLabel(e) : id.slice(0, 8);
  };

  return (
    <section className="data-panel">
      <h3 className="panel-title" style={{ marginBottom: "0.75rem" }}>
        Collaboration
      </h3>
      {error ? <p className="auth-error">{error}</p> : null}

      <div className="grid grid-cols-2" style={{ gap: "1rem" }}>
        <div>
          <h4 style={{ marginBottom: "0.5rem" }}>Comments</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem", fontSize: "0.875rem" }}>
            {comments.map((c) => (
              <li key={c.id} style={{ padding: "0.4rem 0", borderBottom: "1px solid var(--border)" }}>
                <strong>{authorName(c.author_id)}</strong>
                <div>{c.body}</div>
              </li>
            ))}
            {comments.length === 0 ? <li className="text-dim">No comments yet.</li> : null}
          </ul>
          <form className="auth-form" onSubmit={onComment}>
            <div className="form-group">
              <label htmlFor="cmt">New comment</label>
              <textarea id="cmt" rows={3} value={body} onChange={(e) => setBody(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-sm btn-primary" disabled={addComment.isPending}>
              Post
            </button>
          </form>
        </div>

        <div>
          <h4 style={{ marginBottom: "0.5rem" }}>Attachments</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem", fontSize: "0.875rem" }}>
            {attachments.map((a) => (
              <li key={a.id} style={{ padding: "0.4rem 0", borderBottom: "1px solid var(--border)" }}>
                <a href={a.path} target="_blank" rel="noreferrer">
                  {a.file_name}
                </a>
                <span className="text-dim"> · {a.category}</span>
              </li>
            ))}
            {attachments.length === 0 ? <li className="text-dim">No attachments.</li> : null}
          </ul>
          <form className="auth-form" onSubmit={onAttach}>
            <div className="form-group">
              <label htmlFor="fn">File name</label>
              <input id="fn" value={fileName} onChange={(e) => setFileName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="fp">URL / path</label>
              <input id="fp" value={filePath} onChange={(e) => setFilePath(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-sm" disabled={addAttachment.isPending}>
              Add attachment
            </button>
          </form>
        </div>
      </div>

      <h4 style={{ margin: "1.25rem 0 0.5rem" }}>Activity timeline</h4>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.8rem" }}>
        {activities.map((a) => (
          <li key={a.id} className="font-mono" style={{ padding: "0.25rem 0" }}>
            {a.action}
          </li>
        ))}
        {activities.length === 0 ? <li className="text-dim">No activity yet.</li> : null}
      </ul>
    </section>
  );
}
