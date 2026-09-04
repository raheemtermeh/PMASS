import { describe, expect, it } from "vitest";
import { BoundedEventDedupe } from "./dedupe";
import { chatErrorMessage, isDraftConflict } from "../errors";
import { HttpError } from "@/core/api/http-client";
import { applyChatEvent } from "./events";
import { QueryClient } from "@tanstack/react-query";
import { chatKeys } from "../query-keys";
import type { ChatMessage, CursorPage } from "../types";

describe("BoundedEventDedupe", () => {
  it("rejects duplicates and stays bounded", () => {
    const d = new BoundedEventDedupe(3);
    expect(d.accept("a")).toBe(true);
    expect(d.accept("a")).toBe(false);
    expect(d.accept("b")).toBe(true);
    expect(d.accept("c")).toBe(true);
    expect(d.accept("d")).toBe(true);
    // "a" evicted
    expect(d.accept("a")).toBe(true);
  });
});

describe("chatErrorMessage", () => {
  it("maps draft conflict", () => {
    const err = new HttpError("conflict", 409, undefined, "CHAT_DRAFT_CONFLICT");
    expect(isDraftConflict(err)).toBe(true);
    expect(chatErrorMessage(err, "en")).toMatch(/Draft/);
    expect(chatErrorMessage(err, "fa")).toMatch(/پیش‌نویس/);
  });
});

describe("applyChatEvent", () => {
  it("upserts message.created into cache", () => {
    const qc = new QueryClient();
    const msg: ChatMessage = {
      id: "m1",
      company_id: "c",
      conversation_id: "conv1",
      sender_id: "e2",
      content: "hello",
      created_at: new Date().toISOString(),
    };
    qc.setQueryData<CursorPage<ChatMessage>>(chatKeys.messages("conv1"), {
      items: [],
      has_more: false,
    });
    applyChatEvent(
      qc,
      {
        id: "evt1",
        type: "message.created",
        timestamp: new Date().toISOString(),
        payload: { message: msg },
      },
      { myEmployeeId: "e1", activeConversationId: "conv1" },
    );
    const page = qc.getQueryData<CursorPage<ChatMessage>>(chatKeys.messages("conv1"));
    expect(page?.items).toHaveLength(1);
    expect(page?.items[0].content).toBe("hello");
  });

  it("marks deleted messages", () => {
    const qc = new QueryClient();
    qc.setQueryData<CursorPage<ChatMessage>>(chatKeys.messages("conv1"), {
      items: [
        {
          id: "m1",
          company_id: "c",
          conversation_id: "conv1",
          sender_id: "e1",
          content: "secret",
          created_at: new Date().toISOString(),
        },
      ],
    });
    applyChatEvent(
      qc,
      {
        id: "evt2",
        type: "message.deleted",
        timestamp: new Date().toISOString(),
        payload: {
          message_id: "m1",
          conversation_id: "conv1",
          deleted_at: new Date().toISOString(),
        },
      },
      { myEmployeeId: "e1", activeConversationId: "conv1" },
    );
    const page = qc.getQueryData<CursorPage<ChatMessage>>(chatKeys.messages("conv1"));
    expect(page?.items[0].deleted_at).toBeTruthy();
    expect(page?.items[0].content).toBe("");
  });
});
