package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/product"
	"PMAS/internal/domain/shared"
)

type ProductRepo struct{ db *DB }

func NewProductRepo(db *DB) *ProductRepo { return &ProductRepo{db: db} }

func (r *ProductRepo) Create(ctx context.Context, p *product.Product) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO products (id, company_id, owner_id, name, description, category, status, execution_model, pipeline_id, version, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		p.ID, p.CompanyID, p.OwnerID, p.Name, p.Description, p.Category, p.Status, p.ExecutionModel, p.PipelineID, p.Version, p.CreatedAt, p.UpdatedAt,
	)
	return err
}

func (r *ProductRepo) FindByID(ctx context.Context, companyID, id uuid.UUID) (*product.Product, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, owner_id, name, description, category, status, execution_model, pipeline_id, version, created_at, updated_at
		FROM products WHERE company_id=$1 AND id=$2`, companyID, id)
	return scanProduct(row)
}

func scanProduct(row *sql.Row) (*product.Product, error) {
	var p product.Product
	err := row.Scan(&p.ID, &p.CompanyID, &p.OwnerID, &p.Name, &p.Description, &p.Category, &p.Status, &p.ExecutionModel, &p.PipelineID, &p.Version, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, product.ErrProductNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *ProductRepo) List(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]product.Product, int64, error) {
	q = q.Normalize()
	where := `company_id = $1`
	args := []any{companyID}
	if q.Status != "" {
		args = append(args, q.Status)
		where += fmt.Sprintf(` AND status = $%d`, len(args))
	}
	if q.Search != "" {
		args = append(args, "%"+strings.ToLower(q.Search)+"%")
		where += fmt.Sprintf(` AND LOWER(name) LIKE $%d`, len(args))
	}
	var total int64
	if err := r.db.Q(ctx).QueryRowContext(ctx, `SELECT COUNT(*) FROM products WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	order := `created_at DESC`
	if q.Sort == "name" {
		order = `name ASC`
	} else if q.Sort == "-name" {
		order = `name DESC`
	} else if q.Sort == "created_at" {
		order = `created_at ASC`
	}
	args = append(args, q.PageSize, q.Offset())
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, owner_id, name, description, category, status, execution_model, pipeline_id, version, created_at, updated_at
		FROM products WHERE `+where+` ORDER BY `+order+`
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]product.Product, 0)
	for rows.Next() {
		var p product.Product
		if err := rows.Scan(&p.ID, &p.CompanyID, &p.OwnerID, &p.Name, &p.Description, &p.Category, &p.Status, &p.ExecutionModel, &p.PipelineID, &p.Version, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, p)
	}
	return out, total, nil
}

func (r *ProductRepo) Update(ctx context.Context, p *product.Product) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE products SET owner_id=$1, name=$2, description=$3, category=$4, status=$5, pipeline_id=$6, version=version+1, updated_at=$7
		WHERE company_id=$8 AND id=$9 AND version=$10`,
		p.OwnerID, p.Name, p.Description, p.Category, p.Status, p.PipelineID, time.Now().UTC(), p.CompanyID, p.ID, p.Version,
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

type PipelineRepo struct{ db *DB }

func NewPipelineRepo(db *DB) *PipelineRepo { return &PipelineRepo{db: db} }

func (r *PipelineRepo) Create(ctx context.Context, pl *product.Pipeline) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO pipelines (id, company_id, product_id, name, description, version, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		pl.ID, pl.CompanyID, pl.ProductID, pl.Name, pl.Description, pl.Version, pl.CreatedAt, pl.UpdatedAt,
	)
	return err
}

func (r *PipelineRepo) FindByID(ctx context.Context, companyID, id uuid.UUID) (*product.Pipeline, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, product_id, name, description, version, created_at, updated_at
		FROM pipelines WHERE company_id=$1 AND id=$2`, companyID, id)
	return scanPipeline(row)
}

