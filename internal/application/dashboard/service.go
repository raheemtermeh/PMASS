package dashboardapp

import (
	"context"

	"github.com/google/uuid"

	"PMAS/internal/infrastructure/postgres"
)

type Summary struct {
	ActiveProducts     int64 `json:"active_products"`
	CompletedProducts  int64 `json:"completed_products"`
	DraftReadyProducts int64 `json:"draft_ready_products"`
	OpenTasks          int64 `json:"open_tasks"`
	UnreadNotifs       int64 `json:"unread_notifications"`
}

type MyTask struct {
	ID       uuid.UUID `json:"id"`
	Title    string    `json:"title"`
	Status   string    `json:"status"`
	Priority string    `json:"priority"`
}

type PipelineStatus struct {
	ProductID   uuid.UUID `json:"product_id"`
	ProductName string    `json:"product_name"`
	Status      string    `json:"status"`
	ActiveStage string    `json:"active_stage,omitempty"`
}

type DeptProduct struct {
	DepartmentID   uuid.UUID `json:"department_id"`
	DepartmentName string    `json:"department_name"`
	ProductCount   int64     `json:"product_count"`
}

type Dashboard struct {
	Summary          Summary         `json:"summary"`
	MyTasks          []MyTask        `json:"my_tasks"`
	PipelineStatuses []PipelineStatus `json:"pipeline_statuses"`
	DeptProducts     []DeptProduct   `json:"department_products"`
	RecentActivities []map[string]any `json:"recent_activities"`
	Notifications    []map[string]any `json:"notifications"`
}

type Service struct {
	db *postgres.DB
}

func NewService(db *postgres.DB) *Service { return &Service{db: db} }

func (s *Service) Get(ctx context.Context, companyID uuid.UUID, employeeID *uuid.UUID) (*Dashboard, error) {
	q := s.db.Q(ctx)
	out := &Dashboard{
		MyTasks:          []MyTask{},
		PipelineStatuses: []PipelineStatus{},
		DeptProducts:     []DeptProduct{},
		RecentActivities: []map[string]any{},
		Notifications:    []map[string]any{},
	}

	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM products WHERE company_id=$1 AND status='ACTIVE'`, companyID).Scan(&out.Summary.ActiveProducts)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM products WHERE company_id=$1 AND status='COMPLETED'`, companyID).Scan(&out.Summary.CompletedProducts)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM products WHERE company_id=$1 AND status IN ('DRAFT','READY')`, companyID).Scan(&out.Summary.DraftReadyProducts)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE company_id=$1 AND status NOT IN ('COMPLETED','CANCELLED','ARCHIVED')`, companyID).Scan(&out.Summary.OpenTasks)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM notifications WHERE company_id=$1 AND is_read=false AND COALESCE(is_archived,false)=false`, companyID).Scan(&out.Summary.UnreadNotifs)

	if employeeID != nil && *employeeID != uuid.Nil {
		rows, err := q.QueryContext(ctx, `
			SELECT id, title, status, priority FROM tasks
			WHERE company_id=$1 AND assignee_id=$2 AND status NOT IN ('ARCHIVED','CANCELLED')
			ORDER BY created_at DESC LIMIT 10`, companyID, *employeeID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var t MyTask
				if err := rows.Scan(&t.ID, &t.Title, &t.Status, &t.Priority); err == nil {
					out.MyTasks = append(out.MyTasks, t)
				}
			}
		}
	}

	rows, err := q.QueryContext(ctx, `
		SELECT p.id, p.name, p.status, COALESCE(s.name,'')
		FROM products p
		LEFT JOIN stage_instances si ON si.product_id = p.id AND si.status = 'ACTIVE' AND si.company_id = p.company_id
		LEFT JOIN stages s ON s.id = si.stage_id
		WHERE p.company_id=$1 AND p.status IN ('ACTIVE','READY','DRAFT')
		ORDER BY p.updated_at DESC LIMIT 15`, companyID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ps PipelineStatus
			if err := rows.Scan(&ps.ProductID, &ps.ProductName, &ps.Status, &ps.ActiveStage); err == nil {
				out.PipelineStatuses = append(out.PipelineStatuses, ps)
			}
		}
	}

	drows, err := q.QueryContext(ctx, `
		SELECT d.id, d.name, COUNT(DISTINCT si.product_id)
		FROM departments d
		LEFT JOIN stage_instances si ON si.department_id = d.id AND si.status = 'ACTIVE' AND si.company_id = d.company_id
		WHERE d.company_id=$1 AND d.status='ACTIVE'
		GROUP BY d.id, d.name
		ORDER BY d.name`, companyID)
	if err == nil {
		defer drows.Close()
		for drows.Next() {
			var dp DeptProduct
			if err := drows.Scan(&dp.DepartmentID, &dp.DepartmentName, &dp.ProductCount); err == nil {
				out.DeptProducts = append(out.DeptProducts, dp)
			}
		}
	}

	arows, err := q.QueryContext(ctx, `
		SELECT id::text, entity_type, entity_id::text, action, created_at
		FROM activity_logs WHERE company_id=$1
		ORDER BY created_at DESC LIMIT 15`, companyID)
	if err == nil {
		defer arows.Close()
		for arows.Next() {
			var id, et, eid, action string
			var created any
			if err := arows.Scan(&id, &et, &eid, &action, &created); err == nil {
				out.RecentActivities = append(out.RecentActivities, map[string]any{
					"id": id, "entity_type": et, "entity_id": eid, "action": action, "created_at": created,
				})
			}
		}
	}

	nrows, err := q.QueryContext(ctx, `
		SELECT id::text, type, title, body, is_read, created_at
		FROM notifications WHERE company_id=$1 AND COALESCE(is_archived,false)=false
		ORDER BY created_at DESC LIMIT 10`, companyID)
	if err == nil {
		defer nrows.Close()
		for nrows.Next() {
			var id, typ, title, body string
			var isRead bool
			var created any
			if err := nrows.Scan(&id, &typ, &title, &body, &isRead, &created); err == nil {
				out.Notifications = append(out.Notifications, map[string]any{
					"id": id, "type": typ, "title": title, "body": body, "is_read": isRead, "created_at": created,
				})
			}
		}
	}

	return out, nil
}
