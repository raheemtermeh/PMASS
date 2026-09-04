package chatapp

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/auth"
	"PMAS/internal/domain/chat"
	"PMAS/internal/domain/shared"
	"PMAS/internal/domain/support"
	"PMAS/internal/realtime"
)

// roleRank for privilege comparisons (higher = more privileged).
func roleRank(role string) int {
	switch role {
	case chat.MemberRoleOwner:
		return 4
	case chat.MemberRoleAdmin:
		return 3
	case chat.MemberRoleModerator:
		return 2
	default:
		return 1
	}
}

func (s *Service) canChangeRoles(actor Actor, actorMember *chat.ConversationMember) bool {
	if actor.hasPerm(auth.PermChatModerate) || actor.hasPerm(auth.PermChatManageChannel) {
		return true
	}
	return actorMember != nil && (actorMember.Role == chat.MemberRoleOwner || actorMember.Role == chat.MemberRoleAdmin)
}

func (s *Service) canTransferOwner(actor Actor, actorMember *chat.ConversationMember) bool {
	if actor.hasPerm(auth.PermChatModerate) {
		return true
	}
	return actorMember != nil && actorMember.Role == chat.MemberRoleOwner
}

// TransferOwnership atomically moves owner role to another active member.
func (s *Service) TransferOwnership(ctx context.Context, actor Actor, conversationID, newOwnerID uuid.UUID) error {
	actorMember, err := s.requireMember(ctx, actor, conversationID)
	if err != nil {
		return err
	}
	if !s.canTransferOwner(actor, actorMember) {
		return shared.ErrForbidden
	}
	if newOwnerID == actor.EmployeeID && actorMember.Role == chat.MemberRoleOwner {
		return nil
	}
	target, err := s.conv.GetConversationMember(ctx, actor.CompanyID, conversationID, newOwnerID)
	if err != nil {
		return chat.ErrMemberNotFound
	}
	_ = target

	fromOwner := actor.EmployeeID
	if actorMember.Role != chat.MemberRoleOwner {
		// Company admin transferring: find current owner.
		members, err := s.conv.ListConversationMembers(ctx, actor.CompanyID, conversationID, 500)
		if err != nil {
			return err
		}
		fromOwner = uuid.Nil
		for _, m := range members {
			if m.Role == chat.MemberRoleOwner {
				fromOwner = m.EmployeeID
				break
			}
		}
		if fromOwner == uuid.Nil {
			return chat.ErrLastOwner
		}
	}

	if err := s.db.WithinTx(ctx, func(txCtx context.Context) error {
		return s.conv.TransferOwnership(txCtx, actor.CompanyID, conversationID, fromOwner, newOwnerID)
	}); err != nil {
		return err
	}

	convID := conversationID
	actorID := actor.EmployeeID
	targetID := newOwnerID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "ownership.transferred", &targetID, map[string]any{
		"from": fromOwner, "to": newOwnerID,
	})
	s.publish(ctx, realtime.TypeConversationRoleChanged, actor.CompanyID, &convID, &actorID, map[string]any{
		"conversation_id": conversationID,
		"employee_id":     newOwnerID,
		"role":            chat.MemberRoleOwner,
		"previous_owner":  fromOwner,
	})
	s.publish(ctx, realtime.TypeConversationRoleChanged, actor.CompanyID, &convID, &actorID, map[string]any{
		"conversation_id": conversationID,
		"employee_id":     fromOwner,
		"role":            chat.MemberRoleAdmin,
	})
	return nil
}

