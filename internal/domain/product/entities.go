package product

import (
	"strings"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
)

// Product lifecycle (PDF §2.6).
const (
	StatusDraft     = "DRAFT"
	StatusReady     = "READY"
	StatusActive    = "ACTIVE"
	StatusCompleted = "COMPLETED"
	StatusArchived  = "ARCHIVED"
	// StatusOnHold and StatusPlanning are MVP Feature Planning additions layered
	// on top of the original lifecycle — existing statuses are unaffected.
	StatusOnHold   = "ON_HOLD"
	StatusPlanning = "PLANNING"
)

// Default visibility for products that predate the visibility column.
const VisibilityOrganization = "ORGANIZATION"

// Execution models (PDF §2.11) — immutable after create.
const (
	ExecutionDirectTask         = "DIRECT_TASK"
	ExecutionProjectFeatureTask = "PROJECT_FEATURE_TASK"
	ExecutionFeatureTask        = "FEATURE_TASK"
)

var ValidExecutionModels = map[string]bool{
	ExecutionDirectTask:         true,
	ExecutionProjectFeatureTask: true,
	ExecutionFeatureTask:        true,
}

type Product struct {
	shared.BaseModel
	CompanyID      uuid.UUID  `json:"company_id"`
	OwnerID        uuid.UUID  `json:"owner_id"` // employee id
	Name           string     `json:"name"`
	Description    string     `json:"description"`
	Category       string     `json:"category"`
	Status         string     `json:"status"`
	ExecutionModel string     `json:"execution_model"`
	PipelineID     *uuid.UUID `json:"pipeline_id,omitempty"`

	// MVP Feature Planning additions (all optional/additive; zero values are safe defaults).
	Code           string     `json:"code,omitempty"`
	ProductType    string     `json:"product_type,omitempty"`
	ManagerID      *uuid.UUID `json:"manager_id,omitempty"` // employee id
	Priority       string     `json:"priority,omitempty"`
	Vision         string     `json:"vision,omitempty"`
	Goal           string     `json:"goal,omitempty"`
	SuccessMetrics string     `json:"success_metrics,omitempty"`
	BusinessValue  string     `json:"business_value,omitempty"`
	Visibility     string     `json:"visibility,omitempty"`
	DeletedAt      *time.Time `json:"deleted_at,omitempty"`
}

func NewProduct(companyID, ownerID uuid.UUID, name, description, category, executionModel string) (*Product, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrProductNameRequired
	}
	if companyID == uuid.Nil {
		return nil, ErrCompanyNotFound
	}
	if ownerID == uuid.Nil {
		return nil, ErrProductOwnerRequired
	}
	executionModel = strings.TrimSpace(strings.ToUpper(executionModel))
	if executionModel == "" {
		executionModel = ExecutionProjectFeatureTask
	}
	if !ValidExecutionModels[executionModel] {
		return nil, ErrInvalidExecutionModel
	}
	return &Product{
		BaseModel:      shared.NewBase(),
		CompanyID:      companyID,
		OwnerID:        ownerID,
		Name:           name,
		Description:    strings.TrimSpace(description),
		Category:       strings.TrimSpace(category),
		Status:         StatusDraft,
		ExecutionModel: executionModel,
		Visibility:     VisibilityOrganization,
	}, nil
}

func (p *Product) ChangeOwner(ownerID uuid.UUID) error {
	if ownerID == uuid.Nil {
		return ErrProductOwnerRequired
	}
	if p.Status == StatusArchived {
		return ErrProductArchived
	}
	p.OwnerID = ownerID
	p.touch()
	return nil
}

func (p *Product) AssignPipeline(pipelineID uuid.UUID) error {
	if pipelineID == uuid.Nil {
		return ErrPipelineRequired
	}
	if p.Status == StatusArchived {
		return ErrProductArchived
	}
	p.PipelineID = &pipelineID
	if p.Status == StatusDraft {
		p.Status = StatusReady
	}
	p.touch()
	return nil
}

// ChangeExecutionModel is always rejected after create (PDF §2.11 / EXECUTION_MODEL_LOCKED).
func (p *Product) ChangeExecutionModel(_ string) error {
	return ErrExecutionModelLocked
}

func (p *Product) MarkActive() error {
	if p.PipelineID == nil {
		return ErrPipelineRequired
	}
	if p.Status == StatusArchived {
		return ErrProductArchived
	}
	p.Status = StatusActive
	p.touch()
	return nil
}

func (p *Product) Complete() error {
	if p.Status != StatusActive {
		return ErrInvalidProductStatus
	}
	p.Status = StatusCompleted
	p.touch()
	return nil
}

func (p *Product) Archive() error {
	p.Status = StatusArchived
	p.touch()
	return nil
}

func (p *Product) IsActive() bool {
	return p.Status == StatusActive
}

