package chatapp

import (
	"context"

	"github.com/google/uuid"

	"PMAS/internal/logging"
	"PMAS/internal/realtime"
)

// EventPublisher fans out chat events after successful persistence.
// Production uses Redis; tests may use in-memory / hub-local publishers.
type EventPublisher interface {
	Publish(ctx context.Context, event realtime.Event) error
}

// NoopPublisher discards events.
type NoopPublisher struct{}

func (NoopPublisher) Publish(context.Context, realtime.Event) error { return nil }

// HubPublisher delivers events directly to the in-process hub (single-instance mode).
type HubPublisher struct {
	Hub *realtime.Hub
}

func (p HubPublisher) Publish(_ context.Context, event realtime.Event) error {
	if p.Hub == nil {
		return nil
	}
	p.Hub.DeliverEvent(event)
	return nil
}

// MemoryPublisher records events for tests.
type MemoryPublisher struct {
	Events []realtime.Event
}

func (p *MemoryPublisher) Publish(_ context.Context, event realtime.Event) error {
	p.Events = append(p.Events, event)
	return nil
}

func (s *Service) publish(ctx context.Context, eventType string, companyID uuid.UUID, conversationID, actorID *uuid.UUID, payload any) {
	if s.publisher == nil {
		return
	}
	event, err := realtime.NewEvent(eventType, companyID, conversationID, actorID, payload)
	if err != nil {
		logging.Error("chat_event_build_failed", "error", err.Error(), "type", eventType)
		return
	}
	if err := s.publisher.Publish(ctx, event); err != nil {
		logging.Error("chat_event_publish_failed",
			"error", err.Error(),
			"type", event.Type,
			"company_id", event.CompanyID.String(),
		)
	}
}

// CanSubscribe implements realtime.MembershipChecker.
func (s *Service) CanSubscribe(ctx context.Context, companyID, employeeID, conversationID uuid.UUID) (bool, error) {
	_, err := s.conv.GetConversationMember(ctx, companyID, conversationID, employeeID)
	if err != nil {
		return false, nil
	}
	return true, nil
}
