package chatapp

import (
	"context"
	"unicode/utf8"

	"github.com/google/uuid"

	"PMAS/internal/auth"
	"PMAS/internal/domain/chat"
	"PMAS/internal/domain/shared"
	"PMAS/internal/logging"
)

type SearchPage struct {
	Items      []chat.SearchHit `json:"items"`
	NextCursor string           `json:"next_cursor,omitempty"`
	HasMore    bool             `json:"has_more"`
}

// SearchConversation searches messages inside one conversation the actor belongs to.
func (s *Service) SearchConversation(ctx context.Context, actor Actor, conversationID uuid.UUID, q chat.SearchQuery) (*SearchPage, error) {
	if !actor.hasPerm(auth.PermChatView) {
		return nil, shared.ErrForbidden
	}
	if _, err := s.requireMember(ctx, actor, conversationID); err != nil {
		return nil, err
	}
	cid := conversationID
	q.ConversationID = &cid
	return s.runSearch(ctx, actor, q)
}

// SearchGlobal searches across conversations the actor can currently access.
func (s *Service) SearchGlobal(ctx context.Context, actor Actor, q chat.SearchQuery) (*SearchPage, error) {
	if !actor.hasPerm(auth.PermChatView) {
		return nil, shared.ErrForbidden
	}
	return s.runSearch(ctx, actor, q)
}

func (s *Service) runSearch(ctx context.Context, actor Actor, q chat.SearchQuery) (*SearchPage, error) {
	if s.metrics != nil {
		s.metrics.SearchRequests.Add(1)
	}
	q = q.Normalize()
	if utf8.RuneCountInString(q.Query) < chat.SearchMinQueryLength {
		if s.metrics != nil {
			s.metrics.SearchFailures.Add(1)
		}
		return nil, chat.ErrSearchQueryTooShort
	}
	items, next, err := s.msg.SearchMessages(ctx, actor.CompanyID, actor.EmployeeID, q)
	if err != nil {
		if s.metrics != nil {
			s.metrics.SearchFailures.Add(1)
		}
		logging.Warn("chat_search_failed", "error", err.Error(), "company_id", actor.CompanyID.String())
		return nil, err
	}
	return &SearchPage{Items: items, NextCursor: next, HasMore: next != ""}, nil
}
