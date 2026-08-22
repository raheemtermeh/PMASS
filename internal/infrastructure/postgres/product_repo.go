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

const productColumns = `id, company_id, owner_id, name, description, category, status, execution_model, pipeline_id,
	COALESCE(code,''), COALESCE(product_type,''), manager_id, COALESCE(priority,''), COALESCE(vision,''), COALESCE(goal,''),
	COALESCE(success_metrics,''), COALESCE(business_value,''), COALESCE(visibility,'ORGANIZATION'), deleted_at,
	version, created_at, updated_at`

// rowScanner (shared with planning_support_repo.go) is satisfied by both
// *sql.Row and *sql.Rows so scan helpers work for both FindByID and List.

func scanProductRow(row rowScanner) (*product.Product, error) {
	var p product.Product
	err := row.Scan(
		&p.ID, &p.CompanyID, &p.OwnerID, &p.Name, &p.Description, &p.Category, &p.Status, &p.ExecutionModel, &p.PipelineID,
		&p.Code, &p.ProductType, &p.ManagerID, &p.Priority, &p.Vision, &p.Goal,
		&p.SuccessMetrics, &p.BusinessValue, &p.Visibility, &p.DeletedAt,
		&p.Version, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, product.ErrProductNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func scanProductRowTotal(row rowScanner) (*product.Product, int64, error) {
	var p product.Product
	var total int64
	err := row.Scan(
		&p.ID, &p.CompanyID, &p.OwnerID, &p.Name, &p.Description, &p.Category, &p.Status, &p.ExecutionModel, &p.PipelineID,
		&p.Code, &p.ProductType, &p.ManagerID, &p.Priority, &p.Vision, &p.Goal,
		&p.SuccessMetrics, &p.BusinessValue, &p.Visibility, &p.DeletedAt,
		&p.Version, &p.CreatedAt, &p.UpdatedAt, &total,
	)
	if err != nil {
		return nil, 0, err
	}
	return &p, total, nil
}

func (r *ProductRepo) Create(ctx context.Context, p *product.Product) error {
	visibility := p.Visibility
	if visibility == "" {
		visibility = product.VisibilityOrganization
	}
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO products (
			id, company_id, owner_id, name, description, category, status, execution_model, pipeline_id,
			code, product_type, manager_id, priority, vision, goal, success_metrics, business_value, visibility, deleted_at,
			version, created_at, updated_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
		p.ID, p.CompanyID, p.OwnerID, p.Name, p.Description, p.Category, p.Status, p.ExecutionModel, p.PipelineID,
		nullStr(p.Code), nullStr(p.ProductType), p.ManagerID, nullStr(p.Priority), p.Vision, p.Goal,
		p.SuccessMetrics, p.BusinessValue, visibility, p.DeletedAt,
		p.Version, p.CreatedAt, p.UpdatedAt,
	)
	return translateProductConflict(err)
}

func translateProductConflict(err error) error {
	if err == nil {
		return nil
	}
	switch {
	case strings.Contains(err.Error(), "idx_products_company_code"):
		return product.ErrProductCodeTaken
	case strings.Contains(err.Error(), "idx_products_company_name"):
		return product.ErrProductNameTaken
	}
	return err
}

func (r *ProductRepo) FindByID(ctx context.Context, companyID, id uuid.UUID) (*product.Product, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT `+productColumns+`
		FROM products WHERE company_id=$1 AND id=$2`, companyID, id)
	return scanProductRow(row)
}

func (r *ProductRepo) List(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]product.Product, int64, error) {
	q = q.Normalize()
	where := `company_id = $1`
	args := []any{companyID}

	// Soft-deleted products are excluded by default. Passing status=DELETED
	// is the "something special" opt-in to inspect the trash.
	switch strings.ToUpper(q.Status) {
	case "DELETED":
		where += ` AND deleted_at IS NOT NULL`
	case "":
		where += ` AND deleted_at IS NULL`
	default:
		args = append(args, q.Status)
		where += fmt.Sprintf(` AND deleted_at IS NULL AND status = $%d`, len(args))
	}
	if q.Search != "" {
		args = append(args, "%"+strings.ToLower(q.Search)+"%")
		where += fmt.Sprintf(` AND LOWER(name) LIKE $%d`, len(args))
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
		SELECT `+productColumns+`, COUNT(*) OVER()
		FROM products WHERE `+where+` ORDER BY `+order+`
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]product.Product, 0)
	var total int64
	for rows.Next() {
		p, n, err := scanProductRowTotal(rows)
		if err != nil {
			return nil, 0, err
		}
		total = n
		out = append(out, *p)
	}
	return out, total, rows.Err()
}

func (r *ProductRepo) Update(ctx context.Context, p *product.Product) error {
	visibility := p.Visibility
	if visibility == "" {
		visibility = product.VisibilityOrganization
	}
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE products SET
			owner_id=$1, name=$2, description=$3, category=$4, status=$5, pipeline_id=$6,
			code=$7, product_type=$8, manager_id=$9, priority=$10, vision=$11, goal=$12,
			success_metrics=$13, business_value=$14, visibility=$15, deleted_at=$16,
			version=version+1, updated_at=$17
		WHERE company_id=$18 AND id=$19 AND version=$20`,
		p.OwnerID, p.Name, p.Description, p.Category, p.Status, p.PipelineID,
		nullStr(p.Code), nullStr(p.ProductType), p.ManagerID, nullStr(p.Priority), p.Vision, p.Goal,
		p.SuccessMetrics, p.BusinessValue, visibility, p.DeletedAt,
		time.Now().UTC(), p.CompanyID, p.ID, p.Version,
	)
	if err != nil {
		return translateProductConflict(err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return shared.ErrOptimisticLock
	}
	p.Version++
	return nil
}

func (r *ProductRepo) NameTaken(ctx context.Context, companyID uuid.UUID, name string, excludeID uuid.UUID) (bool, error) {
	var exists bool
	err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM products
			WHERE company_id=$1 AND deleted_at IS NULL
			  AND LOWER(TRIM(name)) = LOWER(TRIM($2)) AND id <> $3
		)`, companyID, name, excludeID).Scan(&exists)
	return exists, err
}

func (r *ProductRepo) CodeTaken(ctx context.Context, companyID uuid.UUID, code string, excludeID uuid.UUID) (bool, error) {
	if strings.TrimSpace(code) == "" {
		return false, nil
	}
	var exists bool
	err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM products
			WHERE company_id=$1 AND deleted_at IS NULL
			  AND LOWER(TRIM(COALESCE(code,''))) = LOWER(TRIM($2)) AND id <> $3
		)`, companyID, code, excludeID).Scan(&exists)
	return exists, err
}

