package chat

import (
	"encoding/base64"
	"strings"
	"time"

	"github.com/google/uuid"
)

// EncodeCursor returns a URL-safe base64 cursor for message pagination.
func EncodeCursor(createdAt time.Time, messageID uuid.UUID) (string, error) {
	if createdAt.IsZero() || messageID == uuid.Nil {
		return "", ErrInvalidCursor
	}
	raw := createdAt.UTC().Format(time.RFC3339Nano) + "|" + messageID.String()
	return base64.RawURLEncoding.EncodeToString([]byte(raw)), nil
}

// DecodeCursor parses a cursor produced by EncodeCursor.
func DecodeCursor(cursor string) (time.Time, uuid.UUID, error) {
	cursor = strings.TrimSpace(cursor)
	if cursor == "" {
		return time.Time{}, uuid.Nil, ErrInvalidCursor
	}
	decoded, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, uuid.Nil, ErrInvalidCursor
	}
	parts := strings.SplitN(string(decoded), "|", 2)
	if len(parts) != 2 {
		return time.Time{}, uuid.Nil, ErrInvalidCursor
	}
	ts, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		ts, err = time.Parse(time.RFC3339, parts[0])
		if err != nil {
			return time.Time{}, uuid.Nil, ErrInvalidCursor
		}
	}
	id, err := uuid.Parse(strings.TrimSpace(parts[1]))
	if err != nil || id == uuid.Nil {
		return time.Time{}, uuid.Nil, ErrInvalidCursor
	}
	return ts.UTC(), id, nil
}
