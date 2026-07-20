package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/planning"
	"PMAS/internal/domain/shared"
	"PMAS/internal/domain/support"
)

// rowScanner is satisfied by both *sql.Row and *sql.Rows so scan helpers can be
// shared between FindByID (single row) and List (row set) query paths.
type rowScanner interface {
	Scan(dest ...any) error
}

// nullStr converts an empty string to SQL NULL so nullable/unique varchar
// columns (e.g. code) never collide on empty-string values.
func nullStr(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

type ProjectRepo struct{ db *DB }

func NewProjectRepo(db *DB) *ProjectRepo { return &ProjectRepo{db: db} }

const projectColumns = `id, company_id, product_id, name, description, status,
	code, goal, priority, owner_id, manager_id, start_date, target_end_date, estimated_duration_days,
	deleted_at, created_by, updated_by, archived_by, version, created_at, updated_at`

func scanProject(row rowScanner) (*planning.Project, error) {
	var p planning.Project
	if err := row.Scan(
		&p.ID, &p.CompanyID, &p.ProductID, &p.Name, &p.Description, &p.Status,
		&p.Code, &p.Goal, &p.Priority, &p.OwnerID, &p.ManagerID, &p.StartDate, &p.TargetEndDate, &p.EstimatedDurationDays,
		&p.DeletedAt, &p.CreatedBy, &p.UpdatedBy, &p.ArchivedBy, &p.Version, &p.CreatedAt, &p.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *ProjectRepo) Create(ctx context.Context, p *planning.Project) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO projects (
			id, company_id, product_id, name, description, status,
			code, goal, priority, owner_id, manager_id, start_date, target_end_date, estimated_duration_days,
			deleted_at, created_by, updated_by, archived_by, version, created_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
		p.ID, p.CompanyID, p.ProductID, p.Name, p.Description, p.Status,
		nullStr(p.Code), p.Goal, nullStr(p.Priority), p.OwnerID, p.ManagerID, p.StartDate, p.TargetEndDate, p.EstimatedDurationDays,
		p.DeletedAt, p.CreatedBy, p.UpdatedBy, p.ArchivedBy, p.Version, p.CreatedAt, p.UpdatedAt,
	)
	return err
}

func (r *ProjectRepo) FindByID(ctx context.Context, companyID, id uuid.UUID) (*planning.Project, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `SELECT `+projectColumns+` FROM projects WHERE company_id=$1 AND id=$2`, companyID, id)
	p, err := scanProject(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, planning.ErrProjectNotFound
	}
	return p, err
}

func (r *ProjectRepo) List(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]planning.Project, int64, error) {
	return r.list(ctx, companyID, uuid.Nil, q)
}

func (r *ProjectRepo) ListByProduct(ctx context.Context, companyID, productID uuid.UUID, q shared.PageQuery) ([]planning.Project, int64, error) {
	return r.list(ctx, companyID, productID, q)
}

func (r *ProjectRepo) list(ctx context.Context, companyID, productID uuid.UUID, q shared.PageQuery) ([]planning.Project, int64, error) {
	q = q.Normalize()
	where := `company_id=$1 AND deleted_at IS NULL`
	args := []any{companyID}
	if productID != uuid.Nil {
		args = append(args, productID)
		where += fmt.Sprintf(` AND product_id=$%d`, len(args))
	}
	if q.Status != "" {
		args = append(args, q.Status)
		where += fmt.Sprintf(` AND status=$%d`, len(args))
	}
	if q.Search != "" {
		args = append(args, "%"+strings.ToLower(q.Search)+"%")
		where += fmt.Sprintf(` AND LOWER(name) LIKE $%d`, len(args))
	}
	var total int64
	if err := r.db.Q(ctx).QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, q.PageSize, q.Offset())
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT `+projectColumns+` FROM projects WHERE `+where+` ORDER BY created_at DESC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]planning.Project, 0)
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *p)
	}
	return out, total, nil
}

