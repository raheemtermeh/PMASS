package realtime

import (
	"context"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/chat"
	"PMAS/internal/logging"
)

// DefaultTypingTTL is how long a typing indicator lives without refresh.
const DefaultTypingTTL = 8 * time.Second

// PresenceBackend persists durable presence transitions (PostgreSQL).
// Online state is driven by WebSocket connection counts in the Hub.
type PresenceBackend interface {
	PersistOnline(ctx context.Context, companyID, employeeID uuid.UUID) error
	PersistOffline(ctx context.Context, companyID, employeeID uuid.UUID, lastSeen time.Time) error
	PersistAway(ctx context.Context, companyID, employeeID uuid.UUID) error
}

type typingKey struct {
	Conv uuid.UUID
	Emp  uuid.UUID
}

type typingEntry struct {
	ExpiresAt time.Time
	ConnID    string
	CompanyID uuid.UUID
}

// SetPresenceBackend wires durable presence persistence.
func (h *Hub) SetPresenceBackend(b PresenceBackend) {
	h.presenceBackend = b
}

// StartBackground starts the single typing TTL sweeper. Safe to call once.
func (h *Hub) StartBackground(ctx context.Context) {
	h.typingOnce.Do(func() {
		if h.cfg.TypingTTL <= 0 {
			h.cfg.TypingTTL = DefaultTypingTTL
		}
		go h.typingSweeper(ctx)
	})
}

func (h *Hub) typingSweeper(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			h.expireTyping(time.Now().UTC())
		}
	}
}

func (h *Hub) expireTyping(now time.Time) {
	type expiredTyping struct {
		key       typingKey
		companyID uuid.UUID
	}
	h.typingMu.Lock()
	expired := make([]expiredTyping, 0)
	for k, e := range h.typing {
		if !e.ExpiresAt.After(now) {
			expired = append(expired, expiredTyping{key: k, companyID: e.CompanyID})
			delete(h.typing, k)
		}
	}
	h.typingMu.Unlock()

	for _, item := range expired {
		h.metrics.TypingExpired.Add(1)
		actor := item.key.Emp
		conv := item.key.Conv
		e, err := NewEvent(TypeTypingStopped, item.companyID, &conv, &actor, map[string]any{
			"conversation_id": conv,
			"employee_id":     actor,
			"expired":         true,
		})
		if err != nil {
			continue
		}
		h.publishLocal(e)
	}
}

func (h *Hub) publishLocal(e Event) {
	if e.CompanyID == uuid.Nil {
		return
	}
	if h.localPublish != nil {
		h.localPublish(e)
	} else {
		h.DeliverEvent(e)
	}
}

func (h *Hub) noteOnline(companyID, employeeID uuid.UUID, excludeConnID string) {
	h.metrics.PresenceTransitions.Add(1)
	h.metrics.PresenceOnline.Add(1)
	h.awayMu.Lock()
	delete(h.away, employeeID)
	h.awayMu.Unlock()

	if h.presenceBackend != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := h.presenceBackend.PersistOnline(ctx, companyID, employeeID); err != nil {
			logging.Warn("chat_presence_persist_online_failed", "error", err.Error())
		}
	}
	actor := employeeID
	e, err := NewEvent(TypePresenceUpdated, companyID, nil, &actor, map[string]any{
		"employee_id": employeeID,
		"status":      chat.PresenceOnline,
	})
	if err == nil {
		e.ExcludeConnID = excludeConnID
		h.publishLocal(e)
	}
}

func (h *Hub) noteOffline(companyID, employeeID uuid.UUID) {
	h.metrics.PresenceTransitions.Add(1)
	h.metrics.PresenceOnline.Add(-1)
	if h.metrics.PresenceOnline.Load() < 0 {
		h.metrics.PresenceOnline.Store(0)
	}
	h.awayMu.Lock()
	delete(h.away, employeeID)
	h.awayMu.Unlock()

	now := time.Now().UTC()
	if h.presenceBackend != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := h.presenceBackend.PersistOffline(ctx, companyID, employeeID, now); err != nil {
			logging.Warn("chat_presence_persist_offline_failed", "error", err.Error())
		}
	}
	h.clearTypingForEmployee(companyID, employeeID)
	actor := employeeID
	e, err := NewEvent(TypePresenceUpdated, companyID, nil, &actor, map[string]any{
		"employee_id":  employeeID,
		"status":       chat.PresenceOffline,
		"last_seen_at": now,
	})
	if err == nil {
		h.publishLocal(e)
	}
}

