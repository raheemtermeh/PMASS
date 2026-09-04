package realtime_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"PMAS/internal/domain/chat"
	"PMAS/internal/realtime"
)

type memPresence struct {
	online   map[uuid.UUID]string
	lastSeen map[uuid.UUID]time.Time
}

func (m *memPresence) PersistOnline(_ context.Context, _, employeeID uuid.UUID) error {
	if m.online == nil {
		m.online = map[uuid.UUID]string{}
	}
	m.online[employeeID] = chat.PresenceOnline
	return nil
}
func (m *memPresence) PersistOffline(_ context.Context, _, employeeID uuid.UUID, lastSeen time.Time) error {
	if m.online == nil {
		m.online = map[uuid.UUID]string{}
	}
	if m.lastSeen == nil {
		m.lastSeen = map[uuid.UUID]time.Time{}
	}
	m.online[employeeID] = chat.PresenceOffline
	m.lastSeen[employeeID] = lastSeen
	return nil
}
func (m *memPresence) PersistAway(_ context.Context, _, employeeID uuid.UUID) error {
	if m.online == nil {
		m.online = map[uuid.UUID]string{}
	}
	m.online[employeeID] = chat.PresenceAway
	return nil
}

func TestHub_PresenceMultiDevice(t *testing.T) {
	companyID := uuid.New()
	emp := uuid.New()
	store := &memPresence{}
	hub := realtime.NewHub(realtime.Config{
		PingInterval: time.Hour, PongTimeout: time.Hour,
		MaxConnectionsGlobal: 100, MaxConnectionsPerEmployee: 5,
	}, allowAllChecker{}, &realtime.Metrics{})
	hub.SetPresenceBackend(store)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(w, r, realtime.ConnIdentity{CompanyID: companyID, EmployeeID: emp})
	}))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")

	c1, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, _, _ = c1.ReadMessage() // connected
	time.Sleep(20 * time.Millisecond)
	if hub.LiveStatus(emp) != chat.PresenceOnline {
		t.Fatalf("expected online after first conn, got %q", hub.LiveStatus(emp))
	}
	if store.online[emp] != chat.PresenceOnline {
		t.Fatal("expected persist online")
	}

	c2, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, _, _ = c2.ReadMessage()
	_ = c1.Close()
	time.Sleep(50 * time.Millisecond)
	if hub.LiveStatus(emp) != chat.PresenceOnline {
		t.Fatal("still online with second connection")
	}
	if store.online[emp] == chat.PresenceOffline {
		t.Fatal("must not persist offline while another connection lives")
	}

	_ = c2.Close()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if hub.ConnectionCountFor(emp) == 0 && hub.LiveStatus(emp) == "" {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if hub.LiveStatus(emp) != "" || hub.ConnectionCountFor(emp) != 0 {
		t.Fatalf("expected offline after final disconnect, live=%q conns=%d", hub.LiveStatus(emp), hub.ConnectionCountFor(emp))
	}
	if store.online[emp] != chat.PresenceOffline {
		t.Fatalf("expected offline persist, got %q", store.online[emp])
	}
	if store.lastSeen[emp].IsZero() {
		t.Fatal("expected last_seen")
	}
}

func TestHub_TypingTTLAndNoSelfEcho(t *testing.T) {
	companyID := uuid.New()
	empA := uuid.New()
	empB := uuid.New()
	convID := uuid.New()
	hub := realtime.NewHub(realtime.Config{
		PingInterval: time.Hour, PongTimeout: time.Hour,
		TypingTTL:            200 * time.Millisecond,
		MaxConnectionsGlobal: 100, MaxConnectionsPerEmployee: 5, MaxSubscriptions: 10,
	}, allowAllChecker{}, &realtime.Metrics{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	hub.StartBackground(ctx)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		emp := empA
		if r.URL.Query().Get("who") == "b" {
			emp = empB
		}
		hub.ServeWS(w, r, realtime.ConnIdentity{CompanyID: companyID, EmployeeID: emp})
	}))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")

	a, _, err := websocket.DefaultDialer.Dial(wsURL+"?who=a", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	b, _, err := websocket.DefaultDialer.Dial(wsURL+"?who=b", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	_, _, _ = a.ReadMessage()
	_, _, _ = b.ReadMessage()

	for _, c := range []*websocket.Conn{a, b} {
		if err := c.WriteJSON(map[string]any{
			"type": "subscribe", "conversation_ids": []string{convID.String()},
		}); err != nil {
			t.Fatal(err)
		}
		_, _, _ = c.ReadMessage() // subscribed
	}

	if err := a.WriteJSON(map[string]any{
		"type": "typing.start", "conversation_id": convID.String(),
	}); err != nil {
		t.Fatal(err)
	}

	_ = b.SetReadDeadline(time.Now().Add(2 * time.Second))
	gotTyping := false
	for i := 0; i < 5; i++ {
		_, data, err := b.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(data), realtime.TypeTypingStarted) {
			gotTyping = true
			break
		}
	}
	if !gotTyping {
		t.Fatal("b missing typing.started")
	}

	_ = a.SetReadDeadline(time.Now().Add(150 * time.Millisecond))
	if _, data, err := a.ReadMessage(); err == nil {
		if strings.Contains(string(data), realtime.TypeTypingStarted) {
			t.Fatal("originating connection must not receive own typing.started")
		}
	}

	// Wait for TTL expiry → typing.stopped
	_ = b.SetReadDeadline(time.Now().Add(2 * time.Second))
	gotStop := false
	for i := 0; i < 5; i++ {
		_, data, err := b.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(data), realtime.TypeTypingStopped) {
			gotStop = true
			break
		}
	}
	if !gotStop {
		t.Fatal("expected typing.stopped after TTL")
	}
}
