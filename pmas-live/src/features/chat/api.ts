import { httpClient } from "@/core/api/http-client";
import type {
  ChatBlock,
  ChatBookmark,
  ChatConversation,
  ChatConversationListItem,
  ChatDraft,
  ChatInvitation,
  ChatMember,
  ChatMessage,
  ChatNotificationPage,
  ChatPin,
  ChatPresence,
  ChatReaction,
  ChatReport,
  ChatSearchHit,
  ContentFormat,
  CursorPage,
  InvitationStatus,
  MemberRole,
  NotificationLevel,
  ReportReason,
  ReportStatus,
} from "./types";

const BASE = "/api/v1/chat";

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const chatApi = {
  listConversations(cursor?: string, limit = 50) {
    return httpClient.get<CursorPage<ChatConversationListItem>>(
      `${BASE}/conversations${qs({ cursor, limit })}`,
    );
  },
  getConversation(id: string) {
    return httpClient.get<ChatConversation>(`${BASE}/conversations/${id}`);
  },
  createDM(otherEmployeeId: string) {
    return httpClient.post<ChatConversation>(`${BASE}/conversations`, {
      type: "DM",
      other_employee_id: otherEmployeeId,
    });
  },
  createGroup(name: string, memberIds: string[]) {
    return httpClient.post<ChatConversation>(`${BASE}/conversations`, {
      type: "GROUP",
      name,
      member_ids: memberIds,
    });
  },
  createChannel(input: {
    name: string;
    slug?: string;
    description?: string;
    visibility?: string;
  }) {
    return httpClient.post<ChatConversation>(`${BASE}/conversations`, {
      type: "CHANNEL",
      ...input,
    });
  },
  updateConversation(
    id: string,
    body: Partial<{
      name: string;
      description: string;
      avatar_url: string;
      visibility: string;
      slug: string;
    }>,
  ) {
    return httpClient.patch<ChatConversation>(`${BASE}/conversations/${id}`, body);
  },
  archive(id: string) {
    return httpClient.post<{ archived: boolean }>(`${BASE}/conversations/${id}/archive`);
  },
  unarchive(id: string) {
    return httpClient.post<{ archived: boolean }>(`${BASE}/conversations/${id}/unarchive`);
  },
  leave(id: string) {
    return httpClient.post<{ status: string }>(`${BASE}/conversations/${id}/leave`);
  },
  markReadUpTo(conversationId: string, messageId: string) {
    return httpClient.post(`${BASE}/conversations/${conversationId}/read`, {
      message_id: messageId,
    });
  },
  updateSettings(
    id: string,
    body: Partial<{
      is_muted: boolean;
      is_archived: boolean;
      notification_level: NotificationLevel;
    }>,
  ) {
    return httpClient.patch<ChatMember>(`${BASE}/conversations/${id}/settings`, body);
  },
  transferOwner(conversationId: string, employeeId: string) {
    return httpClient.post(`${BASE}/conversations/${conversationId}/transfer-owner`, {
      employee_id: employeeId,
    });
  },
  listMembers(conversationId: string, limit = 100) {
    return httpClient.get<ChatMember[]>(
      `${BASE}/conversations/${conversationId}/members${qs({ limit })}`,
    );
  },
  addMember(conversationId: string, employeeId: string) {
    return httpClient.post(`${BASE}/conversations/${conversationId}/members`, {
      employee_id: employeeId,
    });
  },
  removeMember(conversationId: string, employeeId: string) {
    return httpClient.delete(
      `${BASE}/conversations/${conversationId}/members/${employeeId}`,
    );
  },
  updateMemberRole(conversationId: string, employeeId: string, role: MemberRole) {
    return httpClient.patch(
      `${BASE}/conversations/${conversationId}/members/${employeeId}/role`,
      { role },
    );
  },
  listMessages(
    conversationId: string,
    opts?: { cursor?: string; limit?: number; direction?: "before" | "after" },
  ) {
    return httpClient.get<CursorPage<ChatMessage>>(
      `${BASE}/conversations/${conversationId}/messages${qs({
        cursor: opts?.cursor,
        limit: opts?.limit ?? 50,
        direction: opts?.direction,
      })}`,
    );
  },
  sendMessage(
    conversationId: string,
    body: {
      content: string;
      message_type?: string;
      content_format?: ContentFormat;
      parent_message_id?: string;
      thread_root_id?: string;
    },
  ) {
    return httpClient.post<ChatMessage>(
      `${BASE}/conversations/${conversationId}/messages`,
      body,
    );
  },
  getMessage(id: string) {
    return httpClient.get<ChatMessage>(`${BASE}/messages/${id}`);
  },
  editMessage(id: string, content: string) {
    return httpClient.patch<ChatMessage>(`${BASE}/messages/${id}`, { content });
  },
  deleteMessage(id: string) {
    return httpClient.delete(`${BASE}/messages/${id}`);
  },
  reply(messageId: string, content: string) {
    return httpClient.post<ChatMessage>(`${BASE}/messages/${messageId}/reply`, { content });
  },
  forward(messageId: string, targetConversationIds: string[], comment?: string) {
    return httpClient.post<ChatMessage[]>(`${BASE}/messages/${messageId}/forward`, {
      target_conversation_ids: targetConversationIds,
      comment,
    });
  },
  addReaction(messageId: string, emoji: string) {
    return httpClient.post<ChatReaction[]>(`${BASE}/messages/${messageId}/reactions`, {
      emoji,
    });
  },
  removeReaction(messageId: string, emoji: string) {
    return httpClient.delete<ChatReaction[]>(
      `${BASE}/messages/${messageId}/reactions${qs({ emoji })}`,
    );
  },
  addBookmark(messageId: string) {
    return httpClient.post(`${BASE}/messages/${messageId}/bookmark`);
  },
  removeBookmark(messageId: string) {
    return httpClient.delete(`${BASE}/messages/${messageId}/bookmark`);
  },
  markMessageRead(messageId: string) {
    return httpClient.post(`${BASE}/messages/${messageId}/read`);
  },
  markDelivered(messageId: string) {
    return httpClient.post(`${BASE}/messages/${messageId}/delivered`);
  },
  reportMessage(messageId: string, reason: ReportReason, details?: string) {
    return httpClient.post<ChatReport>(`${BASE}/messages/${messageId}/report`, {
      reason,
      details,
    });
  },
  listThread(messageId: string, cursor?: string, limit = 50) {
    return httpClient.get<CursorPage<ChatMessage>>(
      `${BASE}/messages/${messageId}/thread${qs({ cursor, limit })}`,
    );
  },
  listPins(conversationId: string) {
    return httpClient.get<ChatPin[]>(`${BASE}/conversations/${conversationId}/pins`);
  },
  pinMessage(conversationId: string, messageId: string) {
    return httpClient.post<ChatPin>(`${BASE}/conversations/${conversationId}/pins`, {
      message_id: messageId,
    });
  },
  unpinMessage(conversationId: string, messageId: string) {
    return httpClient.delete(`${BASE}/conversations/${conversationId}/pins/${messageId}`);
  },
  getDraft(conversationId: string) {
    return httpClient.get<ChatDraft>(`${BASE}/conversations/${conversationId}/draft`);
  },
  saveDraft(
    conversationId: string,
    body: { content: string; parent_message_id?: string | null; updated_at?: string },
  ) {
    return httpClient.put<ChatDraft>(`${BASE}/conversations/${conversationId}/draft`, body);
  },
  deleteDraft(conversationId: string) {
    return httpClient.delete(`${BASE}/conversations/${conversationId}/draft`);
  },
  sync(conversationId: string, afterMessageId?: string, limit = 50) {
    return httpClient.get<CursorPage<ChatMessage>>(
      `${BASE}/sync${qs({
        conversation_id: conversationId,
        after_message_id: afterMessageId,
        limit,
      })}`,
    );
  },
  searchGlobal(q: string, cursor?: string, limit = 30) {
    return httpClient.get<CursorPage<ChatSearchHit>>(
      `${BASE}/search${qs({ q, cursor, limit })}`,
    );
  },
  searchConversation(conversationId: string, q: string, cursor?: string, limit = 30) {
    return httpClient.get<CursorPage<ChatSearchHit>>(
      `${BASE}/conversations/${conversationId}/search${qs({ q, cursor, limit })}`,
    );
  },
  presence(employeeIds: string[]) {
    return httpClient.get<{ items: ChatPresence[] }>(
      `${BASE}/presence${qs({ employee_ids: employeeIds.join(",") })}`,
    );
  },
  listBookmarks(cursor?: string, limit = 50) {
    return httpClient.get<CursorPage<ChatBookmark>>(
      `${BASE}/bookmarks${qs({ cursor, limit })}`,
    );
  },
  listInvitations(status?: InvitationStatus, cursor?: string, limit = 50) {
    return httpClient.get<CursorPage<ChatInvitation>>(
      `${BASE}/invitations${qs({ status, cursor, limit })}`,
    );
  },
  createInvitation(conversationId: string, employeeId: string) {
    return httpClient.post<ChatInvitation>(
      `${BASE}/conversations/${conversationId}/invitations`,
      { employee_id: employeeId },
    );
  },
  acceptInvitation(id: string) {
    return httpClient.post(`${BASE}/invitations/${id}/accept`);
  },
  rejectInvitation(id: string) {
    return httpClient.post(`${BASE}/invitations/${id}/reject`);
  },
  listReports(status?: ReportStatus, cursor?: string, limit = 50) {
    return httpClient.get<CursorPage<ChatReport>>(
      `${BASE}/reports${qs({ status, cursor, limit })}`,
    );
  },
  updateReport(id: string, status: ReportStatus) {
    return httpClient.patch<ChatReport>(`${BASE}/reports/${id}`, { status });
  },
  listBlocks(cursor?: string, limit = 50) {
    return httpClient.get<CursorPage<ChatBlock>>(`${BASE}/blocks${qs({ cursor, limit })}`);
  },
  blockUser(employeeId: string) {
    return httpClient.post(`${BASE}/blocks`, { employee_id: employeeId });
  },
  unblockUser(employeeId: string) {
    return httpClient.delete(`${BASE}/blocks/${employeeId}`);
  },
  listNotifications(cursor?: string, limit = 30, unreadOnly?: boolean) {
    return httpClient.get<ChatNotificationPage>(
      `/api/v1/notifications${qs({
        cursor,
        page_size: limit,
        unread: unreadOnly ? "true" : undefined,
      })}`,
    );
  },
  markNotificationRead(id: string) {
    return httpClient.post(`/api/v1/notifications/${id}/read`);
  },
  markAllNotificationsRead() {
    return httpClient.post(`/api/v1/notifications/read-all`);
  },
};
