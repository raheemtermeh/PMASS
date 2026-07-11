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
)

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

func (p *Product) touch() {
	p.UpdatedAt = time.Now().UTC()
}

type Pipeline struct {
	shared.BaseModel
	ProductID   uuid.UUID `json:"product_id"`
	CompanyID   uuid.UUID `json:"company_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
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
	}, nil
}

type Stage struct {
	shared.BaseModel
	PipelineID     uuid.UUID  `json:"pipeline_id"`
	Name           string     `json:"name"`
	Description    string     `json:"description"`
	Order          int        `json:"order"`
	EntryCriteria  string     `json:"entry_criteria"`
	ExitCriteria   string     `json:"exit_criteria"`
	DepartmentID   *uuid.UUID `json:"department_id,omitempty"` // default responsible dept
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