func (r *ProjectRepo) ListByOwner(ctx context.Context, companyID, ownerID uuid.UUID, q shared.PageQuery) ([]planning.Project, int64, error) {
	q = q.Normalize()
	where := `company_id=$1 AND owner_id=$2 AND deleted_at IS NULL`
	args := []any{companyID, ownerID}
	if q.Status != "" {
		args = append(args, q.Status)
		where += fmt.Sprintf(` AND status=$%d`, len(args))
	}
	if q.Search != "" {
		args = append(args, "%"+strings.ToLower(q.Search)+"%")
		where += fmt.Sprintf(` AND LOWER(name) LIKE $%d`, len(args))
	}
	var total int64
	if err := r.db.Q(ctx).QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, q.PageSize, q.Offset())
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT `+projectColumns+` FROM projects WHERE `+where+` ORDER BY created_at DESC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]planning.Project, 0)
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *p)
	}
	return out, total, nil
}

func (r *ProjectRepo) Update(ctx context.Context, p *planning.Project) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE projects SET
			name=$1, description=$2, status=$3, code=$4, goal=$5, priority=$6,
			owner_id=$7, manager_id=$8, start_date=$9, target_end_date=$10, estimated_duration_days=$11,
			deleted_at=$12, created_by=$13, updated_by=$14, archived_by=$15,
			version=version+1, updated_at=$16
		WHERE company_id=$17 AND id=$18 AND version=$19`,
		p.Name, p.Description, p.Status, nullStr(p.Code), p.Goal, nullStr(p.Priority),
		p.OwnerID, p.ManagerID, p.StartDate, p.TargetEndDate, p.EstimatedDurationDays,
		p.DeletedAt, p.CreatedBy, p.UpdatedBy, p.ArchivedBy,
		time.Now().UTC(), p.CompanyID, p.ID, p.Version,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return shared.ErrOptimisticLock
	}
	p.Version++
	return nil
}

func (r *ProjectRepo) Delete(ctx context.Context, companyID, id uuid.UUID) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `DELETE FROM projects WHERE company_id=$1 AND id=$2`, companyID, id)
	return err
}

type FeatureRepo struct{ db *DB }

func NewFeatureRepo(db *DB) *FeatureRepo { return &FeatureRepo{db: db} }

const featureColumns = `id, company_id, product_id, project_id, title, status, priority,
	code, description, goal, feature_type, owner_id, team_id, parent_feature_id,
	start_date, target_end_date, estimated_effort, progress_pct,
	deleted_at, created_by, updated_by, archived_by, version, created_at, updated_at`

func scanFeature(row rowScanner) (*planning.Feature, error) {
	var f planning.Feature
	if err := row.Scan(
		&f.ID, &f.CompanyID, &f.ProductID, &f.ProjectID, &f.Title, &f.Status, &f.Priority,
		&f.Code, &f.Description, &f.Goal, &f.FeatureType, &f.OwnerID, &f.TeamID, &f.ParentFeatureID,
		&f.StartDate, &f.TargetEndDate, &f.EstimatedEffort, &f.ProgressPct,
		&f.DeletedAt, &f.CreatedBy, &f.UpdatedBy, &f.ArchivedBy, &f.Version, &f.CreatedAt, &f.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &f, nil
}

func (r *FeatureRepo) Create(ctx context.Context, f *planning.Feature) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO features (
			id, company_id, product_id, project_id, title, status, priority,
			code, description, goal, feature_type, owner_id, team_id, parent_feature_id,
			start_date, target_end_date, estimated_effort, progress_pct,
			deleted_at, created_by, updated_by, archived_by, version, created_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
		f.ID, f.CompanyID, f.ProductID, f.ProjectID, f.Title, f.Status, f.Priority,
		nullStr(f.Code), f.Description, f.Goal, nullStr(f.FeatureType), f.OwnerID, f.TeamID, f.ParentFeatureID,
		f.StartDate, f.TargetEndDate, f.EstimatedEffort, f.ProgressPct,
		f.DeletedAt, f.CreatedBy, f.UpdatedBy, f.ArchivedBy, f.Version, f.CreatedAt, f.UpdatedAt,
	)
	return err
}

func (r *FeatureRepo) FindByID(ctx context.Context, companyID, id uuid.UUID) (*planning.Feature, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `SELECT `+featureColumns+` FROM features WHERE company_id=$1 AND id=$2`, companyID, id)
	f, err := scanFeature(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, planning.ErrFeatureNotFound
	}
	return f, err
}

func (r *FeatureRepo) ListByProject(ctx context.Context, companyID, projectID uuid.UUID, q shared.PageQuery) ([]planning.Feature, int64, error) {
	q = q.Normalize()
	where := `company_id=$1 AND project_id=$2 AND deleted_at IS NULL`
	args := []any{companyID, projectID}
	if q.Status != "" {
		args = append(args, q.Status)
		where += fmt.Sprintf(` AND status=$%d`, len(args))
	}
	if q.Search != "" {
		args = append(args, "%"+strings.ToLower(q.Search)+"%")
		where += fmt.Sprintf(` AND LOWER(title) LIKE $%d`, len(args))
	}
	var total int64
	if err := r.db.Q(ctx).QueryRowContext(ctx, `SELECT COUNT(*) FROM features WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, q.PageSize, q.Offset())
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT `+featureColumns+` FROM features WHERE `+where+` ORDER BY created_at DESC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]planning.Feature, 0)
	for rows.Next() {
		f, err := scanFeature(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *f)
	}
	return out, total, nil
}

