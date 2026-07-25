package organization

import (
	"strings"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
)

const (
	StatusActive   = "ACTIVE"
	StatusInactive = "INACTIVE"
	StatusArchived = "ARCHIVED"
	// StatusOnHold is an MVP Feature Planning addition for companies temporarily
	// paused (e.g. billing/compliance hold) without being archived.
	StatusOnHold = "ON_HOLD"

	TeamRoleMember = "MEMBER"
	TeamRoleLead   = "LEAD"
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
	CompanyID     uuid.UUID  `json:"company_id"`
	ManagerID     *uuid.UUID `json:"manager_id"`
	Name          string     `json:"name"`
	Description   string     `json:"description"`
	Status        string     `json:"status"`
	MemberCount   int64      `json:"member_count,omitempty"`
	TeamCount     int64      `json:"team_count,omitempty"`
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

func (d *Department) SetDescription(description string) {
	d.Description = strings.TrimSpace(description)
	d.UpdatedAt = shared.NewBase().UpdatedAt
}

func (d *Department) Archive() {
	d.Status = StatusArchived
	d.UpdatedAt = shared.NewBase().UpdatedAt
}

func (d *Department) SetStatus(status string) error {
	status = strings.TrimSpace(strings.ToUpper(status))
	switch status {
	case StatusActive, StatusInactive, StatusArchived:
		d.Status = status
		d.UpdatedAt = shared.NewBase().UpdatedAt
		return nil
	default:
		return ErrInvalidStatus
	}
}

type Team struct {
	shared.BaseModel
	CompanyID    uuid.UUID  `json:"company_id"`
	DepartmentID uuid.UUID  `json:"department_id"`
	LeadID       *uuid.UUID `json:"lead_id"`
	Name         string     `json:"name"`
	Description  string     `json:"description"`
	Capacity     int        `json:"capacity"`
	Status       string     `json:"status"`
}

func NewTeam(companyID, departmentID, leadID uuid.UUID, name, description string, capacity int) (*Team, error) {
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
	if capacity < 0 {
		capacity = 0
	}
	lid := leadID
	return &Team{
		BaseModel:    shared.NewBase(),
		CompanyID:    companyID,
		DepartmentID: departmentID,
		LeadID:       &lid,
		Name:         name,
		Description:  strings.TrimSpace(description),
		Capacity:     capacity,
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

func (t *Team) UpdateDetails(name, description string, capacity int) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return ErrTeamNameRequired
	}
	if capacity < 0 {
		capacity = 0
	}
	t.Name = name
	t.Description = strings.TrimSpace(description)
	t.Capacity = capacity
	t.UpdatedAt = shared.NewBase().UpdatedAt
	return nil
}

func (t *Team) Archive() {
	t.Status = StatusArchived
	t.UpdatedAt = shared.NewBase().UpdatedAt
}

func (t *Team) SetStatus(status string) error {
	status = strings.TrimSpace(strings.ToUpper(status))
	switch status {
	case StatusActive, StatusInactive, StatusArchived:
		t.Status = status
		t.UpdatedAt = shared.NewBase().UpdatedAt
		return nil
	default:
		return ErrInvalidStatus
	}
}

type Employee struct {
	shared.BaseModel
	CompanyID uuid.UUID `json:"company_id"`
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
	Email     string    `json:"email"`
	Phone     string    `json:"phone"`
	JobTitle  string    `json:"job_title"`
	Status    string    `json:"status"`
	UserID    *int      `json:"user_id,omitempty"` // link to app_users when invited
}

func NewEmployee(companyID uuid.UUID, firstName, lastName, email, phone, jobTitle string) (*Employee, error) {
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
		JobTitle:  strings.TrimSpace(jobTitle),
		Status:    StatusActive,
	}, nil
}

func (e *Employee) UpdateProfile(firstName, lastName, email, phone, jobTitle string) error {
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
	e.JobTitle = strings.TrimSpace(jobTitle)
	e.UpdatedAt = shared.NewBase().UpdatedAt
	return nil
}

func (e *Employee) Archive() {
	e.Status = StatusArchived
	e.UpdatedAt = shared.NewBase().UpdatedAt
}

func (e *Employee) Deactivate() {
	e.Status = StatusInactive
	e.UpdatedAt = shared.NewBase().UpdatedAt
}

func (e *Employee) Activate() {
	e.Status = StatusActive
	e.UpdatedAt = shared.NewBase().UpdatedAt
}

func (e *Employee) FullName() string {
	return strings.TrimSpace(e.FirstName + " " + e.LastName)
}

// TeamMemberView is a membership row with employee profile + audit fields.
type TeamMemberView struct {
	EmployeeID uuid.UUID  `json:"employee_id"`
	FirstName  string     `json:"first_name"`
	LastName   string     `json:"last_name"`
	Email      string     `json:"email"`
	JobTitle   string     `json:"job_title"`
	Status     string     `json:"status"`
	TeamRole   string     `json:"team_role"`
	AssignedAt time.Time  `json:"assigned_at"`
	AssignedBy *int       `json:"assigned_by,omitempty"`
}

func (m TeamMemberView) FullName() string {
	return strings.TrimSpace(m.FirstName + " " + m.LastName)
}
