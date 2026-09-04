"use client";

import { Suspense } from "react";
import { ChatPageClient } from "@/features/chat/components/ChatPageClient";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="chat-shell chat-empty">…</div>}>
      <ChatPageClient />
    </Suspense>
  );
}