// ListSummaries rolls up pipeline position, stage progress and last activity for
// every live product in one round trip so the list view avoids N+1 queries.
func (r *ProductRepo) ListSummaries(ctx context.Context, companyID uuid.UUID) ([]product.ProductSummary, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT p.id,
		       COALESCE(cur.name, ''),
		       COALESCE(tot.cnt, 0),
		       COALESCE(done.cnt, 0),
		       COALESCE(act.action, ''),
		       act.created_at
		FROM products p
		LEFT JOIN LATERAL (
			SELECT st.name
			FROM stage_instances si
			JOIN stages st ON st.id = si.stage_id
			WHERE si.company_id = p.company_id AND si.product_id = p.id AND si.status = 'ACTIVE'
			ORDER BY si.started_at DESC NULLS LAST
			LIMIT 1
		) cur ON TRUE
		LEFT JOIN LATERAL (
			SELECT COUNT(*)::int AS cnt FROM stages st WHERE st.pipeline_id = p.pipeline_id
		) tot ON TRUE
		LEFT JOIN LATERAL (
			SELECT COUNT(DISTINCT si.stage_id)::int AS cnt
			FROM stage_instances si
			WHERE si.company_id = p.company_id AND si.product_id = p.id AND si.status = 'COMPLETED'
		) done ON TRUE
		LEFT JOIN LATERAL (
			SELECT al.action, al.created_at
			FROM activity_logs al
			WHERE al.company_id = p.company_id AND al.entity_type = 'product' AND al.entity_id = p.id
			ORDER BY al.created_at DESC
			LIMIT 1
		) act ON TRUE
		WHERE p.company_id = $1 AND p.deleted_at IS NULL`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]product.ProductSummary, 0)
	for rows.Next() {
		var s product.ProductSummary
		var lastAt sql.NullTime
		if err := rows.Scan(&s.ProductID, &s.CurrentStage, &s.TotalStages, &s.CompletedStages, &s.LastActivity, &lastAt); err != nil {
			return nil, err
		}
		if lastAt.Valid {
			t := lastAt.Time.UTC()
			s.LastActivityAt = &t
		}
		if s.TotalStages > 0 {
			s.Progress = s.CompletedStages * 100 / s.TotalStages
			if s.Progress > 100 {
				s.Progress = 100
			}
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

type PipelineRepo struct{ db *DB }

func NewPipelineRepo(db *DB) *PipelineRepo { return &PipelineRepo{db: db} }

const pipelineColumns = `id, company_id, product_id, name, description, COALESCE(status,'ACTIVE'), archived_at, version, created_at, updated_at`

func (r *PipelineRepo) Create(ctx context.Context, pl *product.Pipeline) error {
	status := pl.Status
	if status == "" {
		status = product.PipelineStatusActive
	}
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO pipelines (id, company_id, product_id, name, description, status, archived_at, version, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		pl.ID, pl.CompanyID, pl.ProductID, pl.Name, pl.Description, status, pl.ArchivedAt, pl.Version, pl.CreatedAt, pl.UpdatedAt,
	)
	return err
}

func (r *PipelineRepo) FindByID(ctx context.Context, companyID, id uuid.UUID) (*product.Pipeline, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT `+pipelineColumns+`
		FROM pipelines WHERE company_id=$1 AND id=$2`, companyID, id)
	return scanPipeline(row)
}