func (r *PipelineRepo) FindByProductID(ctx context.Context, companyID, productID uuid.UUID) (*product.Pipeline, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, product_id, name, description, version, created_at, updated_at
		FROM pipelines WHERE company_id=$1 AND product_id=$2`, companyID, productID)
	return scanPipeline(row)
}

func scanPipeline(row *sql.Row) (*product.Pipeline, error) {
	var pl product.Pipeline
	err := row.Scan(&pl.ID, &pl.CompanyID, &pl.ProductID, &pl.Name, &pl.Description, &pl.Version, &pl.CreatedAt, &pl.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, product.ErrPipelineNotFound
	}
	if err != nil {
		return nil, err
	}
	return &pl, nil
}

func (r *PipelineRepo) Update(ctx context.Context, pl *product.Pipeline) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE pipelines SET name=$1, description=$2, version=version+1, updated_at=$3
		WHERE company_id=$4 AND id=$5 AND version=$6`,
		pl.Name, pl.Description, time.Now().UTC(), pl.CompanyID, pl.ID, pl.Version,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return shared.ErrOptimisticLock
	}
	pl.Version++
	return nil
}

func (r *PipelineRepo) Delete(ctx context.Context, companyID, id uuid.UUID) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `DELETE FROM pipelines WHERE company_id=$1 AND id=$2`, companyID, id)
	return err
}

type StageRepo struct{ db *DB }

func NewStageRepo(db *DB) *StageRepo { return &StageRepo{db: db} }

func (r *StageRepo) Create(ctx context.Context, s *product.Stage) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO stages (id, pipeline_id, name, description, "order", entry_criteria, exit_criteria, department_id, version, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		s.ID, s.PipelineID, s.Name, s.Description, s.Order, s.EntryCriteria, s.ExitCriteria, s.DepartmentID, s.Version, s.CreatedAt, s.UpdatedAt,
	)
	return err
}

func (r *StageRepo) FindByID(ctx context.Context, id uuid.UUID) (*product.Stage, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, pipeline_id, name, description, "order", entry_criteria, exit_criteria, department_id, version, created_at, updated_at
		FROM stages WHERE id=$1`, id)
	var s product.Stage
	err := row.Scan(&s.ID, &s.PipelineID, &s.Name, &s.Description, &s.Order, &s.EntryCriteria, &s.ExitCriteria, &s.DepartmentID, &s.Version, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, product.ErrStageNotFound
	}
	return &s, err
}

func (r *StageRepo) ListByPipeline(ctx context.Context, pipelineID uuid.UUID) ([]product.Stage, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, pipeline_id, name, description, "order", entry_criteria, exit_criteria, department_id, version, created_at, updated_at
		FROM stages WHERE pipeline_id=$1 ORDER BY "order" ASC`, pipelineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]product.Stage, 0)
	for rows.Next() {
		var s product.Stage
		if err := rows.Scan(&s.ID, &s.PipelineID, &s.Name, &s.Description, &s.Order, &s.EntryCriteria, &s.ExitCriteria, &s.DepartmentID, &s.Version, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, nil
}

func (r *StageRepo) Update(ctx context.Context, s *product.Stage) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE stages SET name=$1, description=$2, "order"=$3, entry_criteria=$4, exit_criteria=$5, department_id=$6, version=version+1, updated_at=$7
		WHERE id=$8 AND version=$9`,
		s.Name, s.Description, s.Order, s.EntryCriteria, s.ExitCriteria, s.DepartmentID, time.Now().UTC(), s.ID, s.Version,
	)
	return err
}

func (r *StageRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `DELETE FROM stages WHERE id=$1`, id)
	return err
}

func (r *StageRepo) HasInstances(ctx context.Context, stageID uuid.UUID) (bool, error) {
	var n int
	err := r.db.Q(ctx).QueryRowContext(ctx, `SELECT COUNT(*) FROM stage_instances WHERE stage_id=$1`, stageID).Scan(&n)
	return n > 0, err
}

func (r *StageRepo) Reorder(ctx context.Context, pipelineID uuid.UUID, orderedIDs []uuid.UUID) error {
	for i, id := range orderedIDs {
		if _, err := r.db.Q(ctx).ExecContext(ctx, `
			UPDATE stages SET "order"=$1, updated_at=$2 WHERE id=$3 AND pipeline_id=$4`,
			i, time.Now().UTC(), id, pipelineID); err != nil {
			return err
		}
	}
	return nil
}

type StageInstanceRepo struct{ db *DB }

func NewStageInstanceRepo(db *DB) *StageInstanceRepo { return &StageInstanceRepo{db: db} }

func (r *StageInstanceRepo) Create(ctx context.Context, si *product.StageInstance) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO stage_instances (id, company_id, product_id, stage_id, department_id, status, started_at, finished_at, reject_reason, duration_seconds, version, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		si.ID, si.CompanyID, si.ProductID, si.StageID, si.DepartmentID, si.Status, si.StartedAt, si.FinishedAt, si.RejectReason, si.DurationSecs, si.Version, si.CreatedAt, si.UpdatedAt,
	)
	if err != nil && strings.Contains(err.Error(), "uq_stage_instances_one_active") {
		return product.ErrMultipleActiveStage
	}
	return err
}

func (r *StageInstanceRepo) FindByID(ctx context.Context, companyID, id uuid.UUID) (*product.StageInstance, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, product_id, stage_id, department_id, status, started_at, finished_at, reject_reason, duration_seconds, version, created_at, updated_at
		FROM stage_instances WHERE company_id=$1 AND id=$2`, companyID, id)
	return scanStageInstance(row)
}

