"use client";

import { create } from "zustand";
import type { ChatMessage, ChatWsConnectionState } from "./types";

export type ChatMobilePanel = "list" | "messages" | "details";

interface ChatUiState {
  connectionState: ChatWsConnectionState;
  myEmployeeId: string | null;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  threadRoot: ChatMessage | null;
  highlightMessageId: string | null;
  mobilePanel: ChatMobilePanel;
  detailsOpen: boolean;
  typingByConversation: Record<string, string[]>;
  presenceByEmployee: Record<string, { status: string; last_seen_at?: string | null }>;
  newMessageCount: number;
  setConnectionState: (s: ChatWsConnectionState) => void;
  setMyEmployeeId: (id: string | null) => void;
  setReplyTo: (m: ChatMessage | null) => void;
  setEditing: (m: ChatMessage | null) => void;
  setThreadRoot: (m: ChatMessage | null) => void;
  setHighlightMessageId: (id: string | null) => void;
  setMobilePanel: (p: ChatMobilePanel) => void;
  setDetailsOpen: (open: boolean) => void;
  setTyping: (conversationId: string, employeeId: string, typing: boolean) => void;
  setPresence: (employeeId: string, status: string, lastSeen?: string | null) => void;
  bumpNewMessages: () => void;
  clearNewMessages: () => void;
  resetComposerModes: () => void;
}

export const useChatUiStore = create<ChatUiState>((set) => ({
  connectionState: "disconnected",
  myEmployeeId: null,
  replyTo: null,
  editing: null,
  threadRoot: null,
  highlightMessageId: null,
  mobilePanel: "list",
  detailsOpen: true,
  typingByConversation: {},
  presenceByEmployee: {},
  newMessageCount: 0,
  setConnectionState: (connectionState) => set({ connectionState }),
  setMyEmployeeId: (myEmployeeId) => set({ myEmployeeId }),
  setReplyTo: (replyTo) => set({ replyTo, editing: null }),
  setEditing: (editing) => set({ editing, replyTo: null }),
  setThreadRoot: (threadRoot) => set({ threadRoot }),
  setHighlightMessageId: (highlightMessageId) => set({ highlightMessageId }),
  setMobilePanel: (mobilePanel) => set({ mobilePanel }),
  setDetailsOpen: (detailsOpen) => set({ detailsOpen }),
  setTyping: (conversationId, employeeId, typing) =>
    set((state) => {
      const cur = new Set(state.typingByConversation[conversationId] ?? []);
      if (typing) cur.add(employeeId);
      else cur.delete(employeeId);
      return {
        typingByConversation: {
          ...state.typingByConversation,
          [conversationId]: [...cur],
        },
      };
    }),
  setPresence: (employeeId, status, lastSeen) =>
    set((state) => ({
      presenceByEmployee: {
        ...state.presenceByEmployee,
        [employeeId]: { status, last_seen_at: lastSeen },
      },
    })),
  bumpNewMessages: () => set((s) => ({ newMessageCount: s.newMessageCount + 1 })),
  clearNewMessages: () => set({ newMessageCount: 0 }),
  resetComposerModes: () => set({ replyTo: null, editing: null }),
}));
