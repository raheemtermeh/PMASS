package postgres

import (
	"encoding/base64"
	"strings"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
)

func encodeSupportCursor(createdAt time.Time, id uuid.UUID) (string, error) {
	if createdAt.IsZero() || id == uuid.Nil {
		return "", shared.New("INVALID_CURSOR", "Invalid pagination cursor", 400)
	}
	raw := createdAt.UTC().Format(time.RFC3339Nano) + "|" + id.String()
	return base64.RawURLEncoding.EncodeToString([]byte(raw)), nil
}

func decodeSupportCursor(cursor string) (time.Time, uuid.UUID, error) {
	cursor = strings.TrimSpace(cursor)
	if cursor == "" {
		return time.Time{}, uuid.Nil, shared.New("INVALID_CURSOR", "Invalid pagination cursor", 400)
	}
	decoded, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, uuid.Nil, shared.New("INVALID_CURSOR", "Invalid pagination cursor", 400)
	}
	parts := strings.SplitN(string(decoded), "|", 2)
	if len(parts) != 2 {
		return time.Time{}, uuid.Nil, shared.New("INVALID_CURSOR", "Invalid pagination cursor", 400)
	}
	ts, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		ts, err = time.Parse(time.RFC3339, parts[0])
		if err != nil {
			return time.Time{}, uuid.Nil, shared.New("INVALID_CURSOR", "Invalid pagination cursor", 400)
		}
	}
	id, err := uuid.Parse(strings.TrimSpace(parts[1]))
	if err != nil || id == uuid.Nil {
		return time.Time{}, uuid.Nil, shared.New("INVALID_CURSOR", "Invalid pagination cursor", 400)
	}
	return ts.UTC(), id, nil
}
