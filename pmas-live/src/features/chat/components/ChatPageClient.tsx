"use client";

import { useSearchParams } from "next/navigation";
import { ChatShell } from "@/features/chat/components/ChatShell";

export function ChatPageClient({ conversationId }: { conversationId?: string }) {
  const sp = useSearchParams();
  const messageId = sp.get("message");
  return (
    <ChatShell conversationId={conversationId ?? null} focusMessageId={messageId} />
  );
}