func (r *PipelineRepo) FindByProductID(ctx context.Context, companyID, productID uuid.UUID) (*product.Pipeline, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT `+pipelineColumns+`
		FROM pipelines WHERE company_id=$1 AND product_id=$2`, companyID, productID)
	return scanPipeline(row)
}

func scanPipeline(row rowScanner) (*product.Pipeline, error) {
	var pl product.Pipeline
	err := row.Scan(&pl.ID, &pl.CompanyID, &pl.ProductID, &pl.Name, &pl.Description, &pl.Status, &pl.ArchivedAt, &pl.Version, &pl.CreatedAt, &pl.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, product.ErrPipelineNotFound
	}
	if err != nil {
		return nil, err
	}
	return &pl, nil
}

func (r *PipelineRepo) Update(ctx context.Context, pl *product.Pipeline) error {
	status := pl.Status
	if status == "" {
		status = product.PipelineStatusActive
	}
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE pipelines SET name=$1, description=$2, status=$3, archived_at=$4, version=version+1, updated_at=$5
		WHERE company_id=$6 AND id=$7 AND version=$8`,
		pl.Name, pl.Description, status, pl.ArchivedAt, time.Now().UTC(), pl.CompanyID, pl.ID, pl.Version,
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

const stageColumns = `id, pipeline_id, name, description, "order", entry_criteria, exit_criteria, department_id, COALESCE(color,'#64748b'), version, created_at, updated_at`

func (r *StageRepo) Create(ctx context.Context, s *product.Stage) error {
	color := s.Color
	if color == "" {
		color = product.DefaultStageColor
	}
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO stages (id, pipeline_id, name, description, "order", entry_criteria, exit_criteria, department_id, color, version, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		s.ID, s.PipelineID, s.Name, s.Description, s.Order, s.EntryCriteria, s.ExitCriteria, s.DepartmentID, color, s.Version, s.CreatedAt, s.UpdatedAt,
	)
	return err
}

func (r *StageRepo) FindByID(ctx context.Context, id uuid.UUID) (*product.Stage, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT `+stageColumns+`
		FROM stages WHERE id=$1`, id)
	var s product.Stage
	err := row.Scan(&s.ID, &s.PipelineID, &s.Name, &s.Description, &s.Order, &s.EntryCriteria, &s.ExitCriteria, &s.DepartmentID, &s.Color, &s.Version, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, product.ErrStageNotFound
	}
	return &s, err
}

func (r *StageRepo) ListByPipeline(ctx context.Context, pipelineID uuid.UUID) ([]product.Stage, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT `+stageColumns+`
		FROM stages WHERE pipeline_id=$1 ORDER BY "order" ASC`, pipelineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]product.Stage, 0)
	for rows.Next() {
		var s product.Stage
		if err := rows.Scan(&s.ID, &s.PipelineID, &s.Name, &s.Description, &s.Order, &s.EntryCriteria, &s.ExitCriteria, &s.DepartmentID, &s.Color, &s.Version, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, nil
}

func (r *StageRepo) Update(ctx context.Context, s *product.Stage) error {
	color := s.Color
	if color == "" {
		color = product.DefaultStageColor
	}
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE stages SET name=$1, description=$2, "order"=$3, entry_criteria=$4, exit_criteria=$5, department_id=$6, color=$7, version=version+1, updated_at=$8
		WHERE id=$9 AND version=$10`,
		s.Name, s.Description, s.Order, s.EntryCriteria, s.ExitCriteria, s.DepartmentID, color, time.Now().UTC(), s.ID, s.Version,
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
