/** TypeScript types matching PMASS chat backend responses. */

export type ConversationType = "DM" | "GROUP" | "CHANNEL";
export type MemberRole = "owner" | "admin" | "moderator" | "member";
export type NotificationLevel = "all" | "mentions" | "none";
export type PresenceStatus = "online" | "away" | "offline";
export type ContentFormat = "plain" | "markdown";
export type InvitationStatus = "pending" | "accepted" | "rejected" | "expired" | "cancelled";
export type ReportStatus = "open" | "resolved" | "rejected" | "dismissed";
export type ReportReason = "spam" | "harassment" | "inappropriate" | "other";

export interface CursorPage<T> {
  items: T[];
  next_cursor?: string;
  has_more?: boolean;
}

export interface ChatConversation {
  id: string;
  company_id: string;
  type: ConversationType;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  visibility?: string | null;
  avatar_url?: string | null;
  created_by?: string | null;
  is_archived?: boolean;
  last_message_id?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  created_at?: string;
  updated_at?: string;
  version?: number;
}

export interface ChatConversationListItem extends ChatConversation {
  member_count?: number;
  member_is_archived?: boolean;
  is_muted?: boolean;
  notification_level?: NotificationLevel;
  unread_count?: number;
  unread_is_capped?: boolean;
  last_read_message_id?: string | null;
  last_read_at?: string | null;
}

export interface ChatMember {
  id?: string;
  company_id: string;
  conversation_id: string;
  employee_id: string;
  role: MemberRole;
  joined_at?: string;
  left_at?: string | null;
  is_muted?: boolean;
  is_archived?: boolean;
  notification_level?: NotificationLevel;
  last_read_message_id?: string | null;
  last_read_at?: string | null;
}

export interface ChatMessage {
  id: string;
  company_id: string;
  conversation_id: string;
  sender_id: string;
  message_type?: string;
  content: string;
  content_format?: ContentFormat;
  parent_message_id?: string | null;
  thread_root_id?: string | null;
  thread_reply_count?: number;
  metadata?: Record<string, unknown> | null;
  is_edited?: boolean;
  edited_at?: string | null;
  is_pinned?: boolean;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  reactions?: ChatReaction[];
}

export interface ChatReaction {
  id?: string;
  message_id: string;
  employee_id: string;
  emoji: string;
  created_at?: string;
}

export interface ChatDraft {
  conversation_id: string;
  employee_id: string;
  content: string;
  parent_message_id?: string | null;
  revision?: number;
  updated_at: string;
}

export interface ChatPresence {
  employee_id: string;
  status: PresenceStatus;
  last_seen_at?: string | null;
}

export interface ChatPin {
  id?: string;
  conversation_id: string;
  message_id: string;
  pinned_by?: string;
  pinned_at?: string;
  message?: ChatMessage;
}

export interface ChatBookmark {
  id?: string;
  company_id: string;
  employee_id: string;
  message_id: string;
  created_at?: string;
  message?: ChatMessage;
  conversation?: ChatConversation;
}

export interface ChatInvitation {
  id: string;
  company_id: string;
  conversation_id: string;
  inviter_id: string;
  invitee_id: string;
  status: InvitationStatus;
  created_at?: string;
  expires_at?: string | null;
  conversation?: ChatConversation;
}

export interface ChatReport {
  id: string;
  company_id: string;
  message_id: string;
  reporter_id: string;
  reason: ReportReason;
  details?: string;
  status: ReportStatus;
  created_at?: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  message?: ChatMessage;
}

export interface ChatBlock {
  id?: string;
  company_id: string;
  blocker_id: string;
  blocked_id: string;
  created_at?: string;
}

export interface ChatNotification {
  id: string;
  company_id?: string;
  receiver_id?: string;
  type: string;
  title: string;
  body?: string;
  is_read: boolean;
  source_type?: string | null;
  source_id?: string | null;
  action_url?: string | null;
  created_at?: string;
}

export interface ChatNotificationPage extends CursorPage<ChatNotification> {
  unread_count?: number;
}

export interface ChatSearchHit {
  message: ChatMessage;
  conversation?: ChatConversation;
  highlight?: string;
}

export type ChatWsConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface ChatEventEnvelope {
  id: string;
  type: string;
  timestamp: string;
  company_id?: string;
  conversation_id?: string;
  actor_id?: string;
  recipient_id?: string;
  payload?: Record<string, unknown>;
}

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡"] as const;
export const MAX_MESSAGE_LENGTH = 10_000;
export const MAX_FORWARD_TARGETS = 20;
