package chat

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// ConversationRepository persists conversation and membership data.
type ConversationRepository interface {
	CreateConversation(ctx context.Context, c *Conversation) error
	GetConversationByID(ctx context.Context, companyID, id uuid.UUID) (*Conversation, error)
	GetConversationBySlug(ctx context.Context, companyID uuid.UUID, slug string) (*Conversation, error)
	FindDMByMembers(ctx context.Context, companyID, employeeA, employeeB uuid.UUID) (*Conversation, error)
	ListConversationsForEmployee(ctx context.Context, companyID, employeeID uuid.UUID, cursor string, limit int) ([]ConversationListItem, string, error)
	UpdateConversation(ctx context.Context, companyID uuid.UUID, c *Conversation) error
	SetConversationArchived(ctx context.Context, companyID, id uuid.UUID, archived bool) error
	UpdateConversationPreview(ctx context.Context, companyID, conversationID uuid.UUID, lastMessageID uuid.UUID, preview string, at time.Time) error
	ClearConversationPreview(ctx context.Context, companyID, conversationID uuid.UUID) error
	AddConversationMember(ctx context.Context, m *ConversationMember) error
	RemoveConversationMember(ctx context.Context, companyID, conversationID, employeeID uuid.UUID) error
	GetConversationMember(ctx context.Context, companyID, conversationID, employeeID uuid.UUID) (*ConversationMember, error)
	ListConversationMembers(ctx context.Context, companyID, conversationID uuid.UUID, limit int) ([]ConversationMember, error)
	UpdateMemberRole(ctx context.Context, companyID, conversationID, employeeID uuid.UUID, role string) error
	UpdateMemberSettings(ctx context.Context, companyID, conversationID, employeeID uuid.UUID, isMuted *bool, isArchived *bool, notificationLevel *string) error
	CountActiveMembers(ctx context.Context, companyID, conversationID uuid.UUID) (int, error)
	CountOwners(ctx context.Context, companyID, conversationID uuid.UUID) (int, error)
	EmployeeBelongsToCompany(ctx context.Context, companyID, employeeID uuid.UUID) (bool, error)
	TransferOwnership(ctx context.Context, companyID, conversationID, fromOwner, toMember uuid.UUID) error
}

// MessageRepository persists messages and read/delivery state.
type MessageRepository interface {
	CreateMessage(ctx context.Context, m *Message) error
	GetMessageByID(ctx context.Context, companyID, id uuid.UUID) (*Message, error)
	GetMessageByIDIncludingDeleted(ctx context.Context, companyID, id uuid.UUID) (*Message, error)
	GetLatestMessage(ctx context.Context, companyID, conversationID uuid.UUID) (*Message, error)
	ListMessages(ctx context.Context, companyID, conversationID uuid.UUID, q MessageListQuery) ([]Message, string, error)
	SearchMessages(ctx context.Context, companyID, employeeID uuid.UUID, q SearchQuery) ([]SearchHit, string, error)
	ListThreadMessages(ctx context.Context, companyID, conversationID, threadRootID uuid.UUID, q MessageListQuery) ([]Message, string, error)
	UpdateMessageContent(ctx context.Context, companyID, id uuid.UUID, content string, editedAt time.Time) error
	SoftDeleteMessage(ctx context.Context, companyID, id uuid.UUID, deletedAt time.Time) error
	IncrementThreadReplyCount(ctx context.Context, companyID, threadRootID uuid.UUID) error
	CreateForward(ctx context.Context, f *MessageForward) error
	MarkRead(ctx context.Context, companyID, messageID, employeeID uuid.UUID, readAt time.Time) error
	MarkDelivered(ctx context.Context, companyID, messageID, employeeID uuid.UUID, deliveredAt time.Time) error
	MarkReadUpTo(ctx context.Context, companyID, conversationID, messageID, employeeID uuid.UUID, readAt time.Time) error
}

// MentionRepository persists message mentions.
type MentionRepository interface {
	ReplaceMentions(ctx context.Context, companyID, messageID uuid.UUID, mentions []MessageMention) error
	ListMentionsByMessage(ctx context.Context, companyID, messageID uuid.UUID) ([]MessageMention, error)
	ResolveMentionables(ctx context.Context, companyID, conversationID uuid.UUID, tokens []string) (map[string]uuid.UUID, error)
}

