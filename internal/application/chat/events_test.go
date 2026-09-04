package chatapp_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	chatapp "PMAS/internal/application/chat"
	"PMAS/internal/realtime"
)

func TestMemoryPublisher_RecordsEvents(t *testing.T) {
	pub := &chatapp.MemoryPublisher{}
	companyID := uuid.New()
	convID := uuid.New()
	actor := uuid.New()
	ev, err := realtime.NewEvent(realtime.TypeMessageCreated, companyID, &convID, &actor, map[string]any{"x": 1})
	if err != nil {
		t.Fatal(err)
	}
	if err := pub.Publish(context.Background(), ev); err != nil {
		t.Fatal(err)
	}
	if len(pub.Events) != 1 || pub.Events[0].ID != ev.ID {
		t.Fatalf("%+v", pub.Events)
	}
}