func (r *FeatureRepo) ListByOwner(ctx context.Context, companyID, ownerID uuid.UUID, q shared.PageQuery) ([]planning.Feature, int64, error) {
	q = q.Normalize()
	where := `company_id=$1 AND owner_id=$2 AND deleted_at IS NULL`
	args := []any{companyID, ownerID}
	if q.Status != "" {
		args = append(args, q.Status)
		where += fmt.Sprintf(` AND status=$%d`, len(args))
	}
	if q.Search != "" {
		args = append(args, "%"+strings.ToLower(q.Search)+"%")
		where += fmt.Sprintf(` AND LOWER(title) LIKE $%d`, len(args))
	}
	var total int64
	if err := r.db.Q(ctx).QueryRowContext(ctx, `SELECT COUNT(*) FROM features WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, q.PageSize, q.Offset())
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT `+featureColumns+` FROM features WHERE `+where+` ORDER BY created_at DESC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]planning.Feature, 0)
	for rows.Next() {
		f, err := scanFeature(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *f)
	}
	return out, total, nil
}

func (r *FeatureRepo) CountByProject(ctx context.Context, companyID, projectID uuid.UUID) (int64, error) {
	var total int64
	err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT COUNT(*) FROM features WHERE company_id=$1 AND project_id=$2 AND deleted_at IS NULL`,
		companyID, projectID).Scan(&total)
	return total, err
}

