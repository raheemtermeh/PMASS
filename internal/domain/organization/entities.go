package organization

import (
	"strings"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
)

const (
	StatusActive   = "ACTIVE"
	StatusArchived = "ARCHIVED"
)

type Company struct {
	shared.BaseModel
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	Status   string `json:"status"`
	LogoURL  string `json:"logo_url"`
	Language string `json:"language"`
	Timezone string `json:"timezone"`
}

func NewCompany(name, slug string) (*Company, error) {
	name = strings.TrimSpace(name)
	slug = strings.TrimSpace(strings.ToLower(slug))
	if name == "" {
		return nil, ErrCompanyNameRequired
	}
	if slug == "" {
		return nil, ErrCompanySlugRequired
	}
	return &Company{
		BaseModel: shared.NewBase(),
		Name:      name,
		Slug:      slug,
		Status:    StatusActive,
		Language:  "en",
		Timezone:  "UTC",
	}, nil
}

func (c *Company) UpdateProfile(name, logoURL, language, timezone string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return ErrCompanyNameRequired
	}
	c.Name = name
	c.LogoURL = strings.TrimSpace(logoURL)
	if language = strings.TrimSpace(language); language != "" {
		c.Language = language
	}
	if timezone = strings.TrimSpace(timezone); timezone != "" {
		c.Timezone = timezone
	}
	c.UpdatedAt = shared.NewBase().UpdatedAt
	return nil
}

// Delete is always forbidden (PDF §3.5 COMPANY_DELETE_FORBIDDEN).
func (c *Company) Delete() error {
	return ErrCompanyDeleteForbidden
}

type Department struct {
	shared.BaseModel
	CompanyID uuid.UUID  `json:"company_id"`
	ManagerID *uuid.UUID `json:"manager_id"`
	Name      string     `json:"name"`
	Status    string     `json:"status"`
}

func NewDepartment(companyID uuid.UUID, name string, managerID uuid.UUID) (*Department, error) {
	name = strings.TrimSpace(name)
	if companyID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	if name == "" {
		return nil, ErrDepartmentNameRequired
	}
	if managerID == uuid.Nil {
		return nil, ErrManagerRequired
	}
	mid := managerID
	return &Department{
		BaseModel: shared.NewBase(),
		CompanyID: companyID,
		ManagerID: &mid,
		Name:      name,
		Status:    StatusActive,
	}, nil
}

func (d *Department) ChangeManager(managerID uuid.UUID) error {
	if managerID == uuid.Nil {
		return ErrManagerRequired
	}
	d.ManagerID = &managerID
	d.UpdatedAt = shared.NewBase().UpdatedAt
	return nil
}

func (d *Department) Rename(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return ErrDepartmentNameRequired
	}
	d.Name = name
	d.UpdatedAt = shared.NewBase().UpdatedAt
	return nil
}

func (d *Department) Archive() {
	d.Status = StatusArchived
	d.UpdatedAt = shared.NewBase().UpdatedAt
}

type Team struct {
	shared.BaseModel
	CompanyID    uuid.UUID  `json:"company_id"`
	DepartmentID uuid.UUID  `json:"department_id"`
	LeadID       *uuid.UUID `json:"lead_id"`
	Name         string     `json:"name"`
	Description  string     `json:"description"`
	Status       string     `json:"status"`
}

func NewTeam(companyID, departmentID, leadID uuid.UUID, name, description string) (*Team, error) {
	name = strings.TrimSpace(name)
	if companyID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	if departmentID == uuid.Nil {
		return nil, ErrDepartmentRequired
	}
	if leadID == uuid.Nil {
		return nil, ErrTeamLeadRequired
	}
	if name == "" {
		return nil, ErrTeamNameRequired
	}
	lid := leadID
	return &Team{
		BaseModel:    shared.NewBase(),
		CompanyID:    companyID,
		DepartmentID: departmentID,
		LeadID:       &lid,
		Name:         name,
		Description:  strings.TrimSpace(description),
		Status:       StatusActive,
	}, nil
}

func (t *Team) AssignLead(leadID uuid.UUID) error {
	if leadID == uuid.Nil {
		return ErrTeamLeadRequired
	}
	t.LeadID = &leadID
	t.UpdatedAt = shared.NewBase().UpdatedAt
	return nil
}

func (t *Team) UpdateDetails(name, description string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return ErrTeamNameRequired
	}
	t.Name = name
	t.Description = strings.TrimSpace(description)
	t.UpdatedAt = shared.NewBase().UpdatedAt
	return nil
}

func (t *Team) Archive() {
	t.Status = StatusArchived
	t.UpdatedAt = shared.NewBase().UpdatedAt
}

type Employee struct {
	shared.BaseModel
	CompanyID uuid.UUID `json:"company_id"`
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
	Email     string    `json:"email"`
	Phone     string    `json:"phone"`
	Status    string    `json:"status"`
	UserID    *int      `json:"user_id,omitempty"` // link to app_users when invited
}

func NewEmployee(companyID uuid.UUID, firstName, lastName, email, phone string) (*Employee, error) {
	firstName = strings.TrimSpace(firstName)
	lastName = strings.TrimSpace(lastName)
	email = strings.TrimSpace(strings.ToLower(email))
	if companyID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	if firstName == "" || lastName == "" {
		return nil, ErrEmployeeNameRequired
	}
	if email == "" {
		return nil, ErrEmployeeEmailRequired
	}
	return &Employee{
		BaseModel: shared.NewBase(),
		CompanyID: companyID,
		FirstName: firstName,
		LastName:  lastName,
		Email:     email,
		Phone:     strings.TrimSpace(phone),
		Status:    StatusActive,
	}, nil
}

func (e *Employee) UpdateProfile(firstName, lastName, email, phone string) error {
	firstName = strings.TrimSpace(firstName)
	lastName = strings.TrimSpace(lastName)
	email = strings.TrimSpace(strings.ToLower(email))
	if firstName == "" || lastName == "" {
		return ErrEmployeeNameRequired
	}
	if email == "" {
		return ErrEmployeeEmailRequired
	}
	e.FirstName = firstName
	e.LastName = lastName
	e.Email = email
	e.Phone = strings.TrimSpace(phone)
	e.UpdatedAt = shared.NewBase().UpdatedAt
	return nil
}

func (e *Employee) Archive() {
	e.Status = StatusArchived
	e.UpdatedAt = shared.NewBase().UpdatedAt
}

func (e *Employee) FullName() string {
	return strings.TrimSpace(e.FirstName + " " + e.LastName)
}
