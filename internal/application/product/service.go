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
	db       *postgres.DB
	products product.ProductRepository
	pipes    product.PipelineRepository
	stages   product.StageRepository
	instances product.StageInstanceRepository
	emps     organization.EmployeeRepository
	activities support.ActivityRepository
	notifs   support.NotificationRepository
}

func NewService(
	db *postgres.DB,
	products product.ProductRepository,
	pipes product.PipelineRepository,
	stages product.StageRepository,
	instances product.StageInstanceRepository,
	emps organization.EmployeeRepository,
	activities support.ActivityRepository,
	notifs support.NotificationRepository,
) *Service {
	return &Service{
		db: db, products: products, pipes: pipes, stages: stages, instances: instances,
		emps: emps, activities: activities, notifs: notifs,
	}
}

type CreateProductInput struct {
	OwnerID        uuid.UUID
	Name           string
	Description    string
	Category       string
	ExecutionModel string
	ActorID        *uuid.UUID
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
}

func (s *Service) UpdateProduct(ctx context.Context, companyID, id uuid.UUID, in UpdateProductInput) (*product.Product, error) {
	p, err := s.products.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
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

func (s *Service) ListStageInstances(ctx context.Context, companyID, productID uuid.UUID) ([]product.StageInstance, error) {
	if _, err := s.products.FindByID(ctx, companyID, productID); err != nil {
		return nil, err
	}
	return s.instances.ListByProduct(ctx, companyID, productID)
}