// UpdateMemberRole changes a member's conversation role.
func (s *Service) UpdateMemberRole(ctx context.Context, actor Actor, conversationID, employeeID uuid.UUID, role string) error {
	role = strings.ToLower(strings.TrimSpace(role))
	if _, ok := map[string]struct{}{
		chat.MemberRoleAdmin: {}, chat.MemberRoleModerator: {}, chat.MemberRoleMember: {},
	}[role]; !ok {
		// Ownership transfer must use TransferOwnership — cannot set owner here.
		if role == chat.MemberRoleOwner {
			return chat.ErrInvalidRoleChange
		}
		return chat.ErrInvalidMemberRole
	}
	actorMember, err := s.requireMember(ctx, actor, conversationID)
	if err != nil {
		return err
	}
	if !s.canChangeRoles(actor, actorMember) {
		return shared.ErrForbidden
	}
	target, err := s.conv.GetConversationMember(ctx, actor.CompanyID, conversationID, employeeID)
	if err != nil {
		return chat.ErrMemberNotFound
	}
	if target.Role == chat.MemberRoleOwner {
		owners, err := s.conv.CountOwners(ctx, actor.CompanyID, conversationID)
		if err != nil {
			return err
		}
		if owners <= 1 {
			return chat.ErrLastOwner
		}
		// Only owner / company moderator can demote an owner.
		if !s.canTransferOwner(actor, actorMember) {
			return shared.ErrForbidden
		}
	}
	// Admins cannot modify peers of equal/higher rank unless company moderator.
	if !actor.hasPerm(auth.PermChatModerate) && actorMember.Role != chat.MemberRoleOwner {
		if roleRank(target.Role) >= roleRank(actorMember.Role) {
			return shared.ErrForbidden
		}
		if roleRank(role) >= roleRank(actorMember.Role) {
			return shared.ErrForbidden
		}
	}
	if err := s.conv.UpdateMemberRole(ctx, actor.CompanyID, conversationID, employeeID, role); err != nil {
		return err
	}
	convID := conversationID
	actorID := actor.EmployeeID
	targetID := employeeID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "member.role_changed", &targetID, map[string]any{
		"from": target.Role, "to": role,
	})
	s.publish(ctx, realtime.TypeConversationRoleChanged, actor.CompanyID, &convID, &actorID, map[string]any{
		"conversation_id": conversationID,
		"employee_id":     employeeID,
		"role":            role,
		"previous_role":   target.Role,
	})
	return nil
}

type MemberSettingsInput struct {
	IsMuted           *bool
	IsArchived        *bool
	NotificationLevel *string
}

// UpdateMemberSettings updates per-member mute/archive/notification preferences.
func (s *Service) UpdateMemberSettings(ctx context.Context, actor Actor, conversationID uuid.UUID, in MemberSettingsInput) (*chat.ConversationMember, error) {
	if _, err := s.requireMember(ctx, actor, conversationID); err != nil {
		return nil, err
	}
	if in.NotificationLevel != nil {
		level := strings.ToLower(strings.TrimSpace(*in.NotificationLevel))
		if err := chat.ValidateNotificationLevel(level); err != nil {
			return nil, err
		}
		in.NotificationLevel = &level
	}
	if err := s.conv.UpdateMemberSettings(ctx, actor.CompanyID, conversationID, actor.EmployeeID, in.IsMuted, in.IsArchived, in.NotificationLevel); err != nil {
		return nil, err
	}
	convID := conversationID
	actorID := actor.EmployeeID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "member.settings_updated", nil, nil)
	return s.conv.GetConversationMember(ctx, actor.CompanyID, conversationID, actor.EmployeeID)
}

// --- Invitations ---

func (s *Service) CreateInvitation(ctx context.Context, actor Actor, conversationID, inviteeID uuid.UUID, expiresIn time.Duration) (*chat.ConversationInvitation, error) {
	if s.invites == nil {
		return nil, shared.ErrInternal
	}
	member, err := s.requireMember(ctx, actor, conversationID)
	if err != nil {
		return nil, err
	}
	if !s.canManageMembers(member, actor) {
		return nil, shared.ErrForbidden
	}
	if inviteeID == actor.EmployeeID {
		return nil, shared.New("CHAT_INVALID_INVITE", "Cannot invite yourself", 400)
	}
	ok, err := s.conv.EmployeeBelongsToCompany(ctx, actor.CompanyID, inviteeID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, chat.ErrConversationNotFound
	}
	if _, err := s.conv.GetConversationMember(ctx, actor.CompanyID, conversationID, inviteeID); err == nil {
		return nil, shared.New("CHAT_MEMBER_EXISTS", "Already a member", 409)
	}
	if existing, err := s.invites.FindPendingInvitation(ctx, actor.CompanyID, conversationID, inviteeID); err == nil && existing != nil {
		if existing.ExpiresAt == nil || existing.ExpiresAt.After(time.Now().UTC()) {
			return nil, shared.New("CHAT_INVITATION_EXISTS", "Pending invitation already exists", 409)
		}
	}
	if expiresIn <= 0 {
		expiresIn = 7 * 24 * time.Hour
	}
	exp := time.Now().UTC().Add(expiresIn)
	inv := &chat.ConversationInvitation{
		ID:                uuid.New(),
		CompanyID:         actor.CompanyID,
		ConversationID:    conversationID,
		InvitedBy:         actor.EmployeeID,
		InvitedEmployeeID: inviteeID,
		Status:            chat.InvitationStatusPending,
		ExpiresAt:         &exp,
		CreatedAt:         time.Now().UTC(),
	}
	if err := s.invites.CreateInvitation(ctx, inv); err != nil {
		return nil, err
	}
	convID := conversationID
	actorID := actor.EmployeeID
	target := inviteeID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "invitation.created", &target, map[string]any{"invitation_id": inv.ID})
	s.publish(ctx, realtime.TypeConversationInvitationCreated, actor.CompanyID, &convID, &actorID, map[string]any{
		"invitation_id":   inv.ID,
		"conversation_id": conversationID,
		"invitee_id":      inviteeID,
	})
	if s.notifs != nil {
		n := support.NewNotification(actor.CompanyID, inviteeID, chat.NotifTypeInvitation,
			"Conversation invitation", "You were invited to a conversation").
			WithSource("chat_invitation", inv.ID, "/chat/invitations/"+inv.ID.String())
		_ = s.notifs.Create(ctx, n)
		s.publishToRecipient(ctx, realtime.TypeNotificationCreated, actor.CompanyID, &convID, &actorID, &inviteeID, map[string]any{
			"id": n.ID, "type": n.Type, "title": n.Title, "body": n.Body,
			"action_url": n.ActionURL, "created_at": n.CreatedAt,
		})
	}
	return inv, nil
}

