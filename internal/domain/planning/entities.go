package planning

import (
	"strings"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
)

const (
	StatusBacklog    = "BACKLOG"
	StatusActive     = "ACTIVE"
	StatusInProgress = "IN_PROGRESS"
	StatusBlocked    = "BLOCKED"
	StatusCompleted  = "COMPLETED"
	StatusCancelled  = "CANCELLED"
	StatusArchived   = "ARCHIVED"
)

const (
	PriorityCritical = "CRITICAL"
	PriorityHigh     = "HIGH"
	PriorityMedium   = "MEDIUM"
	PriorityLow      = "LOW"
)

type Project struct {
	shared.BaseModel
	CompanyID   uuid.UUID `json:"company_id"`
	ProductID   uuid.UUID `json:"product_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Status      string    `json:"status"`
}

func NewProject(companyID, productID uuid.UUID, name, description string) (*Project, error) {
	name = strings.TrimSpace(name)
	if companyID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	if productID == uuid.Nil {
		return nil, ErrProductRequired
	}
	if name == "" {
		return nil, ErrProjectNameRequired
	}
	return &Project{
		BaseModel:   shared.NewBase(),
		CompanyID:   companyID,
		ProductID:   productID,
		Name:        name,
		Description: strings.TrimSpace(description),
		Status:      StatusBacklog,
	}, nil
}

func (p *Project) ChangeStatus(status string) error {
	status = strings.TrimSpace(strings.ToUpper(status))
	if status == "" {
		return ErrInvalidStatus
	}
	p.Status = status
	p.UpdatedAt = time.Now().UTC()
	return nil
}

func (p *Project) Archive() {
	p.Status = StatusArchived
	p.UpdatedAt = time.Now().UTC()
}

type Feature struct {
	shared.BaseModel
	CompanyID uuid.UUID `json:"company_id"`
	ProductID uuid.UUID `json:"product_id"`
	ProjectID uuid.UUID `json:"project_id"`
	Title     string    `json:"title"`
	Status    string    `json:"status"`
	Priority  string    `json:"priority"`
}

func NewFeature(companyID, productID, projectID uuid.UUID, title, priority string) (*Feature, error) {
	title = strings.TrimSpace(title)
	if companyID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	if productID == uuid.Nil {
		return nil, ErrProductRequired
	}
	if projectID == uuid.Nil {
		return nil, ErrProjectRequired
	}
	if title == "" {
		return nil, ErrFeatureTitleRequired
	}
	priority = strings.TrimSpace(strings.ToUpper(priority))
	if priority == "" {
		priority = PriorityMedium
	}
	return &Feature{
		BaseModel: shared.NewBase(),
		CompanyID: companyID,
		ProductID: productID,
		ProjectID: projectID,
		Title:     title,
		Status:    StatusBacklog,
		Priority:  priority,
	}, nil
}

func (f *Feature) ChangeStatus(status string) error {
	status = strings.TrimSpace(strings.ToUpper(status))
	if status == "" {
		return ErrInvalidStatus
	}
	f.Status = status
	f.UpdatedAt = time.Now().UTC()
	return nil
}

func (f *Feature) Archive() {
	f.Status = StatusArchived
	f.UpdatedAt = time.Now().UTC()
}

type Task struct {
	shared.BaseModel
	CompanyID  uuid.UUID  `json:"company_id"`
	FeatureID  uuid.UUID  `json:"feature_id"`
	AssigneeID *uuid.UUID `json:"assignee_id,omitempty"` // employee; nullable per PDF
	Title      string     `json:"title"`
	Status     string     `json:"status"`
	Priority   string     `json:"priority"`
	DueDate    *time.Time `json:"due_date,omitempty"`
}

func NewTask(companyID, featureID uuid.UUID, title, priority string, assigneeID *uuid.UUID, dueDate *time.Time) (*Task, error) {
	title = strings.TrimSpace(title)
	if companyID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	if featureID == uuid.Nil {
		return nil, ErrFeatureRequired
	}
	if title == "" {
		return nil, ErrTaskTitleRequired
	}
	priority = strings.TrimSpace(strings.ToUpper(priority))
	if priority == "" {
		priority = PriorityMedium
	}
	return &Task{
		BaseModel:  shared.NewBase(),
		CompanyID:  companyID,
		FeatureID:  featureID,
		AssigneeID: assigneeID,
		Title:      title,
		Status:     StatusBacklog,
		Priority:   priority,
		DueDate:    dueDate,
	}, nil
}

func (t *Task) Assign(assigneeID *uuid.UUID) {
	t.AssigneeID = assigneeID
	t.UpdatedAt = time.Now().UTC()
}

func (t *Task) Complete() {
	t.Status = StatusCompleted
	t.UpdatedAt = time.Now().UTC()
}

func (t *Task) Reject() {
	t.Status = StatusCancelled
	t.UpdatedAt = time.Now().UTC()
}

func (t *Task) ChangeStatus(status string) error {
	status = strings.TrimSpace(strings.ToUpper(status))
	if status == "" {
		return ErrInvalidStatus
	}
	t.Status = status
	t.UpdatedAt = time.Now().UTC()
	return nil
}
