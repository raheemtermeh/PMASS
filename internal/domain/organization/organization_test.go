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
	_, err := organization.NewTeam(uuid.New(), uuid.New(), uuid.Nil, "Alpha", "")
	if err != organization.ErrTeamLeadRequired {
		t.Fatalf("got %v", err)
	}
}
