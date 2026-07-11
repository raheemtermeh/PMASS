package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/organization"
	"PMAS/internal/domain/shared"
)

type CompanyRepo struct{ db *DB }

func NewCompanyRepo(db *DB) *CompanyRepo { return &CompanyRepo{db: db} }

func (r *CompanyRepo) Create(ctx context.Context, c *organization.Company) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO companies (id, name, slug, status, logo_url, language, timezone, version, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		c.ID, c.Name, c.Slug, c.Status, c.LogoURL, c.Language, c.Timezone, c.Version, c.CreatedAt, c.UpdatedAt,
	)
	return err
}

func (r *CompanyRepo) FindByID(ctx context.Context, id uuid.UUID) (*organization.Company, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, name, slug, status, COALESCE(logo_url,''), COALESCE(language,'en'), COALESCE(timezone,'UTC'),
		       version, created_at, updated_at
		FROM companies WHERE id = $1`, id)
	return scanCompany(row)
}

func (r *CompanyRepo) FindBySlug(ctx context.Context, slug string) (*organization.Company, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, name, slug, status, COALESCE(logo_url,''), COALESCE(language,'en'), COALESCE(timezone,'UTC'),
		       version, created_at, updated_at
		FROM companies WHERE slug = $1`, slug)
	return scanCompany(row)
}

func (r *CompanyRepo) Update(ctx context.Context, c *organization.Company) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE companies SET name=$1, status=$2, logo_url=$3, language=$4, timezone=$5, version=version+1, updated_at=$6
		WHERE id=$7 AND version=$8`,
		c.Name, c.Status, c.LogoURL, c.Language, c.Timezone, time.Now().UTC(), c.ID, c.Version,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return shared.ErrOptimisticLock
	}
	c.Version++
	return nil
}

func scanCompany(row *sql.Row) (*organization.Company, error) {
	var c organization.Company
	err := row.Scan(&c.ID, &c.Name, &c.Slug, &c.Status, &c.LogoURL, &c.Language, &c.Timezone, &c.Version, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, organization.ErrCompanyNotFound
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// ResolveCompanyID maps legacy tenant_id → company UUID (Tenant = Company).
func (db *DB) ResolveCompanyID(ctx context.Context, tenantID int) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.Q(ctx).QueryRowContext(ctx, `
		SELECT company_id FROM tenants WHERE id = $1 AND company_id IS NOT NULL`, tenantID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return uuid.Nil, organization.ErrCompanyNotFound
	}
	return id, err
}

type DepartmentRepo struct{ db *DB }

func NewDepartmentRepo(db *DB) *DepartmentRepo { return &DepartmentRepo{db: db} }

func (r *DepartmentRepo) Create(ctx context.Context, d *organization.Department) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO departments (id, company_id, manager_id, name, status, version, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		d.ID, d.CompanyID, d.ManagerID, d.Name, d.Status, d.Version, d.CreatedAt, d.UpdatedAt,
	)
	return err
}

func (r *DepartmentRepo) FindByID(ctx context.Context, companyID, id uuid.UUID) (*organization.Department, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, manager_id, name, status, version, created_at, updated_at
		FROM departments WHERE company_id=$1 AND id=$2`, companyID, id)
	var d organization.Department
	err := row.Scan(&d.ID, &d.CompanyID, &d.ManagerID, &d.Name, &d.Status, &d.Version, &d.CreatedAt, &d.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, organization.ErrDepartmentNotFound
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *DepartmentRepo) List(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]organization.Department, int64, error) {
	q = q.Normalize()
	var total int64
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
	if err := r.db.Q(ctx).QueryRowContext(ctx, `SELECT COUNT(*) FROM departments WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, q.PageSize, q.Offset())
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, manager_id, name, status, version, created_at, updated_at
		FROM departments WHERE `+where+`
		ORDER BY created_at DESC LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]organization.Department, 0)
	for rows.Next() {
		var d organization.Department
		if err := rows.Scan(&d.ID, &d.CompanyID, &d.ManagerID, &d.Name, &d.Status, &d.Version, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, d)
	}
	return out, total, nil
}

func (r *DepartmentRepo) Update(ctx context.Context, d *organization.Department) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE departments SET manager_id=$1, name=$2, status=$3, version=version+1, updated_at=$4
		WHERE company_id=$5 AND id=$6 AND version=$7`,
		d.ManagerID, d.Name, d.Status, time.Now().UTC(), d.CompanyID, d.ID, d.Version,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return shared.ErrOptimisticLock
	}
	d.Version++
	return nil
}

type TeamRepo struct{ db *DB }

func NewTeamRepo(db *DB) *TeamRepo { return &TeamRepo{db: db} }

func (r *TeamRepo) Create(ctx context.Context, t *organization.Team) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO teams (id, company_id, department_id, lead_id, name, description, status, version, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		t.ID, t.CompanyID, t.DepartmentID, t.LeadID, t.Name, t.Description, t.Status, t.Version, t.CreatedAt, t.UpdatedAt,
	)
	return err
}

