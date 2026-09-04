package realtime

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"PMAS/internal/domain/chat"
	"PMAS/internal/logging"
)

// MembershipChecker verifies conversation access for subscriptions.
type MembershipChecker interface {
	CanSubscribe(ctx context.Context, companyID, employeeID, conversationID uuid.UUID) (bool, error)
}

// Hub manages WebSocket connections, subscriptions, and local fan-out.
type Hub struct {
	cfg      Config
	metrics  *Metrics
	checker  MembershipChecker
	upgrader websocket.Upgrader

	mu         sync.RWMutex
	byEmployee map[uuid.UUID]map[string]*Conn
	byConn     map[string]*Conn
	byConv     map[uuid.UUID]map[string]*Conn
	totalConns int
	closed     bool

	// optional local publish callback for typing/presence fanout without Redis
	localPublish func(Event)

	presenceBackend PresenceBackend

	awayMu sync.RWMutex
	away   map[uuid.UUID]struct{}

	typingMu   sync.Mutex
	typing     map[typingKey]typingEntry
	typingOnce sync.Once
}

func NewHub(cfg Config, checker MembershipChecker, metrics *Metrics) *Hub {
	cfg = cfg.withDefaults()
	if metrics == nil {
		metrics = &Metrics{}
	}
	h := &Hub{
		cfg:        cfg,
		metrics:    metrics,
		checker:    checker,
		byEmployee: map[uuid.UUID]map[string]*Conn{},
		byConn:     map[string]*Conn{},
		byConv:     map[uuid.UUID]map[string]*Conn{},
		away:       map[uuid.UUID]struct{}{},
		typing:     map[typingKey]typingEntry{},
	}
	h.upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     h.checkOrigin,
	}
	return h
}

func (h *Hub) Metrics() *Metrics { return h.metrics }

func (h *Hub) Config() Config { return h.cfg }

// SetLocalPublishHook wires typing fan-out when Redis is disabled.
func (h *Hub) SetLocalPublishHook(fn func(Event)) {
	h.localPublish = fn
}

func (h *Hub) checkOrigin(r *http.Request) bool {
	origin := strings.TrimRight(strings.TrimSpace(r.Header.Get("Origin")), "/")
	if origin == "" {
		return true
	}
	for _, a := range h.cfg.AllowedOrigins {
		a = strings.TrimSpace(a)
		if a == "*" {
			return true
		}
		if strings.EqualFold(origin, strings.TrimRight(a, "/")) {
			return true
		}
	}
	if strings.EqualFold(h.cfg.AppEnv, "development") {
		lo := strings.ToLower(origin)
		if strings.HasPrefix(lo, "http://localhost") || strings.HasPrefix(lo, "http://127.0.0.1") {
			return true
		}
	}
	return false
}

// ServeWS upgrades the HTTP request and starts pumps. Blocks until the connection ends.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request, identity ConnIdentity) {
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		http.Error(w, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	if h.totalConns >= h.cfg.MaxConnectionsGlobal {
		h.mu.Unlock()
		h.metrics.ConnectionsRejected.Add(1)
		http.Error(w, "connection limit exceeded", http.StatusServiceUnavailable)
		return
	}
	if len(h.byEmployee[identity.EmployeeID]) >= h.cfg.MaxConnectionsPerEmployee {
		h.mu.Unlock()
		h.metrics.ConnectionsRejected.Add(1)
		http.Error(w, "per-employee connection limit exceeded", http.StatusTooManyRequests)
		return
	}
	h.mu.Unlock()

	ws, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.metrics.ConnectionsRejected.Add(1)
		logging.Warn("chat_ws_upgrade_failed", "error", err.Error())
		return
	}

	conn := newConn(h, ws, identity)
	becameOnline, err := h.register(conn)
	if err != nil {
		_ = ws.Close()
		h.metrics.ConnectionsRejected.Add(1)
		return
	}

	actorID := identity.EmployeeID
	if frame, err := encodeControl(TypeConnected, identity.CompanyID, &actorID, ControlPayload{
		EmployeeID: &identity.EmployeeID,
		ServerTime: time.Now().UTC(),
	}); err == nil {
		_ = conn.Enqueue(frame)
	}

	if becameOnline {
		h.noteOnline(identity.CompanyID, identity.EmployeeID, conn.id)
	}

	go conn.writePump()
	conn.readPump(r.Context())
}