// ReactionRepository manages message reactions.
type ReactionRepository interface {
	AddReaction(ctx context.Context, companyID uuid.UUID, r *MessageReaction) error
	RemoveReaction(ctx context.Context, companyID, messageID, employeeID uuid.UUID, emoji string) error
	ListReactions(ctx context.Context, companyID, messageID uuid.UUID) ([]MessageReaction, error)
}

// AttachmentRepository stores attachment metadata (binary data lives in object storage).
type AttachmentRepository interface {
	CreateAttachment(ctx context.Context, a *MessageAttachment) error
	GetAttachmentByID(ctx context.Context, companyID, id uuid.UUID) (*MessageAttachment, error)
}

// PresenceRepository persists user presence backup state.
type PresenceRepository interface {
	UpsertPresence(ctx context.Context, p *UserPresence) error
	GetPresence(ctx context.Context, companyID, employeeID uuid.UUID) (*UserPresence, error)
	ListPresence(ctx context.Context, companyID uuid.UUID, employeeIDs []uuid.UUID) ([]UserPresence, error)
	FilterCompanyEmployees(ctx context.Context, companyID uuid.UUID, employeeIDs []uuid.UUID) ([]uuid.UUID, error)
}

// BookmarkRepository manages per-user message bookmarks.
type BookmarkRepository interface {
	AddBookmark(ctx context.Context, companyID uuid.UUID, b *MessageBookmark) error
	RemoveBookmark(ctx context.Context, companyID, messageID, employeeID uuid.UUID) error
	ListBookmarks(ctx context.Context, companyID, employeeID uuid.UUID, cursor string, limit int) ([]MessageBookmark, string, error)
}

// PinRepository manages pinned messages in conversations.
type PinRepository interface {
	AddPin(ctx context.Context, companyID uuid.UUID, p *MessagePin) error
	RemovePin(ctx context.Context, companyID, conversationID, messageID uuid.UUID) error
	ListPins(ctx context.Context, companyID, conversationID uuid.UUID) ([]MessagePin, error)
}

// ModerationRepository handles reports and blocks.
type ModerationRepository interface {
	CreateReport(ctx context.Context, r *MessageReport) error
	ListReports(ctx context.Context, companyID uuid.UUID, status string, cursor string, limit int) ([]MessageReport, string, error)
	GetReport(ctx context.Context, companyID, id uuid.UUID) (*MessageReport, error)
	UpdateReportStatus(ctx context.Context, companyID, id, reviewerID uuid.UUID, status string) error
	CreateBlock(ctx context.Context, b *BlockedUser) error
	RemoveBlock(ctx context.Context, companyID, blockerID, blockedID uuid.UUID) error
	IsBlocked(ctx context.Context, companyID, blockerID, blockedID uuid.UUID) (bool, error)
	ListBlocks(ctx context.Context, companyID, blockerID uuid.UUID, cursor string, limit int) ([]BlockedUser, string, error)
}

// InvitationRepository manages conversation invitations.
type InvitationRepository interface {
	CreateInvitation(ctx context.Context, inv *ConversationInvitation) error
	GetInvitation(ctx context.Context, companyID, id uuid.UUID) (*ConversationInvitation, error)
	ListInvitationsForEmployee(ctx context.Context, companyID, employeeID uuid.UUID, status string, cursor string, limit int) ([]ConversationInvitation, string, error)
	FindPendingInvitation(ctx context.Context, companyID, conversationID, inviteeID uuid.UUID) (*ConversationInvitation, error)
	UpdateInvitationStatus(ctx context.Context, companyID, id uuid.UUID, status string) error
}

// DraftRepository stores per-user message drafts.
type DraftRepository interface {
	SaveDraft(ctx context.Context, companyID uuid.UUID, d *MessageDraft, ifUpdatedAt *time.Time) (*MessageDraft, error)
	GetDraft(ctx context.Context, companyID, conversationID, employeeID uuid.UUID) (*MessageDraft, error)
	DeleteDraft(ctx context.Context, companyID, conversationID, employeeID uuid.UUID) error
}

// AuditRepository appends immutable chat audit events.
type AuditRepository interface {
	Append(ctx context.Context, log *ChatAuditLog) error
}
