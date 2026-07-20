package productapp

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"PMAS/internal/domain/organization"
	"PMAS/internal/domain/product"
	"PMAS/internal/domain/shared"
	"PMAS/internal/domain/support"
	"PMAS/internal/infrastructure/postgres"
)

type Service struct {
	db        *postgres.DB
	products  product.ProductRepository
	pipes     product.PipelineRepository
	stages    product.StageRepository
	instances product.StageInstanceRepository
	members   product.ProductMemberRepository
	emps      organization.EmployeeRepository
	activities support.ActivityRepository
	notifs    support.NotificationRepository
}

func NewService(
	db *postgres.DB,
	products product.ProductRepository,
	pipes product.PipelineRepository,
	stages product.StageRepository,
	instances product.StageInstanceRepository,
	members product.ProductMemberRepository,
	emps organization.EmployeeRepository,
	activities support.ActivityRepository,
	notifs support.NotificationRepository,
) *Service {
	return &Service{
		db: db, products: products, pipes: pipes, stages: stages, instances: instances, members: members,
		emps: emps, activities: activities, notifs: notifs,
	}
}

type CreateProductInput struct {
	OwnerID        uuid.UUID
	Name           string
	Description    string
	Category       string
	ExecutionModel string

	// MVP Feature Planning additions — all optional.
	Code           string
	ProductType    string
	ManagerID      *uuid.UUID
	Priority       string
	Vision         string
	Goal           string
	SuccessMetrics string
	BusinessValue  string
	Visibility     string

	ActorID *uuid.UUID
}

func (s *Service) CreateProduct(ctx context.Context, companyID uuid.UUID, in CreateProductInput) (*product.Product, error) {
	var out *product.Product
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		if _, err := s.emps.FindByID(ctx, companyID, in.OwnerID); err != nil {
			return err
		}
		p, err := product.NewProduct(companyID, in.OwnerID, in.Name, in.Description, in.Category, in.ExecutionModel)
		if err != nil {
			return err
		}
		p.Code = strings.TrimSpace(in.Code)
		p.ProductType = strings.TrimSpace(in.ProductType)
		if in.ManagerID != nil && *in.ManagerID != uuid.Nil {
			if _, err := s.emps.FindByID(ctx, companyID, *in.ManagerID); err != nil {
				return err
			}
			p.ManagerID = in.ManagerID
		}
		p.Priority = strings.TrimSpace(in.Priority)
		p.Vision = strings.TrimSpace(in.Vision)
		p.Goal = strings.TrimSpace(in.Goal)
		p.SuccessMetrics = strings.TrimSpace(in.SuccessMetrics)
		p.BusinessValue = strings.TrimSpace(in.BusinessValue)
		if v := strings.TrimSpace(strings.ToUpper(in.Visibility)); v != "" {
			p.Visibility = v
		}
		if err := s.products.Create(ctx, p); err != nil {
			return err
		}
		act, err := support.NewActivity(companyID, "product", p.ID, "ProductCreated", in.ActorID, map[string]any{
			"name": p.Name, "execution_model": p.ExecutionModel,
		})
		if err != nil {
			return err
		}
		if err := s.activities.Append(ctx, act); err != nil {
			return err
		}
		out = p
		return nil
	})
	return out, err
}

func (s *Service) GetProduct(ctx context.Context, companyID, id uuid.UUID) (*product.Product, error) {
	return s.products.FindByID(ctx, companyID, id)
}

func (s *Service) ListProducts(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]product.Product, shared.PageMeta, error) {
	items, total, err := s.products.List(ctx, companyID, q)
	if err != nil {
		return nil, shared.PageMeta{}, err
	}
	return items, shared.NewPageMeta(q, total), nil
}

type UpdateProductInput struct {
	Name        *string
	Description *string
	Category    *string
	// ExecutionModel intentionally omitted — immutable

	// MVP Feature Planning additions — all optional.
	Code           *string
	ProductType    *string
	Priority       *string
	Vision         *string
	Goal           *string
	SuccessMetrics *string
	BusinessValue  *string
	Visibility     *string
}