func (r *TeamRepo) FindByID(ctx context.Context, companyID, id uuid.UUID) (*organization.Team, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, department_id, lead_id, name, description, status, version, created_at, updated_at
		FROM teams WHERE company_id=$1 AND id=$2`, companyID, id)
	var t organization.Team
	err := row.Scan(&t.ID, &t.CompanyID, &t.DepartmentID, &t.LeadID, &t.Name, &t.Description, &t.Status, &t.Version, &t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, organization.ErrTeamNotFound
	}
	return &t, err
}

func (r *TeamRepo) List(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]organization.Team, int64, error) {
	return r.list(ctx, companyID, uuid.Nil, q)
}

func (r *TeamRepo) ListByDepartment(ctx context.Context, companyID, departmentID uuid.UUID, q shared.PageQuery) ([]organization.Team, int64, error) {
	return r.list(ctx, companyID, departmentID, q)
}

func (r *TeamRepo) list(ctx context.Context, companyID, departmentID uuid.UUID, q shared.PageQuery) ([]organization.Team, int64, error) {
	q = q.Normalize()
	where := `company_id = $1`
	args := []any{companyID}
	if departmentID != uuid.Nil {
		args = append(args, departmentID)
		where += fmt.Sprintf(` AND department_id = $%d`, len(args))
	}
	if q.Search != "" {
		args = append(args, "%"+strings.ToLower(q.Search)+"%")
		where += fmt.Sprintf(` AND LOWER(name) LIKE $%d`, len(args))
	}
	var total int64
	if err := r.db.Q(ctx).QueryRowContext(ctx, `SELECT COUNT(*) FROM teams WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, q.PageSize, q.Offset())
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, department_id, lead_id, name, description, status, version, created_at, updated_at
		FROM teams WHERE `+where+`
		ORDER BY created_at DESC LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]organization.Team, 0)
	for rows.Next() {
		var t organization.Team
		if err := rows.Scan(&t.ID, &t.CompanyID, &t.DepartmentID, &t.LeadID, &t.Name, &t.Description, &t.Status, &t.Version, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, t)
	}
	return out, total, nil
}

func (r *TeamRepo) Update(ctx context.Context, t *organization.Team) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE teams SET lead_id=$1, name=$2, description=$3, status=$4, version=version+1, updated_at=$5
		WHERE company_id=$6 AND id=$7 AND version=$8`,
		t.LeadID, t.Name, t.Description, t.Status, time.Now().UTC(), t.CompanyID, t.ID, t.Version,
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

type EmployeeRepo struct{ db *DB }

func NewEmployeeRepo(db *DB) *EmployeeRepo { return &EmployeeRepo{db: db} }

func (r *EmployeeRepo) Create(ctx context.Context, e *organization.Employee) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO employees (id, company_id, first_name, last_name, email, phone, status, user_id, version, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		e.ID, e.CompanyID, e.FirstName, e.LastName, e.Email, e.Phone, e.Status, e.UserID, e.Version, e.CreatedAt, e.UpdatedAt,
	)
	return err
}

func (r *EmployeeRepo) FindByID(ctx context.Context, companyID, id uuid.UUID) (*organization.Employee, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, first_name, last_name, email, phone, status, user_id, version, created_at, updated_at
		FROM employees WHERE company_id=$1 AND id=$2`, companyID, id)
	return scanEmployee(row)
}

func (r *EmployeeRepo) FindByEmail(ctx context.Context, companyID uuid.UUID, email string) (*organization.Employee, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, first_name, last_name, email, phone, status, user_id, version, created_at, updated_at
		FROM employees WHERE company_id=$1 AND email=$2`, companyID, email)
	return scanEmployee(row)
}

func scanEmployee(row *sql.Row) (*organization.Employee, error) {
	var e organization.Employee
	err := row.Scan(&e.ID, &e.CompanyID, &e.FirstName, &e.LastName, &e.Email, &e.Phone, &e.Status, &e.UserID, &e.Version, &e.CreatedAt, &e.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, organization.ErrEmployeeNotFound
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (r *EmployeeRepo) List(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]organization.Employee, int64, error) {
	q = q.Normalize()
	where := `company_id = $1`
	args := []any{companyID}
	if q.Search != "" {
		args = append(args, "%"+strings.ToLower(q.Search)+"%")
		where += fmt.Sprintf(` AND (LOWER(first_name) LIKE $%d OR LOWER(last_name) LIKE $%d OR LOWER(email) LIKE $%d)`, len(args), len(args), len(args))
	}
	var total int64
	if err := r.db.Q(ctx).QueryRowContext(ctx, `SELECT COUNT(*) FROM employees WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, q.PageSize, q.Offset())
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, first_name, last_name, email, phone, status, user_id, version, created_at, updated_at
		FROM employees WHERE `+where+`
		ORDER BY created_at DESC LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]organization.Employee, 0)
	for rows.Next() {
		var e organization.Employee
		if err := rows.Scan(&e.ID, &e.CompanyID, &e.FirstName, &e.LastName, &e.Email, &e.Phone, &e.Status, &e.UserID, &e.Version, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, e)
	}
	return out, total, nil
}

func (r *EmployeeRepo) Update(ctx context.Context, e *organization.Employee) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE employees SET first_name=$1, last_name=$2, email=$3, phone=$4, status=$5, user_id=$6, version=version+1, updated_at=$7
		WHERE company_id=$8 AND id=$9 AND version=$10`,
		e.FirstName, e.LastName, e.Email, e.Phone, e.Status, e.UserID, time.Now().UTC(), e.CompanyID, e.ID, e.Version,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return shared.ErrOptimisticLock
	}
	e.Version++
	return nil
}

func (r *EmployeeRepo) AssignToTeam(ctx context.Context, companyID, employeeID, teamID uuid.UUID) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO team_members_vsm (company_id, team_id, employee_id)
		VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, companyID, teamID, employeeID)
	return err
}

func (r *EmployeeRepo) RemoveFromTeam(ctx context.Context, companyID, employeeID, teamID uuid.UUID) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		DELETE FROM team_members_vsm WHERE company_id=$1 AND team_id=$2 AND employee_id=$3`,
		companyID, teamID, employeeID)
	return err
}
