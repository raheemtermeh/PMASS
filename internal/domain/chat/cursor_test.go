package chat_test

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/chat"
)

func TestEncodeDecodeCursor_RoundTrip(t *testing.T) {
	ts := time.Date(2026, 9, 1, 12, 30, 45, 123456789, time.UTC)
	id := uuid.MustParse("550e8400-e29b-41d4-a716-446655440000")

	encoded, err := chat.EncodeCursor(ts, id)
	if err != nil {
		t.Fatal(err)
	}
	gotTS, gotID, err := chat.DecodeCursor(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if !gotTS.Equal(ts) {
		t.Fatalf("timestamp mismatch: got %v want %v", gotTS, ts)
	}
	if gotID != id {
		t.Fatalf("id mismatch: got %s want %s", gotID, id)
	}
}

func TestDecodeCursor_UUIDCorrectness(t *testing.T) {
	raw := time.Now().UTC().Format(time.RFC3339Nano) + "|" + uuid.New().String()
	cursor := base64.RawURLEncoding.EncodeToString([]byte(raw))
	_, gotID, err := chat.DecodeCursor(cursor)
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(raw, "|")
	wantID := uuid.MustParse(parts[1])
	if gotID != wantID {
		t.Fatalf("id=%s want=%s", gotID, wantID)
	}
}

func TestDecodeCursor_TimestampPrecision(t *testing.T) {
	ts := time.Date(2026, 1, 2, 3, 4, 5, 987654321, time.UTC)
	id := uuid.New()
	encoded, err := chat.EncodeCursor(ts, id)
	if err != nil {
		t.Fatal(err)
	}
	gotTS, _, err := chat.DecodeCursor(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if gotTS.Nanosecond() != ts.Nanosecond() {
		t.Fatalf("ns=%d want=%d", gotTS.Nanosecond(), ts.Nanosecond())
	}
}

func TestDecodeCursor_MalformedBase64(t *testing.T) {
	_, _, err := chat.DecodeCursor("%%%not-base64%%%")
	if err != chat.ErrInvalidCursor {
		t.Fatalf("got %v", err)
	}
}

func TestDecodeCursor_MissingSeparator(t *testing.T) {
	cursor := base64.RawURLEncoding.EncodeToString([]byte("no-separator-here"))
	_, _, err := chat.DecodeCursor(cursor)
	if err != chat.ErrInvalidCursor {
		t.Fatalf("got %v", err)
	}
}

func TestDecodeCursor_InvalidTimestamp(t *testing.T) {
	cursor := base64.RawURLEncoding.EncodeToString([]byte("not-a-time|" + uuid.New().String()))
	_, _, err := chat.DecodeCursor(cursor)
	if err != chat.ErrInvalidCursor {
		t.Fatalf("got %v", err)
	}
}

func TestDecodeCursor_InvalidUUID(t *testing.T) {
	cursor := base64.RawURLEncoding.EncodeToString([]byte(time.Now().UTC().Format(time.RFC3339Nano) + "|not-a-uuid"))
	_, _, err := chat.DecodeCursor(cursor)
	if err != chat.ErrInvalidCursor {
		t.Fatalf("got %v", err)
	}
}

func TestDecodeCursor_EmptyCursor(t *testing.T) {
	_, _, err := chat.DecodeCursor("")
	if err != chat.ErrInvalidCursor {
		t.Fatalf("got %v", err)
	}
}

func TestEncodeCursor_RejectsZeroValues(t *testing.T) {
	_, err := chat.EncodeCursor(time.Time{}, uuid.New())
	if err != chat.ErrInvalidCursor {
		t.Fatalf("got %v", err)
	}
	_, err = chat.EncodeCursor(time.Now(), uuid.Nil)
	if err != chat.ErrInvalidCursor {
		t.Fatalf("got %v", err)
	}
}