func (s *Service) UpdateProduct(ctx context.Context, companyID, id uuid.UUID, in UpdateProductInput) (*product.Product, error) {
	p, err := s.products.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	if p.DeletedAt != nil {
		return nil, product.ErrProductDeleted
	}
	if p.Status == product.StatusArchived {
		return nil, product.ErrProductArchived
	}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, product.ErrProductNameRequired
		}
		p.Name = name
	}
	if in.Description != nil {
		p.Description = strings.TrimSpace(*in.Description)
	}
	if in.Category != nil {
		p.Category = strings.TrimSpace(*in.Category)
	}
	if in.Code != nil {
		p.Code = strings.TrimSpace(*in.Code)
	}
	if in.ProductType != nil {
		p.ProductType = strings.TrimSpace(*in.ProductType)
	}
	if in.Priority != nil {
		p.Priority = strings.TrimSpace(*in.Priority)
	}
	if in.Vision != nil {
		p.Vision = strings.TrimSpace(*in.Vision)
	}
	if in.Goal != nil {
		p.Goal = strings.TrimSpace(*in.Goal)
	}
	if in.SuccessMetrics != nil {
		p.SuccessMetrics = strings.TrimSpace(*in.SuccessMetrics)
	}
	if in.BusinessValue != nil {
		p.BusinessValue = strings.TrimSpace(*in.BusinessValue)
	}
	if in.Visibility != nil {
		v := strings.TrimSpace(strings.ToUpper(*in.Visibility))
		if v == "" {
			v = product.VisibilityOrganization
		}
		p.Visibility = v
	}
	if err := s.products.Update(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

func (s *Service) ChangeProductOwner(ctx context.Context, companyID, productID, ownerID uuid.UUID, actorID *uuid.UUID) (*product.Product, error) {
	var out *product.Product
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		if _, err := s.emps.FindByID(ctx, companyID, ownerID); err != nil {
			return err
		}
		p, err := s.products.FindByID(ctx, companyID, productID)
		if err != nil {
			return err
		}
		if err := p.ChangeOwner(ownerID); err != nil {
			return err
		}
		if err := s.products.Update(ctx, p); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "product", p.ID, "OwnerChanged", actorID, map[string]any{"owner_id": ownerID})
		_ = s.activities.Append(ctx, act)
		out = p
		return nil
	})
	return out, err
}

// ChangeManager assigns (or clears, when managerID is nil/uuid.Nil) the delivery
// manager for a product — distinct from the product owner (MVP addition).
func (s *Service) ChangeManager(ctx context.Context, companyID, productID uuid.UUID, managerID *uuid.UUID, actorID *uuid.UUID) (*product.Product, error) {
	var out *product.Product
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		mid := uuid.Nil
		if managerID != nil {
			mid = *managerID
		}
		if mid != uuid.Nil {
			if _, err := s.emps.FindByID(ctx, companyID, mid); err != nil {
				return err
			}
		}
		p, err := s.products.FindByID(ctx, companyID, productID)
		if err != nil {
			return err
		}
		if err := p.ChangeManager(mid); err != nil {
			return err
		}
		if err := s.products.Update(ctx, p); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "product", p.ID, "ManagerChanged", actorID, map[string]any{"manager_id": mid})
		_ = s.activities.Append(ctx, act)
		out = p
		return nil
	})
	return out, err
}

func (s *Service) ArchiveProduct(ctx context.Context, companyID, id uuid.UUID, actorID *uuid.UUID) (*product.Product, error) {
	var out *product.Product
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		p, err := s.products.FindByID(ctx, companyID, id)
		if err != nil {
			return err
		}
		if p.Status == product.StatusArchived {
			out = p // idempotent
			return nil
		}
		_ = p.Archive()
		if err := s.products.Update(ctx, p); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "product", p.ID, "ProductArchived", actorID, nil)
		_ = s.activities.Append(ctx, act)
		out = p
		return nil
	})
	return out, err
}

