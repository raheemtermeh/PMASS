package chatapp

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/auth"
	"PMAS/internal/domain/chat"
	"PMAS/internal/domain/shared"
	"PMAS/internal/realtime"
)

type SendMessageInput struct {
	Content         string
	MessageType     string
	ContentFormat   string
	ParentMessageID *uuid.UUID
	ThreadRootID    *uuid.UUID
}

func (s *Service) SendMessage(ctx context.Context, actor Actor, conversationID uuid.UUID, in SendMessageInput) (*chat.Message, error) {
	if !actor.hasPerm(auth.PermChatSend) {
		return nil, shared.ErrForbidden
	}
	if err := s.checkMessageRate(actor); err != nil {
		return nil, err
	}
	if _, err := s.requireMember(ctx, actor, conversationID); err != nil {
		return nil, err
	}
	if err := s.enforceDMBlock(ctx, actor, conversationID); err != nil {
		return nil, err
	}
	msgType := strings.ToUpper(strings.TrimSpace(in.MessageType))
	if msgType == "" {
		msgType = chat.MessageTypeText
	}
	if msgType != chat.MessageTypeText && msgType != chat.MessageTypeForward {
		return nil, chat.ErrInvalidMessageType
	}
	senderID := actor.EmployeeID
	m, err := chat.NewMessage(actor.CompanyID, conversationID, &senderID, msgType, in.Content, in.ContentFormat)
	if err != nil {
		return nil, err
	}
	m.ParentMessageID = in.ParentMessageID
	m.ThreadRootID = in.ThreadRootID

	if err := s.persistMessage(ctx, actor, m, false); err != nil {
		return nil, err
	}
	mentions, err := s.syncMentions(ctx, actor.CompanyID, conversationID, m.ID, m.Content)
	if err != nil {
		return nil, err
	}
	convID := m.ConversationID
	actorID := actor.EmployeeID
	s.publish(ctx, realtime.TypeMessageCreated, actor.CompanyID, &convID, &actorID, map[string]any{
		"message": messagePayload(m),
	})
	s.notifyForMessage(ctx, actor, notifyMessageOpts{
		Message: m, Mentions: mentions, SkipSender: actor.EmployeeID,
	})
	return m, nil
}

func (s *Service) persistMessage(ctx context.Context, actor Actor, m *chat.Message, incrementThread bool) error {
	return s.db.WithinTx(ctx, func(txCtx context.Context) error {
		if err := s.msg.CreateMessage(txCtx, m); err != nil {
			return err
		}
		if incrementThread && m.ThreadRootID != nil {
			if err := s.msg.IncrementThreadReplyCount(txCtx, actor.CompanyID, *m.ThreadRootID); err != nil {
				return err
			}
		}
		return s.conv.UpdateConversationPreview(txCtx, actor.CompanyID, m.ConversationID, m.ID, previewText(m.Content), m.CreatedAt)
	})
}

func (s *Service) GetMessage(ctx context.Context, actor Actor, messageID uuid.UUID) (*chat.Message, error) {
	if !actor.hasPerm(auth.PermChatView) {
		return nil, shared.ErrForbidden
	}
	m, err := s.msg.GetMessageByID(ctx, actor.CompanyID, messageID)
	if err != nil {
		return nil, err
	}
	if _, err := s.requireMember(ctx, actor, m.ConversationID); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *Service) ListMessages(ctx context.Context, actor Actor, conversationID uuid.UUID, q chat.MessageListQuery) (*MessagePage, error) {
	if !actor.hasPerm(auth.PermChatView) {
		return nil, shared.ErrForbidden
	}
	if _, err := s.requireMember(ctx, actor, conversationID); err != nil {
		return nil, err
	}
	items, next, err := s.msg.ListMessages(ctx, actor.CompanyID, conversationID, q)
	if err != nil {
		return nil, err
	}
	return &MessagePage{Items: items, NextCursor: next, HasMore: next != ""}, nil
}