// Hold pauses an in-flight product (MVP addition; ARCHIVED products stay terminal).
func (p *Product) Hold() error {
	if p.Status == StatusArchived {
		return ErrProductArchived
	}
	p.Status = StatusOnHold
	p.touch()
	return nil
}

// Resume reactivates a product that was previously put ON_HOLD.
func (p *Product) Resume() error {
	if p.Status != StatusOnHold {
		return ErrInvalidProductStatus
	}
	p.Status = StatusActive
	p.touch()
	return nil
}

// SoftDelete marks the product deleted without removing the row (additive gap-fill).
func (p *Product) SoftDelete() error {
	if p.DeletedAt != nil {
		return nil // idempotent
	}
	now := time.Now().UTC()
	p.DeletedAt = &now
	p.touch()
	return nil
}

// Restore clears a previous soft delete.
func (p *Product) Restore() error {
	p.DeletedAt = nil
	p.touch()
	return nil
}

// ChangeManager assigns the delivery manager (distinct from OwnerID/product owner).
func (p *Product) ChangeManager(managerID uuid.UUID) error {
	if managerID == uuid.Nil {
		p.ManagerID = nil
		p.touch()
		return nil
	}
	p.ManagerID = &managerID
	p.touch()
	return nil
}

func (p *Product) touch() {
	p.UpdatedAt = time.Now().UTC()
}

// Pipeline lifecycle (MVP addition; ACTIVE preserves pre-existing behavior).
const (
	PipelineStatusActive   = "ACTIVE"
	PipelineStatusPaused   = "PAUSED"
	PipelineStatusArchived = "ARCHIVED"
)

