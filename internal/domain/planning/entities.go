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

	// MVP Feature Planning additions — layered on top of the original lifecycle;
	// existing statuses above keep working exactly as before.
	StatusDraft    = "DRAFT"
	StatusPlanning = "PLANNING"
	StatusOnHold   = "ON_HOLD"
	StatusReview   = "REVIEW"
	StatusTodo     = "TODO"
	StatusDone     = "DONE"
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

	// MVP Feature Planning additions (all optional/additive).
	Code                  string     `json:"code,omitempty"`
	Goal                  string     `json:"goal,omitempty"`
	Priority              string     `json:"priority,omitempty"`
	OwnerID               *uuid.UUID `json:"owner_id,omitempty"`
	ManagerID             *uuid.UUID `json:"manager_id,omitempty"`
	StartDate             *time.Time `json:"start_date,omitempty"`
	TargetEndDate         *time.Time `json:"target_end_date,omitempty"`
	EstimatedDurationDays *int       `json:"estimated_duration_days,omitempty"`
	DeletedAt             *time.Time `json:"deleted_at,omitempty"`
	CreatedBy             *uuid.UUID `json:"created_by,omitempty"`
	UpdatedBy             *uuid.UUID `json:"updated_by,omitempty"`
	ArchivedBy            *uuid.UUID `json:"archived_by,omitempty"`
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

// SoftDelete marks the project deleted without removing the row (additive gap-fill).
func (p *Project) SoftDelete(by *uuid.UUID) {
	now := time.Now().UTC()
	p.DeletedAt = &now
	p.ArchivedBy = by
	p.UpdatedAt = now
}

// Restore clears a previous soft delete.
func (p *Project) Restore() {
	p.DeletedAt = nil
	p.ArchivedBy = nil
	p.UpdatedAt = time.Now().UTC()
}

func (p *Project) IsDeleted() bool {
	return p.DeletedAt != nil
}

