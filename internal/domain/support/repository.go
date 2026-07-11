package support

import (
	"context"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
)

type ActivityRepository interface {
	Append(ctx context.Context, a *ActivityLog) error
	ListByEntity(ctx context.Context, companyID uuid.UUID, entityType string, entityID uuid.UUID, q shared.PageQuery) ([]ActivityLog, int64, error)
	ListRecent(ctx context.Context, companyID uuid.UUID, limit int) ([]ActivityLog, error)
}

type NotificationRepository interface {
	Create(ctx context.Context, n *Notification) error
	ListByReceiver(ctx context.Context, companyID, receiverID uuid.UUID, q shared.PageQuery) ([]Notification, int64, error)
	MarkRead(ctx context.Context, companyID, id uuid.UUID) error
	ListByCompany(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]Notification, int64, error)
}

type CommentRepository interface {
	Create(ctx context.Context, c *Comment) error
	ListByEntity(ctx context.Context, companyID uuid.UUID, entityType string, entityID uuid.UUID) ([]Comment, error)
	UpdateBody(ctx context.Context, companyID, id uuid.UUID, body string) error
	Archive(ctx context.Context, companyID, id uuid.UUID) error
}

type AttachmentRepository interface {
	Create(ctx context.Context, a *Attachment) error
	ListByEntity(ctx context.Context, companyID uuid.UUID, entityType string, entityID uuid.UUID) ([]Attachment, error)
	FindByID(ctx context.Context, companyID, id uuid.UUID) (*Attachment, error)
	Delete(ctx context.Context, companyID, id uuid.UUID) error
}
