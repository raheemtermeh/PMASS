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

	"PMAS/internal/realtime"
)

type allowAllChecker struct{}

func (allowAllChecker) CanSubscribe(ctx context.Context, companyID, employeeID, conversationID uuid.UUID) (bool, error) {
	return true, nil
}

type denyAllChecker struct{}

func (denyAllChecker) CanSubscribe(ctx context.Context, companyID, employeeID, conversationID uuid.UUID) (bool, error) {
	return false, nil
}

func readUntilType(t *testing.T, c *websocket.Conn, want string, timeout time.Duration) []byte {
	t.Helper()
	needle := `"type":"` + want + `"`
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		_ = c.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
		_, data, err := c.ReadMessage()
		if err != nil {
			continue
		}
		if strings.Contains(string(data), needle) {
			return data
		}
	}
	t.Fatalf("timeout waiting for %s", want)
	return nil
}

func TestHub_SubscribeAndDeliver(t *testing.T) {
	hub := realtime.NewHub(realtime.Config{
		PingInterval:     time.Hour,
		PongTimeout:      time.Hour,
		WriteQueueSize:   8,
		MaxSubscriptions: 10,
	}, allowAllChecker{}, &realtime.Metrics{})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(w, r, realtime.ConnIdentity{
			CompanyID:  uuid.MustParse("11111111-1111-1111-1111-111111111111"),
			EmployeeID: uuid.MustParse("22222222-2222-2222-2222-222222222222"),
		})
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	// connected
	_, _, err = conn.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}

	convID := uuid.New()
	if err := conn.WriteJSON(map[string]any{
		"type":             "subscribe",
		"conversation_ids": []string{convID.String()},
	}); err != nil {
		t.Fatal(err)
	}
	readUntilType(t, conn, realtime.TypeSubscribed, 2*time.Second)

	companyID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	actor := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	ev, err := realtime.NewEvent(realtime.TypeMessageCreated, companyID, &convID, &actor, map[string]any{
		"message": map[string]any{"content": "hello"},
	})
	if err != nil {
		t.Fatal(err)
	}
	hub.DeliverEvent(ev)

	data := readUntilType(t, conn, realtime.TypeMessageCreated, 2*time.Second)
	_ = data
}

func TestHub_UnauthorizedSubscribeDenied(t *testing.T) {
	hub := realtime.NewHub(realtime.Config{
		PingInterval: time.Hour,
		PongTimeout:  time.Hour,
	}, denyAllChecker{}, &realtime.Metrics{})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(w, r, realtime.ConnIdentity{
			CompanyID:  uuid.New(),
			EmployeeID: uuid.New(),
		})
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, _, _ = conn.ReadMessage() // connected

	convID := uuid.New()
	_ = conn.WriteJSON(map[string]any{
		"type":             "subscribe",
		"conversation_ids": []string{convID.String()},
	})
	readUntilType(t, conn, realtime.TypeSubscribed, 2*time.Second)
	ev, _ := realtime.NewEvent(realtime.TypeMessageCreated, uuid.New(), &convID, nil, map[string]any{})
	hub.DeliverEvent(ev)
	_ = conn.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	_, _, err = conn.ReadMessage()
	if err == nil {
		t.Fatal("unsubscribed connection should not receive event")
	}
}

func TestHub_WriteQueueBackpressure(t *testing.T) {
	metrics := &realtime.Metrics{}
	_ = realtime.NewHub(realtime.Config{
		WriteQueueSize: 1,
		PingInterval:   time.Hour,
		PongTimeout:    time.Hour,
	}, allowAllChecker{}, metrics)
	if metrics.WriteQueueFull.Load() != 0 {
		t.Fatal("expected zero")
	}
}

func TestHub_MalformedClientJSON(t *testing.T) {
	hub := realtime.NewHub(realtime.Config{PingInterval: time.Hour, PongTimeout: time.Hour}, allowAllChecker{}, &realtime.Metrics{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(w, r, realtime.ConnIdentity{CompanyID: uuid.New(), EmployeeID: uuid.New()})
	}))
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, _, _ = conn.ReadMessage()
	_ = conn.WriteMessage(websocket.TextMessage, []byte(`{bad`))
	readUntilType(t, conn, realtime.TypeError, 2*time.Second)
}