// HoldProduct pauses an in-flight product without terminating it (MVP addition).
func (s *Service) HoldProduct(ctx context.Context, companyID, id uuid.UUID, actorID *uuid.UUID) (*product.Product, error) {
	var out *product.Product
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		p, err := s.products.FindByID(ctx, companyID, id)
		if err != nil {
			return err
		}
		if p.DeletedAt != nil {
			return product.ErrProductDeleted
		}
		if err := p.Hold(); err != nil {
			return err
		}
		if err := s.products.Update(ctx, p); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "product", p.ID, "ProductOnHold", actorID, nil)
		_ = s.activities.Append(ctx, act)
		out = p
		return nil
	})
	return out, err
}

// ResumeProduct reactivates a product previously put ON_HOLD (MVP addition).
func (s *Service) ResumeProduct(ctx context.Context, companyID, id uuid.UUID, actorID *uuid.UUID) (*product.Product, error) {
	var out *product.Product
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		p, err := s.products.FindByID(ctx, companyID, id)
		if err != nil {
			return err
		}
		if err := p.Resume(); err != nil {
			return err
		}
		if err := s.products.Update(ctx, p); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "product", p.ID, "ProductResumed", actorID, nil)
		_ = s.activities.Append(ctx, act)
		out = p
		return nil
	})
	return out, err
}

// SoftDeleteProduct marks a product deleted without removing the row, so it can
// later be restored (MVP gap-fill; existing hard-delete semantics are untouched).
func (s *Service) SoftDeleteProduct(ctx context.Context, companyID, id uuid.UUID, actorID *uuid.UUID) (*product.Product, error) {
	var out *product.Product
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		p, err := s.products.FindByID(ctx, companyID, id)
		if err != nil {
			return err
		}
		if err := p.SoftDelete(); err != nil {
			return err
		}
		if err := s.products.Update(ctx, p); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "product", p.ID, "ProductSoftDeleted", actorID, nil)
		_ = s.activities.Append(ctx, act)
		out = p
		return nil
	})
	return out, err
}

// RestoreProduct clears a previous soft delete (MVP gap-fill).
func (s *Service) RestoreProduct(ctx context.Context, companyID, id uuid.UUID, actorID *uuid.UUID) (*product.Product, error) {
	var out *product.Product
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		p, err := s.products.FindByID(ctx, companyID, id)
		if err != nil {
			return err
		}
		if err := p.Restore(); err != nil {
			return err
		}
		if err := s.products.Update(ctx, p); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "product", p.ID, "ProductRestored", actorID, nil)
		_ = s.activities.Append(ctx, act)
		out = p
		return nil
	})
	return out, err
}

// PauseWorkflow pauses execution on a product's workflow. It is an alias over
// HoldProduct exposed under the execution/workflow vocabulary (MVP addition).
func (s *Service) PauseWorkflow(ctx context.Context, companyID, productID uuid.UUID, actorID *uuid.UUID) (*product.Product, error) {
	return s.HoldProduct(ctx, companyID, productID, actorID)
}

// ResumeWorkflow resumes a previously paused product workflow.
func (s *Service) ResumeWorkflow(ctx context.Context, companyID, productID uuid.UUID, actorID *uuid.UUID) (*product.Product, error) {
	return s.ResumeProduct(ctx, companyID, productID, actorID)
}

// CancelWorkflow terminates a product's execution permanently by archiving it.
// Unlike PauseWorkflow (ON_HOLD, resumable), a cancelled workflow is terminal.
func (s *Service) CancelWorkflow(ctx context.Context, companyID, productID uuid.UUID, actorID *uuid.UUID) (*product.Product, error) {
	p, err := s.ArchiveProduct(ctx, companyID, productID, actorID)
	if err != nil {
		return nil, err
	}
	act, _ := support.NewActivity(companyID, "product", productID, "WorkflowCancelled", actorID, nil)
	_ = s.activities.Append(ctx, act)
	return p, nil
}

// AddProductMemberInput adds a collaborator to a product beyond the single
// owner/manager (MVP addition).
type AddProductMemberInput struct {
	EmployeeID uuid.UUID
	Role       string
	ActorID    *uuid.UUID
}

