package planningapp

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/planning"
	"PMAS/internal/domain/product"
	"PMAS/internal/domain/shared"
	"PMAS/internal/domain/support"
	"PMAS/internal/infrastructure/postgres"
)

type Service struct {
	db       *postgres.DB
	projects planning.ProjectRepository
	features planning.FeatureRepository
	tasks    planning.TaskRepository
	products product.ProductRepository
	activities support.ActivityRepository
}

func NewService(
	db *postgres.DB,
	projects planning.ProjectRepository,
	features planning.FeatureRepository,
	tasks planning.TaskRepository,
	products product.ProductRepository,
	activities support.ActivityRepository,
) *Service {
	return &Service{db: db, projects: projects, features: features, tasks: tasks, products: products, activities: activities}
}

type CreateProjectInput struct {
	ProductID   uuid.UUID
	Name        string
	Description string
	ActorID     *uuid.UUID
}

func (s *Service) CreateProject(ctx context.Context, companyID uuid.UUID, in CreateProjectInput) (*planning.Project, error) {
	var out *planning.Project
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		if _, err := s.products.FindByID(ctx, companyID, in.ProductID); err != nil {
			return err
		}
		p, err := planning.NewProject(companyID, in.ProductID, in.Name, in.Description)
		if err != nil {
			return err
		}
		if err := s.projects.Create(ctx, p); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "project", p.ID, "ProjectCreated", in.ActorID, nil)
		_ = s.activities.Append(ctx, act)
		out = p
		return nil
	})
	return out, err
}

func (s *Service) GetProject(ctx context.Context, companyID, id uuid.UUID) (*planning.Project, error) {
	return s.projects.FindByID(ctx, companyID, id)
}

func (s *Service) ListProjects(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]planning.Project, shared.PageMeta, error) {
	items, total, err := s.projects.List(ctx, companyID, q)
	if err != nil {
		return nil, shared.PageMeta{}, err
	}
	return items, shared.NewPageMeta(q, total), nil
}

func (s *Service) ListProjectsByProduct(ctx context.Context, companyID, productID uuid.UUID, q shared.PageQuery) ([]planning.Project, shared.PageMeta, error) {
	items, total, err := s.projects.ListByProduct(ctx, companyID, productID, q)
	if err != nil {
		return nil, shared.PageMeta{}, err
	}
	return items, shared.NewPageMeta(q, total), nil
}

func (s *Service) ArchiveProject(ctx context.Context, companyID, id uuid.UUID) (*planning.Project, error) {
	p, err := s.projects.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	p.Archive()
	if err := s.projects.Update(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

type CreateFeatureInput struct {
	ProjectID uuid.UUID
	Title     string
	Priority  string
	ActorID   *uuid.UUID
}

func (s *Service) CreateFeature(ctx context.Context, companyID uuid.UUID, in CreateFeatureInput) (*planning.Feature, error) {
	var out *planning.Feature
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		proj, err := s.projects.FindByID(ctx, companyID, in.ProjectID)
		if err != nil {
			return err
		}
		f, err := planning.NewFeature(companyID, proj.ProductID, proj.ID, in.Title, in.Priority)
		if err != nil {
			return err
		}
		if err := s.features.Create(ctx, f); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "feature", f.ID, "FeatureCreated", in.ActorID, nil)
		_ = s.activities.Append(ctx, act)
		out = f
		return nil
	})
	return out, err
}

func (s *Service) GetFeature(ctx context.Context, companyID, id uuid.UUID) (*planning.Feature, error) {
	return s.features.FindByID(ctx, companyID, id)
}

func (s *Service) ListFeaturesByProject(ctx context.Context, companyID, projectID uuid.UUID, q shared.PageQuery) ([]planning.Feature, shared.PageMeta, error) {
	items, total, err := s.features.ListByProject(ctx, companyID, projectID, q)
	if err != nil {
		return nil, shared.PageMeta{}, err
	}
	return items, shared.NewPageMeta(q, total), nil
}

func (s *Service) ChangeFeatureStatus(ctx context.Context, companyID, id uuid.UUID, status string) (*planning.Feature, error) {
	f, err := s.features.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	if err := f.ChangeStatus(status); err != nil {
		return nil, err
	}
	if err := s.features.Update(ctx, f); err != nil {
		return nil, err
	}
	return f, nil
}

