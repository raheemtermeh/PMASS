package planning

import (
	"context"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
)

type ProjectRepository interface {
	Create(ctx context.Context, p *Project) error
	FindByID(ctx context.Context, companyID, id uuid.UUID) (*Project, error)
	ListByProduct(ctx context.Context, companyID, productID uuid.UUID, q shared.PageQuery) ([]Project, int64, error)
	List(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]Project, int64, error)
	Update(ctx context.Context, p *Project) error
	Delete(ctx context.Context, companyID, id uuid.UUID) error
}

type FeatureRepository interface {
	Create(ctx context.Context, f *Feature) error
	FindByID(ctx context.Context, companyID, id uuid.UUID) (*Feature, error)
	ListByProject(ctx context.Context, companyID, projectID uuid.UUID, q shared.PageQuery) ([]Feature, int64, error)
	Update(ctx context.Context, f *Feature) error
	Delete(ctx context.Context, companyID, id uuid.UUID) error
}

type TaskRepository interface {
	Create(ctx context.Context, t *Task) error
	FindByID(ctx context.Context, companyID, id uuid.UUID) (*Task, error)
	ListByFeature(ctx context.Context, companyID, featureID uuid.UUID, q shared.PageQuery) ([]Task, int64, error)
	Update(ctx context.Context, t *Task) error
	Delete(ctx context.Context, companyID, id uuid.UUID) error
}