func (s *Service) EditMessage(ctx context.Context, actor Actor, messageID uuid.UUID, content string) (*chat.Message, error) {
	if !actor.hasPerm(auth.PermChatSend) {
		return nil, shared.ErrForbidden
	}
	m, err := s.msg.GetMessageByID(ctx, actor.CompanyID, messageID)
	if err != nil {
		return nil, err
	}
	if _, err := s.requireMember(ctx, actor, m.ConversationID); err != nil {
		return nil, err
	}
	if m.SenderID == nil || *m.SenderID != actor.EmployeeID {
		return nil, shared.ErrForbidden
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, chat.ErrMessageBodyRequired
	}
	if len([]rune(content)) > chat.MaxMessageLength() {
		return nil, chat.ErrMessageTooLong
	}
	now := time.Now().UTC()
	if err := s.msg.UpdateMessageContent(ctx, actor.CompanyID, messageID, content, now); err != nil {
		return nil, err
	}
	updated, err := s.msg.GetMessageByID(ctx, actor.CompanyID, messageID)
	if err != nil {
		return nil, err
	}
	if err := s.refreshPreviewIfLatest(ctx, actor.CompanyID, updated); err != nil {
		return nil, err
	}
	mentions, err := s.syncMentions(ctx, actor.CompanyID, updated.ConversationID, updated.ID, updated.Content)
	if err != nil {
		return nil, err
	}
	convID := updated.ConversationID
	actorID := actor.EmployeeID
	s.publish(ctx, realtime.TypeMessageUpdated, actor.CompanyID, &convID, &actorID, map[string]any{
		"message":   messagePayload(updated),
		"edited_at": updated.EditedAt,
	})
	// Notify newly mentioned users only (dedupe index suppresses repeats for same source).
	s.notifyForMessage(ctx, actor, notifyMessageOpts{
		Message: updated, Mentions: mentions, SkipSender: actor.EmployeeID,
	})
	return updated, nil
}

func (s *Service) DeleteMessage(ctx context.Context, actor Actor, messageID uuid.UUID) error {
	m, err := s.msg.GetMessageByID(ctx, actor.CompanyID, messageID)
	if err != nil {
		return err
	}
	member, err := s.requireMember(ctx, actor, m.ConversationID)
	if err != nil {
		return err
	}
	isSender := m.SenderID != nil && *m.SenderID == actor.EmployeeID
	if !isSender && !s.canModerate(actor, member) {
		return shared.ErrForbidden
	}
	now := time.Now().UTC()
	if err := s.msg.SoftDeleteMessage(ctx, actor.CompanyID, messageID, now); err != nil {
		return err
	}
	if err := s.recalculatePreviewAfterDelete(ctx, actor.CompanyID, m); err != nil {
		return err
	}
	if !isSender {
		convID := m.ConversationID
		actorID := actor.EmployeeID
		target := messageID
		s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "message.deleted.admin", &target, nil)
	}
	convID := m.ConversationID
	actorID := actor.EmployeeID
	s.publish(ctx, realtime.TypeMessageDeleted, actor.CompanyID, &convID, &actorID, map[string]any{
		"message_id":      messageID,
		"conversation_id": convID,
		"deleted_at":      now,
	})
	return nil
}

func (s *Service) ReplyToMessage(ctx context.Context, actor Actor, parentMessageID uuid.UUID, content string) (*chat.Message, error) {
	if !actor.hasPerm(auth.PermChatSend) {
		return nil, shared.ErrForbidden
	}
	if err := s.checkMessageRate(actor); err != nil {
		return nil, err
	}
	parent, err := s.msg.GetMessageByID(ctx, actor.CompanyID, parentMessageID)
	if err != nil {
		return nil, err
	}
	if _, err := s.requireMember(ctx, actor, parent.ConversationID); err != nil {
		return nil, err
	}
	senderID := actor.EmployeeID
	threadRoot := parentMessageID
	if parent.ThreadRootID != nil {
		threadRoot = *parent.ThreadRootID
	}
	m, err := chat.NewMessage(actor.CompanyID, parent.ConversationID, &senderID, chat.MessageTypeText, content, chat.ContentFormatPlain)
	if err != nil {
		return nil, err
	}
	m.ParentMessageID = &parentMessageID
	m.ThreadRootID = &threadRoot

	if err := s.persistMessage(ctx, actor, m, true); err != nil {
		return nil, err
	}
	mentions, err := s.syncMentions(ctx, actor.CompanyID, m.ConversationID, m.ID, m.Content)
	if err != nil {
		return nil, err
	}
	convID := m.ConversationID
	actorID := actor.EmployeeID
	s.publish(ctx, realtime.TypeMessageCreated, actor.CompanyID, &convID, &actorID, map[string]any{
		"message": messagePayload(m),
	})
	s.notifyForMessage(ctx, actor, notifyMessageOpts{
		Message: m, Mentions: mentions, IsReply: true, Parent: parent, SkipSender: actor.EmployeeID,
	})
	return m, nil
}

