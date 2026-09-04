package chatapp

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"PMAS/internal/domain/chat"
	"PMAS/internal/domain/shared"
	"PMAS/internal/domain/support"
	"PMAS/internal/logging"
	"PMAS/internal/realtime"
)

const (
	sourceTypeMessage      = "chat_message"
	sourceTypeConversation = "chat_conversation"
)

func chatDeepLink(conversationID, messageID uuid.UUID) string {
	if messageID == uuid.Nil {
		return fmt.Sprintf("/chat/%s", conversationID.String())
	}
	return fmt.Sprintf("/chat/%s?message=%s", conversationID.String(), messageID.String())
}

func previewBody(content string, max int) string {
	content = strings.TrimSpace(content)
	if content == "" {
		return ""
	}
	runes := []rune(content)
	if max < 1 {
		max = 140
	}
	if len(runes) <= max {
		return content
	}
	return string(runes[:max-1]) + "…"
}

func (s *Service) syncMentions(ctx context.Context, companyID, conversationID, messageID uuid.UUID, content string) ([]chat.MessageMention, error) {
	if s.mentions == nil {
		return nil, nil
	}
	tokens := ParseMentionTokens(content)
	resolved, err := s.mentions.ResolveMentionables(ctx, companyID, conversationID, tokens)
	if err != nil {
		return nil, err
	}
	mentions := make([]chat.MessageMention, 0, len(resolved))
	for _, empID := range resolved {
		id := empID
		m, err := chat.NewMessageMention(companyID, messageID, chat.MentionTypeUser, &id)
		if err != nil {
			return nil, err
		}
		mentions = append(mentions, *m)
	}
	if err := s.mentions.ReplaceMentions(ctx, companyID, messageID, mentions); err != nil {
		return nil, err
	}
	return mentions, nil
}

type notifyMessageOpts struct {
	Message    *chat.Message
	Mentions   []chat.MessageMention
	IsReply    bool
	Parent     *chat.Message
	IsDM       bool
	SkipSender uuid.UUID
}

func (s *Service) notifyForMessage(ctx context.Context, actor Actor, opts notifyMessageOpts) {
	if s.notifs == nil || opts.Message == nil {
		return
	}
	m := opts.Message
	conv, err := s.conv.GetConversationByID(ctx, actor.CompanyID, m.ConversationID)
	if err != nil {
		logging.Warn("chat_notify_load_conversation_failed", "error", err.Error())
		return
	}
	members, err := s.conv.ListConversationMembers(ctx, actor.CompanyID, m.ConversationID, 500)
	if err != nil {
		logging.Warn("chat_notify_list_members_failed", "error", err.Error())
		return
	}

	mentioned := map[uuid.UUID]struct{}{}
	for _, id := range mentionEmployees(opts.Mentions) {
		mentioned[id] = struct{}{}
	}

	body := previewBody(m.Content, 140)
	titleMention := "You were mentioned"
	titleReply := "New reply"
	titleDM := "New direct message"

	for _, mem := range members {
		if mem.EmployeeID == opts.SkipSender || mem.EmployeeID == actor.EmployeeID {
			continue
		}
		if mem.IsMuted || mem.NotificationLevel == chat.NotificationLevelNone {
			continue
		}

		// Mentions always notify (unless muted/none), regardless of "mentions"-only level.
		if _, ok := mentioned[mem.EmployeeID]; ok {
			s.createChatNotification(ctx, actor, mem.EmployeeID, chat.NotifTypeMention, titleMention, body,
				sourceTypeMessage, m.ID, chatDeepLink(m.ConversationID, m.ID), &m.ConversationID)
			continue
		}

		// Reply to the recipient's message.
		if opts.IsReply && opts.Parent != nil && opts.Parent.SenderID != nil &&
			*opts.Parent.SenderID == mem.EmployeeID {
			if mem.NotificationLevel == chat.NotificationLevelMentions {
				continue
			}
			s.createChatNotification(ctx, actor, mem.EmployeeID, chat.NotifTypeReply, titleReply, body,
				sourceTypeMessage, m.ID, chatDeepLink(m.ConversationID, m.ID), &m.ConversationID)
			continue
		}

		// DM: notify the other participant(s) when level allows all.
		if (opts.IsDM || conv.Type == chat.ConversationTypeDM) && mem.NotificationLevel == chat.NotificationLevelAll {
			s.createChatNotification(ctx, actor, mem.EmployeeID, chat.NotifTypeDM, titleDM, body,
				sourceTypeMessage, m.ID, chatDeepLink(m.ConversationID, m.ID), &m.ConversationID)
		}
	}
}

