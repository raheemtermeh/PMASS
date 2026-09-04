package realtime

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Server → client and client → server event type constants.
const (
	TypeConnected    = "connected"
	TypeSubscribed   = "subscribed"
	TypeUnsubscribed = "unsubscribed"
	TypeError        = "error"
	TypePong         = "pong"
	TypePing         = "ping"

	TypeSubscribe   = "subscribe"
	TypeUnsubscribe = "unsubscribe"
	TypeTypingStart = "typing.start"
	TypeTypingStop  = "typing.stop"

	TypeMessageCreated         = "message.created"
	TypeMessageUpdated         = "message.updated"
	TypeMessageDeleted         = "message.deleted"
	TypeMessageReactionAdded   = "message.reaction.added"
	TypeMessageReactionRemoved = "message.reaction.removed"
	TypeMessageRead            = "message.read"
	TypeMessageDelivered       = "message.delivered"
	TypeMessagePinned          = "message.pinned"
	TypeMessageUnpinned        = "message.unpinned"

	TypeConversationCreated           = "conversation.created"
	TypeConversationUpdated           = "conversation.updated"
	TypeConversationMemberAdded       = "conversation.member_added"
	TypeConversationMemberRemoved     = "conversation.member_removed"
	TypeConversationRoleChanged       = "conversation.role_changed"
	TypeConversationInvitationCreated = "conversation.invitation_created"

	TypeTypingStarted       = "typing.started"
	TypeTypingStopped       = "typing.stopped"
	TypePresenceUpdated     = "presence.updated"
	TypePresenceSet         = "presence.set"
	TypeNotificationCreated = "notification.created"
	TypeDraftUpdated        = "draft.updated"
)

// Event is the stable realtime envelope. company_id and actor_id are always server-set.
// RecipientID, when set, restricts delivery to that employee's connections only
// (used for private notifications — never company-broadcast).
type Event struct {
	ID             string          `json:"id"`
	Type           string          `json:"type"`
	Timestamp      time.Time       `json:"timestamp"`
	CompanyID      uuid.UUID       `json:"company_id"`
	ConversationID *uuid.UUID      `json:"conversation_id,omitempty"`
	ActorID        *uuid.UUID      `json:"actor_id,omitempty"`
	RecipientID    *uuid.UUID      `json:"recipient_id,omitempty"`
	ExcludeConnID  string          `json:"-"` // originating connection; not serialized
	Payload        json.RawMessage `json:"payload"`
}

// NewEvent builds a server event with a unique ID and UTC timestamp.
func NewEvent(eventType string, companyID uuid.UUID, conversationID, actorID *uuid.UUID, payload any) (Event, error) {
	return NewRecipientEvent(eventType, companyID, conversationID, actorID, nil, payload)
}

// NewRecipientEvent builds an event optionally targeted at a single recipient.
func NewRecipientEvent(eventType string, companyID uuid.UUID, conversationID, actorID, recipientID *uuid.UUID, payload any) (Event, error) {
	var raw json.RawMessage
	if payload == nil {
		raw = json.RawMessage(`{}`)
	} else {
		b, err := json.Marshal(payload)
		if err != nil {
			return Event{}, err
		}
		raw = b
	}
	return Event{
		ID:             uuid.New().String(),
		Type:           eventType,
		Timestamp:      time.Now().UTC(),
		CompanyID:      companyID,
		ConversationID: conversationID,
		ActorID:        actorID,
		RecipientID:    recipientID,
		Payload:        raw,
	}, nil
}

// EncodeEvent serializes an event envelope.
func EncodeEvent(e Event) ([]byte, error) {
	return json.Marshal(e)
}

// DecodeEvent parses an event envelope.
func DecodeEvent(data []byte) (Event, error) {
	var e Event
	if err := json.Unmarshal(data, &e); err != nil {
		return Event{}, err
	}
	return e, nil
}

// ClientMessage is a client → server command.
type ClientMessage struct {
	Type            string      `json:"type"`
	ConversationIDs []uuid.UUID `json:"conversation_ids,omitempty"`
	ConversationID  *uuid.UUID  `json:"conversation_id,omitempty"`
	Status          string      `json:"status,omitempty"` // presence.set
}

// DecodeClientMessage parses a client command. Malformed JSON returns an error (never panics).
func DecodeClientMessage(data []byte) (ClientMessage, error) {
	var m ClientMessage
	if err := json.Unmarshal(data, &m); err != nil {
		return ClientMessage{}, err
	}
	return m, nil
}

// ControlPayload is used for connected / subscribed / error / pong frames.
type ControlPayload struct {
	EmployeeID      *uuid.UUID  `json:"employee_id,omitempty"`
	ServerTime      time.Time   `json:"server_time,omitempty"`
	ConversationIDs []uuid.UUID `json:"conversation_ids,omitempty"`
	Code            string      `json:"code,omitempty"`
	Message         string      `json:"message,omitempty"`
}

func encodeControl(eventType string, companyID uuid.UUID, actorID *uuid.UUID, payload ControlPayload) ([]byte, error) {
	e, err := NewEvent(eventType, companyID, nil, actorID, payload)
	if err != nil {
		return nil, err
	}
	return EncodeEvent(e)
}
