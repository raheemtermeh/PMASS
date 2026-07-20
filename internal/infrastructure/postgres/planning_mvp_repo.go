package postgres

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/planning"
)

// ChecklistRepo implements planning.ChecklistRepository. Checklist items are
// stored in task_checklists (MVP addition — see migrate_mvp.go).
type ChecklistRepo struct{ db *DB }

func NewChecklistRepo(db *DB) *ChecklistRepo { return &ChecklistRepo{db: db} }

func (r *ChecklistRepo) Create(ctx context.Context, c *planning.ChecklistItem) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO task_checklists (id, company_id, task_id, title, position, is_done, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		c.ID, c.CompanyID, c.TaskID, c.Title, c.Position, c.IsDone, c.CreatedAt, c.UpdatedAt,
	)
	return err
}

func (r *ChecklistRepo) FindByID(ctx context.Context, companyID, id uuid.UUID) (*planning.ChecklistItem, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, task_id, title, position, is_done, created_at, updated_at
		FROM task_checklists WHERE company_id=$1 AND id=$2`, companyID, id)
	var c planning.ChecklistItem
	err := row.Scan(&c.ID, &c.CompanyID, &c.TaskID, &c.Title, &c.Position, &c.IsDone, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, planning.ErrChecklistItemNotFound
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *ChecklistRepo) ListByTask(ctx context.Context, companyID, taskID uuid.UUID) ([]planning.ChecklistItem, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, task_id, title, position, is_done, created_at, updated_at
		FROM task_checklists WHERE company_id=$1 AND task_id=$2
		ORDER BY position ASC, created_at ASC`, companyID, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]planning.ChecklistItem, 0)
	for rows.Next() {
		var c planning.ChecklistItem
		if err := rows.Scan(&c.ID, &c.CompanyID, &c.TaskID, &c.Title, &c.Position, &c.IsDone, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}

func (r *ChecklistRepo) Update(ctx context.Context, c *planning.ChecklistItem) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE task_checklists SET title=$1, position=$2, is_done=$3, updated_at=$4
		WHERE company_id=$5 AND id=$6`,
		c.Title, c.Position, c.IsDone, time.Now().UTC(), c.CompanyID, c.ID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return planning.ErrChecklistItemNotFound
	}
	return nil
}

func (r *ChecklistRepo) Delete(ctx context.Context, companyID, id uuid.UUID) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		DELETE FROM task_checklists WHERE company_id=$1 AND id=$2`, companyID, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return planning.ErrChecklistItemNotFound
	}
	return nil
}

// FeatureDependencyRepo implements planning.FeatureDependencyRepository, mirroring
// the existing task_dependencies pattern for feature-to-feature blocking.
type FeatureDependencyRepo struct{ db *DB }

func NewFeatureDependencyRepo(db *DB) *FeatureDependencyRepo { return &FeatureDependencyRepo{db: db} }

func (r *FeatureDependencyRepo) SetDependencies(ctx context.Context, companyID, featureID uuid.UUID, dependsOn []uuid.UUID) error {
	return r.db.WithinTx(ctx, func(ctx context.Context) error {
		if _, err := r.db.Q(ctx).ExecContext(ctx, `
			DELETE FROM feature_dependencies WHERE company_id=$1 AND feature_id=$2`, companyID, featureID); err != nil {
			return err
		}
		for _, dep := range dependsOn {
			if dep == featureID {
				continue
			}
			if _, err := r.db.Q(ctx).ExecContext(ctx, `
				INSERT INTO feature_dependencies (company_id, feature_id, depends_on_feature_id)
				VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, companyID, featureID, dep); err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *FeatureDependencyRepo) ListDependencies(ctx context.Context, companyID, featureID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT depends_on_feature_id FROM feature_dependencies WHERE company_id=$1 AND feature_id=$2`,
		companyID, featureID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, nil
}

// ProjectMemberRepo implements planning.ProjectMemberRepository (MVP addition:
// collaborative project teams beyond the single owner/manager fields).
type ProjectMemberRepo struct{ db *DB }

func NewProjectMemberRepo(db *DB) *ProjectMemberRepo { return &ProjectMemberRepo{db: db} }

func (r *ProjectMemberRepo) Add(ctx context.Context, m *planning.ProjectMember) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO project_members (id, company_id, project_id, employee_id, role, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (project_id, employee_id) DO UPDATE SET role = EXCLUDED.role`,
		m.ID, m.CompanyID, m.ProjectID, m.EmployeeID, m.Role, m.CreatedAt,
	)
	return err
}

func (r *ProjectMemberRepo) Remove(ctx context.Context, companyID, projectID, employeeID uuid.UUID) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		DELETE FROM project_members WHERE company_id=$1 AND project_id=$2 AND employee_id=$3`,
		companyID, projectID, employeeID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return planning.ErrProjectMemberNotFound
	}
	return nil
}

func (r *ProjectMemberRepo) ListByProject(ctx context.Context, companyID, projectID uuid.UUID) ([]planning.ProjectMember, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, project_id, employee_id, role, created_at
		FROM project_members WHERE company_id=$1 AND project_id=$2 ORDER BY created_at ASC`,
		companyID, projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]planning.ProjectMember, 0)
	for rows.Next() {
		var m planning.ProjectMember
		if err := rows.Scan(&m.ID, &m.CompanyID, &m.ProjectID, &m.EmployeeID, &m.Role, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}

// FeatureMemberRepo implements planning.FeatureMemberRepository (MVP addition:
// collaborative feature teams beyond the single owner field).
type FeatureMemberRepo struct{ db *DB }

func NewFeatureMemberRepo(db *DB) *FeatureMemberRepo { return &FeatureMemberRepo{db: db} }

func (r *FeatureMemberRepo) Add(ctx context.Context, m *planning.FeatureMember) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO feature_members (id, company_id, feature_id, employee_id, role, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (feature_id, employee_id) DO UPDATE SET role = EXCLUDED.role`,
		m.ID, m.CompanyID, m.FeatureID, m.EmployeeID, m.Role, m.CreatedAt,
	)
	return err
}

func (r *FeatureMemberRepo) Remove(ctx context.Context, companyID, featureID, employeeID uuid.UUID) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		DELETE FROM feature_members WHERE company_id=$1 AND feature_id=$2 AND employee_id=$3`,
		companyID, featureID, employeeID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return planning.ErrFeatureMemberNotFound
	}
	return nil
}

func (r *FeatureMemberRepo) ListByFeature(ctx context.Context, companyID, featureID uuid.UUID) ([]planning.FeatureMember, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, feature_id, employee_id, role, created_at
		FROM feature_members WHERE company_id=$1 AND feature_id=$2 ORDER BY created_at ASC`,
		companyID, featureID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]planning.FeatureMember, 0)
	for rows.Next() {
		var m planning.FeatureMember
		if err := rows.Scan(&m.ID, &m.CompanyID, &m.FeatureID, &m.EmployeeID, &m.Role, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}