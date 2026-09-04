package chat

import (
	"encoding/json"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
)

const (
	ConversationTypeDM      = "DM"
	ConversationTypeGroup   = "GROUP"
	ConversationTypeChannel = "CHANNEL"

	VisibilityPublic  = "PUBLIC"
	VisibilityPrivate = "PRIVATE"

	MessageTypeText       = "TEXT"
	MessageTypeSystem     = "SYSTEM"
	MessageTypeAttachment = "ATTACHMENT"
	MessageTypeVoice      = "VOICE"
	MessageTypeForward    = "FORWARD"

	ContentFormatPlain    = "plain"
	ContentFormatMarkdown = "markdown"

	MemberRoleOwner     = "owner"
	MemberRoleAdmin     = "admin"
	MemberRoleModerator = "moderator"
	MemberRoleMember    = "member"

	NotificationLevelAll      = "all"
	NotificationLevelMentions = "mentions"
	NotificationLevelNone     = "none"

	PresenceOnline  = "online"
	PresenceAway    = "away"
	PresenceDND     = "dnd"
	PresenceOffline = "offline"

	MentionTypeUser     = "user"
	MentionTypeChannel  = "channel"
	MentionTypeEveryone = "everyone"

	ReportReasonSpam          = "spam"
	ReportReasonHarassment    = "harassment"
	ReportReasonInappropriate = "inappropriate"
	ReportReasonOther         = "other"

	ReportStatusPending   = "pending"
	ReportStatusReviewed  = "reviewed"
	ReportStatusActioned  = "actioned"
	ReportStatusDismissed = "dismissed"

	InvitationStatusPending  = "pending"
	InvitationStatusAccepted = "accepted"
	InvitationStatusDeclined = "declined"
	InvitationStatusExpired  = "expired"

	// UnreadCountCap bounds per-conversation unread scans in sidebar queries.
	UnreadCountCap = 100
)

var (
	validConversationTypes = map[string]struct{}{
		ConversationTypeDM: {}, ConversationTypeGroup: {}, ConversationTypeChannel: {},
	}
	validVisibilities = map[string]struct{}{
		VisibilityPublic: {}, VisibilityPrivate: {},
	}
	validMessageTypes = map[string]struct{}{
		MessageTypeText: {}, MessageTypeSystem: {}, MessageTypeAttachment: {},
		MessageTypeVoice: {}, MessageTypeForward: {},
	}
	validContentFormats = map[string]struct{}{
		ContentFormatPlain: {}, ContentFormatMarkdown: {},
	}
	validMemberRoles = map[string]struct{}{
		MemberRoleOwner: {}, MemberRoleAdmin: {}, MemberRoleModerator: {}, MemberRoleMember: {},
	}
	validNotificationLevels = map[string]struct{}{
		NotificationLevelAll: {}, NotificationLevelMentions: {}, NotificationLevelNone: {},
	}
	validPresenceStatuses = map[string]struct{}{
		PresenceOnline: {}, PresenceAway: {}, PresenceDND: {}, PresenceOffline: {},
	}
	validMentionTypes = map[string]struct{}{
		MentionTypeUser: {}, MentionTypeChannel: {}, MentionTypeEveryone: {},
	}
	validReportReasons = map[string]struct{}{
		ReportReasonSpam: {}, ReportReasonHarassment: {}, ReportReasonInappropriate: {}, ReportReasonOther: {},
	}
	validReportStatuses = map[string]struct{}{
		ReportStatusPending: {}, ReportStatusReviewed: {}, ReportStatusActioned: {}, ReportStatusDismissed: {},
	}
	validInvitationStatuses = map[string]struct{}{
		InvitationStatusPending: {}, InvitationStatusAccepted: {},
		InvitationStatusDeclined: {}, InvitationStatusExpired: {},
	}
)

