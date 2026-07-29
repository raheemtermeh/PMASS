"use client";

import { DragEvent, FormEvent, useCallback, useRef, useState } from "react";
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

export type CollaborationVariant = "full" | "comments" | "files" | "activity";

export function CollaborationPanel({
  entityType,
  entityID,
  variant = "full",
}: {
  entityType: string;
  entityID: string;
  variant?: CollaborationVariant;
}) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  const showComments = variant === "full" || variant === "comments";
  const showFiles = variant === "full" || variant === "files";
  const showActivity = variant === "full" || variant === "activity";

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
    enabled: Boolean(entityID) && showComments,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["vsm-attachments", entityType, entityID],
    queryFn: () =>
      httpClient.get<Attachment[]>(
        `/api/v1/attachments?entity_type=${entityType}&entity_id=${entityID}`,
      ),
    enabled: Boolean(entityID) && showFiles,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["vsm-activities", entityType, entityID],
    queryFn: () =>
      httpClient.get<Activity[]>(
        `/api/v1/activities?entity_type=${entityType}&entity_id=${entityID}`,
      ),
    enabled: Boolean(entityID) && showActivity,
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

  const registerAttachment = useMutation({
    mutationFn: (file: File) =>
      httpClient.post("/api/v1/attachments", {
        entity_type: entityType,
        entity_id: entityID,
        file_name: file.name,
        path: `upload://${encodeURIComponent(file.name)}`,
        mime_type: file.type || "application/octet-stream",
        category: "general",
        size: file.size,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vsm-attachments", entityType, entityID] });
      void qc.invalidateQueries({ queryKey: ["vsm-activities", entityType, entityID] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const uploadFiles = useCallback(
    (files: FileList | File[]) => {
      setError("");
      const list = Array.from(files);
      if (list.length === 0) return;
      void Promise.all(list.map((file) => registerAttachment.mutateAsync(file))).catch((e: Error) =>
        setError(e.message),
      );
    },
    [registerAttachment],
  );

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

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
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

  const topLevel = comments.filter((c) => !c.parent_id);
  const repliesOf = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  function renderComment(c: Comment, depth = 0) {
    return (
      <li
        key={c.id}
        className="collab-comment-item"
        style={{ marginLeft: depth ? `${depth * 1.25}rem` : undefined }}
      >
        <div className="flex collab-comment-head">
          <div style={{ flex: 1 }}>
            <strong>{authorName(c.author_id)}</strong>
            {editingId === c.id ? (
              <div className="auth-form" style={{ marginTop: "0.35rem" }}>
                <textarea rows={2} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
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
          <ul className="collab-comment-list">
            {repliesOf(c.id).map((r) => renderComment(r, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  }

  const commentsBlock = showComments ? (
    <div className={variant === "full" ? "" : "collab-section"}>
      {variant !== "comments" ? <h4 className="collab-subtitle">Comments</h4> : null}
      <ul className="collab-comment-list">
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
          <label htmlFor="cmt">Comment</label>
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
          {addComment.isPending ? "Posting…" : "Post comment"}
        </button>
      </form>
    </div>
  ) : null;

  const filesBlock = showFiles ? (
    <div className={variant === "full" ? "" : "collab-section"}>
      {variant !== "files" ? <h4 className="collab-subtitle">Attachments</h4> : null}
      <ul className="collab-file-list">
        {attachments.map((a) => (
          <li key={a.id} className="collab-file-item">
            <span className="collab-file-name">{a.file_name}</span>
            <span className="text-dim">
              {(a.size / 1024).toFixed(1)} KB · {a.category}
            </span>
          </li>
        ))}
        {attachments.length === 0 ? <li className="text-dim">No files yet.</li> : null}
      </ul>
      <div
        className={`file-drop-zone${dragOver ? " file-drop-zone-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
      >
        <p className="file-drop-title">Drop files here or click to upload</p>
        <p className="text-dim file-drop-hint">Registers file metadata for this product</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {registerAttachment.isPending ? <p className="text-dim">Uploading…</p> : null}
    </div>
  ) : null;

  const activityBlock = showActivity ? (
    <div className={variant === "full" ? "" : "collab-section"}>
      {variant !== "activity" ? <h4 className="collab-subtitle">Activity</h4> : null}
      <ul className="product-activity-timeline">
        {activities.map((a) => (
          <li key={a.id} className="product-activity-item">
            <span className="product-activity-dot" aria-hidden />
            <div>
              <p>{a.action}</p>
              <time className="text-dim">{new Date(a.created_at).toLocaleString()}</time>
            </div>
          </li>
        ))}
        {activities.length === 0 ? <li className="text-dim">No activity yet.</li> : null}
      </ul>
    </div>
  ) : null;

  return (
    <section className={variant === "full" ? "data-panel" : undefined}>
      {variant === "full" ? (
        <h3 className="panel-title" style={{ marginBottom: "0.75rem" }}>
          Collaboration
        </h3>
      ) : null}
      {error ? <p className="auth-error">{error}</p> : null}

      {variant === "full" ? (
        <div className="grid grid-cols-2 collab-grid">
          {commentsBlock}
          {filesBlock}
        </div>
      ) : (
        <>
          {commentsBlock}
          {filesBlock}
          {activityBlock}
        </>
      )}

      {variant === "full" ? activityBlock : null}
    </section>
  );
}
