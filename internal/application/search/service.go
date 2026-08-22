package searchapp

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"PMAS/internal/infrastructure/postgres"
)

type Hit struct {
	Type  string    `json:"type"`
	ID    uuid.UUID `json:"id"`
	Title string    `json:"title"`
	Meta  string    `json:"meta,omitempty"`
}

type Result struct {
	Query string `json:"query"`
	Hits  []Hit  `json:"hits"`
}

type Service struct {
	db *postgres.DB
}

func NewService(db *postgres.DB) *Service { return &Service{db: db} }

func (s *Service) Search(ctx context.Context, companyID uuid.UUID, query string) (*Result, error) {
	q := strings.TrimSpace(query)
	out := &Result{Query: q, Hits: []Hit{}}
	if len(q) < 2 {
		return out, nil
	}
	like := "%" + strings.ToLower(q) + "%"

	rows, err := s.db.Q(ctx).QueryContext(ctx, `
		(SELECT 'product' AS kind, id, name, status
		 FROM products
		 WHERE company_id=$1 AND deleted_at IS NULL AND LOWER(name) LIKE $2
		 ORDER BY updated_at DESC LIMIT 10)
		UNION ALL
		(SELECT 'feature', id, title, status
		 FROM features
		 WHERE company_id=$1 AND deleted_at IS NULL AND LOWER(title) LIKE $2
		 ORDER BY updated_at DESC LIMIT 10)
		UNION ALL
		(SELECT 'task', id, title, status
		 FROM tasks
		 WHERE company_id=$1 AND deleted_at IS NULL AND LOWER(title) LIKE $2 AND status <> 'ARCHIVED'
		 ORDER BY updated_at DESC LIMIT 10)
		UNION ALL
		(SELECT 'employee', id, first_name || ' ' || last_name, email
		 FROM employees
		 WHERE company_id=$1 AND status='ACTIVE'
		   AND (LOWER(first_name) LIKE $2 OR LOWER(last_name) LIKE $2 OR LOWER(email) LIKE $2)
		 ORDER BY updated_at DESC LIMIT 10)`, companyID, like)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var h Hit
		if err := rows.Scan(&h.Type, &h.ID, &h.Title, &h.Meta); err == nil {
			out.Hits = append(out.Hits, h)
		}
	}
	return out, rows.Err()
}