// ConversationListItem is a conversation row enriched for sidebar listing.
type ConversationListItem struct {
	Conversation
	MemberCount       int64      `json:"member_count,omitempty"`
	MemberIsArchived  bool       `json:"member_is_archived"`
	IsMuted           bool       `json:"is_muted"`
	NotificationLevel string     `json:"notification_level,omitempty"`
	UnreadCount       int64      `json:"unread_count"`
	UnreadIsCapped    bool       `json:"unread_is_capped,omitempty"`
	LastReadMessageID *uuid.UUID `json:"last_read_message_id,omitempty"`
	LastReadAt        *time.Time `json:"last_read_at,omitempty"`
}

type Conversation struct {
	shared.BaseModel
	CompanyID          uuid.UUID  `json:"company_id"`
	Type               string     `json:"type"`
	Name               string     `json:"name,omitempty"`
	Slug               string     `json:"slug,omitempty"`
	Description        string     `json:"description,omitempty"`
	Visibility         string     `json:"visibility,omitempty"`
	AvatarURL          string     `json:"avatar_url,omitempty"`
	CreatedBy          *uuid.UUID `json:"created_by,omitempty"`
	IsArchived         bool       `json:"is_archived"`
	LastMessageID      *uuid.UUID `json:"last_message_id,omitempty"`
	LastMessageAt      *time.Time `json:"last_message_at,omitempty"`
	LastMessagePreview string     `json:"last_message_preview,omitempty"`
	DeletedAt          *time.Time `json:"deleted_at,omitempty"`
}

func NewConversation(companyID uuid.UUID, convType, name, slug, visibility string, createdBy *uuid.UUID) (*Conversation, error) {
	convType = strings.ToUpper(strings.TrimSpace(convType))
	if companyID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	if _, ok := validConversationTypes[convType]; !ok {
		return nil, ErrInvalidConversationType
	}
	name = strings.TrimSpace(name)
	slug = strings.TrimSpace(strings.ToLower(slug))
	visibility = strings.ToUpper(strings.TrimSpace(visibility))

	switch convType {
	case ConversationTypeDM:
		name = ""
		slug = ""
		visibility = ""
	case ConversationTypeGroup:
		if name == "" {
			return nil, shared.New("CHAT_GROUP_NAME_REQUIRED", "Group name is required", 400)
		}
		slug = ""
		visibility = ""
	case ConversationTypeChannel:
		if name == "" {
			return nil, shared.New("CHAT_CHANNEL_NAME_REQUIRED", "Channel name is required", 400)
		}
		if slug == "" {
			return nil, shared.New("CHAT_CHANNEL_SLUG_REQUIRED", "Channel slug is required", 400)
		}
		if visibility == "" {
			visibility = VisibilityPublic
		}
		if _, ok := validVisibilities[visibility]; !ok {
			return nil, ErrInvalidVisibility
		}
	}

	return &Conversation{
		BaseModel:   shared.NewBase(),
		CompanyID:   companyID,
		Type:        convType,
		Name:        name,
		Slug:        slug,
		Description: "",
		Visibility:  visibility,
		CreatedBy:   createdBy,
	}, nil
}

type ConversationMember struct {
	ID                uuid.UUID  `json:"id"`
	CompanyID         uuid.UUID  `json:"company_id"`
	ConversationID    uuid.UUID  `json:"conversation_id"`
	EmployeeID        uuid.UUID  `json:"employee_id"`
	Role              string     `json:"role"`
	JoinedAt          time.Time  `json:"joined_at"`
	LastReadAt        *time.Time `json:"last_read_at,omitempty"`
	LastReadMessageID *uuid.UUID `json:"last_read_message_id,omitempty"`
	IsMuted           bool       `json:"is_muted"`
	IsArchived        bool       `json:"is_archived"`
	NotificationLevel string     `json:"notification_level"`
	LeftAt            *time.Time `json:"left_at,omitempty"`
}