func (s *Service) AddProductMember(ctx context.Context, companyID, productID uuid.UUID, in AddProductMemberInput) (*product.ProductMember, error) {
	var out *product.ProductMember
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		if _, err := s.products.FindByID(ctx, companyID, productID); err != nil {
			return err
		}
		if _, err := s.emps.FindByID(ctx, companyID, in.EmployeeID); err != nil {
			return err
		}
		m, err := product.NewProductMember(companyID, productID, in.EmployeeID, in.Role)
		if err != nil {
			return err
		}
		if err := s.members.Add(ctx, m); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "product", productID, "MemberAdded", in.ActorID, map[string]any{
			"employee_id": in.EmployeeID, "role": m.Role,
		})
		_ = s.activities.Append(ctx, act)
		out = m
		return nil
	})
	return out, err
}

func (s *Service) RemoveProductMember(ctx context.Context, companyID, productID, employeeID uuid.UUID, actorID *uuid.UUID) error {
	return s.db.WithinTx(ctx, func(ctx context.Context) error {
		if _, err := s.products.FindByID(ctx, companyID, productID); err != nil {
			return err
		}
		if err := s.members.Remove(ctx, companyID, productID, employeeID); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "product", productID, "MemberRemoved", actorID, map[string]any{"employee_id": employeeID})
		_ = s.activities.Append(ctx, act)
		return nil
	})
}

func (s *Service) ListProductMembers(ctx context.Context, companyID, productID uuid.UUID) ([]product.ProductMember, error) {
	if _, err := s.products.FindByID(ctx, companyID, productID); err != nil {
		return nil, err
	}
	return s.members.ListByProduct(ctx, companyID, productID)
}

type CreatePipelineInput struct {
	ProductID   uuid.UUID
	Name        string
	Description string
	Stages      []CreateStageInput
	ActorID     *uuid.UUID
}

type CreateStageInput struct {
	Name          string
	Description   string
	Order         int
	EntryCriteria string
	ExitCriteria  string
	DepartmentID  *uuid.UUID
}

func (s *Service) CreatePipeline(ctx context.Context, companyID uuid.UUID, in CreatePipelineInput) (*product.Pipeline, []product.Stage, error) {
	var outPL *product.Pipeline
	var outStages []product.Stage
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		p, err := s.products.FindByID(ctx, companyID, in.ProductID)
		if err != nil {
			return err
		}
		if _, err := s.pipes.FindByProductID(ctx, companyID, in.ProductID); err == nil {
			return product.ErrPipelineOwnerInvalid
		} else if !errors.Is(err, product.ErrPipelineNotFound) {
			return err
		}
		pl, err := product.NewPipeline(companyID, in.ProductID, in.Name, in.Description)
		if err != nil {
			return err
		}
		if err := s.pipes.Create(ctx, pl); err != nil {
			return err
		}
		stages := make([]product.Stage, 0, len(in.Stages))
		for i, stIn := range in.Stages {
			order := stIn.Order
			if order == 0 && len(in.Stages) > 0 {
				order = i
			}
			st, err := product.NewStage(pl.ID, stIn.Name, stIn.Description, order, stIn.EntryCriteria, stIn.ExitCriteria, stIn.DepartmentID)
			if err != nil {
				return err
			}
			if err := s.stages.Create(ctx, st); err != nil {
				return err
			}
			stages = append(stages, *st)
		}
		if err := p.AssignPipeline(pl.ID); err != nil {
			return err
		}
		if err := s.products.Update(ctx, p); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "pipeline", pl.ID, "PipelineCreated", in.ActorID, map[string]any{"product_id": in.ProductID})
		_ = s.activities.Append(ctx, act)
		outPL = pl
		outStages = stages
		return nil
	})
	return outPL, outStages, err
}

func (s *Service) GetPipeline(ctx context.Context, companyID, id uuid.UUID) (*product.Pipeline, []product.Stage, error) {
	pl, err := s.pipes.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, nil, err
	}
	stages, err := s.stages.ListByPipeline(ctx, pl.ID)
	if err != nil {
		return nil, nil, err
	}
	return pl, stages, nil
}