type Pipeline struct {
	shared.BaseModel
	ProductID   uuid.UUID  `json:"product_id"`
	CompanyID   uuid.UUID  `json:"company_id"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Status      string     `json:"status,omitempty"`
	ArchivedAt  *time.Time `json:"archived_at,omitempty"`
}

func NewPipeline(companyID, productID uuid.UUID, name, description string) (*Pipeline, error) {
	name = strings.TrimSpace(name)
	if companyID == uuid.Nil {
		return nil, ErrCompanyNotFound
	}
	if productID == uuid.Nil {
		return nil, ErrProductNotFound
	}
	if name == "" {
		return nil, ErrPipelineNameRequired
	}
	return &Pipeline{
		BaseModel:   shared.NewBase(),
		ProductID:   productID,
		CompanyID:   companyID,
		Name:        name,
		Description: strings.TrimSpace(description),
		Status:      PipelineStatusActive,
	}, nil
}

func (pl *Pipeline) Rename(name, description string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return ErrPipelineNameRequired
	}
	pl.Name = name
	pl.Description = strings.TrimSpace(description)
	pl.UpdatedAt = time.Now().UTC()
	return nil
}

func (pl *Pipeline) Pause() error {
	if pl.Status == PipelineStatusArchived {
		return ErrPipelineOwnerInvalid
	}
	pl.Status = PipelineStatusPaused
	pl.UpdatedAt = time.Now().UTC()
	return nil
}

func (pl *Pipeline) Resume() error {
	if pl.Status == PipelineStatusArchived {
		return ErrPipelineOwnerInvalid
	}
	pl.Status = PipelineStatusActive
	pl.UpdatedAt = time.Now().UTC()
	return nil
}

func (pl *Pipeline) Archive() {
	now := time.Now().UTC()
	pl.Status = PipelineStatusArchived
	pl.ArchivedAt = &now
	pl.UpdatedAt = now
}

// Restore un-archives a pipeline back to ACTIVE (MVP gap-fill; idempotent no-op
// when the pipeline isn't archived).
func (pl *Pipeline) Restore() error {
	if pl.Status != PipelineStatusArchived {
		return nil
	}
	pl.Status = PipelineStatusActive
	pl.ArchivedAt = nil
	pl.UpdatedAt = time.Now().UTC()
	return nil
}

// DefaultStageColor is used when a stage has no explicit color assigned (MVP addition).
const DefaultStageColor = "#64748b"

type Stage struct {
	shared.BaseModel
	PipelineID    uuid.UUID  `json:"pipeline_id"`
	Name          string     `json:"name"`
	Description   string     `json:"description"`
	Order         int        `json:"order"`
	EntryCriteria string     `json:"entry_criteria"`
	ExitCriteria  string     `json:"exit_criteria"`
	DepartmentID  *uuid.UUID `json:"department_id,omitempty"` // default responsible dept
	Color         string     `json:"color,omitempty"`
}

func NewStage(pipelineID uuid.UUID, name, description string, order int, entryCriteria, exitCriteria string, departmentID *uuid.UUID) (*Stage, error) {
	name = strings.TrimSpace(name)
	if pipelineID == uuid.Nil {
		return nil, ErrPipelineNotFound
	}
	if name == "" {
		return nil, ErrStageNameRequired
	}
	if order < 0 {
		return nil, ErrStageOrderRequired
	}
	return &Stage{
		BaseModel:     shared.NewBase(),
		PipelineID:    pipelineID,
		Name:          name,
		Description:   strings.TrimSpace(description),
		Order:         order,
		EntryCriteria: strings.TrimSpace(entryCriteria),
		ExitCriteria:  strings.TrimSpace(exitCriteria),
		DepartmentID:  departmentID,
		Color:         DefaultStageColor,
	}, nil
}

// Stage instance statuses.
const (
	StagePending   = "PENDING"
	StageActive    = "ACTIVE"
	StageCompleted = "COMPLETED"
	StageRejected  = "REJECTED"
)

type StageInstance struct {
	shared.BaseModel
	ProductID    uuid.UUID  `json:"product_id"`
	CompanyID    uuid.UUID  `json:"company_id"`
	StageID      uuid.UUID  `json:"stage_id"`
	DepartmentID *uuid.UUID `json:"department_id,omitempty"`
	Status       string     `json:"status"`
	StartedAt    *time.Time `json:"started_at,omitempty"`
	FinishedAt   *time.Time `json:"finished_at,omitempty"`
	RejectReason string     `json:"reject_reason,omitempty"`
	DurationSecs *int64     `json:"duration_seconds,omitempty"`
}

func NewStageInstance(companyID, productID, stageID uuid.UUID, departmentID *uuid.UUID) *StageInstance {
	now := time.Now().UTC()
	return &StageInstance{
		BaseModel:    shared.NewBase(),
		ProductID:    productID,
		CompanyID:    companyID,
		StageID:      stageID,
		DepartmentID: departmentID,
		Status:       StageActive,
		StartedAt:    &now,
	}
}

func (si *StageInstance) Complete(exitCriteriaMet bool) error {
	if si.Status != StageActive {
		return ErrInvalidStageStatus
	}
	if !exitCriteriaMet {
		return ErrExitCriteriaFailed
	}
	now := time.Now().UTC()
	si.Status = StageCompleted
	si.FinishedAt = &now
	if si.StartedAt != nil {
		d := int64(now.Sub(*si.StartedAt).Seconds())
		si.DurationSecs = &d
	}
	si.UpdatedAt = now
	return nil
}

// Member roles for product_members (MVP addition, additive to owner/manager fields).
const (
	MemberRoleContributor = "CONTRIBUTOR"
	MemberRoleViewer      = "VIEWER"
)

// ProductMember represents an employee granted membership on a product beyond the
// single owner/manager (MVP Feature Planning gap: collaborative product teams).
type ProductMember struct {
	ID         uuid.UUID `json:"id"`
	CompanyID  uuid.UUID `json:"company_id"`
	ProductID  uuid.UUID `json:"product_id"`
	EmployeeID uuid.UUID `json:"employee_id"`
	Role       string    `json:"role"`
	CreatedAt  time.Time `json:"created_at"`
}

func NewProductMember(companyID, productID, employeeID uuid.UUID, role string) (*ProductMember, error) {
	if companyID == uuid.Nil {
		return nil, ErrCompanyNotFound
	}
	if productID == uuid.Nil {
		return nil, ErrProductNotFound
	}
	if employeeID == uuid.Nil {
		return nil, ErrProductOwnerRequired
	}
	role = strings.TrimSpace(strings.ToUpper(role))
	if role == "" {
		role = MemberRoleContributor
	}
	return &ProductMember{
		ID:         uuid.New(),
		CompanyID:  companyID,
		ProductID:  productID,
		EmployeeID: employeeID,
		Role:       role,
		CreatedAt:  time.Now().UTC(),
	}, nil
}

// Reopen reactivates a stage instance that was previously COMPLETED or REJECTED
// (MVP gap-fill for correcting an erroneous stage transition). The caller is
// responsible for ensuring no other stage instance is currently ACTIVE.
func (si *StageInstance) Reopen() error {
	if si.Status != StageRejected && si.Status != StageCompleted {
		return ErrInvalidStageStatus
	}
	now := time.Now().UTC()
	si.Status = StageActive
	si.FinishedAt = nil
	si.RejectReason = ""
	si.DurationSecs = nil
	si.StartedAt = &now
	si.UpdatedAt = now
	return nil
}

func (si *StageInstance) Reject(reason string) error {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return ErrRejectReasonRequired
	}
	if si.Status != StageActive {
		return ErrInvalidStageStatus
	}
	now := time.Now().UTC()
	si.Status = StageRejected
	si.RejectReason = reason
	si.FinishedAt = &now
	if si.StartedAt != nil {
		d := int64(now.Sub(*si.StartedAt).Seconds())
		si.DurationSecs = &d
	}
	si.UpdatedAt = now
	return nil
}
