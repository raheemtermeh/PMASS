package searchapp

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"PMAS/internal/infrastructure/postgres"
)

type Hit struct {
	Type string    `json:"type"`
	ID   uuid.UUID `json:"id"`
	Title string   `json:"title"`
	Meta string    `json:"meta,omitempty"`
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
	dbq := s.db.Q(ctx)

	rows, err := dbq.QueryContext(ctx, `
		SELECT id, name, status FROM products
		WHERE company_id=$1 AND LOWER(name) LIKE $2
		ORDER BY updated_at DESC LIMIT 10`, companyID, like)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var h Hit
			var status string
			if err := rows.Scan(&h.ID, &h.Title, &status); err == nil {
				h.Type = "product"
				h.Meta = status
				out.Hits = append(out.Hits, h)
			}
		}
	}

	frows, err := dbq.QueryContext(ctx, `
		SELECT id, title, status FROM features
		WHERE company_id=$1 AND LOWER(title) LIKE $2
		ORDER BY updated_at DESC LIMIT 10`, companyID, like)
	if err == nil {
		defer frows.Close()
		for frows.Next() {
			var h Hit
			var status string
			if err := frows.Scan(&h.ID, &h.Title, &status); err == nil {
				h.Type = "feature"
				h.Meta = status
				out.Hits = append(out.Hits, h)
			}
		}
	}

	trows, err := dbq.QueryContext(ctx, `
		SELECT id, title, status FROM tasks
		WHERE company_id=$1 AND LOWER(title) LIKE $2 AND status <> 'ARCHIVED'
		ORDER BY updated_at DESC LIMIT 10`, companyID, like)
	if err == nil {
		defer trows.Close()
		for trows.Next() {
			var h Hit
			var status string
			if err := trows.Scan(&h.ID, &h.Title, &status); err == nil {
				h.Type = "task"
				h.Meta = status
				out.Hits = append(out.Hits, h)
			}
		}
	}

	erows, err := dbq.QueryContext(ctx, `
		SELECT id, first_name || ' ' || last_name, email FROM employees
		WHERE company_id=$1 AND (LOWER(first_name) LIKE $2 OR LOWER(last_name) LIKE $2 OR LOWER(email) LIKE $2)
		AND status='ACTIVE'
		ORDER BY updated_at DESC LIMIT 10`, companyID, like)
	if err == nil {
		defer erows.Close()
		for erows.Next() {
			var h Hit
			var email string
			if err := erows.Scan(&h.ID, &h.Title, &email); err == nil {
				h.Type = "employee"
				h.Meta = email
				out.Hits = append(out.Hits, h)
			}
		}
	}

	return out, nil
}