type Feature struct {
	shared.BaseModel
	CompanyID uuid.UUID `json:"company_id"`
	ProductID uuid.UUID `json:"product_id"`
	ProjectID uuid.UUID `json:"project_id"`
	Title     string    `json:"title"`
	Status    string    `json:"status"`
	Priority  string    `json:"priority"`

	// MVP Feature Planning additions (all optional/additive).
	Code            string     `json:"code,omitempty"`
	Description     string     `json:"description,omitempty"`
	Goal            string     `json:"goal,omitempty"`
	FeatureType     string     `json:"feature_type,omitempty"`
	OwnerID         *uuid.UUID `json:"owner_id,omitempty"`
	TeamID          *uuid.UUID `json:"team_id,omitempty"`
	ParentFeatureID *uuid.UUID `json:"parent_feature_id,omitempty"`
	StartDate       *time.Time `json:"start_date,omitempty"`
	TargetEndDate   *time.Time `json:"target_end_date,omitempty"`
	EstimatedEffort *int       `json:"estimated_effort,omitempty"`
	ProgressPct     int        `json:"progress_pct,omitempty"`
	DeletedAt       *time.Time `json:"deleted_at,omitempty"`
	CreatedBy       *uuid.UUID `json:"created_by,omitempty"`
	UpdatedBy       *uuid.UUID `json:"updated_by,omitempty"`
	ArchivedBy      *uuid.UUID `json:"archived_by,omitempty"`
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

func (f *Feature) Archive(by *uuid.UUID) {
	now := time.Now().UTC()
	f.Status = StatusArchived
	f.ArchivedBy = by
	f.UpdatedAt = now
}

// SoftDelete marks the feature deleted without removing the row (additive gap-fill).
func (f *Feature) SoftDelete(by *uuid.UUID) {
	now := time.Now().UTC()
	f.DeletedAt = &now
	f.ArchivedBy = by
	f.UpdatedAt = now
}

// Restore clears a previous archive/soft delete.
func (f *Feature) Restore() {
	f.DeletedAt = nil
	f.ArchivedBy = nil
	if f.Status == StatusArchived {
		f.Status = StatusBacklog
	}
	f.UpdatedAt = time.Now().UTC()
}

func (f *Feature) IsDeleted() bool {
	return f.DeletedAt != nil
}

func (f *Feature) SetProgress(pct int) {
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	f.ProgressPct = pct
	f.UpdatedAt = time.Now().UTC()
}

type Task struct {
	shared.BaseModel
	CompanyID    uuid.UUID   `json:"company_id"`
	FeatureID    uuid.UUID   `json:"feature_id"`
	AssigneeID   *uuid.UUID  `json:"assignee_id,omitempty"`
	Title        string      `json:"title"`
	Status       string      `json:"status"`
	Priority     string      `json:"priority"`
	DueDate      *time.Time  `json:"due_date,omitempty"`
	DependsOnIDs []uuid.UUID `json:"depends_on_ids,omitempty"`
	ProgressPct  int         `json:"progress_pct,omitempty"` // for feature/project summaries

	// MVP Feature Planning additions (all optional/additive).
	Description      string     `json:"description,omitempty"`
	TaskType         string     `json:"task_type,omitempty"`
	StartDate        *time.Time `json:"start_date,omitempty"`
	EstimatedMinutes *int       `json:"estimated_minutes,omitempty"`
	ActualMinutes    *int       `json:"actual_minutes,omitempty"`
	DeletedAt        *time.Time `json:"deleted_at,omitempty"`
	CreatedBy        *uuid.UUID `json:"created_by,omitempty"`
	UpdatedBy        *uuid.UUID `json:"updated_by,omitempty"`
	ArchivedBy       *uuid.UUID `json:"archived_by,omitempty"`
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
	t.ProgressPct = 100
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

func (t *Task) Archive(by *uuid.UUID) {
	now := time.Now().UTC()
	t.Status = StatusArchived
	t.ArchivedBy = by
	t.UpdatedAt = now
}

// Pause moves an in-flight task to ON_HOLD (MVP addition).
func (t *Task) Pause() error {
	if t.Status == StatusCompleted || t.Status == StatusCancelled || t.Status == StatusArchived {
		return ErrInvalidStatus
	}
	t.Status = StatusOnHold
	t.UpdatedAt = time.Now().UTC()
	return nil
}

// Resume moves an ON_HOLD task back to IN_PROGRESS.
func (t *Task) Resume() error {
	if t.Status != StatusOnHold {
		return ErrInvalidStatus
	}
	t.Status = StatusInProgress
	t.UpdatedAt = time.Now().UTC()
	return nil
}

// Reopen brings a completed/cancelled task back to TODO for rework.
func (t *Task) Reopen() error {
	if t.Status != StatusCompleted && t.Status != StatusCancelled {
		return ErrInvalidStatus
	}
	t.Status = StatusTodo
	if t.ProgressPct == 100 {
		t.ProgressPct = 0
	}
	t.UpdatedAt = time.Now().UTC()
	return nil
}

// SoftDelete marks the task deleted without removing the row (additive gap-fill).
func (t *Task) SoftDelete(by *uuid.UUID) {
	now := time.Now().UTC()
	t.DeletedAt = &now
	t.ArchivedBy = by
	t.UpdatedAt = now
}

// Restore clears a previous soft delete.
func (t *Task) Restore() {
	t.DeletedAt = nil
	t.ArchivedBy = nil
	t.UpdatedAt = time.Now().UTC()
}

func (t *Task) IsDeleted() bool {
	return t.DeletedAt != nil
}

func (t *Task) SetDueDate(due *time.Time) {
	t.DueDate = due
	t.UpdatedAt = time.Now().UTC()
}

func (t *Task) SetProgress(pct int) {
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	t.ProgressPct = pct
	t.UpdatedAt = time.Now().UTC()
}

// ChecklistItem is a single checkable line item under a task (MVP addition:
// task_checklists table doubles as the checklist-item store per the migration).
type ChecklistItem struct {
	ID        uuid.UUID `json:"id"`
	CompanyID uuid.UUID `json:"company_id"`
	TaskID    uuid.UUID `json:"task_id"`
	Title     string    `json:"title"`
	Position  int       `json:"position"`
	IsDone    bool      `json:"is_done"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func NewChecklistItem(companyID, taskID uuid.UUID, title string, position int) (*ChecklistItem, error) {
	title = strings.TrimSpace(title)
	if companyID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	if taskID == uuid.Nil {
		return nil, ErrTaskRequired
	}
	if title == "" {
		return nil, ErrChecklistTitleRequired
	}
	now := time.Now().UTC()
	return &ChecklistItem{
		ID:        uuid.New(),
		CompanyID: companyID,
		TaskID:    taskID,
		Title:     title,
		Position:  position,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (c *ChecklistItem) Toggle(done bool) {
	c.IsDone = done
	c.UpdatedAt = time.Now().UTC()
}

func (c *ChecklistItem) Rename(title string) error {
	title = strings.TrimSpace(title)
	if title == "" {
		return ErrChecklistTitleRequired
	}
	c.Title = title
	c.UpdatedAt = time.Now().UTC()
	return nil
}

// FeatureDependency records that a feature is blocked until another feature completes
// (MVP addition, mirrors the existing task_dependencies pattern).
type FeatureDependency struct {
	CompanyID          uuid.UUID `json:"company_id"`
	FeatureID          uuid.UUID `json:"feature_id"`
	DependsOnFeatureID uuid.UUID `json:"depends_on_feature_id"`
	CreatedAt          time.Time `json:"created_at"`
}

// Member roles for project_members/feature_members (MVP addition).
const (
	MemberRoleContributor = "CONTRIBUTOR"
	MemberRoleViewer      = "VIEWER"
)

// ProjectMember represents an employee granted membership on a project.
type ProjectMember struct {
	ID         uuid.UUID `json:"id"`
	CompanyID  uuid.UUID `json:"company_id"`
	ProjectID  uuid.UUID `json:"project_id"`
	EmployeeID uuid.UUID `json:"employee_id"`
	Role       string    `json:"role"`
	CreatedAt  time.Time `json:"created_at"`
}

func NewProjectMember(companyID, projectID, employeeID uuid.UUID, role string) (*ProjectMember, error) {
	if companyID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	if projectID == uuid.Nil {
		return nil, ErrProjectRequired
	}
	if employeeID == uuid.Nil {
		return nil, ErrMemberEmployeeRequired
	}
	role = strings.TrimSpace(strings.ToUpper(role))
	if role == "" {
		role = MemberRoleContributor
	}
	return &ProjectMember{
		ID:         uuid.New(),
		CompanyID:  companyID,
		ProjectID:  projectID,
		EmployeeID: employeeID,
		Role:       role,
		CreatedAt:  time.Now().UTC(),
	}, nil
}

// FeatureMember represents an employee granted membership on a feature.
type FeatureMember struct {
	ID         uuid.UUID `json:"id"`
	CompanyID  uuid.UUID `json:"company_id"`
	FeatureID  uuid.UUID `json:"feature_id"`
	EmployeeID uuid.UUID `json:"employee_id"`
	Role       string    `json:"role"`
	CreatedAt  time.Time `json:"created_at"`
}

func NewFeatureMember(companyID, featureID, employeeID uuid.UUID, role string) (*FeatureMember, error) {
	if companyID == uuid.Nil {
		return nil, ErrCompanyRequired
	}
	if featureID == uuid.Nil {
		return nil, ErrFeatureRequired
	}
	if employeeID == uuid.Nil {
		return nil, ErrMemberEmployeeRequired
	}
	role = strings.TrimSpace(strings.ToUpper(role))
	if role == "" {
		role = MemberRoleContributor
	}
	return &FeatureMember{
		ID:         uuid.New(),
		CompanyID:  companyID,
		FeatureID:  featureID,
		EmployeeID: employeeID,
		Role:       role,
		CreatedAt:  time.Now().UTC(),
	}, nil
}
