package planningapp

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/organization"
	"PMAS/internal/domain/planning"
	"PMAS/internal/domain/product"
	"PMAS/internal/domain/shared"
	"PMAS/internal/domain/support"
	"PMAS/internal/infrastructure/postgres"
)

// Notification types raised by the planning service (MVP addition).
const (
	NotifTypeAssignment  = "ASSIGNMENT"
	NotifTypeStatusChange = "STATUS_CHANGE"
)

type Service struct {
	db             *postgres.DB
	projects       planning.ProjectRepository
	features       planning.FeatureRepository
	tasks          planning.TaskRepository
	products       product.ProductRepository
	activities     support.ActivityRepository
	notifications  support.NotificationRepository
	checklists     planning.ChecklistRepository
	featureDeps    planning.FeatureDependencyRepository
	projectMembers planning.ProjectMemberRepository
	featureMembers planning.FeatureMemberRepository
	employees      organization.EmployeeRepository
}

func NewService(
	db *postgres.DB,
	projects planning.ProjectRepository,
	features planning.FeatureRepository,
	tasks planning.TaskRepository,
	products product.ProductRepository,
	activities support.ActivityRepository,
	notifications support.NotificationRepository,
	checklists planning.ChecklistRepository,
	featureDeps planning.FeatureDependencyRepository,
	projectMembers planning.ProjectMemberRepository,
	featureMembers planning.FeatureMemberRepository,
	employees organization.EmployeeRepository,
) *Service {
	return &Service{
		db: db, projects: projects, features: features, tasks: tasks, products: products,
		activities: activities, notifications: notifications, checklists: checklists,
		featureDeps: featureDeps, projectMembers: projectMembers, featureMembers: featureMembers,
		employees: employees,
	}
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

type CreateProjectInput struct {
	ProductID             uuid.UUID
	Name                  string
	Description           string
	Code                  string
	Goal                  string
	Priority              string
	Status                string
	OwnerID               *uuid.UUID
	ManagerID             *uuid.UUID
	StartDate             *time.Time
	TargetEndDate         *time.Time
	EstimatedDurationDays *int
	ActorID               *uuid.UUID
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
		p.CreatedBy = in.ActorID
		if c := strings.TrimSpace(in.Code); c != "" {
			p.Code = c
		}
		if g := strings.TrimSpace(in.Goal); g != "" {
			p.Goal = g
		}
		if pr := strings.TrimSpace(in.Priority); pr != "" {
			p.Priority = strings.ToUpper(pr)
		}
		if st := strings.TrimSpace(in.Status); st != "" {
			if err := p.ChangeStatus(st); err != nil {
				return err
			}
		}
		if in.OwnerID != nil && *in.OwnerID != uuid.Nil {
			p.OwnerID = in.OwnerID
		}
		if in.ManagerID != nil && *in.ManagerID != uuid.Nil {
			p.ManagerID = in.ManagerID
		}
		if in.StartDate != nil {
			p.StartDate = in.StartDate
		}
		if in.TargetEndDate != nil {
			p.TargetEndDate = in.TargetEndDate
		}
		if in.EstimatedDurationDays != nil {
			p.EstimatedDurationDays = in.EstimatedDurationDays
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

func (s *Service) ListProjectsByOwner(ctx context.Context, companyID, ownerID uuid.UUID, q shared.PageQuery) ([]planning.Project, shared.PageMeta, error) {
	items, total, err := s.projects.ListByOwner(ctx, companyID, ownerID, q)
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

// UpdateProjectInput carries every mutable project field (MVP addition — all optional).
type UpdateProjectInput struct {
	Name                  *string
	Description           *string
	Code                  *string
	Goal                  *string
	Priority              *string
	Status                *string
	OwnerID               *uuid.UUID
	ManagerID             *uuid.UUID
	StartDate             *time.Time
	TargetEndDate         *time.Time
	EstimatedDurationDays *int
	UpdatedBy             *uuid.UUID
}

func (s *Service) UpdateProject(ctx context.Context, companyID, id uuid.UUID, in UpdateProjectInput) (*planning.Project, error) {
	p, err := s.projects.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	if p.IsDeleted() {
		return nil, planning.ErrProjectDeleted
	}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, planning.ErrProjectNameRequired
		}
		p.Name = name
	}
	if in.Description != nil {
		p.Description = strings.TrimSpace(*in.Description)
	}
	if in.Code != nil {
		p.Code = strings.TrimSpace(*in.Code)
	}
	if in.Goal != nil {
		p.Goal = strings.TrimSpace(*in.Goal)
	}
	if in.Priority != nil {
		p.Priority = strings.ToUpper(strings.TrimSpace(*in.Priority))
	}
	if in.Status != nil && strings.TrimSpace(*in.Status) != "" {
		if err := p.ChangeStatus(*in.Status); err != nil {
			return nil, err
		}
	}
	if in.OwnerID != nil {
		p.OwnerID = in.OwnerID
	}
	if in.ManagerID != nil {
		p.ManagerID = in.ManagerID
	}
	if in.StartDate != nil {
		p.StartDate = in.StartDate
	}
	if in.TargetEndDate != nil {
		p.TargetEndDate = in.TargetEndDate
	}
	if in.EstimatedDurationDays != nil {
		p.EstimatedDurationDays = in.EstimatedDurationDays
	}
	if in.UpdatedBy != nil {
		p.UpdatedBy = in.UpdatedBy
	}
	p.UpdatedAt = time.Now().UTC()
	if err := s.projects.Update(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

func (s *Service) SoftDeleteProject(ctx context.Context, companyID, id uuid.UUID, actorID *uuid.UUID) (*planning.Project, error) {
	p, err := s.projects.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	if p.IsDeleted() {
		return p, nil
	}
	p.SoftDelete(actorID)
	if err := s.projects.Update(ctx, p); err != nil {
		return nil, err
	}
	act, _ := support.NewActivity(companyID, "project", p.ID, "ProjectSoftDeleted", actorID, nil)
	_ = s.activities.Append(ctx, act)
	return p, nil
}

func (s *Service) RestoreProject(ctx context.Context, companyID, id uuid.UUID) (*planning.Project, error) {
	p, err := s.projects.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	p.Restore()
	if err := s.projects.Update(ctx, p); err != nil {
		return nil, err
	}
	act, _ := support.NewActivity(companyID, "project", p.ID, "ProjectRestored", nil, nil)
	_ = s.activities.Append(ctx, act)
	return p, nil
}

// ---------------------------------------------------------------------------
// Project members
// ---------------------------------------------------------------------------

func (s *Service) AddProjectMember(ctx context.Context, companyID, projectID, employeeID uuid.UUID, role string) (*planning.ProjectMember, error) {
	if _, err := s.projects.FindByID(ctx, companyID, projectID); err != nil {
		return nil, err
	}
	if _, err := s.employees.FindByID(ctx, companyID, employeeID); err != nil {
		return nil, err
	}
	m, err := planning.NewProjectMember(companyID, projectID, employeeID, role)
	if err != nil {
		return nil, err
	}
	if err := s.projectMembers.Add(ctx, m); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *Service) RemoveProjectMember(ctx context.Context, companyID, projectID, employeeID uuid.UUID) error {
	return s.projectMembers.Remove(ctx, companyID, projectID, employeeID)
}

func (s *Service) ListProjectMembers(ctx context.Context, companyID, projectID uuid.UUID) ([]planning.ProjectMember, error) {
	return s.projectMembers.ListByProject(ctx, companyID, projectID)
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

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
		f.CreatedBy = in.ActorID
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

func (s *Service) ListFeaturesByOwner(ctx context.Context, companyID, ownerID uuid.UUID, q shared.PageQuery) ([]planning.Feature, shared.PageMeta, error) {
	items, total, err := s.features.ListByOwner(ctx, companyID, ownerID, q)
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
	act, _ := support.NewActivity(companyID, "feature", f.ID, "FeatureStatusChanged", nil, map[string]any{"status": f.Status})
	_ = s.activities.Append(ctx, act)
	if f.OwnerID != nil {
		n := support.NewNotification(companyID, *f.OwnerID, NotifTypeStatusChange, "Feature status changed", f.Title+" is now "+f.Status)
		_ = s.notifications.Create(ctx, n)
	}
	return f, nil
}

// UpdateFeatureInput carries every mutable feature field (MVP addition — all optional).
type UpdateFeatureInput struct {
	Title           *string
	Description     *string
	Code            *string
	Goal            *string
	FeatureType     *string
	Priority        *string
	Status          *string
	OwnerID         *uuid.UUID
	TeamID          *uuid.UUID
	ParentFeatureID *uuid.UUID
	StartDate       *time.Time
	TargetEndDate   *time.Time
	EstimatedEffort *int
	ProgressPct     *int
	UpdatedBy       *uuid.UUID
}

func (s *Service) UpdateFeature(ctx context.Context, companyID, id uuid.UUID, in UpdateFeatureInput) (*planning.Feature, error) {
	f, err := s.features.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	if f.IsDeleted() {
		return nil, planning.ErrFeatureDeleted
	}
	if in.Title != nil {
		title := strings.TrimSpace(*in.Title)
		if title == "" {
			return nil, planning.ErrFeatureTitleRequired
		}
		f.Title = title
	}
	if in.Description != nil {
		f.Description = strings.TrimSpace(*in.Description)
	}
	if in.Code != nil {
		f.Code = strings.TrimSpace(*in.Code)
	}
	if in.Goal != nil {
		f.Goal = strings.TrimSpace(*in.Goal)
	}
	if in.FeatureType != nil {
		f.FeatureType = strings.ToUpper(strings.TrimSpace(*in.FeatureType))
	}
	if in.Priority != nil {
		if p := strings.ToUpper(strings.TrimSpace(*in.Priority)); p != "" {
			f.Priority = p
		}
	}
	if in.Status != nil && strings.TrimSpace(*in.Status) != "" {
		if err := f.ChangeStatus(*in.Status); err != nil {
			return nil, err
		}
	}
	if in.OwnerID != nil {
		f.OwnerID = in.OwnerID
	}
	if in.TeamID != nil {
		f.TeamID = in.TeamID
	}
	if in.ParentFeatureID != nil {
		f.ParentFeatureID = in.ParentFeatureID
	}
	if in.StartDate != nil {
		f.StartDate = in.StartDate
	}
	if in.TargetEndDate != nil {
		f.TargetEndDate = in.TargetEndDate
	}
	if in.EstimatedEffort != nil {
		f.EstimatedEffort = in.EstimatedEffort
	}
	if in.ProgressPct != nil {
		f.SetProgress(*in.ProgressPct)
	}
	if in.UpdatedBy != nil {
		f.UpdatedBy = in.UpdatedBy
	}
	f.UpdatedAt = time.Now().UTC()
	if err := s.features.Update(ctx, f); err != nil {
		return nil, err
	}
	return f, nil
}

func (s *Service) ArchiveFeature(ctx context.Context, companyID, id uuid.UUID, actorID *uuid.UUID) (*planning.Feature, error) {
	f, err := s.features.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	f.Archive(actorID)
	if err := s.features.Update(ctx, f); err != nil {
		return nil, err
	}
	act, _ := support.NewActivity(companyID, "feature", f.ID, "FeatureArchived", actorID, nil)
	_ = s.activities.Append(ctx, act)
	return f, nil
}

func (s *Service) RestoreFeature(ctx context.Context, companyID, id uuid.UUID) (*planning.Feature, error) {
	f, err := s.features.FindByID(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	f.Restore()
	if err := s.features.Update(ctx, f); err != nil {
		return nil, err
	}
	act, _ := support.NewActivity(companyID, "feature", f.ID, "FeatureRestored", nil, nil)
	_ = s.activities.Append(ctx, act)
	return f, nil
}

func (s *Service) SetFeatureDependencies(ctx context.Context, companyID, featureID uuid.UUID, dependsOn []uuid.UUID) (*planning.Feature, error) {
	f, err := s.features.FindByID(ctx, companyID, featureID)
	if err != nil {
		return nil, err
	}
	for _, dep := range dependsOn {
		if dep == featureID {
			return nil, planning.ErrFeatureDependencyInvalid
		}
	}
	if err := s.featureDeps.SetDependencies(ctx, companyID, featureID, dependsOn); err != nil {
		return nil, err
	}
	return f, nil
}

func (s *Service) ListFeatureDependencies(ctx context.Context, companyID, featureID uuid.UUID) ([]uuid.UUID, error) {
	return s.featureDeps.ListDependencies(ctx, companyID, featureID)
}

// ---------------------------------------------------------------------------
// Feature members
// ---------------------------------------------------------------------------

func (s *Service) AddFeatureMember(ctx context.Context, companyID, featureID, employeeID uuid.UUID, role string) (*planning.FeatureMember, error) {
	if _, err := s.features.FindByID(ctx, companyID, featureID); err != nil {
		return nil, err
	}
	if _, err := s.employees.FindByID(ctx, companyID, employeeID); err != nil {
		return nil, err
	}
	m, err := planning.NewFeatureMember(companyID, featureID, employeeID, role)
	if err != nil {
		return nil, err
	}
	if err := s.featureMembers.Add(ctx, m); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *Service) RemoveFeatureMember(ctx context.Context, companyID, featureID, employeeID uuid.UUID) error {
	return s.featureMembers.Remove(ctx, companyID, featureID, employeeID)
}

func (s *Service) ListFeatureMembers(ctx context.Context, companyID, featureID uuid.UUID) ([]planning.FeatureMember, error) {
	return s.featureMembers.ListByFeature(ctx, companyID, featureID)
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

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
		t.CreatedBy = in.ActorID
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

func (s *Service) ListOverdueTasks(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]planning.Task, shared.PageMeta, error) {
	items, total, err := s.tasks.ListOverdue(ctx, companyID, q)
	if err != nil {
		return nil, shared.PageMeta{}, err
	}
	return items, shared.NewPageMeta(q, total), nil
}

// ListMyTasks resolves the acting employee (by explicit override, falling back to the
// employee record linked to the caller's email) and lists tasks assigned to them.
func (s *Service) ListMyTasks(ctx context.Context, companyID uuid.UUID, actorEmail string, assigneeOverride *uuid.UUID, q shared.PageQuery) ([]planning.Task, shared.PageMeta, error) {
	assigneeID := uuid.Nil
	if assigneeOverride != nil && *assigneeOverride != uuid.Nil {
		assigneeID = *assigneeOverride
	} else {
		emp, err := s.employees.FindByEmail(ctx, companyID, strings.ToLower(strings.TrimSpace(actorEmail)))
		if err != nil {
			return nil, shared.PageMeta{}, err
		}
		assigneeID = emp.ID
	}
	items, total, err := s.tasks.ListByAssignee(ctx, companyID, assigneeID, q)
	if err != nil {
		return nil, shared.PageMeta{}, err
	}
	return items, shared.NewPageMeta(q, total), nil
}

// notifyTaskEvent records an activity entry and — when the task has an assignee —
// raises a notification for them (MVP addition: AssignTask/status-change alerts).
func (s *Service) notifyTaskEvent(ctx context.Context, companyID uuid.UUID, t *planning.Task, action, notifType, title, body string, actorID *uuid.UUID) {
	act, _ := support.NewActivity(companyID, "task", t.ID, action, actorID, nil)
	_ = s.activities.Append(ctx, act)
	if t.AssigneeID == nil || s.notifications == nil {
		return
	}
	n := support.NewNotification(companyID, *t.AssigneeID, notifType, title, body)
	_ = s.notifications.Create(ctx, n)
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
	s.notifyTaskEvent(ctx, companyID, t, "TaskAssigned", NotifTypeAssignment, "You have been assigned a task", t.Title, nil)
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
	s.notifyTaskEvent(ctx, companyID, t, "TaskCompleted", NotifTypeStatusChange, "Task completed", t.Title, nil)
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
	s.notifyTaskEvent(ctx, companyID, t, "TaskRejected", NotifTypeStatusChange, "Task rejected", t.Title, nil)
	return t, nil
}

func (s *Service) ArchiveTask(ctx context.Context, companyID, taskID uuid.UUID) (*planning.Task, error) {
	t, err := s.tasks.FindByID(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	t.Archive(nil)
	if err := s.tasks.Update(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

func (s *Service) PauseTask(ctx context.Context, companyID, taskID uuid.UUID) (*planning.Task, error) {
	t, err := s.tasks.FindByID(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	if err := t.Pause(); err != nil {
		return nil, err
	}
	if err := s.tasks.Update(ctx, t); err != nil {
		return nil, err
	}
	s.notifyTaskEvent(ctx, companyID, t, "TaskPaused", NotifTypeStatusChange, "Task paused", t.Title, nil)
	return t, nil
}

func (s *Service) ResumeTask(ctx context.Context, companyID, taskID uuid.UUID) (*planning.Task, error) {
	t, err := s.tasks.FindByID(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	if err := t.Resume(); err != nil {
		return nil, err
	}
	if err := s.tasks.Update(ctx, t); err != nil {
		return nil, err
	}
	s.notifyTaskEvent(ctx, companyID, t, "TaskResumed", NotifTypeStatusChange, "Task resumed", t.Title, nil)
	return t, nil
}

func (s *Service) ReopenTask(ctx context.Context, companyID, taskID uuid.UUID) (*planning.Task, error) {
	t, err := s.tasks.FindByID(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	if err := t.Reopen(); err != nil {
		return nil, err
	}
	if err := s.tasks.Update(ctx, t); err != nil {
		return nil, err
	}
	s.notifyTaskEvent(ctx, companyID, t, "TaskReopened", NotifTypeStatusChange, "Task reopened", t.Title, nil)
	return t, nil
}

func (s *Service) SoftDeleteTask(ctx context.Context, companyID, taskID uuid.UUID, actorID *uuid.UUID) (*planning.Task, error) {
	t, err := s.tasks.FindByID(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	if t.IsDeleted() {
		return t, nil
	}
	t.SoftDelete(actorID)
	if err := s.tasks.Update(ctx, t); err != nil {
		return nil, err
	}
	act, _ := support.NewActivity(companyID, "task", t.ID, "TaskSoftDeleted", actorID, nil)
	_ = s.activities.Append(ctx, act)
	return t, nil
}

func (s *Service) RestoreTask(ctx context.Context, companyID, taskID uuid.UUID) (*planning.Task, error) {
	t, err := s.tasks.FindByID(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	t.Restore()
	if err := s.tasks.Update(ctx, t); err != nil {
		return nil, err
	}
	act, _ := support.NewActivity(companyID, "task", t.ID, "TaskRestored", nil, nil)
	_ = s.activities.Append(ctx, act)
	return t, nil
}

// UpdateTaskInput carries every mutable task field (MVP addition — all optional).
type UpdateTaskInput struct {
	Title            *string
	Description      *string
	TaskType         *string
	Priority         *string
	Status           *string
	DueDate          *time.Time
	StartDate        *time.Time
	EstimatedMinutes *int
	ActualMinutes    *int
	UpdatedBy        *uuid.UUID
}

func (s *Service) UpdateTask(ctx context.Context, companyID, taskID uuid.UUID, in UpdateTaskInput) (*planning.Task, error) {
	t, err := s.tasks.FindByID(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	if t.IsDeleted() {
		return nil, planning.ErrTaskDeleted
	}
	statusChanged := false
	if in.Title != nil {
		title := strings.TrimSpace(*in.Title)
		if title == "" {
			return nil, planning.ErrTaskTitleRequired
		}
		t.Title = title
	}
	if in.Description != nil {
		t.Description = strings.TrimSpace(*in.Description)
	}
	if in.TaskType != nil {
		t.TaskType = strings.ToUpper(strings.TrimSpace(*in.TaskType))
	}
	if in.Priority != nil {
		if p := strings.ToUpper(strings.TrimSpace(*in.Priority)); p != "" {
			t.Priority = p
		}
	}
	if in.Status != nil && strings.TrimSpace(*in.Status) != "" {
		if err := t.ChangeStatus(*in.Status); err != nil {
			return nil, err
		}
		statusChanged = true
	}
	if in.DueDate != nil {
		t.SetDueDate(in.DueDate)
	}
	if in.StartDate != nil {
		t.StartDate = in.StartDate
	}
	if in.EstimatedMinutes != nil {
		t.EstimatedMinutes = in.EstimatedMinutes
	}
	if in.ActualMinutes != nil {
		t.ActualMinutes = in.ActualMinutes
	}
	if in.UpdatedBy != nil {
		t.UpdatedBy = in.UpdatedBy
	}
	t.UpdatedAt = time.Now().UTC()
	if err := s.tasks.Update(ctx, t); err != nil {
		return nil, err
	}
	if statusChanged {
		s.notifyTaskEvent(ctx, companyID, t, "TaskStatusChanged", NotifTypeStatusChange, "Task status changed", t.Title+" is now "+t.Status, in.UpdatedBy)
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

// ---------------------------------------------------------------------------
// Task checklists
// ---------------------------------------------------------------------------

func (s *Service) CreateChecklistItem(ctx context.Context, companyID, taskID uuid.UUID, title string) (*planning.ChecklistItem, error) {
	if _, err := s.tasks.FindByID(ctx, companyID, taskID); err != nil {
		return nil, err
	}
	existing, err := s.checklists.ListByTask(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	c, err := planning.NewChecklistItem(companyID, taskID, title, len(existing))
	if err != nil {
		return nil, err
	}
	if err := s.checklists.Create(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

func (s *Service) ListChecklist(ctx context.Context, companyID, taskID uuid.UUID) ([]planning.ChecklistItem, error) {
	return s.checklists.ListByTask(ctx, companyID, taskID)
}

func (s *Service) ToggleChecklist(ctx context.Context, companyID, itemID uuid.UUID, done bool) (*planning.ChecklistItem, error) {
	item, err := s.checklists.FindByID(ctx, companyID, itemID)
	if err != nil {
		return nil, err
	}
	item.Toggle(done)
	if err := s.checklists.Update(ctx, item); err != nil {
		return nil, err
	}
	return item, nil
}

// ReorderChecklist re-numbers checklist items for a task according to orderedIDs;
// unknown ids are ignored so partial reorders never fail the whole request.
func (s *Service) ReorderChecklist(ctx context.Context, companyID, taskID uuid.UUID, orderedIDs []uuid.UUID) ([]planning.ChecklistItem, error) {
	items, err := s.checklists.ListByTask(ctx, companyID, taskID)
	if err != nil {
		return nil, err
	}
	byID := make(map[uuid.UUID]*planning.ChecklistItem, len(items))
	for i := range items {
		byID[items[i].ID] = &items[i]
	}
	for pos, id := range orderedIDs {
		item, ok := byID[id]
		if !ok {
			continue
		}
		item.Position = pos
		if err := s.checklists.Update(ctx, item); err != nil {
			return nil, err
		}
	}
	return s.checklists.ListByTask(ctx, companyID, taskID)
}

func (s *Service) DeleteChecklistItem(ctx context.Context, companyID, itemID uuid.UUID) error {
	return s.checklists.Delete(ctx, companyID, itemID)
}
