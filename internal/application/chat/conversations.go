package chatapp

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"PMAS/internal/auth"
	"PMAS/internal/domain/chat"
	"PMAS/internal/domain/shared"
	"PMAS/internal/realtime"
)

type CreateDMInput struct {
	OtherEmployeeID uuid.UUID
}

func (s *Service) CreateDM(ctx context.Context, actor Actor, in CreateDMInput) (*chat.Conversation, error) {
	if !actor.hasPerm(auth.PermChatSend) {
		return nil, shared.ErrForbidden
	}
	if in.OtherEmployeeID == uuid.Nil || in.OtherEmployeeID == actor.EmployeeID {
		return nil, shared.New("CHAT_INVALID_DM_TARGET", "Invalid DM target", 400)
	}
	ok, err := s.conv.EmployeeBelongsToCompany(ctx, actor.CompanyID, in.OtherEmployeeID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, chat.ErrConversationNotFound
	}
	blocked, err := s.mod.IsBlocked(ctx, actor.CompanyID, in.OtherEmployeeID, actor.EmployeeID)
	if err != nil {
		return nil, err
	}
	if blocked {
		return nil, shared.New("CHAT_BLOCKED", "Cannot message this user", 403)
	}
	blocked, err = s.mod.IsBlocked(ctx, actor.CompanyID, actor.EmployeeID, in.OtherEmployeeID)
	if err != nil {
		return nil, err
	}
	if blocked {
		return nil, shared.New("CHAT_BLOCKED", "Cannot message this user", 403)
	}

	if existing, err := s.conv.FindDMByMembers(ctx, actor.CompanyID, actor.EmployeeID, in.OtherEmployeeID); err == nil && existing != nil {
		return existing, nil
	}

	var created *chat.Conversation
	err = s.db.WithinTx(ctx, func(txCtx context.Context) error {
		c, err := chat.NewConversation(actor.CompanyID, chat.ConversationTypeDM, "", "", "", &actor.EmployeeID)
		if err != nil {
			return err
		}
		if err := s.conv.CreateConversation(txCtx, c); err != nil {
			return err
		}
		for _, empID := range []uuid.UUID{actor.EmployeeID, in.OtherEmployeeID} {
			role := chat.MemberRoleMember
			if empID == actor.EmployeeID {
				role = chat.MemberRoleOwner
			}
			m, err := chat.NewConversationMember(actor.CompanyID, c.ID, empID, role)
			if err != nil {
				return err
			}
			if err := s.conv.AddConversationMember(txCtx, m); err != nil {
				return err
			}
		}
		created = c
		return nil
	})
	if err != nil {
		if existing, findErr := s.conv.FindDMByMembers(ctx, actor.CompanyID, actor.EmployeeID, in.OtherEmployeeID); findErr == nil && existing != nil {
			return existing, nil
		}
		return nil, err
	}
	convID := created.ID
	actorID := actor.EmployeeID
	s.publish(ctx, realtime.TypeConversationCreated, actor.CompanyID, &convID, &actorID, created)
	return created, nil
}

type CreateGroupInput struct {
	Name      string
	MemberIDs []uuid.UUID
}

func (s *Service) CreateGroup(ctx context.Context, actor Actor, in CreateGroupInput) (*chat.Conversation, error) {
	if !actor.hasPerm(auth.PermChatSend) {
		return nil, shared.ErrForbidden
	}
	var created *chat.Conversation
	err := s.db.WithinTx(ctx, func(txCtx context.Context) error {
		c, err := chat.NewConversation(actor.CompanyID, chat.ConversationTypeGroup, in.Name, "", "", &actor.EmployeeID)
		if err != nil {
			return err
		}
		if err := s.conv.CreateConversation(txCtx, c); err != nil {
			return err
		}
		seen := map[uuid.UUID]bool{actor.EmployeeID: true}
		owner, err := chat.NewConversationMember(actor.CompanyID, c.ID, actor.EmployeeID, chat.MemberRoleOwner)
		if err != nil {
			return err
		}
		if err := s.conv.AddConversationMember(txCtx, owner); err != nil {
			return err
		}
		for _, empID := range in.MemberIDs {
			if empID == uuid.Nil || seen[empID] {
				continue
			}
			ok, err := s.conv.EmployeeBelongsToCompany(txCtx, actor.CompanyID, empID)
			if err != nil {
				return err
			}
			if !ok {
				return shared.New("CHAT_INVALID_MEMBER", "Employee not in company", 400)
			}
			seen[empID] = true
			m, err := chat.NewConversationMember(actor.CompanyID, c.ID, empID, chat.MemberRoleMember)
			if err != nil {
				return err
			}
			if err := s.conv.AddConversationMember(txCtx, m); err != nil {
				return err
			}
		}
		created = c
		convID := c.ID
		actorID := actor.EmployeeID
		s.appendAudit(txCtx, actor.CompanyID, &convID, &actorID, "conversation.group.created", nil, nil)
		return nil
	})
	if err != nil {
		return nil, err
	}
	convID := created.ID
	actorID := actor.EmployeeID
	s.publish(ctx, realtime.TypeConversationCreated, actor.CompanyID, &convID, &actorID, created)
	return created, nil
}

