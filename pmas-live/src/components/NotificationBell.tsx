"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { httpClient } from "@/core/api/http-client";
import { useAuthStore } from "@/core/auth/auth-store";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const hasTenant = Boolean(user?.tenant_id);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data: items = [] } = useQuery({
    queryKey: ["vsm-notifications", "mine"],
    queryFn: () =>
      httpClient.get<NotificationItem[]>("/api/v1/notifications?mine=true&page_size=20"),
    enabled: hasTenant,
    staleTime: 20_000,
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => httpClient.post(`/api/v1/notifications/${id}/read`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vsm-notifications", "mine"] }),
  });

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  if (!hasTenant) return null;

  const unread = items.filter((item) => !item.is_read).length;

  return (
    <div className="notif-bell" ref={rootRef}>
      <button
        type="button"
        className="notif-bell-btn"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 ? <span className="notif-bell-badge">{unread > 9 ? "9+" : unread}</span> : null}
      </button>

      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">
            <strong>Notifications</strong>
            <Link href="/home" onClick={() => setOpen(false)}>
              Open dashboard
            </Link>
          </div>
          <ul className="notif-panel-list">
            {items.length === 0 ? (
              <li className="text-dim">No notifications yet.</li>
            ) : (
              items.slice(0, 8).map((n) => (
                <li key={n.id} className={n.is_read ? "is-read" : ""}>
                  <div>
                    <strong>{n.title}</strong>
                    <p>{n.body}</p>
                  </div>
                  {!n.is_read ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => markRead.mutate(n.id)}
                    >
                      Read
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
