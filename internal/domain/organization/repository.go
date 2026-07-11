package organization

import (
	"context"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
)

type CompanyRepository interface {
	Create(ctx context.Context, c *Company) error
	FindByID(ctx context.Context, id uuid.UUID) (*Company, error)
	FindBySlug(ctx context.Context, slug string) (*Company, error)
	Update(ctx context.Context, c *Company) error
	// Delete must always fail at domain; repo should not expose hard delete for MVP.
}

type DepartmentRepository interface {
	Create(ctx context.Context, d *Department) error
	FindByID(ctx context.Context, companyID, id uuid.UUID) (*Department, error)
	List(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]Department, int64, error)
	Update(ctx context.Context, d *Department) error
}

type TeamRepository interface {
	Create(ctx context.Context, t *Team) error
	FindByID(ctx context.Context, companyID, id uuid.UUID) (*Team, error)
	List(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]Team, int64, error)
	ListByDepartment(ctx context.Context, companyID, departmentID uuid.UUID, q shared.PageQuery) ([]Team, int64, error)
	Update(ctx context.Context, t *Team) error
}

type EmployeeRepository interface {
	Create(ctx context.Context, e *Employee) error
	FindByID(ctx context.Context, companyID, id uuid.UUID) (*Employee, error)
	FindByEmail(ctx context.Context, companyID uuid.UUID, email string) (*Employee, error)
	List(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]Employee, int64, error)
	Update(ctx context.Context, e *Employee) error
	AssignToTeam(ctx context.Context, companyID, employeeID, teamID uuid.UUID) error
	RemoveFromTeam(ctx context.Context, companyID, employeeID, teamID uuid.UUID) error
}