type CreateChannelInput struct {
	Name        string
	Slug        string
	Description string
	Visibility  string
}

func (s *Service) CreateChannel(ctx context.Context, actor Actor, in CreateChannelInput) (*chat.Conversation, error) {
	if !actor.hasPerm(auth.PermChatCreateChannel) {
		return nil, shared.ErrForbidden
	}
	var created *chat.Conversation
	err := s.db.WithinTx(ctx, func(txCtx context.Context) error {
		c, err := chat.NewConversation(actor.CompanyID, chat.ConversationTypeChannel, in.Name, in.Slug, in.Visibility, &actor.EmployeeID)
		if err != nil {
			return err
		}
		c.Description = strings.TrimSpace(in.Description)
		if err := s.conv.CreateConversation(txCtx, c); err != nil {
			if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
				return shared.New("CHAT_CHANNEL_SLUG_EXISTS", "Channel slug already exists", 409)
			}
			return err
		}
		m, err := chat.NewConversationMember(actor.CompanyID, c.ID, actor.EmployeeID, chat.MemberRoleOwner)
		if err != nil {
			return err
		}
		if err := s.conv.AddConversationMember(txCtx, m); err != nil {
			return err
		}
		created = c
		convID := c.ID
		actorID := actor.EmployeeID
		s.appendAudit(txCtx, actor.CompanyID, &convID, &actorID, "conversation.channel.created", nil, nil)
		return nil
	})
	if err != nil {
		return nil, err
	}
	convID := created.ID
	actorID := actor.EmployeeID
	s.publish(ctx, realtime.TypeConversationCreated, actor.CompanyID, &convID, &actorID, created)
	return created, nil
}

func (s *Service) GetConversation(ctx context.Context, actor Actor, conversationID uuid.UUID) (*chat.Conversation, error) {
	if !actor.hasPerm(auth.PermChatView) {
		return nil, shared.ErrForbidden
	}
	if _, err := s.requireMember(ctx, actor, conversationID); err != nil {
		return nil, err
	}
	return s.conv.GetConversationByID(ctx, actor.CompanyID, conversationID)
}

func (s *Service) ListConversations(ctx context.Context, actor Actor, cursor string, limit int) (*ConversationPage, error) {
	if !actor.hasPerm(auth.PermChatView) {
		return nil, shared.ErrForbidden
	}
	items, next, err := s.conv.ListConversationsForEmployee(ctx, actor.CompanyID, actor.EmployeeID, cursor, limit)
	if err != nil {
		return nil, err
	}
	return &ConversationPage{Items: items, NextCursor: next, HasMore: next != ""}, nil
}

type UpdateConversationInput struct {
	Name        *string
	Description *string
	AvatarURL   *string
	Visibility  *string
	Slug        *string
}

func (s *Service) UpdateConversation(ctx context.Context, actor Actor, conversationID uuid.UUID, in UpdateConversationInput) (*chat.Conversation, error) {
	member, err := s.requireMember(ctx, actor, conversationID)
	if err != nil {
		return nil, err
	}
	if !s.canManageChannel(actor, member) {
		return nil, shared.ErrForbidden
	}
	c, err := s.conv.GetConversationByID(ctx, actor.CompanyID, conversationID)
	if err != nil {
		return nil, err
	}
	if in.Name != nil {
		c.Name = strings.TrimSpace(*in.Name)
	}
	if in.Description != nil {
		c.Description = strings.TrimSpace(*in.Description)
	}
	if in.AvatarURL != nil {
		c.AvatarURL = strings.TrimSpace(*in.AvatarURL)
	}
	if in.Visibility != nil {
		vis := strings.ToUpper(strings.TrimSpace(*in.Visibility))
		if vis != chat.VisibilityPublic && vis != chat.VisibilityPrivate {
			return nil, chat.ErrInvalidVisibility
		}
		c.Visibility = vis
	}
	if in.Slug != nil && c.Type == chat.ConversationTypeChannel {
		c.Slug = strings.TrimSpace(strings.ToLower(*in.Slug))
	}
	if err := s.conv.UpdateConversation(ctx, actor.CompanyID, c); err != nil {
		return nil, err
	}
	convID := conversationID
	actorID := actor.EmployeeID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "conversation.updated", nil, nil)
	updated, err := s.conv.GetConversationByID(ctx, actor.CompanyID, conversationID)
	if err != nil {
		return nil, err
	}
	s.publish(ctx, realtime.TypeConversationUpdated, actor.CompanyID, &convID, &actorID, updated)
	return updated, nil
}

func (s *Service) ArchiveConversation(ctx context.Context, actor Actor, conversationID uuid.UUID) error {
	if _, err := s.requireMember(ctx, actor, conversationID); err != nil {
		return err
	}
	archived := true
	if err := s.conv.UpdateMemberSettings(ctx, actor.CompanyID, conversationID, actor.EmployeeID, nil, &archived, nil); err != nil {
		return err
	}
	convID := conversationID
	actorID := actor.EmployeeID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "member.archived", nil, nil)
	return nil
}