func NewConversationMember(companyID, conversationID, employeeID uuid.UUID, role string) (*ConversationMember, error) {
	if companyID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	if conversationID == uuid.Nil {
		return nil, ErrConversationRequired
	}
	if employeeID == uuid.Nil {
		return nil, ErrEmployeeRequired
	}
	role = strings.ToLower(strings.TrimSpace(role))
	if role == "" {
		role = MemberRoleMember
	}
	if _, ok := validMemberRoles[role]; !ok {
		return nil, ErrInvalidMemberRole
	}
	return &ConversationMember{
		ID:                uuid.New(),
		CompanyID:         companyID,
		ConversationID:    conversationID,
		EmployeeID:        employeeID,
		Role:              role,
		JoinedAt:          time.Now().UTC(),
		NotificationLevel: NotificationLevelAll,
	}, nil
}

func ValidateNotificationLevel(level string) error {
	level = strings.ToLower(strings.TrimSpace(level))
	if level == "" {
		return nil
	}
	if _, ok := validNotificationLevels[level]; !ok {
		return ErrInvalidNotificationLevel
	}
	return nil
}

type ConversationRole struct {
	ID             uuid.UUID       `json:"id"`
	CompanyID      uuid.UUID       `json:"company_id"`
	ConversationID uuid.UUID       `json:"conversation_id"`
	Name           string          `json:"name"`
	Permissions    json.RawMessage `json:"permissions"`
	CreatedAt      time.Time       `json:"created_at"`
}

