export const chatKeys = {
  all: ["chat"] as const,
  conversations: () => [...chatKeys.all, "conversations"] as const,
  conversation: (id: string) => [...chatKeys.all, "conversation", id] as const,
  members: (id: string) => [...chatKeys.all, "members", id] as const,
  messages: (id: string) => [...chatKeys.all, "messages", id] as const,
  pins: (id: string) => [...chatKeys.all, "pins", id] as const,
  draft: (id: string) => [...chatKeys.all, "draft", id] as const,
  thread: (id: string) => [...chatKeys.all, "thread", id] as const,
  bookmarks: () => [...chatKeys.all, "bookmarks"] as const,
  invitations: () => [...chatKeys.all, "invitations"] as const,
  reports: () => [...chatKeys.all, "reports"] as const,
  blocks: () => [...chatKeys.all, "blocks"] as const,
  presence: (ids: string[]) => [...chatKeys.all, "presence", ...ids.slice().sort()] as const,
  search: (q: string, conversationId?: string) =>
    [...chatKeys.all, "search", conversationId ?? "global", q] as const,
  notifications: () => [...chatKeys.all, "notifications"] as const,
};