type UpdatePipelineInput struct {
	Name        *string
	Description *string
	Status      *string
}

// UpdatePipeline edits name/description and — via Status — transitions the
// pipeline between ACTIVE/PAUSED/ARCHIVED (MVP addition).
func (s *Service) UpdatePipeline(ctx context.Context, companyID, id uuid.UUID, in UpdatePipelineInput) (*product.Pipeline, error) {
	var out *product.Pipeline
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		pl, err := s.pipes.FindByID(ctx, companyID, id)
		if err != nil {
			return err
		}
		if in.Name != nil || in.Description != nil {
			name := pl.Name
			if in.Name != nil {
				name = *in.Name
			}
			desc := pl.Description
			if in.Description != nil {
				desc = *in.Description
			}
			if err := pl.Rename(name, desc); err != nil {
				return err
			}
		}
		if in.Status != nil {
			switch strings.ToUpper(strings.TrimSpace(*in.Status)) {
			case product.PipelineStatusActive:
				if err := pl.Resume(); err != nil {
					return err
				}
			case product.PipelineStatusPaused:
				if err := pl.Pause(); err != nil {
					return err
				}
			case product.PipelineStatusArchived:
				pl.Archive()
			default:
				return shared.New("INVALID_PIPELINE_STATUS", "Invalid pipeline status", 400)
			}
		}
		if err := s.pipes.Update(ctx, pl); err != nil {
			return err
		}
		out = pl
		return nil
	})
	return out, err
}

// ArchivePipeline retires a pipeline (kept distinct from Delete, which still
// requires the product to be inactive).
func (s *Service) ArchivePipeline(ctx context.Context, companyID, id uuid.UUID, actorID *uuid.UUID) (*product.Pipeline, error) {
	var out *product.Pipeline
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		pl, err := s.pipes.FindByID(ctx, companyID, id)
		if err != nil {
			return err
		}
		pl.Archive()
		if err := s.pipes.Update(ctx, pl); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "pipeline", pl.ID, "PipelineArchived", actorID, nil)
		_ = s.activities.Append(ctx, act)
		out = pl
		return nil
	})
	return out, err
}

// RestorePipeline un-archives a pipeline back to ACTIVE (MVP addition).
func (s *Service) RestorePipeline(ctx context.Context, companyID, id uuid.UUID, actorID *uuid.UUID) (*product.Pipeline, error) {
	var out *product.Pipeline
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		pl, err := s.pipes.FindByID(ctx, companyID, id)
		if err != nil {
			return err
		}
		if err := pl.Restore(); err != nil {
			return err
		}
		if err := s.pipes.Update(ctx, pl); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "pipeline", pl.ID, "PipelineRestored", actorID, nil)
		_ = s.activities.Append(ctx, act)
		out = pl
		return nil
	})
	return out, err
}

func (s *Service) DeletePipeline(ctx context.Context, companyID, id uuid.UUID) error {
	return s.db.WithinTx(ctx, func(ctx context.Context) error {
		pl, err := s.pipes.FindByID(ctx, companyID, id)
		if err != nil {
			return err
		}
		p, err := s.products.FindByID(ctx, companyID, pl.ProductID)
		if err != nil {
			return err
		}
		if p.IsActive() {
			return product.ErrPipelineInUse
		}
		return s.pipes.Delete(ctx, companyID, id)
	})
}

func (s *Service) AddStage(ctx context.Context, companyID, pipelineID uuid.UUID, in CreateStageInput) (*product.Stage, error) {
	if _, err := s.pipes.FindByID(ctx, companyID, pipelineID); err != nil {
		return nil, err
	}
	st, err := product.NewStage(pipelineID, in.Name, in.Description, in.Order, in.EntryCriteria, in.ExitCriteria, in.DepartmentID)
	if err != nil {
		return nil, err
	}
	if err := s.stages.Create(ctx, st); err != nil {
		return nil, err
	}
	return st, nil
}

type UpdateStageInput struct {
	Name          *string
	Description   *string
	EntryCriteria *string
	ExitCriteria  *string
	Color         *string
}

