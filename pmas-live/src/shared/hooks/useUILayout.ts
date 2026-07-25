"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { httpClient } from "@/core/api/http-client";

interface UILayoutResponse {
  key: string;
  layout: Record<string, unknown>;
}

/**
 * Loads a per-user layout blob and exposes a debounced saver.
 * Only one PUT fires after `delayMs` of quiet edits (keeps request volume low).
 */
export function useUILayout<T extends object>(
  layoutKey: string,
  delayMs = 900,
) {
  const [layout, setLayout] = useState<T | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<number | null>(null);
  const lastSentRef = useRef<string>("");
  const pendingRef = useRef<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLayout(null);
    lastSentRef.current = "";
    httpClient
      .get<UILayoutResponse>(`/api/v1/ui-layouts/${encodeURIComponent(layoutKey)}`)
      .then((res) => {
        if (cancelled) return;
        const data = (res?.layout ?? {}) as T;
        setLayout(data);
        lastSentRef.current = JSON.stringify(data);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLayout({} as T);
        lastSentRef.current = "{}";
        setReady(true);
      });
    return () => {
      cancelled = true;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [layoutKey]);

  const flush = useCallback(async () => {
    const next = pendingRef.current;
    if (!next) return;
    const serialized = JSON.stringify(next);
    if (serialized === lastSentRef.current) return;
    setSaving(true);
    try {
      await httpClient.put(`/api/v1/ui-layouts/${encodeURIComponent(layoutKey)}`, {
        layout: next,
      });
      lastSentRef.current = serialized;
    } catch {
      // Keep pending; next edit/flush can retry.
    } finally {
      setSaving(false);
    }
  }, [layoutKey]);

  const saveLayout = useCallback(
    (next: T) => {
      setLayout(next);
      pendingRef.current = next;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void flush();
      }, delayMs);
    },
    [delayMs, flush],
  );

  const saveLayoutNow = useCallback(
    (next: T) => {
      setLayout(next);
      pendingRef.current = next;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      void flush();
    },
    [flush],
  );

  return { layout, ready, saving, saveLayout, saveLayoutNow, setLayout };
}