type CreateTaskInput struct {
	FeatureID  uuid.UUID
	Title      string
	Priority   string
	AssigneeID *uuid.UUID
	DueDate    *time.Time
	ActorID    *uuid.UUID
}

func (s *Service) CreateTask(ctx context.Context, companyID uuid.UUID, in CreateTaskInput) (*planning.Task, error) {
	var out *planning.Task
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		if _, err := s.features.FindByID(ctx, companyID, in.FeatureID); err != nil {
			return err
		}
		t, err := planning.NewTask(companyID, in.FeatureID, in.Title, in.Priority, in.AssigneeID, in.DueDate)
		if err != nil {
			return err
		}
		if err := s.tasks.Create(ctx, t); err != nil {
			return err
		}
		act, _ := support.NewActivity(companyID, "task", t.ID, "TaskCreated", in.ActorID, nil)
		_ = s.activities.Append(ctx, act)
		out = t
		return nil
	})
	return out, err
}

func (s *Service) GetTask(ctx context.Context, companyID, id uuid.UUID) (*planning.Task, error) {
	return s.tasks.FindByID(ctx, companyID, id)
}

func (s *Service) ListTasksByFeature(ctx context.Context, companyID, featureID uuid.UUID, q shared.PageQuery) ([]planning.Task, shared.PageMeta, error) {
	items, total, err := s.tasks.ListByFeature(ctx, companyID, featureID, q)
	if err != nil {
		return nil, shared.PageMeta{}, err
	}
	return items, shared.NewPageMeta(q, total), nil
}

func (s *Service) AssignTask(ctx context.Context, companyID, taskID uuid.UUID, assigneeID *uuid.UUID) (*planning.Task, error) {
	t, err := s.tasks.FindByID(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	t.Assign(assigneeID)
	if err := s.tasks.Update(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

func (s *Service) CompleteTask(ctx context.Context, companyID, taskID uuid.UUID) (*planning.Task, error) {
	t, err := s.tasks.FindByID(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	t.Complete()
	if err := s.tasks.Update(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

func (s *Service) RejectTask(ctx context.Context, companyID, taskID uuid.UUID) (*planning.Task, error) {
	t, err := s.tasks.FindByID(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	t.Reject()
	if err := s.tasks.Update(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

func (s *Service) ArchiveTask(ctx context.Context, companyID, taskID uuid.UUID) (*planning.Task, error) {
	t, err := s.tasks.FindByID(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	t.Archive()
	if err := s.tasks.Update(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

func (s *Service) UpdateTask(ctx context.Context, companyID, taskID uuid.UUID, title, priority, status string, dueDate *time.Time) (*planning.Task, error) {
	t, err := s.tasks.FindByID(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	if title = strings.TrimSpace(title); title != "" {
		t.Title = title
	}
	if priority = strings.TrimSpace(strings.ToUpper(priority)); priority != "" {
		t.Priority = priority
	}
	if status != "" {
		if err := t.ChangeStatus(status); err != nil {
			return nil, err
		}
	}
	if dueDate != nil {
		t.SetDueDate(dueDate)
	}
	if err := s.tasks.Update(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

func (s *Service) SetTaskDependencies(ctx context.Context, companyID, taskID uuid.UUID, dependsOn []uuid.UUID) (*planning.Task, error) {
	t, err := s.tasks.FindByID(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	repo, ok := s.tasks.(interface {
		SetDependencies(ctx context.Context, companyID, taskID uuid.UUID, dependsOn []uuid.UUID) error
		ListDependencies(ctx context.Context, companyID, taskID uuid.UUID) ([]uuid.UUID, error)
	})
	if !ok {
		return nil, shared.New("DEPENDENCY_UNSUPPORTED", "Task dependencies unavailable", 500)
	}
	if err := repo.SetDependencies(ctx, companyID, taskID, dependsOn); err != nil {
		return nil, err
	}
	deps, _ := repo.ListDependencies(ctx, companyID, taskID)
	t.DependsOnIDs = deps
	return t, nil
}
