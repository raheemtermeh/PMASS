package support

import (
	"context"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
)

type ActivityRepository interface {
	Append(ctx context.Context, a *ActivityLog) error
	ListByEntity(ctx context.Context, companyID uuid.UUID, entityType string, entityID uuid.UUID, q shared.PageQuery) ([]ActivityLog, int64, error)
}

type NotificationRepository interface {
	Create(ctx context.Context, n *Notification) error
	ListByReceiver(ctx context.Context, companyID, receiverID uuid.UUID, q shared.PageQuery) ([]Notification, int64, error)
	MarkRead(ctx context.Context, companyID, id uuid.UUID) error
}
