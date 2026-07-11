package shared

import (
	"time"

	"github.com/google/uuid"
)

// BaseModel is the common identity + audit fields for all domain entities (PDF §3.17).
type BaseModel struct {
	ID        uuid.UUID `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Version   int       `json:"version"` // optimistic locking
}

func NewBase() BaseModel {
	now := time.Now().UTC()
	return BaseModel{
		ID:        uuid.New(),
		CreatedAt: now,
		UpdatedAt: now,
		Version:   1,
	}
}
