package realtime

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"PMAS/internal/logging"
)

// ConnIdentity is the authenticated identity bound to a connection.
type ConnIdentity struct {
	CompanyID  uuid.UUID
	EmployeeID uuid.UUID
	UserID     int
	Role       string
	Perms      []string
}

// Conn is a single WebSocket connection with dedicated read/write pumps.
type Conn struct {
	id       string
	hub      *Hub
	ws       *websocket.Conn
	identity ConnIdentity

	send      chan []byte
	subsMu    sync.RWMutex
	subs      map[uuid.UUID]struct{}
	closeOnce sync.Once
	closed    chan struct{}
}

func newConn(hub *Hub, ws *websocket.Conn, identity ConnIdentity) *Conn {
	return &Conn{
		id:       uuid.New().String(),
		hub:      hub,
		ws:       ws,
		identity: identity,
		send:     make(chan []byte, hub.cfg.WriteQueueSize),
		subs:     make(map[uuid.UUID]struct{}),
		closed:   make(chan struct{}),
	}
}

func (c *Conn) ID() string { return c.id }

func (c *Conn) Identity() ConnIdentity { return c.identity }

func (c *Conn) subscribed(conversationID uuid.UUID) bool {
	c.subsMu.RLock()
	defer c.subsMu.RUnlock()
	_, ok := c.subs[conversationID]
	return ok
}

func (c *Conn) subscriptionCount() int {
	c.subsMu.RLock()
	defer c.subsMu.RUnlock()
	return len(c.subs)
}

func (c *Conn) addSubscriptions(ids []uuid.UUID) []uuid.UUID {
	c.subsMu.Lock()
	defer c.subsMu.Unlock()
	added := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if _, ok := c.subs[id]; ok {
			added = append(added, id)
			continue
		}
		if len(c.subs) >= c.hub.cfg.MaxSubscriptions {
			break
		}
		c.subs[id] = struct{}{}
		added = append(added, id)
	}
	return added
}

func (c *Conn) removeSubscriptions(ids []uuid.UUID) []uuid.UUID {
	c.subsMu.Lock()
	defer c.subsMu.Unlock()
	removed := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if _, ok := c.subs[id]; ok {
			delete(c.subs, id)
			removed = append(removed, id)
		}
	}
	return removed
}

func (c *Conn) snapshotSubs() []uuid.UUID {
	c.subsMu.RLock()
	defer c.subsMu.RUnlock()
	out := make([]uuid.UUID, 0, len(c.subs))
	for id := range c.subs {
		out = append(out, id)
	}
	return out
}

// Enqueue sends a frame to the write pump. Returns ErrWriteQueueFull if backpressure trips.
func (c *Conn) Enqueue(payload []byte) error {
	select {
	case <-c.closed:
		return ErrHubClosed
	default:
	}
	select {
	case c.send <- payload:
		return nil
	default:
		c.hub.metrics.WriteQueueFull.Add(1)
		logging.Warn("chat_ws_write_queue_full", "conn_id", c.id)
		c.close()
		return ErrWriteQueueFull
	}
}

func (c *Conn) close() {
	c.closeOnce.Do(func() {
		close(c.closed)
		_ = c.ws.Close()
		c.hub.unregister(c)
		c.hub.metrics.Disconnects.Add(1)
	})
}

func (c *Conn) writePump() {
	cfg := c.hub.cfg
	ticker := time.NewTicker(cfg.PingInterval)
	defer func() {
		ticker.Stop()
		c.close()
	}()

	for {
		select {
		case <-c.closed:
			return
		case msg, ok := <-c.send:
			_ = c.ws.SetWriteDeadline(time.Now().Add(cfg.WriteWait))
			if !ok {
				_ = c.ws.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.ws.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
			c.hub.metrics.MessagesSent.Add(1)
		case <-ticker.C:
			_ = c.ws.SetWriteDeadline(time.Now().Add(cfg.WriteWait))
			if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Conn) readPump(ctx context.Context) {
	defer c.close()
	cfg := c.hub.cfg
	c.ws.SetReadLimit(cfg.MaxMessageSize)
	_ = c.ws.SetReadDeadline(time.Now().Add(cfg.PingInterval + cfg.PongTimeout))
	c.ws.SetPongHandler(func(string) error {
		return c.ws.SetReadDeadline(time.Now().Add(cfg.PingInterval + cfg.PongTimeout))
	})

	for {
		_, data, err := c.ws.ReadMessage()
		if err != nil {
			return
		}
		c.hub.metrics.MessagesReceived.Add(1)
		_ = c.ws.SetReadDeadline(time.Now().Add(cfg.PingInterval + cfg.PongTimeout))
		c.hub.handleClientMessage(ctx, c, data)
	}
}
