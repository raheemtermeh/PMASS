package postgres

import (
	"context"

	"github.com/google/uuid"

	"PMAS/internal/domain/product"
)

// ProductMemberRepo implements product.ProductMemberRepository (MVP addition:
// collaborative product teams beyond the single owner/manager fields).
type ProductMemberRepo struct{ db *DB }

func NewProductMemberRepo(db *DB) *ProductMemberRepo { return &ProductMemberRepo{db: db} }

func (r *ProductMemberRepo) Add(ctx context.Context, m *product.ProductMember) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO product_members (id, company_id, product_id, employee_id, role, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (product_id, employee_id) DO UPDATE SET role = EXCLUDED.role`,
		m.ID, m.CompanyID, m.ProductID, m.EmployeeID, m.Role, m.CreatedAt,
	)
	return err
}

func (r *ProductMemberRepo) Remove(ctx context.Context, companyID, productID, employeeID uuid.UUID) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		DELETE FROM product_members WHERE company_id=$1 AND product_id=$2 AND employee_id=$3`,
		companyID, productID, employeeID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return product.ErrProductMemberNotFound
	}
	return nil
}

func (r *ProductMemberRepo) ListByProduct(ctx context.Context, companyID, productID uuid.UUID) ([]product.ProductMember, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, product_id, employee_id, role, created_at
		FROM product_members WHERE company_id=$1 AND product_id=$2 ORDER BY created_at ASC`,
		companyID, productID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]product.ProductMember, 0)
	for rows.Next() {
		var m product.ProductMember
		if err := rows.Scan(&m.ID, &m.CompanyID, &m.ProductID, &m.EmployeeID, &m.Role, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}
