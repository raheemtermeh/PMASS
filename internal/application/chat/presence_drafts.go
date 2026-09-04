package chatapp

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"PMAS/internal/auth"
	"PMAS/internal/domain/chat"
	"PMAS/internal/domain/shared"
	"PMAS/internal/realtime"
)

// LivePresenceReader exposes in-process WebSocket presence from the Hub.
type LivePresenceReader interface {
	LiveStatus(employeeID uuid.UUID) string
}

type presenceBackendAdapter struct {
	presence chat.PresenceRepository
}

func (a presenceBackendAdapter) PersistOnline(ctx context.Context, companyID, employeeID uuid.UUID) error {
	p, err := chat.NewUserPresence(companyID, employeeID, chat.PresenceOnline)
	if err != nil {
		return err
	}
	return a.presence.UpsertPresence(ctx, p)
}

func (a presenceBackendAdapter) PersistOffline(ctx context.Context, companyID, employeeID uuid.UUID, lastSeen time.Time) error {
	p, err := chat.NewUserPresence(companyID, employeeID, chat.PresenceOffline)
	if err != nil {
		return err
	}
	p.LastSeenAt = &lastSeen
	return a.presence.UpsertPresence(ctx, p)
}

func (a presenceBackendAdapter) PersistAway(ctx context.Context, companyID, employeeID uuid.UUID) error {
	p, err := chat.NewUserPresence(companyID, employeeID, chat.PresenceAway)
	if err != nil {
		return err
	}
	return a.presence.UpsertPresence(ctx, p)
}

// PresenceBackend returns a realtime.PresenceBackend backed by PostgreSQL.
func (s *Service) PresenceBackend() realtime.PresenceBackend {
	if s.presence == nil {
		return nil
	}
	return presenceBackendAdapter{presence: s.presence}
}

// GetPresence returns hydrated presence for a bounded set of same-company employees.
func (s *Service) GetPresence(ctx context.Context, actor Actor, employeeIDs []uuid.UUID, live LivePresenceReader) ([]chat.PresenceView, error) {
	if !actor.hasPerm(auth.PermChatView) {
		return nil, shared.ErrForbidden
	}
	if len(employeeIDs) == 0 {
		return []chat.PresenceView{}, nil
	}
	if len(employeeIDs) > chat.MaxPresenceQueryIDs {
		return nil, shared.New("CHAT_PRESENCE_TOO_MANY", "Too many employee_ids", 400)
	}

	// Deduplicate while preserving order.
	seen := map[uuid.UUID]struct{}{}
	ids := make([]uuid.UUID, 0, len(employeeIDs))
	for _, id := range employeeIDs {
		if id == uuid.Nil {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	if s.presence == nil {
		return nil, shared.ErrInternal
	}

	// Only same-company active employees — never leak foreign tenants.
	allowed, err := s.presence.FilterCompanyEmployees(ctx, actor.CompanyID, ids)
	if err != nil {
		return nil, err
	}

	stored, err := s.presence.ListPresence(ctx, actor.CompanyID, allowed)
	if err != nil {
		return nil, err
	}
	byID := map[uuid.UUID]chat.UserPresence{}
	for _, p := range stored {
		byID[p.EmployeeID] = p
	}

	out := make([]chat.PresenceView, 0, len(allowed))
	for _, id := range allowed {
		view := chat.PresenceView{EmployeeID: id, Status: chat.PresenceOffline}
		if live != nil {
			if st := live.LiveStatus(id); st != "" {
				view.Status = st
			}
		}
		if p, ok := byID[id]; ok {
			if view.Status == "" || view.Status == chat.PresenceOffline {
				view.Status = p.Status
				if view.Status == "" {
					view.Status = chat.PresenceOffline
				}
			}
			if view.Status == chat.PresenceOffline || view.Status == chat.PresenceAway {
				view.LastSeenAt = p.LastSeenAt
			}
		}
		// Online: omit last_seen
		if view.Status == chat.PresenceOnline {
			view.LastSeenAt = nil
		}
		out = append(out, view)
	}
	return out, nil
}

type SaveDraftInput struct {
	Content         string
	ParentMessageID *uuid.UUID
	IfUpdatedAt     *time.Time
}

// GetDraft returns the actor's draft for a conversation.
func (s *Service) GetDraft(ctx context.Context, actor Actor, conversationID uuid.UUID) (*chat.MessageDraft, error) {
	if !actor.hasPerm(auth.PermChatView) {
		return nil, shared.ErrForbidden
	}
	if _, err := s.requireMember(ctx, actor, conversationID); err != nil {
		return nil, err
	}
	if s.drafts == nil {
		return nil, shared.ErrInternal
	}
	return s.drafts.GetDraft(ctx, actor.CompanyID, conversationID, actor.EmployeeID)
}

// SaveDraft upserts the actor's draft (one row per conversation+employee).
func (s *Service) SaveDraft(ctx context.Context, actor Actor, conversationID uuid.UUID, in SaveDraftInput) (*chat.MessageDraft, error) {
	if !actor.hasPerm(auth.PermChatSend) {
		return nil, shared.ErrForbidden
	}
	if _, err := s.requireMember(ctx, actor, conversationID); err != nil {
		return nil, err
	}
	content := strings.TrimSpace(in.Content)
	if utf8.RuneCountInString(content) > chat.MaxMessageLength() {
		return nil, chat.ErrMessageTooLong
	}
	if s.drafts == nil {
		return nil, shared.ErrInternal
	}
	d := &chat.MessageDraft{
		ConversationID:  conversationID,
		EmployeeID:      actor.EmployeeID,
		Content:         content,
		ParentMessageID: in.ParentMessageID,
		UpdatedAt:       time.Now().UTC(),
	}
	saved, err := s.drafts.SaveDraft(ctx, actor.CompanyID, d, in.IfUpdatedAt)
	if err != nil {
		return nil, err
	}
	if s.metrics != nil {
		s.metrics.DraftUpdates.Add(1)
	}
	// Private multi-device sync — no draft content in the event.
	recipient := actor.EmployeeID
	convID := conversationID
	s.publishToRecipient(ctx, realtime.TypeDraftUpdated, actor.CompanyID, &convID, &actor.EmployeeID, &recipient, map[string]any{
		"conversation_id": conversationID,
		"updated_at":      saved.UpdatedAt,
		"revision":        saved.Revision,
		"deleted":         false,
	})
	return saved, nil
}

// DeleteDraft removes the actor's draft.
func (s *Service) DeleteDraft(ctx context.Context, actor Actor, conversationID uuid.UUID) error {
	if !actor.hasPerm(auth.PermChatSend) {
		return shared.ErrForbidden
	}
	if _, err := s.requireMember(ctx, actor, conversationID); err != nil {
		return err
	}
	if s.drafts == nil {
		return shared.ErrInternal
	}
	if err := s.drafts.DeleteDraft(ctx, actor.CompanyID, conversationID, actor.EmployeeID); err != nil {
		return err
	}
	if s.metrics != nil {
		s.metrics.DraftUpdates.Add(1)
	}
	recipient := actor.EmployeeID
	convID := conversationID
	now := time.Now().UTC()
	s.publishToRecipient(ctx, realtime.TypeDraftUpdated, actor.CompanyID, &convID, &actor.EmployeeID, &recipient, map[string]any{
		"conversation_id": conversationID,
		"updated_at":      now,
		"deleted":         true,
	})
	return nil
}
