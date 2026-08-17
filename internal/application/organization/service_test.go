package organizationapp

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"PMAS/internal/domain/organization"
	"PMAS/internal/domain/shared"
)

type departmentRepoStub struct {
	items map[uuid.UUID]*organization.Department
}

func (r *departmentRepoStub) Create(_ context.Context, d *organization.Department) error {
	r.items[d.ID] = d
	return nil
}

func (r *departmentRepoStub) FindByID(_ context.Context, companyID, id uuid.UUID) (*organization.Department, error) {
	d, ok := r.items[id]
	if !ok || d.CompanyID != companyID {
		return nil, organization.ErrDepartmentNotFound
	}
	return d, nil
}

func (r *departmentRepoStub) List(_ context.Context, _ uuid.UUID, _ shared.PageQuery) ([]organization.Department, int64, error) {
	return nil, 0, nil
}

func (r *departmentRepoStub) Update(_ context.Context, _ *organization.Department) error {
	return nil
}

type teamRepoStub struct {
	items map[uuid.UUID]*organization.Team
}

func (r *teamRepoStub) Create(_ context.Context, team *organization.Team) error {
	r.items[team.ID] = team
	return nil
}

func (r *teamRepoStub) FindByID(_ context.Context, companyID, id uuid.UUID) (*organization.Team, error) {
	team, ok := r.items[id]
	if !ok || team.CompanyID != companyID {
		return nil, organization.ErrTeamNotFound
	}
	return team, nil
}

func (r *teamRepoStub) List(_ context.Context, _ uuid.UUID, _ shared.PageQuery) ([]organization.Team, int64, error) {
	return nil, 0, nil
}

func (r *teamRepoStub) ListByDepartment(_ context.Context, _, _ uuid.UUID, _ shared.PageQuery) ([]organization.Team, int64, error) {
	return nil, 0, nil
}

func (r *teamRepoStub) Update(_ context.Context, _ *organization.Team) error {
	return nil
}

func (r *teamRepoStub) CountLinkedFeatures(_ context.Context, _, _ uuid.UUID) (int64, error) {
	return 0, nil
}

type employeeRepoStub struct {
	items map[uuid.UUID]*organization.Employee
}

func (r *employeeRepoStub) Create(_ context.Context, employee *organization.Employee) error {
	r.items[employee.ID] = employee
	return nil
}

func (r *employeeRepoStub) FindByID(_ context.Context, companyID, id uuid.UUID) (*organization.Employee, error) {
	employee, ok := r.items[id]
	if !ok || employee.CompanyID != companyID {
		return nil, organization.ErrEmployeeNotFound
	}
	return employee, nil
}

func (r *employeeRepoStub) FindByEmail(_ context.Context, _ uuid.UUID, _ string) (*organization.Employee, error) {
	return nil, organization.ErrEmployeeNotFound
}

func (r *employeeRepoStub) List(_ context.Context, _ uuid.UUID, _ shared.PageQuery) ([]organization.Employee, int64, error) {
	return nil, 0, nil
}

func (r *employeeRepoStub) Update(_ context.Context, _ *organization.Employee) error {
	return nil
}

func (r *employeeRepoStub) AssignToTeam(_ context.Context, _, _, _ uuid.UUID, _ *int, _ string) error {
	return nil
}

func (r *employeeRepoStub) RemoveFromTeam(_ context.Context, _, _, _ uuid.UUID) error {
	return nil
}

func (r *employeeRepoStub) ListByTeam(_ context.Context, _, _ uuid.UUID) ([]organization.TeamMemberView, error) {
	return nil, nil
}

func (r *employeeRepoStub) ListAllMemberships(_ context.Context, _ uuid.UUID) ([]organization.TeamMembership, error) {
	return nil, nil
}

func (r *employeeRepoStub) FindTeamIDForEmployee(_ context.Context, _, _ uuid.UUID) (uuid.UUID, error) {
	return uuid.Nil, nil
}

func (r *employeeRepoStub) CountTeamMembers(_ context.Context, _, _ uuid.UUID) (int64, error) {
	return 0, nil
}