type ForwardMessageInput struct {
	TargetConversationIDs []uuid.UUID
	Comment               string
}

func (s *Service) ForwardMessage(ctx context.Context, actor Actor, messageID uuid.UUID, in ForwardMessageInput) ([]chat.Message, error) {
	if !actor.hasPerm(auth.PermChatSend) {
		return nil, shared.ErrForbidden
	}
	original, err := s.msg.GetMessageByID(ctx, actor.CompanyID, messageID)
	if err != nil {
		return nil, err
	}
	if _, err := s.requireMember(ctx, actor, original.ConversationID); err != nil {
		return nil, err
	}
	if len(in.TargetConversationIDs) == 0 {
		return nil, shared.New("CHAT_FORWARD_TARGETS_REQUIRED", "At least one target conversation required", 400)
	}
	if len(in.TargetConversationIDs) > 20 {
		return nil, shared.New("CHAT_FORWARD_TOO_MANY", "Too many forward targets", 400)
	}

	seen := map[uuid.UUID]struct{}{}
	targets := make([]uuid.UUID, 0, len(in.TargetConversationIDs))
	for _, id := range in.TargetConversationIDs {
		if id == uuid.Nil {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		targets = append(targets, id)
	}
	// Pre-authorize all targets; fail closed (atomic all-or-nothing authorization).
	for _, targetConvID := range targets {
		if _, err := s.requireMember(ctx, actor, targetConvID); err != nil {
			return nil, err
		}
		if err := s.enforceDMBlock(ctx, actor, targetConvID); err != nil {
			return nil, err
		}
	}

	out := make([]chat.Message, 0, len(targets))
	err = s.db.WithinTx(ctx, func(txCtx context.Context) error {
		for _, targetConvID := range targets {
			senderID := actor.EmployeeID
			content := strings.TrimSpace(in.Comment)
			if content == "" {
				content = original.Content
			}
			m, err := chat.NewMessage(actor.CompanyID, targetConvID, &senderID, chat.MessageTypeForward, content, original.ContentFormat)
			if err != nil {
				return err
			}
			if err := s.msg.CreateMessage(txCtx, m); err != nil {
				return err
			}
			fwd := &chat.MessageForward{
				ID:                     uuid.New(),
				CompanyID:              actor.CompanyID,
				MessageID:              m.ID,
				OriginalMessageID:      original.ID,
				OriginalConversationID: original.ConversationID,
				CreatedAt:              time.Now().UTC(),
			}
			if err := s.msg.CreateForward(txCtx, fwd); err != nil {
				return err
			}
			if err := s.conv.UpdateConversationPreview(txCtx, actor.CompanyID, targetConvID, m.ID, previewText(m.Content), m.CreatedAt); err != nil {
				return err
			}
			out = append(out, *m)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	for i := range out {
		convID := out[i].ConversationID
		actorID := actor.EmployeeID
		s.publish(ctx, realtime.TypeMessageCreated, actor.CompanyID, &convID, &actorID, map[string]any{
			"message": messagePayload(&out[i]),
		})
	}
	return out, nil
}

func (s *Service) enforceDMBlock(ctx context.Context, actor Actor, conversationID uuid.UUID) error {
	conv, err := s.conv.GetConversationByID(ctx, actor.CompanyID, conversationID)
	if err != nil {
		return err
	}
	if conv.Type != chat.ConversationTypeDM {
		return nil
	}
	members, err := s.conv.ListConversationMembers(ctx, actor.CompanyID, conversationID, 10)
	if err != nil {
		return err
	}
	for _, m := range members {
		if m.EmployeeID == actor.EmployeeID {
			continue
		}
		blocked, err := s.mod.IsBlocked(ctx, actor.CompanyID, actor.EmployeeID, m.EmployeeID)
		if err != nil {
			return err
		}
		if blocked {
			return chat.ErrBlocked
		}
		blocked, err = s.mod.IsBlocked(ctx, actor.CompanyID, m.EmployeeID, actor.EmployeeID)
		if err != nil {
			return err
		}
		if blocked {
			return chat.ErrBlocked
		}
	}
	return nil
}

func (s *Service) MarkMessageRead(ctx context.Context, actor Actor, messageID uuid.UUID) error {
	m, err := s.msg.GetMessageByID(ctx, actor.CompanyID, messageID)
	if err != nil {
		return err
	}
	if _, err := s.requireMember(ctx, actor, m.ConversationID); err != nil {
		return err
	}
	now := time.Now().UTC()
	if err := s.msg.MarkRead(ctx, actor.CompanyID, messageID, actor.EmployeeID, now); err != nil {
		return err
	}
	convID := m.ConversationID
	actorID := actor.EmployeeID
	s.publish(ctx, realtime.TypeMessageRead, actor.CompanyID, &convID, &actorID, map[string]any{
		"message_id":      messageID,
		"conversation_id": convID,
		"employee_id":     actor.EmployeeID,
		"read_at":         now,
	})
	return nil
}

// MarkConversationReadUpTo advances the conversation read cursor to messageID (inclusive).
// Individual historical message_reads rows are not bulk-inserted; unread uses the cursor.
func (s *Service) MarkConversationReadUpTo(ctx context.Context, actor Actor, conversationID, messageID uuid.UUID) error {
	if !actor.hasPerm(auth.PermChatView) {
		return shared.ErrForbidden
	}
	if _, err := s.requireMember(ctx, actor, conversationID); err != nil {
		return err
	}
	now := time.Now().UTC()
	if err := s.msg.MarkReadUpTo(ctx, actor.CompanyID, conversationID, messageID, actor.EmployeeID, now); err != nil {
		return err
	}
	actorID := actor.EmployeeID
	s.publish(ctx, realtime.TypeMessageRead, actor.CompanyID, &conversationID, &actorID, map[string]any{
		"message_id":      messageID,
		"conversation_id": conversationID,
		"employee_id":     actor.EmployeeID,
		"read_at":         now,
		"up_to":           true,
	})
	return nil
}

func (s *Service) MarkMessageDelivered(ctx context.Context, actor Actor, messageID uuid.UUID) error {
	m, err := s.msg.GetMessageByID(ctx, actor.CompanyID, messageID)
	if err != nil {
		return err
	}
	if _, err := s.requireMember(ctx, actor, m.ConversationID); err != nil {
		return err
	}
	now := time.Now().UTC()
	if err := s.msg.MarkDelivered(ctx, actor.CompanyID, messageID, actor.EmployeeID, now); err != nil {
		return err
	}
	convID := m.ConversationID
	actorID := actor.EmployeeID
	s.publish(ctx, realtime.TypeMessageDelivered, actor.CompanyID, &convID, &actorID, map[string]any{
		"message_id":      messageID,
		"conversation_id": convID,
		"employee_id":     actor.EmployeeID,
		"delivered_at":    now,
	})
	return nil
}

func (s *Service) AddReaction(ctx context.Context, actor Actor, messageID uuid.UUID, emoji string) ([]chat.MessageReaction, error) {
	if !actor.hasPerm(auth.PermChatSend) {
		return nil, shared.ErrForbidden
	}
	m, err := s.msg.GetMessageByID(ctx, actor.CompanyID, messageID)
	if err != nil {
		return nil, err
	}
	if _, err := s.requireMember(ctx, actor, m.ConversationID); err != nil {
		return nil, err
	}
	reaction, err := chat.NewMessageReaction(messageID, actor.EmployeeID, emoji)
	if err != nil {
		return nil, err
	}
	if err := s.reaction.AddReaction(ctx, actor.CompanyID, reaction); err != nil {
		return nil, err
	}
	reactions, err := s.reaction.ListReactions(ctx, actor.CompanyID, messageID)
	if err != nil {
		return nil, err
	}
	convID := m.ConversationID
	actorID := actor.EmployeeID
	s.publish(ctx, realtime.TypeMessageReactionAdded, actor.CompanyID, &convID, &actorID, map[string]any{
		"message_id":      messageID,
		"conversation_id": convID,
		"employee_id":     actor.EmployeeID,
		"emoji":           reaction.Emoji,
	})
	s.notifyReaction(ctx, actor, m, reaction.Emoji)
	return reactions, nil
}

func (s *Service) RemoveReaction(ctx context.Context, actor Actor, messageID uuid.UUID, emoji string) ([]chat.MessageReaction, error) {
	m, err := s.msg.GetMessageByID(ctx, actor.CompanyID, messageID)
	if err != nil {
		return nil, err
	}
	if _, err := s.requireMember(ctx, actor, m.ConversationID); err != nil {
		return nil, err
	}
	if err := s.reaction.RemoveReaction(ctx, actor.CompanyID, messageID, actor.EmployeeID, emoji); err != nil {
		if errors.Is(err, chat.ErrMessageNotFound) {
			return s.reaction.ListReactions(ctx, actor.CompanyID, messageID)
		}
		return nil, err
	}
	reactions, err := s.reaction.ListReactions(ctx, actor.CompanyID, messageID)
	if err != nil {
		return nil, err
	}
	convID := m.ConversationID
	actorID := actor.EmployeeID
	s.publish(ctx, realtime.TypeMessageReactionRemoved, actor.CompanyID, &convID, &actorID, map[string]any{
		"message_id":      messageID,
		"conversation_id": convID,
		"employee_id":     actor.EmployeeID,
		"emoji":           emoji,
	})
	return reactions, nil
}

func (s *Service) AddBookmark(ctx context.Context, actor Actor, messageID uuid.UUID) error {
	if !actor.hasPerm(auth.PermChatView) {
		return shared.ErrForbidden
	}
	m, err := s.msg.GetMessageByID(ctx, actor.CompanyID, messageID)
	if err != nil {
		return err
	}
	if _, err := s.requireMember(ctx, actor, m.ConversationID); err != nil {
		return err
	}
	return s.bookmark.AddBookmark(ctx, actor.CompanyID, &chat.MessageBookmark{
		MessageID:  messageID,
		EmployeeID: actor.EmployeeID,
		CreatedAt:  time.Now().UTC(),
	})
}

func (s *Service) RemoveBookmark(ctx context.Context, actor Actor, messageID uuid.UUID) error {
	m, err := s.msg.GetMessageByID(ctx, actor.CompanyID, messageID)
	if err != nil {
		return err
	}
	if _, err := s.requireMember(ctx, actor, m.ConversationID); err != nil {
		return err
	}
	return s.bookmark.RemoveBookmark(ctx, actor.CompanyID, messageID, actor.EmployeeID)
}

func (s *Service) PinMessage(ctx context.Context, actor Actor, conversationID, messageID uuid.UUID) (*chat.MessagePin, error) {
	member, err := s.requireMember(ctx, actor, conversationID)
	if err != nil {
		return nil, err
	}
	if !s.canModerate(actor, member) {
		return nil, shared.ErrForbidden
	}
	m, err := s.msg.GetMessageByID(ctx, actor.CompanyID, messageID)
	if err != nil {
		return nil, err
	}
	if m.ConversationID != conversationID {
		return nil, chat.ErrMessageNotFound
	}
	pin := &chat.MessagePin{
		ConversationID: conversationID,
		MessageID:      messageID,
		PinnedBy:       actor.EmployeeID,
		PinnedAt:       time.Now().UTC(),
	}
	if err := s.pin.AddPin(ctx, actor.CompanyID, pin); err != nil {
		return nil, err
	}
	convID := conversationID
	actorID := actor.EmployeeID
	target := messageID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "message.pinned", &target, nil)
	s.publish(ctx, realtime.TypeMessagePinned, actor.CompanyID, &convID, &actorID, map[string]any{
		"message_id":      messageID,
		"conversation_id": conversationID,
		"actor_id":        actor.EmployeeID,
		"pinned_at":       pin.PinnedAt,
	})
	s.notifyPin(ctx, actor, conversationID, messageID, m.Content)
	return pin, nil
}

func (s *Service) UnpinMessage(ctx context.Context, actor Actor, conversationID, messageID uuid.UUID) error {
	member, err := s.requireMember(ctx, actor, conversationID)
	if err != nil {
		return err
	}
	if !s.canModerate(actor, member) {
		return shared.ErrForbidden
	}
	if err := s.pin.RemovePin(ctx, actor.CompanyID, conversationID, messageID); err != nil {
		return err
	}
	convID := conversationID
	actorID := actor.EmployeeID
	target := messageID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "message.unpinned", &target, nil)
	s.publish(ctx, realtime.TypeMessageUnpinned, actor.CompanyID, &convID, &actorID, map[string]any{
		"message_id":      messageID,
		"conversation_id": conversationID,
		"actor_id":        actor.EmployeeID,
		"timestamp":       time.Now().UTC(),
	})
	return nil
}

func (s *Service) ListPinnedMessages(ctx context.Context, actor Actor, conversationID uuid.UUID) ([]chat.MessagePin, error) {
	if !actor.hasPerm(auth.PermChatView) {
		return nil, shared.ErrForbidden
	}
	if _, err := s.requireMember(ctx, actor, conversationID); err != nil {
		return nil, err
	}
	return s.pin.ListPins(ctx, actor.CompanyID, conversationID)
}

func (s *Service) ReportMessage(ctx context.Context, actor Actor, messageID uuid.UUID, reason, details string) (*chat.MessageReport, error) {
	m, err := s.msg.GetMessageByID(ctx, actor.CompanyID, messageID)
	if err != nil {
		return nil, err
	}
	if _, err := s.requireMember(ctx, actor, m.ConversationID); err != nil {
		return nil, err
	}
	report, err := chat.NewMessageReport(actor.CompanyID, messageID, actor.EmployeeID, reason, details)
	if err != nil {
		return nil, err
	}
	if err := s.mod.CreateReport(ctx, report); err != nil {
		return nil, err
	}
	convID := m.ConversationID
	actorID := actor.EmployeeID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "message.reported", &messageID, map[string]any{"reason": reason})
	return report, nil
}

func (s *Service) BlockUser(ctx context.Context, actor Actor, blockedID uuid.UUID) error {
	if blockedID == actor.EmployeeID {
		return shared.New("CHAT_INVALID_BLOCK", "Cannot block yourself", 400)
	}
	ok, err := s.conv.EmployeeBelongsToCompany(ctx, actor.CompanyID, blockedID)
	if err != nil {
		return err
	}
	if !ok {
		return chat.ErrConversationNotFound
	}
	if err := s.mod.CreateBlock(ctx, &chat.BlockedUser{
		BlockerID: actor.EmployeeID,
		BlockedID: blockedID,
		CompanyID: actor.CompanyID,
		CreatedAt: time.Now().UTC(),
	}); err != nil {
		return err
	}
	s.appendAudit(ctx, actor.CompanyID, nil, &actor.EmployeeID, "user.blocked", &blockedID, nil)
	return nil
}

func (s *Service) UnblockUser(ctx context.Context, actor Actor, blockedID uuid.UUID) error {
	if err := s.mod.RemoveBlock(ctx, actor.CompanyID, actor.EmployeeID, blockedID); err != nil {
		return err
	}
	s.appendAudit(ctx, actor.CompanyID, nil, &actor.EmployeeID, "user.unblocked", &blockedID, nil)
	return nil
}

func messagePayload(m *chat.Message) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                m.ID,
		"conversation_id":   m.ConversationID,
		"sender_id":         m.SenderID,
		"content":           m.Content,
		"message_type":      m.MessageType,
		"content_format":    m.ContentFormat,
		"parent_message_id": m.ParentMessageID,
		"thread_root_id":    m.ThreadRootID,
		"is_edited":         m.IsEdited,
		"edited_at":         m.EditedAt,
		"created_at":        m.CreatedAt,
		"updated_at":        m.UpdatedAt,
	}
}

