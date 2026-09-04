"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/core/auth/auth-store";
import { chatApi } from "../api";
import { chatKeys } from "../query-keys";
import { useChatUiStore } from "../ui-store";
import { applyChatEvent } from "../ws/events";
import { getChatSocket } from "../ws/manager";
import type { ChatEventEnvelope, ChatWsConnectionState } from "../types";

/** Connects the shared chat WebSocket and wires realtime cache updates. */
export function useChatRealtime(activeConversationId: string | null) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const setConnectionState = useChatUiStore((s) => s.setConnectionState);
  const setMyEmployeeId = useChatUiStore((s) => s.setMyEmployeeId);
  const setTyping = useChatUiStore((s) => s.setTyping);
  const setPresence = useChatUiStore((s) => s.setPresence);
  const myEmployeeId = useChatUiStore((s) => s.myEmployeeId);
  const activeRef = useRef(activeConversationId);
  activeRef.current = activeConversationId;

  useEffect(() => {
    if (!token) return;
    const sock = getChatSocket();
    const offState = sock.onState(setConnectionState);
    const offEvent = sock.onEvent((event: ChatEventEnvelope) => {
      if (event.type === "connected") {
        const emp = (event.payload as { employee_id?: string } | undefined)?.employee_id;
        if (emp) setMyEmployeeId(emp);
      }
      if (event.type === "typing.started" || event.type === "typing.stopped") {
        const cid = String(event.payload?.conversation_id ?? event.conversation_id ?? "");
        const eid = String(event.payload?.employee_id ?? event.actor_id ?? "");
        if (cid && eid) setTyping(cid, eid, event.type === "typing.started");
        return;
      }
      if (event.type === "presence.updated") {
        const eid = String(event.payload?.employee_id ?? "");
        const status = String(event.payload?.status ?? "offline");
        const last = (event.payload?.last_seen_at as string | null | undefined) ?? null;
        if (eid) setPresence(eid, status, last);
        return;
      }
      applyChatEvent(qc, event, {
        myEmployeeId: useChatUiStore.getState().myEmployeeId,
        activeConversationId: activeRef.current,
      });
    });
    sock.connect(token);
    return () => {
      offState();
      offEvent();
      // Keep socket alive across chat route remounts; disconnect only on logout.
    };
  }, [token, qc, setConnectionState, setMyEmployeeId, setTyping, setPresence]);

  useEffect(() => {
    if (!token) {
      getChatSocket().disconnect();
      setMyEmployeeId(null);
    }
  }, [token, setMyEmployeeId]);

  // Subscribe + sync after reconnect
  useEffect(() => {
    const sock = getChatSocket();
    if (!activeConversationId) return;
    sock.subscribe([activeConversationId]);
    return () => {
      sock.unsubscribe([activeConversationId]);
    };
  }, [activeConversationId]);

  useEffect(() => {
    const sock = getChatSocket();
    return sock.onState(async (state: ChatWsConnectionState) => {
      if (state !== "connected") return;
      const cid = activeRef.current;
      if (!cid) return;
      sock.subscribe([cid]);
      try {
        const page = await chatApi.listMessages(cid, { limit: 50 });
        const cached = qc.getQueryData<{ items: { id: string; created_at: string }[] }>(
          chatKeys.messages(cid),
        );
        const lastId = cached?.items?.[cached.items.length - 1]?.id;
        if (lastId) {
          const synced = await chatApi.sync(cid, lastId, 100);
          qc.setQueryData(chatKeys.messages(cid), (old: { items: typeof synced.items } | undefined) => {
            if (!old) return { items: synced.items, next_cursor: page.next_cursor, has_more: page.has_more };
            const map = new Map<string, (typeof synced.items)[number]>();
            for (const m of old.items) map.set(m.id, m);
            for (const m of synced.items) map.set(m.id, m);
            const items = [...map.values()].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            );
            return { ...old, items };
          });
        } else {
          qc.setQueryData(chatKeys.messages(cid), page);
        }
      } catch {
        /* ignore sync errors; UI can retry */
      }
    });
  }, [qc]);

  return { myEmployeeId };
}
