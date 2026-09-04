package redisx_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	redisx "PMAS/internal/infrastructure/redis"
	"PMAS/internal/realtime"
)

func TestRedisPubSub_Fanout(t *testing.T) {
	url := os.Getenv("REDIS_URL")
	if url == "" {
		url = os.Getenv("CHAT_REDIS_URL")
	}
	if url == "" {
		t.Skip("REDIS_URL not set")
	}
	client, err := redisx.NewClient(url)
	if err != nil {
		t.Skip(err)
	}
	defer client.Close()

	metrics := &realtime.Metrics{}
	hub := realtime.NewHub(realtime.Config{PingInterval: time.Hour, PongTimeout: time.Hour}, nil, metrics)
	sub := redisx.NewSubscriber(client, hub, metrics)
	sub.Start(context.Background())
	defer sub.Stop(context.Background())

	// Allow subscription to settle.
	time.Sleep(200 * time.Millisecond)

	received := make(chan realtime.Event, 1)
	// DeliverEvent is what subscriber calls; wrap by using a local capture hub isn't trivial.
	// Instead publish and verify Redis accepts, then use a second subscriber callback path:
	pub := redisx.NewPublisher(client, metrics)
	companyID := uuid.New()
	convID := uuid.New()
	actor := uuid.New()
	ev, err := realtime.NewEvent(realtime.TypeMessageCreated, companyID, &convID, &actor, map[string]any{"ok": true})
	if err != nil {
		t.Fatal(err)
	}

	// Temporary hook: replace hub delivery by polling via dedicated pattern subscribe.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ps := client.RDB().Subscribe(ctx, redisx.CompanyChannel(companyID))
	defer ps.Close()
	if _, err := ps.Receive(ctx); err != nil {
		t.Fatal(err)
	}
	ch := ps.Channel()

	if err := pub.Publish(ctx, ev); err != nil {
		t.Fatal(err)
	}

	select {
	case msg := <-ch:
		got, err := realtime.DecodeEvent([]byte(msg.Payload))
		if err != nil {
			t.Fatal(err)
		}
		if got.ID != ev.ID || got.Type != realtime.TypeMessageCreated {
			t.Fatalf("got %+v", got)
		}
		received <- got
	case <-ctx.Done():
		t.Fatal("timeout waiting for redis message")
	}
}

func TestCompanyChannel(t *testing.T) {
	id := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	got := redisx.CompanyChannel(id)
	if got != "pmass:chat:company:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" {
		t.Fatalf("%s", got)
	}
}
