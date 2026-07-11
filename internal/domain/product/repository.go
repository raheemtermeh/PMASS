package product

import (
	"context"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
)

type ProductRepository interface {
	Create(ctx context.Context, p *Product) error
	FindByID(ctx context.Context, companyID, id uuid.UUID) (*Product, error)
	List(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]Product, int64, error)
	Update(ctx context.Context, p *Product) error
}

type PipelineRepository interface {
	Create(ctx context.Context, pl *Pipeline) error
	FindByID(ctx context.Context, companyID, id uuid.UUID) (*Pipeline, error)
	FindByProductID(ctx context.Context, companyID, productID uuid.UUID) (*Pipeline, error)
	Update(ctx context.Context, pl *Pipeline) error
	Delete(ctx context.Context, companyID, id uuid.UUID) error
}

type StageRepository interface {
	Create(ctx context.Context, s *Stage) error
	FindByID(ctx context.Context, id uuid.UUID) (*Stage, error)
	ListByPipeline(ctx context.Context, pipelineID uuid.UUID) ([]Stage, error)
	Update(ctx context.Context, s *Stage) error
	Delete(ctx context.Context, id uuid.UUID) error
	HasInstances(ctx context.Context, stageID uuid.UUID) (bool, error)
	Reorder(ctx context.Context, pipelineID uuid.UUID, orderedIDs []uuid.UUID) error
}

type StageInstanceRepository interface {
	Create(ctx context.Context, si *StageInstance) error
	FindByID(ctx context.Context, companyID, id uuid.UUID) (*StageInstance, error)
	FindActiveByProduct(ctx context.Context, companyID, productID uuid.UUID) (*StageInstance, error)
	ListByProduct(ctx context.Context, companyID, productID uuid.UUID) ([]StageInstance, error)
	Update(ctx context.Context, si *StageInstance) error
}