type InvitationPage struct {
	Items      []chat.ConversationInvitation `json:"items"`
	NextCursor string                        `json:"next_cursor,omitempty"`
	HasMore    bool                          `json:"has_more"`
}

func (s *Service) ListMyInvitations(ctx context.Context, actor Actor, status, cursor string, limit int) (*InvitationPage, error) {
	if s.invites == nil {
		return nil, shared.ErrInternal
	}
	if !actor.hasPerm(auth.PermChatView) {
		return nil, shared.ErrForbidden
	}
	items, next, err := s.invites.ListInvitationsForEmployee(ctx, actor.CompanyID, actor.EmployeeID, status, cursor, limit)
	if err != nil {
		return nil, err
	}
	return &InvitationPage{Items: items, NextCursor: next, HasMore: next != ""}, nil
}

func (s *Service) AcceptInvitation(ctx context.Context, actor Actor, invitationID uuid.UUID) error {
	if s.invites == nil {
		return shared.ErrInternal
	}
	inv, err := s.invites.GetInvitation(ctx, actor.CompanyID, invitationID)
	if err != nil {
		return err
	}
	if inv.InvitedEmployeeID != actor.EmployeeID {
		return shared.ErrForbidden
	}
	if inv.Status != chat.InvitationStatusPending {
		return chat.ErrInvitationNotPending
	}
	if inv.ExpiresAt != nil && !inv.ExpiresAt.After(time.Now().UTC()) {
		_ = s.invites.UpdateInvitationStatus(ctx, actor.CompanyID, invitationID, chat.InvitationStatusExpired)
		return chat.ErrInvitationExpired
	}
	m, err := chat.NewConversationMember(actor.CompanyID, inv.ConversationID, actor.EmployeeID, chat.MemberRoleMember)
	if err != nil {
		return err
	}
	if err := s.db.WithinTx(ctx, func(txCtx context.Context) error {
		if err := s.invites.UpdateInvitationStatus(txCtx, actor.CompanyID, invitationID, chat.InvitationStatusAccepted); err != nil {
			return err
		}
		return s.conv.AddConversationMember(txCtx, m)
	}); err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			_ = s.invites.UpdateInvitationStatus(ctx, actor.CompanyID, invitationID, chat.InvitationStatusAccepted)
			return nil
		}
		return err
	}
	convID := inv.ConversationID
	actorID := actor.EmployeeID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "invitation.accepted", &invitationID, nil)
	s.publish(ctx, realtime.TypeConversationMemberAdded, actor.CompanyID, &convID, &actorID, map[string]any{
		"conversation_id": convID,
		"employee_id":     actor.EmployeeID,
		"role":            chat.MemberRoleMember,
	})
	return nil
}