// UpdateStage edits a stage's descriptive fields, criteria and visual color
// (MVP addition; stage order changes go through ReorderStages).
func (s *Service) UpdateStage(ctx context.Context, companyID, stageID uuid.UUID, in UpdateStageInput) (*product.Stage, error) {
	st, err := s.stages.FindByID(ctx, stageID)
	if err != nil {
		return nil, err
	}
	if _, err := s.pipes.FindByID(ctx, companyID, st.PipelineID); err != nil {
		return nil, err
	}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, product.ErrStageNameRequired
		}
		st.Name = name
	}
	if in.Description != nil {
		st.Description = strings.TrimSpace(*in.Description)
	}
	if in.EntryCriteria != nil {
		st.EntryCriteria = strings.TrimSpace(*in.EntryCriteria)
	}
	if in.ExitCriteria != nil {
		st.ExitCriteria = strings.TrimSpace(*in.ExitCriteria)
	}
	if in.Color != nil {
		color := strings.TrimSpace(*in.Color)
		if color == "" {
			color = product.DefaultStageColor
		}
		st.Color = color
	}
	if err := s.stages.Update(ctx, st); err != nil {
		return nil, err
	}
	return st, nil
}

// ReorderStages persists a new stage ordering for a pipeline. orderedIDs must
// contain every stage belonging to the pipeline exactly once (MVP addition).
func (s *Service) ReorderStages(ctx context.Context, companyID, pipelineID uuid.UUID, orderedIDs []uuid.UUID) ([]product.Stage, error) {
	if _, err := s.pipes.FindByID(ctx, companyID, pipelineID); err != nil {
		return nil, err
	}
	existing, err := s.stages.ListByPipeline(ctx, pipelineID)
	if err != nil {
		return nil, err
	}
	if len(orderedIDs) != len(existing) {
		return nil, shared.New("INVALID_STAGE_ORDER", "Reorder list must include all stages exactly once", 400)
	}
	valid := make(map[uuid.UUID]bool, len(existing))
	for _, st := range existing {
		valid[st.ID] = true
	}
	seen := make(map[uuid.UUID]bool, len(orderedIDs))
	for _, id := range orderedIDs {
		if !valid[id] || seen[id] {
			return nil, shared.New("INVALID_STAGE_ORDER", "Reorder list must include all stages exactly once", 400)
		}
		seen[id] = true
	}
	if err := s.stages.Reorder(ctx, pipelineID, orderedIDs); err != nil {
		return nil, err
	}
	return s.stages.ListByPipeline(ctx, pipelineID)
}

func (s *Service) DeleteStage(ctx context.Context, companyID, stageID uuid.UUID) error {
	return s.db.WithinTx(ctx, func(ctx context.Context) error {
		st, err := s.stages.FindByID(ctx, stageID)
		if err != nil {
			return err
		}
		if _, err := s.pipes.FindByID(ctx, companyID, st.PipelineID); err != nil {
			return err
		}
		used, err := s.stages.HasInstances(ctx, stageID)
		if err != nil {
			return err
		}
		if used {
			return product.ErrStageInUse
		}
		return s.stages.Delete(ctx, stageID)
	})
}

// StartExecution activates product and opens first stage instance (transactional).
func (s *Service) StartExecution(ctx context.Context, companyID, productID uuid.UUID, actorID *uuid.UUID) (*product.StageInstance, error) {
	var out *product.StageInstance
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		p, err := s.products.FindByID(ctx, companyID, productID)
		if err != nil {
			return err
		}
		if p.PipelineID == nil {
			return product.ErrPipelineRequired
		}
		if _, err := s.instances.FindActiveByProduct(ctx, companyID, productID); err == nil {
			return product.ErrMultipleActiveStage
		} else if !errors.Is(err, product.ErrStageInstanceNotFound) {
			return err
		}
		stages, err := s.stages.ListByPipeline(ctx, *p.PipelineID)
		if err != nil {
			return err
		}
		if len(stages) == 0 {
			return product.ErrNoNextStage
		}
		first := stages[0]
		si := product.NewStageInstance(companyID, productID, first.ID, first.DepartmentID)
		if err := s.instances.Create(ctx, si); err != nil {
			return err
		}
		if err := p.MarkActive(); err != nil {
			return err
		}
		if err := s.products.Update(ctx, p); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "product", productID, "ExecutionStarted", actorID, map[string]any{
			"stage_id": first.ID, "stage_instance_id": si.ID,
		})
		_ = s.activities.Append(ctx, act)
		if first.DepartmentID != nil {
			n := support.NewNotification(companyID, *first.DepartmentID, "DEPARTMENT_TRANSFER",
				"Product entered stage", "Responsibility transferred for product execution start")
			// receiver should be employee; use product owner as fallback notification target
			n.ReceiverID = p.OwnerID
			_ = s.notifs.Create(ctx, n)
		}
		out = si
		return nil
	})
	return out, err
}