func (r *FeatureRepo) Update(ctx context.Context, f *planning.Feature) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE features SET
			title=$1, status=$2, priority=$3, code=$4, description=$5, goal=$6, feature_type=$7,
			owner_id=$8, team_id=$9, parent_feature_id=$10, start_date=$11, target_end_date=$12,
			estimated_effort=$13, progress_pct=$14, deleted_at=$15, created_by=$16, updated_by=$17, archived_by=$18,
			version=version+1, updated_at=$19
		WHERE company_id=$20 AND id=$21 AND version=$22`,
		f.Title, f.Status, f.Priority, nullStr(f.Code), f.Description, f.Goal, nullStr(f.FeatureType),
		f.OwnerID, f.TeamID, f.ParentFeatureID, f.StartDate, f.TargetEndDate,
		f.EstimatedEffort, f.ProgressPct, f.DeletedAt, f.CreatedBy, f.UpdatedBy, f.ArchivedBy,
		time.Now().UTC(), f.CompanyID, f.ID, f.Version,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return shared.ErrOptimisticLock
	}
	f.Version++
	return nil
}

func (r *FeatureRepo) Delete(ctx context.Context, companyID, id uuid.UUID) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `DELETE FROM features WHERE company_id=$1 AND id=$2`, companyID, id)
	return err
}

type TaskRepo struct{ db *DB }

func NewTaskRepo(db *DB) *TaskRepo { return &TaskRepo{db: db} }

const taskColumns = `id, company_id, feature_id, assignee_id, title, status, priority, due_date,
	description, task_type, start_date, estimated_minutes, actual_minutes, progress_pct,
	deleted_at, created_by, updated_by, archived_by, version, created_at, updated_at`

func scanTask(row rowScanner) (*planning.Task, error) {
	var t planning.Task
	if err := row.Scan(
		&t.ID, &t.CompanyID, &t.FeatureID, &t.AssigneeID, &t.Title, &t.Status, &t.Priority, &t.DueDate,
		&t.Description, &t.TaskType, &t.StartDate, &t.EstimatedMinutes, &t.ActualMinutes, &t.ProgressPct,
		&t.DeletedAt, &t.CreatedBy, &t.UpdatedBy, &t.ArchivedBy, &t.Version, &t.CreatedAt, &t.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *TaskRepo) Create(ctx context.Context, t *planning.Task) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO tasks (
			id, company_id, feature_id, assignee_id, title, status, priority, due_date,
			description, task_type, start_date, estimated_minutes, actual_minutes, progress_pct,
			deleted_at, created_by, updated_by, archived_by, version, created_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
		t.ID, t.CompanyID, t.FeatureID, t.AssigneeID, t.Title, t.Status, t.Priority, t.DueDate,
		t.Description, nullStr(t.TaskType), t.StartDate, t.EstimatedMinutes, t.ActualMinutes, t.ProgressPct,
		t.DeletedAt, t.CreatedBy, t.UpdatedBy, t.ArchivedBy, t.Version, t.CreatedAt, t.UpdatedAt,
	)
	return err
}

func (r *TaskRepo) FindByID(ctx context.Context, companyID, id uuid.UUID) (*planning.Task, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `SELECT `+taskColumns+` FROM tasks WHERE company_id=$1 AND id=$2`, companyID, id)
	t, err := scanTask(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, planning.ErrTaskNotFound
	}
	return t, err
}

func (r *TaskRepo) ListByFeature(ctx context.Context, companyID, featureID uuid.UUID, q shared.PageQuery) ([]planning.Task, int64, error) {
	q = q.Normalize()
	where := `company_id=$1 AND feature_id=$2 AND deleted_at IS NULL`
	args := []any{companyID, featureID}
	if q.Status != "" {
		args = append(args, q.Status)
		where += fmt.Sprintf(` AND status=$%d`, len(args))
	}
	if q.Search != "" {
		args = append(args, "%"+strings.ToLower(q.Search)+"%")
		where += fmt.Sprintf(` AND LOWER(title) LIKE $%d`, len(args))
	}
	var total int64
	if err := r.db.Q(ctx).QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, q.PageSize, q.Offset())
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT `+taskColumns+` FROM tasks WHERE `+where+` ORDER BY created_at DESC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]planning.Task, 0)
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *t)
	}
	return out, total, nil
}

func (r *TaskRepo) ListByAssignee(ctx context.Context, companyID, assigneeID uuid.UUID, q shared.PageQuery) ([]planning.Task, int64, error) {
	q = q.Normalize()
	where := `company_id=$1 AND assignee_id=$2 AND deleted_at IS NULL`
	args := []any{companyID, assigneeID}
	if q.Status != "" {
		args = append(args, q.Status)
		where += fmt.Sprintf(` AND status=$%d`, len(args))
	}
	if q.Search != "" {
		args = append(args, "%"+strings.ToLower(q.Search)+"%")
		where += fmt.Sprintf(` AND LOWER(title) LIKE $%d`, len(args))
	}
	var total int64
	if err := r.db.Q(ctx).QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, q.PageSize, q.Offset())
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT `+taskColumns+` FROM tasks WHERE `+where+` ORDER BY due_date ASC NULLS LAST, created_at DESC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]planning.Task, 0)
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *t)
	}
	return out, total, nil
}

func (r *TaskRepo) ListOverdue(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]planning.Task, int64, error) {
	q = q.Normalize()
	where := `company_id=$1 AND deleted_at IS NULL AND due_date IS NOT NULL AND due_date < now()
		AND status NOT IN ($2,$3,$4,$5)`
	args := []any{companyID, planning.StatusCompleted, planning.StatusCancelled, planning.StatusArchived, planning.StatusDone}
	if q.Status != "" {
		args = append(args, q.Status)
		where += fmt.Sprintf(` AND status=$%d`, len(args))
	}
	var total int64
	if err := r.db.Q(ctx).QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, q.PageSize, q.Offset())
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT `+taskColumns+` FROM tasks WHERE `+where+` ORDER BY due_date ASC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]planning.Task, 0)
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *t)
	}
	return out, total, nil
}

func (r *TaskRepo) Update(ctx context.Context, t *planning.Task) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE tasks SET
			assignee_id=$1, title=$2, status=$3, priority=$4, due_date=$5,
			description=$6, task_type=$7, start_date=$8, estimated_minutes=$9, actual_minutes=$10, progress_pct=$11,
			deleted_at=$12, created_by=$13, updated_by=$14, archived_by=$15,
			version=version+1, updated_at=$16
		WHERE company_id=$17 AND id=$18 AND version=$19`,
		t.AssigneeID, t.Title, t.Status, t.Priority, t.DueDate,
		t.Description, nullStr(t.TaskType), t.StartDate, t.EstimatedMinutes, t.ActualMinutes, t.ProgressPct,
		t.DeletedAt, t.CreatedBy, t.UpdatedBy, t.ArchivedBy,
		time.Now().UTC(), t.CompanyID, t.ID, t.Version,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return shared.ErrOptimisticLock
	}
	t.Version++
	return nil
}