func (s *Service) refreshPreviewIfLatest(ctx context.Context, companyID uuid.UUID, m *chat.Message) error {
	conv, err := s.conv.GetConversationByID(ctx, companyID, m.ConversationID)
	if err != nil {
		return err
	}
	if conv.LastMessageID != nil && *conv.LastMessageID != m.ID {
		return nil
	}
	// Legacy rows without last_message_id: only update when timestamps match latest.
	if conv.LastMessageID == nil {
		latest, err := s.msg.GetLatestMessage(ctx, companyID, m.ConversationID)
		if err != nil {
			if errors.Is(err, chat.ErrMessageNotFound) {
				return nil
			}
			return err
		}
		if latest.ID != m.ID {
			return nil
		}
	}
	return s.conv.UpdateConversationPreview(ctx, companyID, m.ConversationID, m.ID, previewText(m.Content), m.CreatedAt)
}

func (s *Service) recalculatePreviewAfterDelete(ctx context.Context, companyID uuid.UUID, deleted *chat.Message) error {
	conv, err := s.conv.GetConversationByID(ctx, companyID, deleted.ConversationID)
	if err != nil {
		return err
	}
	isLatest := conv.LastMessageID != nil && *conv.LastMessageID == deleted.ID
	if !isLatest && conv.LastMessageID != nil {
		return nil
	}
	if !isLatest && conv.LastMessageID == nil {
		// Without last_message_id, only recalc if deleted message was the preview timestamp match.
		if conv.LastMessageAt == nil || !conv.LastMessageAt.Equal(deleted.CreatedAt) {
			return nil
		}
	}
	latest, err := s.msg.GetLatestMessage(ctx, companyID, deleted.ConversationID)
	if err != nil {
		if errors.Is(err, chat.ErrMessageNotFound) {
			return s.conv.ClearConversationPreview(ctx, companyID, deleted.ConversationID)
		}
		return err
	}
	return s.conv.UpdateConversationPreview(ctx, companyID, deleted.ConversationID, latest.ID, previewText(latest.Content), latest.CreatedAt)
}