func (h *Hub) register(c *Conn) (becameOnline bool, err error) {
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return false, ErrHubClosed
	}
	if h.totalConns >= h.cfg.MaxConnectionsGlobal {
		h.mu.Unlock()
		return false, ErrConnectionLimit
	}
	prev := len(h.byEmployee[c.identity.EmployeeID])
	if prev >= h.cfg.MaxConnectionsPerEmployee {
		h.mu.Unlock()
		return false, ErrConnectionLimit
	}
	h.byConn[c.id] = c
	if h.byEmployee[c.identity.EmployeeID] == nil {
		h.byEmployee[c.identity.EmployeeID] = map[string]*Conn{}
	}
	h.byEmployee[c.identity.EmployeeID][c.id] = c
	h.totalConns++
	h.metrics.Connections.Store(int64(h.totalConns))
	becameOnline = prev == 0
	h.mu.Unlock()
	return becameOnline, nil
}

func (h *Hub) unregister(c *Conn) {
	// Snapshot subscriptions first to preserve lock order: conn.subsMu → hub.mu
	subs := c.snapshotSubs()
	h.mu.Lock()
	if _, ok := h.byConn[c.id]; !ok {
		h.mu.Unlock()
		return
	}
	delete(h.byConn, c.id)
	wentOffline := false
	companyID := c.identity.CompanyID
	employeeID := c.identity.EmployeeID
	if emp := h.byEmployee[c.identity.EmployeeID]; emp != nil {
		delete(emp, c.id)
		if len(emp) == 0 {
			delete(h.byEmployee, c.identity.EmployeeID)
			wentOffline = true
		}
	}
	for _, convID := range subs {
		if room := h.byConv[convID]; room != nil {
			delete(room, c.id)
			if len(room) == 0 {
				delete(h.byConv, convID)
			}
		}
	}
	h.totalConns--
	if h.totalConns < 0 {
		h.totalConns = 0
	}
	h.metrics.Connections.Store(int64(h.totalConns))
	h.mu.Unlock()

	if wentOffline {
		h.noteOffline(companyID, employeeID)
	}
}

func (h *Hub) bindConversation(c *Conn, conversationID uuid.UUID) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.byConv[conversationID] == nil {
		h.byConv[conversationID] = map[string]*Conn{}
	}
	h.byConv[conversationID][c.id] = c
}

func (h *Hub) unbindConversation(c *Conn, conversationID uuid.UUID) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room := h.byConv[conversationID]; room != nil {
		delete(room, c.id)
		if len(room) == 0 {
			delete(h.byConv, conversationID)
		}
	}
}

// DeliverEvent fans out a server event to locally subscribed connections.
// Company mismatch is rejected. Conversation-scoped events require subscription.
// Recipient-scoped events (e.g. notification.created) go only to that employee.
// Multiple devices of the same employee receive the event when each connection is eligible.
func (h *Hub) DeliverEvent(e Event) {
	payload, err := EncodeEvent(e)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	if h.closed {
		return
	}

	// Private recipient delivery — never fall through to conversation/company fanout.
	if e.RecipientID != nil && *e.RecipientID != uuid.Nil {
		for _, c := range h.byEmployee[*e.RecipientID] {
			if c.identity.CompanyID != e.CompanyID {
				continue
			}
			_ = c.Enqueue(payload)
		}
		return
	}

	if e.ConversationID != nil {
		for _, c := range h.byConv[*e.ConversationID] {
			if c.identity.CompanyID != e.CompanyID {
				continue
			}
			if e.ExcludeConnID != "" && c.id == e.ExcludeConnID {
				continue
			}
			_ = c.Enqueue(payload)
		}
		return
	}

	for _, empMap := range h.byEmployee {
		for _, c := range empMap {
			if c.identity.CompanyID != e.CompanyID {
				continue
			}
			if e.ExcludeConnID != "" && c.id == e.ExcludeConnID {
				continue
			}
			_ = c.Enqueue(payload)
		}
	}
}

func (h *Hub) handleClientMessage(ctx context.Context, c *Conn, data []byte) {
	msg, err := DecodeClientMessage(data)
	if err != nil {
		c.sendError("INVALID_PAYLOAD", "Malformed JSON")
		return
	}
	switch strings.ToLower(strings.TrimSpace(msg.Type)) {
	case TypePing:
		actorID := c.identity.EmployeeID
		frame, err := encodeControl(TypePong, c.identity.CompanyID, &actorID, ControlPayload{ServerTime: time.Now().UTC()})
		if err == nil {
			_ = c.Enqueue(frame)
		}
	case TypeSubscribe:
		h.handleSubscribe(ctx, c, msg.ConversationIDs)
	case TypeUnsubscribe:
		h.handleUnsubscribe(c, msg.ConversationIDs)
	case TypeTypingStart, TypeTypingStop:
		h.handleTyping(ctx, c, msg)
	case TypePresenceSet:
		h.handlePresenceSet(c, msg)
	default:
		c.sendError("UNKNOWN_COMMAND", "Unknown or unsupported command")
	}
}

