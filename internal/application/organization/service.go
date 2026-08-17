package organizationapp

import (
	"context"
	"fmt"
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

func (s *Service) UpdateCompany(ctx context.Context, companyID uuid.UUID, name, logoURL, language, timezone string) (*organization.Company, error) {
	c, err := s.co.FindByID(ctx, companyID)
	if err != nil {
		return nil, err
	}
	if err := c.UpdateProfile(name, logoURL, language, timezone); err != nil {
		return nil, err
	}
	if err := s.co.Update(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

// UpdateCompanyStatus sets company lifecycle status (ACTIVE / ON_HOLD / ARCHIVED) without removing data.
func (s *Service) UpdateCompanyStatus(ctx context.Context, companyID uuid.UUID, status string) (*organization.Company, error) {
	status = strings.TrimSpace(strings.ToUpper(status))
	switch status {
	case organization.StatusActive, organization.StatusOnHold, organization.StatusArchived:
	default:
		return nil, shared.New("INVALID_COMPANY_STATUS", "status must be ACTIVE, ON_HOLD, or ARCHIVED", 400)
	}
	c, err := s.co.FindByID(ctx, companyID)
	if err != nil {
		return nil, err
	}
	c.Status = status
	c.UpdatedAt = shared.NewBase().UpdatedAt
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
	Name        string
	Description string
	ManagerID   uuid.UUID
}

func (s *Service) CreateDepartment(ctx context.Context, companyID uuid.UUID, in CreateDepartmentInput) (*organization.Department, error) {
	if _, err := s.emp.FindByID(ctx, companyID, in.ManagerID); err != nil {
		return nil, err
	}
	d, err := organization.NewDepartment(companyID, in.Name, in.ManagerID)
	if err != nil {
		return nil, err
	}
	d.SetDescription(in.Description)
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

func (s *Service) UpdateDepartment(ctx context.Context, companyID, deptID uuid.UUID, name, description string, managerID uuid.UUID) (*organization.Department, error) {
	if _, err := s.emp.FindByID(ctx, companyID, managerID); err != nil {
		return nil, err
	}
	d, err := s.dept.FindByID(ctx, companyID, deptID)
	if err != nil {
		return nil, err
	}
	if err := d.Rename(name); err != nil {
		return nil, err
	}
	d.SetDescription(description)
	if err := d.ChangeManager(managerID); err != nil {
		return nil, err
	}
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
	DepartmentID *uuid.UUID
	LeadID       uuid.UUID
	Name         string
	Description  string
	Capacity     int
	Status       string
}

func (s *Service) CreateTeam(ctx context.Context, companyID uuid.UUID, in CreateTeamInput) (*organization.Team, error) {
	if in.DepartmentID != nil {
		if *in.DepartmentID == uuid.Nil {
			return nil, organization.ErrDepartmentRequired
		}
		if _, err := s.dept.FindByID(ctx, companyID, *in.DepartmentID); err != nil {
			return nil, err
		}
	}
	if _, err := s.emp.FindByID(ctx, companyID, in.LeadID); err != nil {
		return nil, err
	}
	t, err := organization.NewTeam(companyID, in.DepartmentID, in.LeadID, in.Name, in.Description, in.Capacity)
	if err != nil {
		return nil, err
	}
	// A team is never born archived — that would strand the lead membership below.
	if status := strings.TrimSpace(strings.ToUpper(in.Status)); status == organization.StatusInactive {
		if err := t.SetStatus(status); err != nil {
			return nil, err
		}
	}
	if err := s.team.Create(ctx, t); err != nil {
		return nil, err
	}
	// Ensure lead is a member of the team (move off any previous team).
	if prev, err := s.emp.FindTeamIDForEmployee(ctx, companyID, in.LeadID); err == nil && prev != uuid.Nil && prev != t.ID {
		_ = s.emp.RemoveFromTeam(ctx, companyID, in.LeadID, prev)
	}
	if err := s.emp.AssignToTeam(ctx, companyID, in.LeadID, t.ID, nil, organization.TeamRoleLead); err != nil {
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

func (s *Service) UpdateTeam(ctx context.Context, companyID, teamID uuid.UUID, name, description string, capacity int, leadID uuid.UUID, status string) (*organization.Team, error) {
	if _, err := s.emp.FindByID(ctx, companyID, leadID); err != nil {
		return nil, err
	}
	t, err := s.team.FindByID(ctx, companyID, teamID)
	if err != nil {
		return nil, err
	}
	if err := t.UpdateDetails(name, description, capacity); err != nil {
		return nil, err
	}
	if err := t.AssignLead(leadID); err != nil {
		return nil, err
	}
	if status != "" {
		if err := t.SetStatus(status); err != nil {
			return nil, err
		}
	}
	if err := s.team.Update(ctx, t); err != nil {
		return nil, err
	}
	if prev, err := s.emp.FindTeamIDForEmployee(ctx, companyID, leadID); err == nil && prev != uuid.Nil && prev != teamID {
		_ = s.emp.RemoveFromTeam(ctx, companyID, leadID, prev)
	}
	if err := s.emp.AssignToTeam(ctx, companyID, leadID, teamID, nil, organization.TeamRoleLead); err != nil {
		return nil, err
	}
	return t, nil
}

// AssignTeamDepartment attaches a team to a department in the same company, or
// makes it independent when departmentID is nil.
func (s *Service) AssignTeamDepartment(ctx context.Context, companyID, teamID uuid.UUID, departmentID *uuid.UUID) (*organization.Team, error) {
	if departmentID != nil {
		if *departmentID == uuid.Nil {
			return nil, organization.ErrDepartmentRequired
		}
		if _, err := s.dept.FindByID(ctx, companyID, *departmentID); err != nil {
			return nil, err
		}
	}
	t, err := s.team.FindByID(ctx, companyID, teamID)
	if err != nil {
		return nil, err
	}
	t.DepartmentID = departmentID
	t.UpdatedAt = shared.NewBase().UpdatedAt
	if err := s.team.Update(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

// ListAllTeamMemberships backs the company-wide membership map used by the
// organization UI.
func (s *Service) ListAllTeamMemberships(ctx context.Context, companyID uuid.UUID) ([]organization.TeamMembership, error) {
	return s.emp.ListAllMemberships(ctx, companyID)
}

func (s *Service) ListTeamMembers(ctx context.Context, companyID, teamID uuid.UUID) ([]organization.TeamMemberView, error) {
	if _, err := s.team.FindByID(ctx, companyID, teamID); err != nil {
		return nil, err
	}
	return s.emp.ListByTeam(ctx, companyID, teamID)
}

// TeamDependencies is what still points at a team and therefore blocks archiving.
type TeamDependencies struct {
	Members   int64 `json:"members"`
	Features  int64 `json:"features"`
	OpenTasks int64 `json:"open_tasks"`
}

func (d TeamDependencies) any() bool {
	return d.Members > 0 || d.Features > 0 || d.OpenTasks > 0
}

// describe lists the blockers so the caller can tell the user exactly what to
// reassign, instead of a bare "team is in use".
func (d TeamDependencies) describe() string {
	parts := make([]string, 0, 3)
	if d.Members > 0 {
		parts = append(parts, fmt.Sprintf("%d member(s)", d.Members))
	}
	if d.Features > 0 {
		parts = append(parts, fmt.Sprintf("%d open feature(s)", d.Features))
	}
	if d.OpenTasks > 0 {
		parts = append(parts, fmt.Sprintf("%d open task assignment(s)", d.OpenTasks))
	}
	return strings.Join(parts, ", ")
}

// TeamDependencyCounts reports what is attached to a team so the UI can warn
// before the user attempts to archive it.
func (s *Service) TeamDependencyCounts(ctx context.Context, companyID, teamID uuid.UUID) (TeamDependencies, error) {
	var out TeamDependencies
	if _, err := s.team.FindByID(ctx, companyID, teamID); err != nil {
		return out, err
	}
	var err error
	if out.Members, err = s.emp.CountTeamMembers(ctx, companyID, teamID); err != nil {
		return out, err
	}
	if out.Features, err = s.team.CountLinkedFeatures(ctx, companyID, teamID); err != nil {
		return out, err
	}
	if out.OpenTasks, err = s.emp.CountOpenAssignmentsForTeam(ctx, companyID, teamID); err != nil {
		return out, err
	}
	return out, nil
}

func (s *Service) ArchiveTeam(ctx context.Context, companyID, id uuid.UUID) (*organization.Team, error) {
	t, err := s.team.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	deps, err := s.TeamDependencyCounts(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	if deps.any() {
		return nil, shared.New(
			organization.ErrTeamHasDependencies.Code,
			"Team still has "+deps.describe()+" — reassign them before archiving",
			organization.ErrTeamHasDependencies.HTTPStatus,
		)
	}
	t.Archive()
	if err := s.team.Update(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

// SetTeamStatus changes only the lifecycle status, so the UI can offer it as a
// one-click row action without resubmitting the whole team form.
func (s *Service) SetTeamStatus(ctx context.Context, companyID, teamID uuid.UUID, status string) (*organization.Team, error) {
	if strings.EqualFold(strings.TrimSpace(status), organization.StatusArchived) {
		return s.ArchiveTeam(ctx, companyID, teamID)
	}
	t, err := s.team.FindByID(ctx, companyID, teamID)
	if err != nil {
		return nil, err
	}
	if err := t.SetStatus(status); err != nil {
		return nil, err
	}
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
	JobTitle  string
	UserID    *int
}

func (s *Service) CreateEmployee(ctx context.Context, companyID uuid.UUID, in CreateEmployeeInput) (*organization.Employee, error) {
	e, err := organization.NewEmployee(companyID, in.FirstName, in.LastName, in.Email, in.Phone, in.JobTitle)
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

func (s *Service) UpdateEmployee(ctx context.Context, companyID, id uuid.UUID, in CreateEmployeeInput) (*organization.Employee, error) {
	e, err := s.emp.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	if err := e.UpdateProfile(in.FirstName, in.LastName, in.Email, in.Phone, in.JobTitle); err != nil {
		return nil, err
	}
	if err := s.emp.Update(ctx, e); err != nil {
		return nil, err
	}
	return e, nil
}

// DeactivateEmployee sets status INACTIVE (soft offboarding) instead of hard delete.
func (s *Service) DeactivateEmployee(ctx context.Context, companyID, id uuid.UUID) (*organization.Employee, error) {
	e, err := s.emp.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	e.Deactivate()
	if err := s.emp.Update(ctx, e); err != nil {
		return nil, err
	}
	return e, nil
}

func (s *Service) ActivateEmployee(ctx context.Context, companyID, id uuid.UUID) (*organization.Employee, error) {
	e, err := s.emp.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	e.Activate()
	if err := s.emp.Update(ctx, e); err != nil {
		return nil, err
	}
	return e, nil
}

func (s *Service) ArchiveEmployee(ctx context.Context, companyID, id uuid.UUID) (*organization.Employee, error) {
	return s.DeactivateEmployee(ctx, companyID, id)
}

func (s *Service) AssignEmployeeToTeam(ctx context.Context, companyID, employeeID, teamID uuid.UUID, assignedBy *int) error {
	if _, err := s.emp.FindByID(ctx, companyID, employeeID); err != nil {
		return err
	}
	t, err := s.team.FindByID(ctx, companyID, teamID)
	if err != nil {
		return err
	}
	role := organization.TeamRoleMember
	if t.LeadID != nil && *t.LeadID == employeeID {
		role = organization.TeamRoleLead
	}
	return s.emp.AssignToTeam(ctx, companyID, employeeID, teamID, assignedBy, role)
}

func (s *Service) RemoveEmployeeFromTeam(ctx context.Context, companyID, employeeID, teamID uuid.UUID) error {
	return s.emp.RemoveFromTeam(ctx, companyID, employeeID, teamID)
}