func (s *Service) RejectInvitation(ctx context.Context, actor Actor, invitationID uuid.UUID) error {
	if s.invites == nil {
		return shared.ErrInternal
	}
	inv, err := s.invites.GetInvitation(ctx, actor.CompanyID, invitationID)
	if err != nil {
		return err
	}
	if inv.InvitedEmployeeID != actor.EmployeeID {
		return shared.ErrForbidden
	}
	if inv.Status != chat.InvitationStatusPending {
		return chat.ErrInvitationNotPending
	}
	if err := s.invites.UpdateInvitationStatus(ctx, actor.CompanyID, invitationID, chat.InvitationStatusDeclined); err != nil {
		return err
	}
	convID := inv.ConversationID
	actorID := actor.EmployeeID
	s.appendAudit(ctx, actor.CompanyID, &convID, &actorID, "invitation.rejected", &invitationID, nil)
	return nil
}

// --- Reports / blocks / bookmarks / threads ---

type ReportPage struct {
	Items      []chat.MessageReport `json:"items"`
	NextCursor string               `json:"next_cursor,omitempty"`
	HasMore    bool                 `json:"has_more"`
}

func (s *Service) ListReports(ctx context.Context, actor Actor, status, cursor string, limit int) (*ReportPage, error) {
	if !actor.hasPerm(auth.PermChatModerate) {
		return nil, shared.ErrForbidden
	}
	items, next, err := s.mod.ListReports(ctx, actor.CompanyID, status, cursor, limit)
	if err != nil {
		return nil, err
	}
	return &ReportPage{Items: items, NextCursor: next, HasMore: next != ""}, nil
}

func (s *Service) UpdateReport(ctx context.Context, actor Actor, reportID uuid.UUID, status string) (*chat.MessageReport, error) {
	if !actor.hasPerm(auth.PermChatModerate) {
		return nil, shared.ErrForbidden
	}
	status = strings.ToLower(strings.TrimSpace(status))
	if err := chat.ValidateReportStatus(status); err != nil {
		return nil, err
	}
	if status == chat.ReportStatusPending {
		return nil, shared.New("CHAT_INVALID_REPORT_STATUS", "Cannot reset to pending", 400)
	}
	if err := s.mod.UpdateReportStatus(ctx, actor.CompanyID, reportID, actor.EmployeeID, status); err != nil {
		return nil, err
	}
	s.appendAudit(ctx, actor.CompanyID, nil, &actor.EmployeeID, "report.updated", &reportID, map[string]any{"status": status})
	return s.mod.GetReport(ctx, actor.CompanyID, reportID)
}

type BlockPage struct {
	Items      []chat.BlockedUser `json:"items"`
	NextCursor string             `json:"next_cursor,omitempty"`
	HasMore    bool               `json:"has_more"`
}

func (s *Service) ListBlocks(ctx context.Context, actor Actor, cursor string, limit int) (*BlockPage, error) {
	items, next, err := s.mod.ListBlocks(ctx, actor.CompanyID, actor.EmployeeID, cursor, limit)
	if err != nil {
		return nil, err
	}
	return &BlockPage{Items: items, NextCursor: next, HasMore: next != ""}, nil
}

type BookmarkPage struct {
	Items      []chat.MessageBookmark `json:"items"`
	NextCursor string                 `json:"next_cursor,omitempty"`
	HasMore    bool                   `json:"has_more"`
}

func (s *Service) ListBookmarks(ctx context.Context, actor Actor, cursor string, limit int) (*BookmarkPage, error) {
	if !actor.hasPerm(auth.PermChatView) {
		return nil, shared.ErrForbidden
	}
	items, next, err := s.bookmark.ListBookmarks(ctx, actor.CompanyID, actor.EmployeeID, cursor, limit)
	if err != nil {
		return nil, err
	}
	return &BookmarkPage{Items: items, NextCursor: next, HasMore: next != ""}, nil
}

func (s *Service) ListThread(ctx context.Context, actor Actor, messageID uuid.UUID, q chat.MessageListQuery) (*MessagePage, error) {
	if !actor.hasPerm(auth.PermChatView) {
		return nil, shared.ErrForbidden
	}
	root, err := s.msg.GetMessageByIDIncludingDeleted(ctx, actor.CompanyID, messageID)
	if err != nil {
		return nil, err
	}
	if _, err := s.requireMember(ctx, actor, root.ConversationID); err != nil {
		return nil, err
	}
	threadRoot := messageID
	if root.ThreadRootID != nil {
		threadRoot = *root.ThreadRootID
	}
	items, next, err := s.msg.ListThreadMessages(ctx, actor.CompanyID, root.ConversationID, threadRoot, q)
	if err != nil {
		return nil, err
	}
	return &MessagePage{Items: items, NextCursor: next, HasMore: next != ""}, nil
}
