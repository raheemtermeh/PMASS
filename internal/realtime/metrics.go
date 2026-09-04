package realtime

import "sync/atomic"

// Metrics holds low-cardinality chat websocket / search / notification counters.
type Metrics struct {
	Connections                 atomic.Int64
	ConnectionsRejected         atomic.Int64
	MessagesReceived            atomic.Int64
	MessagesSent                atomic.Int64
	WriteQueueFull              atomic.Int64
	Disconnects                 atomic.Int64
	AuthFailures                atomic.Int64
	SubscriptionDenied          atomic.Int64
	RedisPublishFailures        atomic.Int64
	RedisReconnects             atomic.Int64
	SearchRequests              atomic.Int64
	SearchFailures              atomic.Int64
	NotificationCreated         atomic.Int64
	NotificationDeliveryFailure atomic.Int64
	PresenceOnline              atomic.Int64
	PresenceTransitions         atomic.Int64
	TypingEvents                atomic.Int64
	TypingExpired               atomic.Int64
	DraftUpdates                atomic.Int64
}

func (m *Metrics) Snapshot() map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return map[string]any{
		"chat_ws_connections":                 m.Connections.Load(),
		"chat_ws_connections_rejected":        m.ConnectionsRejected.Load(),
		"chat_ws_messages_received":           m.MessagesReceived.Load(),
		"chat_ws_messages_sent":               m.MessagesSent.Load(),
		"chat_ws_write_queue_full":            m.WriteQueueFull.Load(),
		"chat_ws_disconnects":                 m.Disconnects.Load(),
		"chat_ws_auth_failures":               m.AuthFailures.Load(),
		"chat_ws_subscription_denied":         m.SubscriptionDenied.Load(),
		"chat_redis_publish_failures":         m.RedisPublishFailures.Load(),
		"chat_redis_reconnects":               m.RedisReconnects.Load(),
		"chat_search_requests":                m.SearchRequests.Load(),
		"chat_search_failures":                m.SearchFailures.Load(),
		"chat_notification_created":           m.NotificationCreated.Load(),
		"chat_notification_delivery_failures": m.NotificationDeliveryFailure.Load(),
		"chat_presence_online":                m.PresenceOnline.Load(),
		"chat_presence_transitions":           m.PresenceTransitions.Load(),
		"chat_typing_events":                  m.TypingEvents.Load(),
		"chat_typing_expired":                 m.TypingExpired.Load(),
		"chat_draft_updates":                  m.DraftUpdates.Load(),
	}
}
