package realtime_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/realtime"
)

func TestEventEncodeDecode(t *testing.T) {
	companyID := uuid.New()
	convID := uuid.New()
	actorID := uuid.New()
	e, err := realtime.NewEvent(realtime.TypeMessageCreated, companyID, &convID, &actorID, map[string]any{
		"message": map[string]any{"id": uuid.New().String(), "content": "hi"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if e.ID == "" || e.Type != realtime.TypeMessageCreated {
		t.Fatalf("bad event: %+v", e)
	}
	raw, err := realtime.EncodeEvent(e)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := realtime.DecodeEvent(raw)
	if err != nil {
		t.Fatal(err)
	}
	if decoded.CompanyID != companyID || *decoded.ConversationID != convID {
		t.Fatalf("roundtrip mismatch: %+v", decoded)
	}
	if time.Since(decoded.Timestamp) > time.Minute {
		t.Fatal("timestamp not server-generated recently")
	}
}

func TestDecodeClientMessage_Malformed(t *testing.T) {
	_, err := realtime.DecodeClientMessage([]byte(`{not-json`))
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestDecodeClientMessage_Subscribe(t *testing.T) {
	id := uuid.New()
	raw, _ := json.Marshal(map[string]any{
		"type":             "subscribe",
		"conversation_ids": []string{id.String()},
	})
	msg, err := realtime.DecodeClientMessage(raw)
	if err != nil {
		t.Fatal(err)
	}
	if msg.Type != "subscribe" || len(msg.ConversationIDs) != 1 || msg.ConversationIDs[0] != id {
		t.Fatalf("%+v", msg)
	}
}
