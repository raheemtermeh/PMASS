package organizationapp

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"PMAS/internal/domain/organization"
	"PMAS/internal/domain/shared"
	"PMAS/internal/infrastructure/postgres"
)

type Service struct {
	db   *postgres.DB
	co   organization.CompanyRepository
	dept organization.DepartmentRepository
	team organization.TeamRepository
	emp  organization.EmployeeRepository
}

func NewService(
	db *postgres.DB,
	co organization.CompanyRepository,
	dept organization.DepartmentRepository,
	team organization.TeamRepository,
	emp organization.EmployeeRepository,
) *Service {
	return &Service{db: db, co: co, dept: dept, team: team, emp: emp}
}

func (s *Service) GetCompany(ctx context.Context, companyID uuid.UUID) (*organization.Company, error) {
	return s.co.FindByID(ctx, companyID)
}

func (s *Service) UpdateCompany(ctx context.Context, companyID uuid.UUID, name string) (*organization.Company, error) {
	c, err := s.co.FindByID(ctx, companyID)
	if err != nil {
		return nil, err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, organization.ErrCompanyNameRequired
	}
	c.Name = name
	if err := s.co.Update(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

// DeleteCompany always rejected (PDF).
func (s *Service) DeleteCompany(ctx context.Context, companyID uuid.UUID) error {
	c, err := s.co.FindByID(ctx, companyID)
	if err != nil {
		return err
	}
	return c.Delete()
}

type CreateDepartmentInput struct {
	Name      string
	ManagerID uuid.UUID
}

func (s *Service) CreateDepartment(ctx context.Context, companyID uuid.UUID, in CreateDepartmentInput) (*organization.Department, error) {
	if _, err := s.emp.FindByID(ctx, companyID, in.ManagerID); err != nil {
		return nil, err
	}
	d, err := organization.NewDepartment(companyID, in.Name, in.ManagerID)
	if err != nil {
		return nil, err
	}
	if err := s.dept.Create(ctx, d); err != nil {
		return nil, err
	}
	return d, nil
}

func (s *Service) GetDepartment(ctx context.Context, companyID, id uuid.UUID) (*organization.Department, error) {
	return s.dept.FindByID(ctx, companyID, id)
}

func (s *Service) ListDepartments(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]organization.Department, shared.PageMeta, error) {
	items, total, err := s.dept.List(ctx, companyID, q)
	if err != nil {
		return nil, shared.PageMeta{}, err
	}
	return items, shared.NewPageMeta(q, total), nil
}

func (s *Service) ChangeDepartmentManager(ctx context.Context, companyID, deptID, managerID uuid.UUID) (*organization.Department, error) {
	if _, err := s.emp.FindByID(ctx, companyID, managerID); err != nil {
		return nil, err
	}
	d, err := s.dept.FindByID(ctx, companyID, deptID)
	if err != nil {
		return nil, err
	}
	if err := d.ChangeManager(managerID); err != nil {
		return nil, err
	}
	// ChangeManager already bumped version; repo Update expects current version before bump.
	if err := s.dept.Update(ctx, d); err != nil {
		return nil, err
	}
	return d, nil
}

func (s *Service) ArchiveDepartment(ctx context.Context, companyID, id uuid.UUID) (*organization.Department, error) {
	d, err := s.dept.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	d.Archive()
	if err := s.dept.Update(ctx, d); err != nil {
		return nil, err
	}
	return d, nil
}

type CreateTeamInput struct {
	DepartmentID uuid.UUID
	LeadID       uuid.UUID
	Name         string
	Description  string
}

func (s *Service) CreateTeam(ctx context.Context, companyID uuid.UUID, in CreateTeamInput) (*organization.Team, error) {
	if _, err := s.dept.FindByID(ctx, companyID, in.DepartmentID); err != nil {
		return nil, err
	}
	if _, err := s.emp.FindByID(ctx, companyID, in.LeadID); err != nil {
		return nil, err
	}
	t, err := organization.NewTeam(companyID, in.DepartmentID, in.LeadID, in.Name, in.Description)
	if err != nil {
		return nil, err
	}
	if err := s.team.Create(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

func (s *Service) GetTeam(ctx context.Context, companyID, id uuid.UUID) (*organization.Team, error) {
	return s.team.FindByID(ctx, companyID, id)
}

func (s *Service) ListTeams(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]organization.Team, shared.PageMeta, error) {
	items, total, err := s.team.List(ctx, companyID, q)
	if err != nil {
		return nil, shared.PageMeta{}, err
	}
	return items, shared.NewPageMeta(q, total), nil
}

func (s *Service) AssignTeamLead(ctx context.Context, companyID, teamID, leadID uuid.UUID) (*organization.Team, error) {
	if _, err := s.emp.FindByID(ctx, companyID, leadID); err != nil {
		return nil, err
	}
	t, err := s.team.FindByID(ctx, companyID, teamID)
	if err != nil {
		return nil, err
	}
	if err := t.AssignLead(leadID); err != nil {
		return nil, err
	}
	if err := s.team.Update(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

func (s *Service) ArchiveTeam(ctx context.Context, companyID, id uuid.UUID) (*organization.Team, error) {
	t, err := s.team.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	t.Archive()
	if err := s.team.Update(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

type CreateEmployeeInput struct {
	FirstName string
	LastName  string
	Email     string
	Phone     string
	UserID    *int
}

func (s *Service) CreateEmployee(ctx context.Context, companyID uuid.UUID, in CreateEmployeeInput) (*organization.Employee, error) {
	e, err := organization.NewEmployee(companyID, in.FirstName, in.LastName, in.Email, in.Phone)
	if err != nil {
		return nil, err
	}
	e.UserID = in.UserID
	if err := s.emp.Create(ctx, e); err != nil {
		return nil, err
	}
	return e, nil
}

func (s *Service) GetEmployee(ctx context.Context, companyID, id uuid.UUID) (*organization.Employee, error) {
	return s.emp.FindByID(ctx, companyID, id)
}

func (s *Service) ListEmployees(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]organization.Employee, shared.PageMeta, error) {
	items, total, err := s.emp.List(ctx, companyID, q)
	if err != nil {
		return nil, shared.PageMeta{}, err
	}
	return items, shared.NewPageMeta(q, total), nil
}

func (s *Service) ArchiveEmployee(ctx context.Context, companyID, id uuid.UUID) (*organization.Employee, error) {
	e, err := s.emp.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	e.Archive()
	if err := s.emp.Update(ctx, e); err != nil {
		return nil, err
	}
	return e, nil
}

func (s *Service) AssignEmployeeToTeam(ctx context.Context, companyID, employeeID, teamID uuid.UUID) error {
	if _, err := s.emp.FindByID(ctx, companyID, employeeID); err != nil {
		return err
	}
	if _, err := s.team.FindByID(ctx, companyID, teamID); err != nil {
		return err
	}
	return s.emp.AssignToTeam(ctx, companyID, employeeID, teamID)
}

func (s *Service) RemoveEmployeeFromTeam(ctx context.Context, companyID, employeeID, teamID uuid.UUID) error {
	return s.emp.RemoveFromTeam(ctx, companyID, employeeID, teamID)
}