func (s *Service) notifyReaction(ctx context.Context, actor Actor, m *chat.Message, emoji string) {
	if s.notifs == nil || m == nil || m.SenderID == nil {
		return
	}
	if *m.SenderID == actor.EmployeeID {
		return
	}
	mem, err := s.conv.GetConversationMember(ctx, actor.CompanyID, m.ConversationID, *m.SenderID)
	if err != nil {
		return
	}
	if mem.IsMuted || mem.NotificationLevel != chat.NotificationLevelAll {
		return
	}
	body := previewBody(m.Content, 80)
	if body == "" {
		body = emoji
	} else {
		body = emoji + " · " + body
	}
	s.createChatNotification(ctx, actor, *m.SenderID, chat.NotifTypeReaction, "New reaction", body,
		sourceTypeMessage, m.ID, chatDeepLink(m.ConversationID, m.ID), &m.ConversationID)
}

func (s *Service) notifyMemberAdded(ctx context.Context, actor Actor, conversationID, employeeID uuid.UUID) {
	if s.notifs == nil || employeeID == actor.EmployeeID {
		return
	}
	s.createChatNotification(ctx, actor, employeeID, chat.NotifTypeMemberAdded, "Added to conversation",
		"You were added to a conversation",
		sourceTypeConversation, conversationID, chatDeepLink(conversationID, uuid.Nil), &conversationID)
}

func (s *Service) notifyPin(ctx context.Context, actor Actor, conversationID, messageID uuid.UUID, content string) {
	if s.notifs == nil {
		return
	}
	members, err := s.conv.ListConversationMembers(ctx, actor.CompanyID, conversationID, 500)
	if err != nil {
		return
	}
	body := previewBody(content, 140)
	for _, mem := range members {
		if mem.EmployeeID == actor.EmployeeID {
			continue
		}
		if mem.IsMuted || mem.NotificationLevel != chat.NotificationLevelAll {
			continue
		}
		s.createChatNotification(ctx, actor, mem.EmployeeID, chat.NotifTypePin, "Message pinned", body,
			sourceTypeMessage, messageID, chatDeepLink(conversationID, messageID), &conversationID)
	}
}

func (s *Service) createChatNotification(
	ctx context.Context,
	actor Actor,
	receiverID uuid.UUID,
	notifType, title, body, sourceType string,
	sourceID uuid.UUID,
	actionURL string,
	conversationID *uuid.UUID,
) {
	if s.notifs == nil || receiverID == uuid.Nil || receiverID == actor.EmployeeID {
		return
	}
	n := support.NewNotification(actor.CompanyID, receiverID, notifType, title, body).
		WithSource(sourceType, sourceID, actionURL)
	if err := s.notifs.Create(ctx, n); err != nil {
		if errors.Is(err, shared.ErrConflict) {
			return // idempotent dedupe — skip realtime re-fanout
		}
		if s.metrics != nil {
			s.metrics.NotificationDeliveryFailure.Add(1)
		}
		logging.Warn("chat_notification_create_failed",
			"error", err.Error(),
			"type", notifType,
			"company_id", actor.CompanyID.String(),
		)
		return
	}
	if s.metrics != nil {
		s.metrics.NotificationCreated.Add(1)
	}

	payload := map[string]any{
		"id":          n.ID,
		"type":        n.Type,
		"title":       n.Title,
		"body":        n.Body,
		"is_read":     n.IsRead,
		"action_url":  n.ActionURL,
		"source_type": n.SourceType,
		"source_id":   n.SourceID,
		"created_at":  n.CreatedAt,
	}
	if utf8.RuneCountInString(n.Body) > 200 {
		payload["body"] = previewBody(n.Body, 200)
	}
	s.publishToRecipient(ctx, realtime.TypeNotificationCreated, actor.CompanyID, conversationID, &actor.EmployeeID, &receiverID, payload)
}

func (s *Service) publishToRecipient(
	ctx context.Context,
	eventType string,
	companyID uuid.UUID,
	conversationID, actorID, recipientID *uuid.UUID,
	payload any,
) {
	if s.publisher == nil {
		return
	}
	event, err := realtime.NewRecipientEvent(eventType, companyID, conversationID, actorID, recipientID, payload)
	if err != nil {
		logging.Error("chat_event_build_failed", "error", err.Error(), "type", eventType)
		if s.metrics != nil {
			s.metrics.NotificationDeliveryFailure.Add(1)
		}
		return
	}
	if err := s.publisher.Publish(ctx, event); err != nil {
		logging.Error("chat_event_publish_failed",
			"error", err.Error(),
			"type", event.Type,
			"company_id", event.CompanyID.String(),
		)
		if s.metrics != nil {
			s.metrics.NotificationDeliveryFailure.Add(1)
		}
	}
}
