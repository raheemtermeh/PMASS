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
	ListByOwner(ctx context.Context, companyID, ownerID uuid.UUID, q shared.PageQuery) ([]Project, int64, error)
}

type FeatureRepository interface {
	Create(ctx context.Context, f *Feature) error
	FindByID(ctx context.Context, companyID, id uuid.UUID) (*Feature, error)
	ListByProject(ctx context.Context, companyID, projectID uuid.UUID, q shared.PageQuery) ([]Feature, int64, error)
	Update(ctx context.Context, f *Feature) error
	Delete(ctx context.Context, companyID, id uuid.UUID) error
	CountByProject(ctx context.Context, companyID, projectID uuid.UUID) (int64, error)
	ListByOwner(ctx context.Context, companyID, ownerID uuid.UUID, q shared.PageQuery) ([]Feature, int64, error)
}

type TaskRepository interface {
	Create(ctx context.Context, t *Task) error
	FindByID(ctx context.Context, companyID, id uuid.UUID) (*Task, error)
	ListByFeature(ctx context.Context, companyID, featureID uuid.UUID, q shared.PageQuery) ([]Task, int64, error)
	Update(ctx context.Context, t *Task) error
	Delete(ctx context.Context, companyID, id uuid.UUID) error
	ListOverdue(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]Task, int64, error)
	ListByAssignee(ctx context.Context, companyID, assigneeID uuid.UUID, q shared.PageQuery) ([]Task, int64, error)
}

// ChecklistRepository manages task checklist items (MVP addition).
type ChecklistRepository interface {
	Create(ctx context.Context, c *ChecklistItem) error
	FindByID(ctx context.Context, companyID, id uuid.UUID) (*ChecklistItem, error)
	ListByTask(ctx context.Context, companyID, taskID uuid.UUID) ([]ChecklistItem, error)
	Update(ctx context.Context, c *ChecklistItem) error
	Delete(ctx context.Context, companyID, id uuid.UUID) error
}

// FeatureDependencyRepository manages feature-to-feature blocking relationships (MVP addition).
type FeatureDependencyRepository interface {
	SetDependencies(ctx context.Context, companyID, featureID uuid.UUID, dependsOn []uuid.UUID) error
	ListDependencies(ctx context.Context, companyID, featureID uuid.UUID) ([]uuid.UUID, error)
}

// ProjectMemberRepository manages collaborative project membership (MVP addition).
type ProjectMemberRepository interface {
	Add(ctx context.Context, m *ProjectMember) error
	Remove(ctx context.Context, companyID, projectID, employeeID uuid.UUID) error
	ListByProject(ctx context.Context, companyID, projectID uuid.UUID) ([]ProjectMember, error)
}

// FeatureMemberRepository manages collaborative feature membership (MVP addition).
type FeatureMemberRepository interface {
	Add(ctx context.Context, m *FeatureMember) error
	Remove(ctx context.Context, companyID, featureID, employeeID uuid.UUID) error
	ListByFeature(ctx context.Context, companyID, featureID uuid.UUID) ([]FeatureMember, error)
}