type CompleteStageInput struct {
	ExitCriteriaMet bool
	ActorID         *uuid.UUID
}

func (s *Service) CompleteCurrentStage(ctx context.Context, companyID, productID uuid.UUID, in CompleteStageInput) (*product.StageInstance, error) {
	var out *product.StageInstance
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		si, err := s.instances.FindActiveByProduct(ctx, companyID, productID)
		if err != nil {
			if errors.Is(err, product.ErrStageInstanceNotFound) {
				return product.ErrNoActiveStage
			}
			return err
		}
		if err := si.Complete(in.ExitCriteriaMet); err != nil {
			return err
		}
		if err := s.instances.Update(ctx, si); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "stage_instance", si.ID, "StageCompleted", in.ActorID, nil)
		_ = s.activities.Append(ctx, act)
		out = si
		return nil
	})
	return out, err
}

type RejectStageInput struct {
	Reason  string
	ActorID *uuid.UUID
}

func (s *Service) RejectCurrentStage(ctx context.Context, companyID, productID uuid.UUID, in RejectStageInput) (*product.StageInstance, error) {
	var out *product.StageInstance
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		si, err := s.instances.FindActiveByProduct(ctx, companyID, productID)
		if err != nil {
			if errors.Is(err, product.ErrStageInstanceNotFound) {
				return product.ErrNoActiveStage
			}
			return err
		}
		if err := si.Reject(in.Reason); err != nil {
			return err
		}
		if err := s.instances.Update(ctx, si); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "stage_instance", si.ID, "StageRejected", in.ActorID, map[string]any{"reason": in.Reason})
		_ = s.activities.Append(ctx, act)
		p, _ := s.products.FindByID(ctx, companyID, productID)
		if p != nil {
			n := support.NewNotification(companyID, p.OwnerID, "STAGE_REJECTED", "Stage rejected", in.Reason)
			_ = s.notifs.Create(ctx, n)
		}
		out = si
		return nil
	})
	return out, err
}

// MoveToNextStage: complete current (with exit criteria), open next, transfer dept — atomic (PDF §2.10).
func (s *Service) MoveToNextStage(ctx context.Context, companyID, productID uuid.UUID, exitCriteriaMet bool, actorID *uuid.UUID) (*product.StageInstance, error) {
	var out *product.StageInstance
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		p, err := s.products.FindByID(ctx, companyID, productID)
		if err != nil {
			return err
		}
		if p.PipelineID == nil {
			return product.ErrPipelineRequired
		}
		current, err := s.instances.FindActiveByProduct(ctx, companyID, productID)
		if err != nil {
			if errors.Is(err, product.ErrStageInstanceNotFound) {
				return product.ErrNoActiveStage
			}
			return err
		}
		if err := current.Complete(exitCriteriaMet); err != nil {
			return err
		}
		if err := s.instances.Update(ctx, current); err != nil {
			return err
		}

		stages, err := s.stages.ListByPipeline(ctx, *p.PipelineID)
		if err != nil {
			return err
		}
		var next *product.Stage
		for i := range stages {
			if stages[i].ID == current.StageID && i+1 < len(stages) {
				next = &stages[i+1]
				break
			}
		}
		if next == nil {
			_ = p.Complete()
			if err := s.products.Update(ctx, p); err != nil {
				return err
			}
			act, _ := support.NewActivity(companyID, "product", productID, "ProductCompleted", actorID, nil)
			_ = s.activities.Append(ctx, act)
			out = current
			return nil
		}

		si := product.NewStageInstance(companyID, productID, next.ID, next.DepartmentID)
		if err := s.instances.Create(ctx, si); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "product", productID, "DepartmentTransferred", actorID, map[string]any{
			"from_stage": current.StageID, "to_stage": next.ID, "department_id": next.DepartmentID,
		})
		_ = s.activities.Append(ctx, act)
		n := support.NewNotification(companyID, p.OwnerID, "DEPARTMENT_TRANSFER",
			"Product moved to next stage", "Responsibility transferred to the next department")
		_ = s.notifs.Create(ctx, n)
		out = si
		return nil
	})
	return out, err
}

