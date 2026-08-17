package organization_test

import (
	"testing"

	"github.com/google/uuid"

	"PMAS/internal/domain/organization"
)

func TestCompany_DeleteForbidden(t *testing.T) {
	c, err := organization.NewCompany("Acme", "acme")
	if err != nil {
		t.Fatal(err)
	}
	if err := c.Delete(); err != organization.ErrCompanyDeleteForbidden {
		t.Fatalf("got %v", err)
	}
}

func TestDepartment_ManagerRequired(t *testing.T) {
	_, err := organization.NewDepartment(uuid.New(), "Eng", uuid.Nil)
	if err != organization.ErrManagerRequired {
		t.Fatalf("got %v", err)
	}
}

func TestTeam_LeadRequired(t *testing.T) {
	departmentID := uuid.New()
	_, err := organization.NewTeam(uuid.New(), &departmentID, uuid.Nil, "Alpha", "", 0)
	if err != organization.ErrTeamLeadRequired {
		t.Fatalf("got %v", err)
	}
}

func TestTeam_DepartmentOptional(t *testing.T) {
	team, err := organization.NewTeam(uuid.New(), nil, uuid.New(), "Independent", "", 0)
	if err != nil {
		t.Fatal(err)
	}
	if team.DepartmentID != nil {
		t.Fatalf("expected independent team, got department %v", team.DepartmentID)
	}
}

func TestTeam_DepartmentMustBePositiveWhenPresent(t *testing.T) {
	departmentID := uuid.Nil
	_, err := organization.NewTeam(uuid.New(), &departmentID, uuid.New(), "Alpha", "", 0)
	if err != organization.ErrDepartmentRequired {
		t.Fatalf("got %v", err)
	}
}