func (r *StageInstanceRepo) FindActiveByProduct(ctx context.Context, companyID, productID uuid.UUID) (*product.StageInstance, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, product_id, stage_id, department_id, status, started_at, finished_at, reject_reason, duration_seconds, version, created_at, updated_at
		FROM stage_instances WHERE company_id=$1 AND product_id=$2 AND status='ACTIVE'`, companyID, productID)
	return scanStageInstance(row)
}

func scanStageInstance(row *sql.Row) (*product.StageInstance, error) {
	var si product.StageInstance
	err := row.Scan(&si.ID, &si.CompanyID, &si.ProductID, &si.StageID, &si.DepartmentID, &si.Status, &si.StartedAt, &si.FinishedAt, &si.RejectReason, &si.DurationSecs, &si.Version, &si.CreatedAt, &si.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, product.ErrStageInstanceNotFound
	}
	if err != nil {
		return nil, err
	}
	return &si, nil
}

func (r *StageInstanceRepo) ListByProduct(ctx context.Context, companyID, productID uuid.UUID) ([]product.StageInstance, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, product_id, stage_id, department_id, status, started_at, finished_at, reject_reason, duration_seconds, version, created_at, updated_at
		FROM stage_instances WHERE company_id=$1 AND product_id=$2 ORDER BY created_at ASC`, companyID, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]product.StageInstance, 0)
	for rows.Next() {
		var si product.StageInstance
		if err := rows.Scan(&si.ID, &si.CompanyID, &si.ProductID, &si.StageID, &si.DepartmentID, &si.Status, &si.StartedAt, &si.FinishedAt, &si.RejectReason, &si.DurationSecs, &si.Version, &si.CreatedAt, &si.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, si)
	}
	return out, nil
}

func (r *StageInstanceRepo) Update(ctx context.Context, si *product.StageInstance) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE stage_instances SET department_id=$1, status=$2, started_at=$3, finished_at=$4, reject_reason=$5, duration_seconds=$6, version=version+1, updated_at=$7
		WHERE company_id=$8 AND id=$9 AND version=$10`,
		si.DepartmentID, si.Status, si.StartedAt, si.FinishedAt, si.RejectReason, si.DurationSecs, time.Now().UTC(), si.CompanyID, si.ID, si.Version,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return shared.ErrOptimisticLock
	}
	si.Version++
	return nil
}