func (s *Service) UnarchiveConversation(ctx context.Context, actor Actor, conversationID uuid.UUID) error {
	if _, err := s.requireMember(ctx, actor, conversationID); err != nil {
		return err
	}
	archived := false
	if err := s.conv.UpdateMemberSettings(ctx, actor.CompanyID, conversationID, actor.EmployeeID, nil, &archived, nil); err != nil {
		return err
	}
	convID := conversationID
	actorID := actor.EmployeeID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "member.unarchived", nil, nil)
	return nil
}

func (s *Service) AddMember(ctx context.Context, actor Actor, conversationID, employeeID uuid.UUID) error {
	member, err := s.requireMember(ctx, actor, conversationID)
	if err != nil {
		return err
	}
	if !s.canManageMembers(member, actor) {
		return shared.ErrForbidden
	}
	ok, err := s.conv.EmployeeBelongsToCompany(ctx, actor.CompanyID, employeeID)
	if err != nil {
		return err
	}
	if !ok {
		return chat.ErrConversationNotFound
	}
	m, err := chat.NewConversationMember(actor.CompanyID, conversationID, employeeID, chat.MemberRoleMember)
	if err != nil {
		return err
	}
	if err := s.conv.AddConversationMember(ctx, m); err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return shared.New("CHAT_MEMBER_EXISTS", "Member already in conversation", 409)
		}
		return err
	}
	convID := conversationID
	actorID := actor.EmployeeID
	target := employeeID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "member.added", &target, nil)
	s.publish(ctx, realtime.TypeConversationMemberAdded, actor.CompanyID, &convID, &actorID, map[string]any{
		"conversation_id": conversationID,
		"employee_id":     employeeID,
		"role":            chat.MemberRoleMember,
	})
	s.notifyMemberAdded(ctx, actor, conversationID, employeeID)
	return nil
}

func (s *Service) RemoveMember(ctx context.Context, actor Actor, conversationID, employeeID uuid.UUID) error {
	if employeeID == actor.EmployeeID {
		return shared.New("CHAT_USE_LEAVE", "Use leave endpoint to leave a conversation", 400)
	}
	actorMember, err := s.requireMember(ctx, actor, conversationID)
	if err != nil {
		return err
	}
	if !s.canManageMembers(actorMember, actor) {
		return shared.ErrForbidden
	}
	targetMember, err := s.conv.GetConversationMember(ctx, actor.CompanyID, conversationID, employeeID)
	if err != nil {
		return chat.ErrConversationNotFound
	}
	if targetMember.Role == chat.MemberRoleOwner {
		return chat.ErrLastOwner // must transfer ownership first
	}
	// Moderators cannot remove admins; admins cannot remove owners (handled above).
	if !actor.hasPerm(auth.PermChatModerate) && actorMember.Role != chat.MemberRoleOwner {
		if roleRank(targetMember.Role) >= roleRank(actorMember.Role) {
			return shared.ErrForbidden
		}
	}
	if err := s.conv.RemoveConversationMember(ctx, actor.CompanyID, conversationID, employeeID); err != nil {
		return err
	}
	convID := conversationID
	actorID := actor.EmployeeID
	target := employeeID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "member.removed", &target, nil)
	s.publish(ctx, realtime.TypeConversationMemberRemoved, actor.CompanyID, &convID, &actorID, map[string]any{
		"conversation_id": conversationID,
		"employee_id":     employeeID,
	})
	return nil
}

func (s *Service) LeaveConversation(ctx context.Context, actor Actor, conversationID uuid.UUID) error {
	member, err := s.requireMember(ctx, actor, conversationID)
	if err != nil {
		return err
	}
	if member.Role == chat.MemberRoleOwner {
		owners, err := s.conv.CountOwners(ctx, actor.CompanyID, conversationID)
		if err != nil {
			return err
		}
		if owners <= 1 {
			return chat.ErrOwnerCannotLeave
		}
	}
	if err := s.conv.RemoveConversationMember(ctx, actor.CompanyID, conversationID, actor.EmployeeID); err != nil {
		return err
	}
	convID := conversationID
	actorID := actor.EmployeeID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "member.left", &actorID, nil)
	s.publish(ctx, realtime.TypeConversationMemberRemoved, actor.CompanyID, &convID, &actorID, map[string]any{
		"conversation_id": conversationID,
		"employee_id":     actor.EmployeeID,
	})
	return nil
}

func (s *Service) ListMembers(ctx context.Context, actor Actor, conversationID uuid.UUID, limit int) ([]chat.ConversationMember, error) {
	if !actor.hasPerm(auth.PermChatView) {
		return nil, shared.ErrForbidden
	}
	if _, err := s.requireMember(ctx, actor, conversationID); err != nil {
		return nil, err
	}
	return s.conv.ListConversationMembers(ctx, actor.CompanyID, conversationID, limit)
}