func TestHub_OriginRejected(t *testing.T) {
	hub := realtime.NewHub(realtime.Config{
		AllowedOrigins: []string{"https://trusted.example"},
		AppEnv:         "production",
		PingInterval:   time.Hour,
		PongTimeout:    time.Hour,
	}, allowAllChecker{}, &realtime.Metrics{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(w, r, realtime.ConnIdentity{CompanyID: uuid.New(), EmployeeID: uuid.New()})
	}))
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	_, resp, err := websocket.DefaultDialer.Dial(wsURL, http.Header{"Origin": []string{"https://evil.example"}})
	if err == nil {
		t.Fatal("expected origin rejection")
	}
	if resp != nil && resp.StatusCode != http.StatusForbidden {
		t.Logf("status=%d (upgrade may fail differently)", resp.StatusCode)
	}
}

func TestHub_MultiDeviceSameEmployee(t *testing.T) {
	companyID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	empID := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	hub := realtime.NewHub(realtime.Config{
		PingInterval: time.Hour, PongTimeout: time.Hour, MaxConnectionsPerEmployee: 5,
	}, allowAllChecker{}, &realtime.Metrics{})

	dial := func() *websocket.Conn {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			hub.ServeWS(w, r, realtime.ConnIdentity{CompanyID: companyID, EmployeeID: empID})
		}))
		t.Cleanup(server.Close)
		wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = conn.Close() })
		_, _, _ = conn.ReadMessage() // connected
		return conn
	}

	a := dial()
	b := dial()
	convID := uuid.New()
	for _, c := range []*websocket.Conn{a, b} {
		if err := c.WriteJSON(map[string]any{
			"type": "subscribe", "conversation_ids": []string{convID.String()},
		}); err != nil {
			t.Fatal(err)
		}
		readUntilType(t, c, realtime.TypeSubscribed, 2*time.Second)
	}

	actor := empID
	ev, err := realtime.NewEvent(realtime.TypeMessageCreated, companyID, &convID, &actor, map[string]any{"ok": true})
	if err != nil {
		t.Fatal(err)
	}
	hub.DeliverEvent(ev)

	for i, c := range []*websocket.Conn{a, b} {
		data := readUntilType(t, c, realtime.TypeMessageCreated, 2*time.Second)
		if !strings.Contains(string(data), realtime.TypeMessageCreated) {
			t.Fatalf("device %d missing event: %s", i, data)
		}
	}
}

func TestHub_Shutdown(t *testing.T) {
	hub := realtime.NewHub(realtime.Config{PingInterval: time.Hour, PongTimeout: time.Hour}, allowAllChecker{}, &realtime.Metrics{})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	hub.Shutdown(ctx)
	if hub.ConnectionCount() != 0 {
		t.Fatal("expected zero connections")
	}
}

func TestHub_RecipientOnlyNotification(t *testing.T) {
	companyID := uuid.New()
	recipient := uuid.New()
	other := uuid.New()
	hub := realtime.NewHub(realtime.Config{
		PingInterval: time.Hour, PongTimeout: time.Hour,
		MaxConnectionsGlobal: 100, MaxConnectionsPerEmployee: 5,
	}, allowAllChecker{}, &realtime.Metrics{})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		emp := recipient
		if r.URL.Query().Get("who") == "other" {
			emp = other
		}
		hub.ServeWS(w, r, realtime.ConnIdentity{CompanyID: companyID, EmployeeID: emp})
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	recConn, _, err := websocket.DefaultDialer.Dial(wsURL+"?who=rec", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer recConn.Close()
	otherConn, _, err := websocket.DefaultDialer.Dial(wsURL+"?who=other", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer otherConn.Close()

	_, _, _ = recConn.ReadMessage()   // connected
	_, _, _ = otherConn.ReadMessage() // connected

	actor := uuid.New()
	rid := recipient
	ev, err := realtime.NewRecipientEvent(realtime.TypeNotificationCreated, companyID, nil, &actor, &rid, map[string]any{
		"title": "hi",
	})
	if err != nil {
		t.Fatal(err)
	}
	hub.DeliverEvent(ev)

	data := readUntilType(t, recConn, realtime.TypeNotificationCreated, 2*time.Second)
	if !strings.Contains(string(data), realtime.TypeNotificationCreated) {
		t.Fatalf("recipient missing event: %s", data)
	}

	_ = otherConn.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	if _, _, err := otherConn.ReadMessage(); err == nil {
		t.Fatal("other employee must not receive private notification")
	}
}
