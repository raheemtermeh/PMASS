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
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
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

  const invalidateComments = () => {
    void qc.invalidateQueries({ queryKey: ["vsm-comments", entityType, entityID] });
    void qc.invalidateQueries({ queryKey: ["vsm-activities", entityType, entityID] });
  };

  const addComment = useMutation({
    mutationFn: () =>
      httpClient.post("/api/v1/comments", {
        entity_type: entityType,
        entity_id: entityID,
        author_id: authorID,
        body,
        parent_id: replyTo?.id ?? null,
        mention_employee_ids: mentionIds,
      }),
    onSuccess: () => {
      setBody("");
      setReplyTo(null);
      setMentionIds([]);
      invalidateComments();
    },
    onError: (e: Error) => setError(e.message),
  });

  const editComment = useMutation({
    mutationFn: ({ id, newBody }: { id: string; newBody: string }) =>
      httpClient.patch(`/api/v1/comments/${id}`, { body: newBody }),
    onSuccess: () => {
      setEditingId(null);
      setEditBody("");
      invalidateComments();
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteComment = useMutation({
    mutationFn: (id: string) => httpClient.delete(`/api/v1/comments/${id}`),
    onSuccess: invalidateComments,
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
    if (!body.trim()) return;
    addComment.mutate();
  }

  function onAttach(e: FormEvent) {
    e.preventDefault();
    setError("");
    addAttachment.mutate();
  }

  function startEdit(c: Comment) {
    setEditingId(c.id);
    setEditBody(c.body);
  }

  function saveEdit() {
    if (!editingId || !editBody.trim()) return;
    editComment.mutate({ id: editingId, newBody: editBody.trim() });
  }

  function toggleMention(id: string) {
    setMentionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const authorName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? employeeLabel(e) : id.slice(0, 8);
  };

  // Group replies under their parent (single-level threading is sufficient for MVP).
  const topLevel = comments.filter((c) => !c.parent_id);
  const repliesOf = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  function renderComment(c: Comment, depth = 0) {
    return (
      <li
        key={c.id}
        style={{
          padding: "0.4rem 0",
          borderBottom: "1px solid var(--border)",
          marginLeft: depth ? `${depth * 1.25}rem` : undefined,
        }}
      >
        <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
          <div style={{ flex: 1 }}>
            <strong>{authorName(c.author_id)}</strong>
            {editingId === c.id ? (
              <div className="auth-form" style={{ marginTop: "0.35rem" }}>
                <textarea
                  rows={2}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                />
                <div className="flex" style={{ gap: "0.35rem" }}>
                  <button type="button" className="btn btn-sm btn-primary" onClick={saveEdit} disabled={editComment.isPending}>
                    Save
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>{c.body}</div>
            )}
          </div>
          {editingId !== c.id ? (
            <div className="flex" style={{ gap: "0.25rem" }}>
              <button type="button" className="btn btn-sm" onClick={() => setReplyTo(c)}>
                Reply
              </button>
              <button type="button" className="btn btn-sm" onClick={() => startEdit(c)}>
                Edit
              </button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteComment.mutate(c.id)}>
                Delete
              </button>
            </div>
          ) : null}
        </div>
        {repliesOf(c.id).length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: "0.35rem 0 0" }}>
            {repliesOf(c.id).map((r) => renderComment(r, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  }

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
            {topLevel.map((c) => renderComment(c))}
            {comments.length === 0 ? <li className="text-dim">No comments yet.</li> : null}
          </ul>
          <form className="auth-form" onSubmit={onComment}>
            {replyTo ? (
              <p className="text-dim" style={{ fontSize: "0.8rem" }}>
                Replying to <strong>{authorName(replyTo.author_id)}</strong>{" "}
                <button type="button" className="btn btn-sm" onClick={() => setReplyTo(null)}>
                  Cancel
                </button>
              </p>
            ) : null}
            <div className="form-group">
              <label htmlFor="cmt">New comment</label>
              <textarea id="cmt" rows={3} value={body} onChange={(e) => setBody(e.target.value)} required />
            </div>
            {employees.length > 0 ? (
              <div className="form-group">
                <label>Mention</label>
                <div className="flex" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
                  {employees.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className={`btn btn-sm${mentionIds.includes(e.id) ? " btn-primary" : ""}`}
                      onClick={() => toggleMention(e.id)}
                    >
                      @{employeeLabel(e)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <button type="submit" className="btn btn-sm btn-primary" disabled={addComment.isPending}>
              {addComment.isPending ? "Posting…" : "Post"}
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