// MoveToPreviousStage rewinds execution to the stage preceding the currently
// active one — the mirror image of MoveToNextStage (MVP addition).
func (s *Service) MoveToPreviousStage(ctx context.Context, companyID, productID uuid.UUID, reason string, actorID *uuid.UUID) (*product.StageInstance, error) {
	var out *product.StageInstance
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		p, err := s.products.FindByID(ctx, companyID, productID)
		if err != nil {
			return err
		}
		if p.PipelineID == nil {
			return product.ErrPipelineRequired
		}
		current, err := s.instances.FindActiveByProduct(ctx, companyID, productID)
		if err != nil {
			if errors.Is(err, product.ErrStageInstanceNotFound) {
				return product.ErrNoActiveStage
			}
			return err
		}
		stages, err := s.stages.ListByPipeline(ctx, *p.PipelineID)
		if err != nil {
			return err
		}
		var prev *product.Stage
		for i := range stages {
			if stages[i].ID == current.StageID && i > 0 {
				prev = &stages[i-1]
				break
			}
		}
		if prev == nil {
			return product.ErrNoPreviousStage
		}
		reason = strings.TrimSpace(reason)
		if reason == "" {
			reason = "Moved back to previous stage"
		}
		if err := current.Reject(reason); err != nil {
			return err
		}
		if err := s.instances.Update(ctx, current); err != nil {
			return err
		}

		si := product.NewStageInstance(companyID, productID, prev.ID, prev.DepartmentID)
		if err := s.instances.Create(ctx, si); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "product", productID, "MovedToPreviousStage", actorID, map[string]any{
			"from_stage": current.StageID, "to_stage": prev.ID, "reason": reason,
		})
		_ = s.activities.Append(ctx, act)
		out = si
		return nil
	})
	return out, err
}

// ReopenStage reactivates the most recently closed (COMPLETED or REJECTED)
// stage instance for a product, provided no instance is currently active
// (MVP addition — keeps the invariant "at most one active stage" intact).
func (s *Service) ReopenStage(ctx context.Context, companyID, productID uuid.UUID, actorID *uuid.UUID) (*product.StageInstance, error) {
	var out *product.StageInstance
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		if _, err := s.instances.FindActiveByProduct(ctx, companyID, productID); err == nil {
			return product.ErrMultipleActiveStage
		} else if !errors.Is(err, product.ErrStageInstanceNotFound) {
			return err
		}
		history, err := s.instances.ListByProduct(ctx, companyID, productID)
		if err != nil {
			return err
		}
		if len(history) == 0 {
			return product.ErrStageInstanceNotFound
		}
		last := history[len(history)-1]
		if err := last.Reopen(); err != nil {
			return err
		}
		if err := s.instances.Update(ctx, &last); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "stage_instance", last.ID, "StageReopened", actorID, nil)
		_ = s.activities.Append(ctx, act)
		out = &last
		return nil
	})
	return out, err
}

func (s *Service) ListStageInstances(ctx context.Context, companyID, productID uuid.UUID) ([]product.StageInstance, error) {
	if _, err := s.products.FindByID(ctx, companyID, productID); err != nil {
		return nil, err
	}
	return s.instances.ListByProduct(ctx, companyID, productID)
}