func (h *Hub) setAway(c *Conn) {
	h.mu.RLock()
	n := len(h.byEmployee[c.identity.EmployeeID])
	h.mu.RUnlock()
	if n == 0 {
		return
	}
	h.awayMu.Lock()
	h.away[c.identity.EmployeeID] = struct{}{}
	h.awayMu.Unlock()
	h.metrics.PresenceTransitions.Add(1)

	if h.presenceBackend != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := h.presenceBackend.PersistAway(ctx, c.identity.CompanyID, c.identity.EmployeeID); err != nil {
			logging.Warn("chat_presence_persist_away_failed", "error", err.Error())
		}
	}
	actor := c.identity.EmployeeID
	e, err := NewEvent(TypePresenceUpdated, c.identity.CompanyID, nil, &actor, map[string]any{
		"employee_id": actor,
		"status":      chat.PresenceAway,
	})
	if err == nil {
		h.publishLocal(e)
	}
}

func (h *Hub) clearAwayOnline(c *Conn) {
	h.awayMu.Lock()
	_, wasAway := h.away[c.identity.EmployeeID]
	delete(h.away, c.identity.EmployeeID)
	h.awayMu.Unlock()
	if !wasAway {
		return
	}
	h.noteOnline(c.identity.CompanyID, c.identity.EmployeeID, c.id)
}

// LiveStatus returns the in-memory presence for an employee in this hub process.
// Empty string means no live connection (caller should use PostgreSQL fallback).
func (h *Hub) LiveStatus(employeeID uuid.UUID) string {
	h.mu.RLock()
	n := len(h.byEmployee[employeeID])
	h.mu.RUnlock()
	if n == 0 {
		return ""
	}
	h.awayMu.RLock()
	_, away := h.away[employeeID]
	h.awayMu.RUnlock()
	if away {
		return chat.PresenceAway
	}
	return chat.PresenceOnline
}

// ConnectionCountFor returns active WebSocket count for an employee.
func (h *Hub) ConnectionCountFor(employeeID uuid.UUID) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.byEmployee[employeeID])
}

func (h *Hub) clearTypingForEmployee(companyID, employeeID uuid.UUID) {
	h.typingMu.Lock()
	removed := make([]typingKey, 0)
	for k, e := range h.typing {
		if k.Emp == employeeID {
			removed = append(removed, k)
			_ = e
			delete(h.typing, k)
		}
	}
	h.typingMu.Unlock()
	for _, k := range removed {
		actor := k.Emp
		conv := k.Conv
		ev, err := NewEvent(TypeTypingStopped, companyID, &conv, &actor, map[string]any{
			"conversation_id": conv,
			"employee_id":     actor,
		})
		if err == nil {
			h.publishLocal(ev)
		}
	}
}

func (h *Hub) refreshTyping(c *Conn, convID uuid.UUID) {
	ttl := h.cfg.TypingTTL
	if ttl <= 0 {
		ttl = DefaultTypingTTL
	}
	key := typingKey{Conv: convID, Emp: c.identity.EmployeeID}
	now := time.Now().UTC()
	h.typingMu.Lock()
	prev, existed := h.typing[key]
	h.typing[key] = typingEntry{
		ExpiresAt: now.Add(ttl),
		ConnID:    c.id,
		CompanyID: c.identity.CompanyID,
	}
	h.typingMu.Unlock()

	h.metrics.TypingEvents.Add(1)
	// Only fan out typing.started when newly created (avoid keystroke spam).
	if existed && prev.ExpiresAt.After(now) {
		return
	}
	actor := c.identity.EmployeeID
	e, err := NewEvent(TypeTypingStarted, c.identity.CompanyID, &convID, &actor, map[string]any{
		"conversation_id": convID,
		"employee_id":     actor,
	})
	if err != nil {
		return
	}
	e.ExcludeConnID = c.id
	h.publishLocal(e)
}

func (h *Hub) stopTyping(c *Conn, convID uuid.UUID) {
	key := typingKey{Conv: convID, Emp: c.identity.EmployeeID}
	h.typingMu.Lock()
	_, ok := h.typing[key]
	if ok {
		delete(h.typing, key)
	}
	h.typingMu.Unlock()
	if !ok {
		return
	}
	h.metrics.TypingEvents.Add(1)
	actor := c.identity.EmployeeID
	e, err := NewEvent(TypeTypingStopped, c.identity.CompanyID, &convID, &actor, map[string]any{
		"conversation_id": convID,
		"employee_id":     actor,
	})
	if err != nil {
		return
	}
	e.ExcludeConnID = c.id
	h.publishLocal(e)
}