func (r *TaskRepo) Delete(ctx context.Context, companyID, id uuid.UUID) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `DELETE FROM tasks WHERE company_id=$1 AND id=$2`, companyID, id)
	return err
}

type ActivityRepo struct{ db *DB }

func NewActivityRepo(db *DB) *ActivityRepo { return &ActivityRepo{db: db} }

func (r *ActivityRepo) Append(ctx context.Context, a *support.ActivityLog) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO activity_logs (id, company_id, entity_type, entity_id, action, actor_id, payload, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		a.ID, a.CompanyID, a.EntityType, a.EntityID, a.Action, a.ActorID, a.Payload, a.CreatedAt,
	)
	return err
}

func (r *ActivityRepo) ListByEntity(ctx context.Context, companyID uuid.UUID, entityType string, entityID uuid.UUID, q shared.PageQuery) ([]support.ActivityLog, int64, error) {
	q = q.Normalize()
	var total int64
	if err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT COUNT(*) FROM activity_logs WHERE company_id=$1 AND entity_type=$2 AND entity_id=$3`,
		companyID, entityType, entityID).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, entity_type, entity_id, action, actor_id, payload, created_at
		FROM activity_logs WHERE company_id=$1 AND entity_type=$2 AND entity_id=$3
		ORDER BY created_at DESC LIMIT $4 OFFSET $5`, companyID, entityType, entityID, q.PageSize, q.Offset())
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]support.ActivityLog, 0)
	for rows.Next() {
		var a support.ActivityLog
		if err := rows.Scan(&a.ID, &a.CompanyID, &a.EntityType, &a.EntityID, &a.Action, &a.ActorID, &a.Payload, &a.CreatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, a)
	}
	return out, total, nil
}

type NotificationRepo struct{ db *DB }

func NewNotificationRepo(db *DB) *NotificationRepo { return &NotificationRepo{db: db} }

func (r *NotificationRepo) Create(ctx context.Context, n *support.Notification) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO notifications (id, company_id, receiver_id, type, title, body, is_read, version, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		n.ID, n.CompanyID, n.ReceiverID, n.Type, n.Title, n.Body, n.IsRead, n.Version, n.CreatedAt, n.UpdatedAt,
	)
	return err
}

func (r *NotificationRepo) ListByReceiver(ctx context.Context, companyID, receiverID uuid.UUID, q shared.PageQuery) ([]support.Notification, int64, error) {
	q = q.Normalize()
	var total int64
	if err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT COUNT(*) FROM notifications WHERE company_id=$1 AND receiver_id=$2`, companyID, receiverID).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, receiver_id, type, title, body, is_read, version, created_at, updated_at
		FROM notifications WHERE company_id=$1 AND receiver_id=$2
		ORDER BY created_at DESC LIMIT $3 OFFSET $4`, companyID, receiverID, q.PageSize, q.Offset())
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]support.Notification, 0)
	for rows.Next() {
		var n support.Notification
		if err := rows.Scan(&n.ID, &n.CompanyID, &n.ReceiverID, &n.Type, &n.Title, &n.Body, &n.IsRead, &n.Version, &n.CreatedAt, &n.UpdatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, n)
	}
	return out, total, nil
}

func (r *NotificationRepo) MarkRead(ctx context.Context, companyID, id uuid.UUID) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE notifications SET is_read=true, updated_at=$1 WHERE company_id=$2 AND id=$3`,
		time.Now().UTC(), companyID, id)
	return err
}