type Message struct {
	ID               uuid.UUID       `json:"id"`
	CompanyID        uuid.UUID       `json:"company_id"`
	ConversationID   uuid.UUID       `json:"conversation_id"`
	SenderID         *uuid.UUID      `json:"sender_id,omitempty"`
	MessageType      string          `json:"message_type"`
	Content          string          `json:"content,omitempty"`
	ContentFormat    string          `json:"content_format"`
	ParentMessageID  *uuid.UUID      `json:"parent_message_id,omitempty"`
	ThreadRootID     *uuid.UUID      `json:"thread_root_id,omitempty"`
	ThreadReplyCount int             `json:"thread_reply_count"`
	Metadata         json.RawMessage `json:"metadata,omitempty"`
	IsEdited         bool            `json:"is_edited"`
	EditedAt         *time.Time      `json:"edited_at,omitempty"`
	IsPinned         bool            `json:"is_pinned"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
	DeletedAt        *time.Time      `json:"deleted_at,omitempty"`
}

func NewMessage(companyID, conversationID uuid.UUID, senderID *uuid.UUID, messageType, content, contentFormat string) (*Message, error) {
	if companyID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	if conversationID == uuid.Nil {
		return nil, ErrConversationRequired
	}
	messageType = strings.ToUpper(strings.TrimSpace(messageType))
	if messageType == "" {
		messageType = MessageTypeText
	}
	if _, ok := validMessageTypes[messageType]; !ok {
		return nil, ErrInvalidMessageType
	}
	contentFormat = strings.ToLower(strings.TrimSpace(contentFormat))
	if contentFormat == "" {
		contentFormat = ContentFormatPlain
	}
	if _, ok := validContentFormats[contentFormat]; !ok {
		return nil, ErrInvalidContentFormat
	}
	content = strings.TrimSpace(content)
	if messageType == MessageTypeText && content == "" {
		return nil, ErrMessageBodyRequired
	}
	if messageType == MessageTypeSystem && senderID != nil {
		return nil, shared.New("CHAT_SYSTEM_SENDER_FORBIDDEN", "System messages cannot have a sender", 400)
	}
	if messageType != MessageTypeSystem && (senderID == nil || *senderID == uuid.Nil) {
		return nil, ErrEmployeeRequired
	}
	if err := validateMessageLength(content); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	return &Message{
		ID:             uuid.New(),
		CompanyID:      companyID,
		ConversationID: conversationID,
		SenderID:       senderID,
		MessageType:    messageType,
		Content:        content,
		ContentFormat:  contentFormat,
		Metadata:       json.RawMessage(`{}`),
		CreatedAt:      now,
		UpdatedAt:      now,
	}, nil
}

func validateMessageLength(content string) error {
	if utf8.RuneCountInString(content) > MaxMessageLength() {
		return ErrMessageTooLong
	}
	return nil
}

type MessageReaction struct {
	MessageID  uuid.UUID `json:"message_id"`
	EmployeeID uuid.UUID `json:"employee_id"`
	Emoji      string    `json:"emoji"`
	CreatedAt  time.Time `json:"created_at"`
}

func NewMessageReaction(messageID, employeeID uuid.UUID, emoji string) (*MessageReaction, error) {
	emoji = strings.TrimSpace(emoji)
	if messageID == uuid.Nil || employeeID == uuid.Nil {
		return nil, ErrEmployeeRequired
	}
	if emoji == "" || utf8.RuneCountInString(emoji) > 32 {
		return nil, ErrInvalidReactionEmoji
	}
	return &MessageReaction{
		MessageID:  messageID,
		EmployeeID: employeeID,
		Emoji:      emoji,
		CreatedAt:  time.Now().UTC(),
	}, nil
}

type MessageMention struct {
	ID                  uuid.UUID  `json:"id"`
	CompanyID           uuid.UUID  `json:"company_id"`
	MessageID           uuid.UUID  `json:"message_id"`
	MentionedEmployeeID *uuid.UUID `json:"mentioned_employee_id,omitempty"`
	MentionType         string     `json:"mention_type"`
	CreatedAt           time.Time  `json:"created_at"`
}

func NewMessageMention(companyID, messageID uuid.UUID, mentionType string, mentionedEmployeeID *uuid.UUID) (*MessageMention, error) {
	mentionType = strings.ToLower(strings.TrimSpace(mentionType))
	if mentionType == "" {
		mentionType = MentionTypeUser
	}
	if _, ok := validMentionTypes[mentionType]; !ok {
		return nil, ErrInvalidMentionType
	}
	if companyID == uuid.Nil || messageID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	return &MessageMention{
		ID:                  uuid.New(),
		CompanyID:           companyID,
		MessageID:           messageID,
		MentionedEmployeeID: mentionedEmployeeID,
		MentionType:         mentionType,
		CreatedAt:           time.Now().UTC(),
	}, nil
}

type MessageAttachment struct {
	ID             uuid.UUID `json:"id"`
	CompanyID      uuid.UUID `json:"company_id"`
	MessageID      uuid.UUID `json:"message_id"`
	FileName       string    `json:"file_name"`
	StorageKey     string    `json:"storage_key"`
	MimeType       string    `json:"mime_type"`
	SizeBytes      int64     `json:"size_bytes"`
	Width          *int      `json:"width,omitempty"`
	Height         *int      `json:"height,omitempty"`
	DurationMs     *int      `json:"duration_ms,omitempty"`
	ThumbnailKey   string    `json:"thumbnail_key,omitempty"`
	ChecksumSHA256 string    `json:"checksum_sha256,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

type MessageRead struct {
	MessageID  uuid.UUID `json:"message_id"`
	EmployeeID uuid.UUID `json:"employee_id"`
	ReadAt     time.Time `json:"read_at"`
}

type MessageDelivery struct {
	MessageID   uuid.UUID `json:"message_id"`
	EmployeeID  uuid.UUID `json:"employee_id"`
	DeliveredAt time.Time `json:"delivered_at"`
}

type MessageBookmark struct {
	MessageID  uuid.UUID `json:"message_id"`
	EmployeeID uuid.UUID `json:"employee_id"`
	CreatedAt  time.Time `json:"created_at"`
}

type MessagePin struct {
	ConversationID uuid.UUID `json:"conversation_id"`
	MessageID      uuid.UUID `json:"message_id"`
	PinnedBy       uuid.UUID `json:"pinned_by"`
	PinnedAt       time.Time `json:"pinned_at"`
}

type MessageForward struct {
	ID                     uuid.UUID `json:"id"`
	CompanyID              uuid.UUID `json:"company_id"`
	MessageID              uuid.UUID `json:"message_id"`
	OriginalMessageID      uuid.UUID `json:"original_message_id"`
	OriginalConversationID uuid.UUID `json:"original_conversation_id"`
	CreatedAt              time.Time `json:"created_at"`
}

type UserPresence struct {
	EmployeeID    uuid.UUID  `json:"employee_id"`
	CompanyID     uuid.UUID  `json:"company_id"`
	Status        string     `json:"status"`
	LastSeenAt    *time.Time `json:"last_seen_at,omitempty"`
	StatusMessage string     `json:"status_message,omitempty"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

func NewUserPresence(companyID, employeeID uuid.UUID, status string) (*UserPresence, error) {
	status = strings.ToLower(strings.TrimSpace(status))
	if status == "" {
		status = PresenceOffline
	}
	if _, ok := validPresenceStatuses[status]; !ok {
		return nil, ErrInvalidPresenceStatus
	}
	if companyID == uuid.Nil || employeeID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	now := time.Now().UTC()
	return &UserPresence{
		EmployeeID: employeeID,
		CompanyID:  companyID,
		Status:     status,
		UpdatedAt:  now,
	}, nil
}

type NotificationPreference struct {
	EmployeeID uuid.UUID `json:"employee_id"`
	CompanyID  uuid.UUID `json:"company_id"`
	EventType  string    `json:"event_type"`
	InApp      bool      `json:"in_app"`
	Browser    bool      `json:"browser"`
	Email      bool      `json:"email"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type MessageReport struct {
	ID         uuid.UUID  `json:"id"`
	CompanyID  uuid.UUID  `json:"company_id"`
	MessageID  uuid.UUID  `json:"message_id"`
	ReporterID uuid.UUID  `json:"reporter_id"`
	Reason     string     `json:"reason"`
	Details    string     `json:"details,omitempty"`
	Status     string     `json:"status"`
	ReviewedBy *uuid.UUID `json:"reviewed_by,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

func NewMessageReport(companyID, messageID, reporterID uuid.UUID, reason, details string) (*MessageReport, error) {
	reason = strings.ToLower(strings.TrimSpace(reason))
	if _, ok := validReportReasons[reason]; !ok {
		return nil, ErrInvalidReportReason
	}
	if companyID == uuid.Nil || messageID == uuid.Nil || reporterID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	return &MessageReport{
		ID:         uuid.New(),
		CompanyID:  companyID,
		MessageID:  messageID,
		ReporterID: reporterID,
		Reason:     reason,
		Details:    strings.TrimSpace(details),
		Status:     ReportStatusPending,
		CreatedAt:  time.Now().UTC(),
	}, nil
}

func ValidateReportStatus(status string) error {
	status = strings.ToLower(strings.TrimSpace(status))
	if _, ok := validReportStatuses[status]; !ok {
		return ErrInvalidReportStatus
	}
	return nil
}

type BlockedUser struct {
	BlockerID uuid.UUID `json:"blocker_id"`
	BlockedID uuid.UUID `json:"blocked_id"`
	CompanyID uuid.UUID `json:"company_id"`
	CreatedAt time.Time `json:"created_at"`
}

type ChatAuditLog struct {
	ID             uuid.UUID       `json:"id"`
	CompanyID      uuid.UUID       `json:"company_id"`
	ConversationID *uuid.UUID      `json:"conversation_id,omitempty"`
	ActorID        *uuid.UUID      `json:"actor_id,omitempty"`
	Action         string          `json:"action"`
	TargetID       *uuid.UUID      `json:"target_id,omitempty"`
	Payload        json.RawMessage `json:"payload,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
}

func NewChatAuditLog(companyID uuid.UUID, conversationID, actorID *uuid.UUID, action string, targetID *uuid.UUID, payload json.RawMessage) (*ChatAuditLog, error) {
	action = strings.TrimSpace(action)
	if companyID == uuid.Nil || action == "" {
		return nil, ErrCompanyRequired
	}
	if payload == nil {
		payload = json.RawMessage(`{}`)
	}
	return &ChatAuditLog{
		ID:             uuid.New(),
		CompanyID:      companyID,
		ConversationID: conversationID,
		ActorID:        actorID,
		Action:         action,
		TargetID:       targetID,
		Payload:        payload,
		CreatedAt:      time.Now().UTC(),
	}, nil
}

type MessageDraft struct {
	ConversationID  uuid.UUID  `json:"conversation_id"`
	EmployeeID      uuid.UUID  `json:"employee_id"`
	Content         string     `json:"content"`
	ParentMessageID *uuid.UUID `json:"parent_message_id,omitempty"`
	Revision        int64      `json:"revision"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// PresenceView is the UI-safe presence payload for hydration.
type PresenceView struct {
	EmployeeID uuid.UUID  `json:"employee_id"`
	Status     string     `json:"status"`
	LastSeenAt *time.Time `json:"last_seen_at,omitempty"`
}

// MaxPresenceQueryIDs bounds GET /presence?employee_ids=...
const MaxPresenceQueryIDs = 100

type ConversationInvitation struct {
	ID                uuid.UUID  `json:"id"`
	CompanyID         uuid.UUID  `json:"company_id"`
	ConversationID    uuid.UUID  `json:"conversation_id"`
	InvitedBy         uuid.UUID  `json:"invited_by"`
	InvitedEmployeeID uuid.UUID  `json:"invited_employee_id"`
	Status            string     `json:"status"`
	ExpiresAt         *time.Time `json:"expires_at,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
}

func ValidateInvitationStatus(status string) error {
	status = strings.ToLower(strings.TrimSpace(status))
	if _, ok := validInvitationStatuses[status]; !ok {
		return ErrInvalidInvitationStatus
	}
	return nil
}

// MessageListQuery controls cursor-based message history loading.
type MessageListQuery struct {
	Cursor    string
	Limit     int
	Direction string // "before" (default) or "after"
}

func (q MessageListQuery) Normalize() MessageListQuery {
	if q.Limit < 1 {
		q.Limit = 50
	}
	if q.Limit > 100 {
		q.Limit = 100
	}
	dir := strings.ToLower(strings.TrimSpace(q.Direction))
	if dir != "after" {
		dir = "before"
	}
	q.Direction = dir
	return q
}

// SearchMinQueryLength is the minimum trimmed query length for chat search.
const SearchMinQueryLength = 2

// SearchQuery controls conversation or global chat search.
type SearchQuery struct {
	Query          string
	ConversationID *uuid.UUID
	SenderID       *uuid.UUID
	Before         *time.Time
	After          *time.Time
	Cursor         string
	Limit          int
}

func (q SearchQuery) Normalize() SearchQuery {
	q.Query = strings.Join(strings.Fields(strings.TrimSpace(q.Query)), " ")
	if q.Limit < 1 {
		q.Limit = 50
	}
	if q.Limit > 100 {
		q.Limit = 100
	}
	return q
}

// SearchHit is a UI-safe search result row.
type SearchHit struct {
	MessageID       uuid.UUID  `json:"message_id"`
	ConversationID  uuid.UUID  `json:"conversation_id"`
	SenderID        *uuid.UUID `json:"sender_id,omitempty"`
	SenderName      string     `json:"sender_name,omitempty"`
	Content         string     `json:"content"`
	Snippet         string     `json:"snippet,omitempty"`
	MessageType     string     `json:"message_type"`
	CreatedAt       time.Time  `json:"created_at"`
	EditedAt        *time.Time `json:"edited_at,omitempty"`
	IsEdited        bool       `json:"is_edited"`
	ParentMessageID *uuid.UUID `json:"parent_message_id,omitempty"`
	ThreadRootID    *uuid.UUID `json:"thread_root_id,omitempty"`
	Score           float64    `json:"score,omitempty"`
}

// Chat notification type constants.
const (
	NotifTypeMention     = "chat.mention"
	NotifTypeReply       = "chat.reply"
	NotifTypeDM          = "chat.dm"
	NotifTypeReaction    = "chat.reaction"
	NotifTypeMemberAdded = "chat.member_added"
	NotifTypePin         = "chat.pin"
	NotifTypeInvitation  = "chat.invitation"
)
