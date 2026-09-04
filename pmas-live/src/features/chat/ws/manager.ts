import { getApiBaseUrl } from "@/shared/config/env";
import type { ChatEventEnvelope, ChatWsConnectionState } from "../types";
import { BoundedEventDedupe } from "./dedupe";

type EventHandler = (event: ChatEventEnvelope) => void;
type StateHandler = (state: ChatWsConnectionState) => void;

function buildWsUrl(token: string): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) {
    const sep = explicit.includes("?") ? "&" : "?";
    return `${explicit}${sep}access_token=${encodeURIComponent(token)}`;
  }
  const api = getApiBaseUrl();
  let origin: string;
  if (api) {
    origin = api.replace(/^http/, "ws");
  } else if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    origin = `${proto}//${window.location.host}`;
  } else {
    origin = "ws://localhost:8080";
  }
  return `${origin}/api/v1/chat/ws?access_token=${encodeURIComponent(token)}`;
}

/**
 * Singleton WebSocket manager for PMASS Messenger.
 * One shared connection per browser session.
 */
export class ChatWebSocketManager {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private state: ChatWsConnectionState = "disconnected";
  private readonly subscriptions = new Set<string>();
  private readonly dedupe = new BoundedEventDedupe(2000);
  private readonly eventHandlers = new Set<EventHandler>();
  private readonly stateHandlers = new Set<StateHandler>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;
  private employeeId: string | null = null;

  getConnectionState(): ChatWsConnectionState {
    return this.state;
  }

  getEmployeeId(): string | null {
    return this.employeeId;
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onState(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    handler(this.state);
    return () => this.stateHandlers.delete(handler);
  }

  connect(token: string): void {
    this.token = token;
    this.intentionalClose = false;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.openSocket();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
    this.setState("disconnected");
  }

  subscribe(conversationIds: string[]): void {
    for (const id of conversationIds) this.subscriptions.add(id);
    this.send({ type: "subscribe", conversation_ids: conversationIds });
  }

  unsubscribe(conversationIds: string[]): void {
    for (const id of conversationIds) this.subscriptions.delete(id);
    this.send({ type: "unsubscribe", conversation_ids: conversationIds });
  }

  typingStart(conversationId: string): void {
    this.send({ type: "typing.start", conversation_id: conversationId });
  }

  typingStop(conversationId: string): void {
    this.send({ type: "typing.stop", conversation_id: conversationId });
  }

  setPresence(status: "online" | "away"): void {
    this.send({ type: "presence.set", status });
  }

  private openSocket(): void {
    if (!this.token) return;
    this.setState(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
    try {
      this.ws = new WebSocket(buildWsUrl(this.token));
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState("connected");
      this.startPing();
      if (this.subscriptions.size > 0) {
        this.send({ type: "subscribe", conversation_ids: [...this.subscriptions] });
      }
      this.setPresence("online");
    };

    this.ws.onmessage = (ev) => {
      let data: ChatEventEnvelope;
      try {
        data = JSON.parse(String(ev.data)) as ChatEventEnvelope;
      } catch {
        return;
      }
      if (data.id && !this.dedupe.accept(data.id)) return;
      if (data.type === "connected") {
        const emp = (data.payload as { employee_id?: string } | undefined)?.employee_id;
        if (emp) this.employeeId = emp;
      }
      for (const h of this.eventHandlers) h(data);
    };

    this.ws.onclose = () => {
      this.clearPing();
      this.ws = null;
      if (this.intentionalClose) {
        this.setState("disconnected");
        return;
      }
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will follow
    };
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  private scheduleReconnect(): void {
    this.setState("reconnecting");
    this.clearTimers();
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }

  private startPing(): void {
    this.clearPing();
    this.pingTimer = setInterval(() => this.send({ type: "ping" }), 25_000);
  }

  private clearPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private clearTimers(): void {
    this.clearPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setState(state: ChatWsConnectionState): void {
    this.state = state;
    for (const h of this.stateHandlers) h(state);
  }
}

let singleton: ChatWebSocketManager | null = null;

export function getChatSocket(): ChatWebSocketManager {
  if (!singleton) singleton = new ChatWebSocketManager();
  return singleton;
}