func (h *Hub) handleSubscribe(ctx context.Context, c *Conn, ids []uuid.UUID) {
	if len(ids) == 0 {
		c.sendError("INVALID_SUBSCRIBE", "conversation_ids required")
		return
	}
	allowed := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if id == uuid.Nil {
			continue
		}
		if c.subscribed(id) {
			allowed = append(allowed, id)
			continue
		}
		if c.subscriptionCount() >= h.cfg.MaxSubscriptions {
			h.metrics.SubscriptionDenied.Add(1)
			c.sendError("SUBSCRIPTION_LIMIT", "Subscription limit exceeded")
			break
		}
		ok := false
		if h.checker != nil {
			var err error
			ok, err = h.checker.CanSubscribe(ctx, c.identity.CompanyID, c.identity.EmployeeID, id)
			if err != nil {
				logging.Warn("chat_ws_subscribe_check_failed", "error", err.Error())
				h.metrics.SubscriptionDenied.Add(1)
				continue
			}
		}
		if !ok {
			h.metrics.SubscriptionDenied.Add(1)
			continue
		}
		allowed = append(allowed, id)
	}
	added := c.addSubscriptions(allowed)
	for _, id := range added {
		h.bindConversation(c, id)
	}
	actorID := c.identity.EmployeeID
	frame, err := encodeControl(TypeSubscribed, c.identity.CompanyID, &actorID, ControlPayload{ConversationIDs: added})
	if err == nil {
		_ = c.Enqueue(frame)
	}
}

func (h *Hub) handleUnsubscribe(c *Conn, ids []uuid.UUID) {
	removed := c.removeSubscriptions(ids)
	for _, id := range removed {
		h.unbindConversation(c, id)
	}
	actorID := c.identity.EmployeeID
	frame, err := encodeControl(TypeUnsubscribed, c.identity.CompanyID, &actorID, ControlPayload{ConversationIDs: removed})
	if err == nil {
		_ = c.Enqueue(frame)
	}
}

func (h *Hub) handleTyping(ctx context.Context, c *Conn, msg ClientMessage) {
	if msg.ConversationID == nil || *msg.ConversationID == uuid.Nil {
		c.sendError("INVALID_TYPING", "conversation_id required")
		return
	}
	convID := *msg.ConversationID
	if !c.subscribed(convID) {
		ok := false
		if h.checker != nil {
			var err error
			ok, err = h.checker.CanSubscribe(ctx, c.identity.CompanyID, c.identity.EmployeeID, convID)
			if err != nil || !ok {
				h.metrics.SubscriptionDenied.Add(1)
				return
			}
		} else {
			return
		}
	}
	if strings.EqualFold(msg.Type, TypeTypingStop) {
		h.stopTyping(c, convID)
		return
	}
	h.clearAwayOnline(c)
	h.refreshTyping(c, convID)
}

func (h *Hub) handlePresenceSet(c *Conn, msg ClientMessage) {
	status := strings.ToLower(strings.TrimSpace(msg.Status))
	switch status {
	case chat.PresenceAway:
		h.setAway(c)
	case chat.PresenceOnline:
		h.clearAwayOnline(c)
	default:
		c.sendError("INVALID_PRESENCE", "status must be online or away")
	}
}

func (c *Conn) sendError(code, message string) {
	actorID := c.identity.EmployeeID
	frame, err := encodeControl(TypeError, c.identity.CompanyID, &actorID, ControlPayload{Code: code, Message: message})
	if err == nil {
		_ = c.Enqueue(frame)
	}
}

// Shutdown stops accepting connections and closes all active ones.
func (h *Hub) Shutdown(ctx context.Context) {
	h.mu.Lock()
	h.closed = true
	conns := make([]*Conn, 0, len(h.byConn))
	for _, c := range h.byConn {
		conns = append(conns, c)
	}
	h.mu.Unlock()

	for _, c := range conns {
		c.close()
	}

	deadline := time.Now().Add(5 * time.Second)
	if d, ok := ctx.Deadline(); ok {
		deadline = d
	}
	for time.Now().Before(deadline) {
		h.mu.RLock()
		n := h.totalConns
		h.mu.RUnlock()
		if n == 0 {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(50 * time.Millisecond):
		}
	}
}

// ConnectionCount returns the number of active connections (for tests).
func (h *Hub) ConnectionCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.totalConns
}