// SyncMessages returns persisted messages after a known message for reconnect catch-up.
// This is PostgreSQL-based sync, not Redis event replay.
func (s *Service) SyncMessages(ctx context.Context, actor Actor, conversationID uuid.UUID, afterMessageID *uuid.UUID, limit int) (*MessagePage, error) {
	if !actor.hasPerm(auth.PermChatView) {
		return nil, shared.ErrForbidden
	}
	if _, err := s.requireMember(ctx, actor, conversationID); err != nil {
		return nil, err
	}
	q := chat.MessageListQuery{Limit: limit, Direction: "after"}
	if afterMessageID != nil && *afterMessageID != uuid.Nil {
		anchor, err := s.msg.GetMessageByIDIncludingDeleted(ctx, actor.CompanyID, *afterMessageID)
		if err != nil {
			return nil, err
		}
		if anchor.ConversationID != conversationID {
			return nil, chat.ErrMessageNotFound
		}
		cursor, err := chat.EncodeCursor(anchor.CreatedAt, anchor.ID)
		if err != nil {
			return nil, err
		}
		q.Cursor = cursor
	}
	items, next, err := s.msg.ListMessages(ctx, actor.CompanyID, conversationID, q)
	if err != nil {
		return nil, err
	}
	return &MessagePage{Items: items, NextCursor: next, HasMore: next != ""}, nil
}
