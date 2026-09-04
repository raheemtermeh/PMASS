package support

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
)

// ActivityLog is immutable (PDF §3.13).
type ActivityLog struct {
	ID         uuid.UUID       `json:"id"`
	CompanyID  uuid.UUID       `json:"company_id"`
	EntityType string          `json:"entity_type"`
	EntityID   uuid.UUID       `json:"entity_id"`
	Action     string          `json:"action"`
	ActorID    *uuid.UUID      `json:"actor_id,omitempty"`
	Payload    json.RawMessage `json:"payload,omitempty"`
	CreatedAt  time.Time       `json:"created_at"`
}

func NewActivity(companyID uuid.UUID, entityType string, entityID uuid.UUID, action string, actorID *uuid.UUID, payload any) (*ActivityLog, error) {
	var raw json.RawMessage
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		raw = b
	}
	return &ActivityLog{
		ID:         uuid.New(),
		CompanyID:  companyID,
		EntityType: entityType,
		EntityID:   entityID,
		Action:     action,
		ActorID:    actorID,
		Payload:    raw,
		CreatedAt:  time.Now().UTC(),
	}, nil
}

type Notification struct {
	shared.BaseModel
	CompanyID  uuid.UUID  `json:"company_id"`
	ReceiverID uuid.UUID  `json:"receiver_id"` // employee id
	Type       string     `json:"type"`
	Title      string     `json:"title"`
	Body       string     `json:"body"`
	IsRead     bool       `json:"is_read"`
	SourceType string     `json:"source_type,omitempty"`
	SourceID   *uuid.UUID `json:"source_id,omitempty"`
	ActionURL  string     `json:"action_url,omitempty"`
}

func NewNotification(companyID, receiverID uuid.UUID, notifType, title, body string) *Notification {
	return &Notification{
		BaseModel:  shared.NewBase(),
		CompanyID:  companyID,
		ReceiverID: receiverID,
		Type:       notifType,
		Title:      title,
		Body:       body,
		IsRead:     false,
	}
}

func (n *Notification) WithSource(sourceType string, sourceID uuid.UUID, actionURL string) *Notification {
	n.SourceType = sourceType
	if sourceID != uuid.Nil {
		id := sourceID
		n.SourceID = &id
	}
	n.ActionURL = actionURL
	return n
}