func (r *employeeRepoStub) CountOpenAssignmentsForTeam(_ context.Context, _, _ uuid.UUID) (int64, error) {
	return 0, nil
}

func newTeamServiceFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	companyID := uuid.New()
	otherCompanyID := uuid.New()
	leadID := uuid.New()
	departmentID := uuid.New()
	otherDepartmentID := uuid.New()
	departments := &departmentRepoStub{items: map[uuid.UUID]*organization.Department{
		departmentID:      {CompanyID: companyID},
		otherDepartmentID: {CompanyID: otherCompanyID},
	}}
	employees := &employeeRepoStub{items: map[uuid.UUID]*organization.Employee{
		leadID: {CompanyID: companyID},
	}}
	teams := &teamRepoStub{items: make(map[uuid.UUID]*organization.Team)}
	return NewService(nil, nil, departments, teams, employees), companyID, leadID, departmentID, otherDepartmentID
}

func TestCreateTeamWithOptionalDepartment(t *testing.T) {
	service, companyID, leadID, departmentID, _ := newTeamServiceFixture(t)

	independent, err := service.CreateTeam(context.Background(), companyID, CreateTeamInput{
		LeadID: leadID,
		Name:   "Independent",
	})
	if err != nil {
		t.Fatal(err)
	}
	if independent.DepartmentID != nil {
		t.Fatalf("expected no department, got %v", independent.DepartmentID)
	}

	assigned, err := service.CreateTeam(context.Background(), companyID, CreateTeamInput{
		DepartmentID: &departmentID,
		LeadID:       leadID,
		Name:         "Assigned",
	})
	if err != nil {
		t.Fatal(err)
	}
	if assigned.DepartmentID == nil || *assigned.DepartmentID != departmentID {
		t.Fatalf("expected department %s, got %v", departmentID, assigned.DepartmentID)
	}
}

func TestCreateTeamRejectsDepartmentFromAnotherCompany(t *testing.T) {
	service, companyID, leadID, _, otherDepartmentID := newTeamServiceFixture(t)
	_, err := service.CreateTeam(context.Background(), companyID, CreateTeamInput{
		DepartmentID: &otherDepartmentID,
		LeadID:       leadID,
		Name:         "Wrong tenant",
	})
	if err != organization.ErrDepartmentNotFound {
		t.Fatalf("got %v", err)
	}
}

func TestCreateTeamRejectsNilDepartmentIDWhenPresent(t *testing.T) {
	service, companyID, leadID, _, _ := newTeamServiceFixture(t)
	departmentID := uuid.Nil
	_, err := service.CreateTeam(context.Background(), companyID, CreateTeamInput{
		DepartmentID: &departmentID,
		LeadID:       leadID,
		Name:         "Invalid department",
	})
	if err != organization.ErrDepartmentRequired {
		t.Fatalf("got %v", err)
	}
}

func TestAssignAndUnassignTeamDepartment(t *testing.T) {
	service, companyID, leadID, departmentID, otherDepartmentID := newTeamServiceFixture(t)
	team, err := service.CreateTeam(context.Background(), companyID, CreateTeamInput{
		LeadID: leadID,
		Name:   "Movable",
	})
	if err != nil {
		t.Fatal(err)
	}

	team, err = service.AssignTeamDepartment(context.Background(), companyID, team.ID, &departmentID)
	if err != nil {
		t.Fatal(err)
	}
	if team.DepartmentID == nil || *team.DepartmentID != departmentID {
		t.Fatalf("expected department %s, got %v", departmentID, team.DepartmentID)
	}

	team, err = service.AssignTeamDepartment(context.Background(), companyID, team.ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if team.DepartmentID != nil {
		t.Fatalf("expected independent team, got %v", team.DepartmentID)
	}

	_, err = service.AssignTeamDepartment(context.Background(), companyID, team.ID, &otherDepartmentID)
	if err != organization.ErrDepartmentNotFound {
		t.Fatalf("expected cross-company department rejection, got %v", err)
	}
}
