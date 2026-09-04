"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ChatPageClient } from "@/features/chat/components/ChatPageClient";

export default function ChatConversationPage() {
  const params = useParams<{ conversationId: string }>();
  return (
    <Suspense fallback={<div className="chat-shell chat-empty">…</div>}>
      <ChatPageClient conversationId={params.conversationId} />
    </Suspense>
  );
}
