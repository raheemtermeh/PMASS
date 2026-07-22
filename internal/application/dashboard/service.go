package dashboardapp

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/infrastructure/postgres"
)

type Summary struct {
	ActiveProducts     int64 `json:"active_products"`
	CompletedProducts  int64 `json:"completed_products"`
	DraftReadyProducts int64 `json:"draft_ready_products"`
	OnHoldProducts     int64 `json:"on_hold_products"`
	OpenTasks          int64 `json:"open_tasks"`
	OverdueTasks       int64 `json:"overdue_tasks"`
	CompletedTasks     int64 `json:"completed_tasks"`
	UnreadNotifs       int64 `json:"unread_notifications"`
	Employees          int64 `json:"employees"`
	Departments        int64 `json:"departments"`
	Projects           int64 `json:"projects"`
	ActiveProjects     int64 `json:"active_projects"`
	Features           int64 `json:"features"`
	OpenFeatures       int64 `json:"open_features"`
	CompletedFeatures  int64 `json:"completed_features"`
	ActiveWorkflows    int64 `json:"active_workflows"`
}

type MyTask struct {
	ID       uuid.UUID  `json:"id"`
	Title    string     `json:"title"`
	Status   string     `json:"status"`
	Priority string     `json:"priority"`
	DueDate  *time.Time `json:"due_date,omitempty"`
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

// NamedCount is a generic label/value pair for charts (company-scoped aggregates).
type NamedCount struct {
	Name  string `json:"name"`
	Count int64  `json:"count"`
}

// DayCount is a date-bucketed series point for activity trend charts.
type DayCount struct {
	Day   string `json:"day"`
	Count int64  `json:"count"`
}

// Charts holds live aggregates derived from the authenticated company database.
type Charts struct {
	ProductsByStatus []NamedCount `json:"products_by_status"`
	TasksByStatus    []NamedCount `json:"tasks_by_status"`
	TasksByPriority  []NamedCount `json:"tasks_by_priority"`
	ActivityByDay    []DayCount   `json:"activity_by_day"`
	StagesByStatus   []NamedCount `json:"stages_by_status"`
}

// FlowStage is one pipeline stage with live instance status for a product.
type FlowStage struct {
	ID     uuid.UUID `json:"id"`
	Name   string    `json:"name"`
	Order  int       `json:"order"`
	Status string    `json:"status"`
}

// FlowProject is a project hanging under a product in the lifecycle graph.
type FlowProject struct {
	ID     uuid.UUID `json:"id"`
	Name   string    `json:"name"`
	Status string    `json:"status"`
}

// FlowFeature is a feature under a product (optionally tied to a project).
type FlowFeature struct {
	ID        uuid.UUID `json:"id"`
	ProjectID uuid.UUID `json:"project_id"`
	Title     string    `json:"title"`
	Status    string    `json:"status"`
	Priority  string    `json:"priority"`
}

// FlowProduct is a company product with its stage chain, projects, and features.
type FlowProduct struct {
	ID             uuid.UUID      `json:"id"`
	Name           string         `json:"name"`
	Status         string         `json:"status"`
	PipelineID     *uuid.UUID     `json:"pipeline_id,omitempty"`
	PipelineName   string         `json:"pipeline_name,omitempty"`
	PipelineStatus string         `json:"pipeline_status,omitempty"`
	ActiveStage    string         `json:"active_stage,omitempty"`
	NextStage      string         `json:"next_stage,omitempty"`
	Stages         []FlowStage    `json:"stages"`
	Projects       []FlowProject  `json:"projects"`
	Features       []FlowFeature  `json:"features"`
}

// FlowGraph is the Command Center lifecycle graph (company-scoped, live DB).
type FlowGraph struct {
	CompanyName string        `json:"company_name"`
	Products    []FlowProduct `json:"products"`
}

type Dashboard struct {
	Summary          Summary          `json:"summary"`
	Charts           Charts           `json:"charts"`
	Flow             FlowGraph        `json:"flow"`
	MyTasks          []MyTask         `json:"my_tasks"`
	MyProducts       []NamedID        `json:"my_products"`
	MyProjects       []NamedID        `json:"my_projects"`
	MyFeatures       []NamedID        `json:"my_features"`
	PipelineStatuses []PipelineStatus `json:"pipeline_statuses"`
	DeptProducts     []DeptProduct    `json:"department_products"`
	RecentActivities []map[string]any `json:"recent_activities"`
	Notifications    []map[string]any `json:"notifications"`
}

// NamedID is a lightweight workspace item for "My Products/Projects/Features".
type NamedID struct {
	ID     uuid.UUID `json:"id"`
	Name   string    `json:"name"`
	Status string    `json:"status"`
}

type Service struct {
	db *postgres.DB
}

func NewService(db *postgres.DB) *Service { return &Service{db: db} }

func (s *Service) Get(ctx context.Context, companyID uuid.UUID, employeeID *uuid.UUID) (*Dashboard, error) {
	q := s.db.Q(ctx)
	out := &Dashboard{
		Charts: Charts{
			ProductsByStatus: []NamedCount{},
			TasksByStatus:    []NamedCount{},
			TasksByPriority:  []NamedCount{},
			ActivityByDay:    []DayCount{},
			StagesByStatus:   []NamedCount{},
		},
		Flow: FlowGraph{
			Products: []FlowProduct{},
		},
		MyTasks:          []MyTask{},
		MyProducts:       []NamedID{},
		MyProjects:       []NamedID{},
		MyFeatures:       []NamedID{},
		PipelineStatuses: []PipelineStatus{},
		DeptProducts:     []DeptProduct{},
		RecentActivities: []map[string]any{},
		Notifications:    []map[string]any{},
	}

	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM products WHERE company_id=$1 AND status='ACTIVE' AND deleted_at IS NULL`, companyID).Scan(&out.Summary.ActiveProducts)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM products WHERE company_id=$1 AND status='COMPLETED' AND deleted_at IS NULL`, companyID).Scan(&out.Summary.CompletedProducts)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM products WHERE company_id=$1 AND status IN ('DRAFT','READY','PLANNING') AND deleted_at IS NULL`, companyID).Scan(&out.Summary.DraftReadyProducts)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM products WHERE company_id=$1 AND status='ON_HOLD' AND deleted_at IS NULL`, companyID).Scan(&out.Summary.OnHoldProducts)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE company_id=$1 AND deleted_at IS NULL AND status NOT IN ('COMPLETED','CANCELLED','ARCHIVED','DONE')`, companyID).Scan(&out.Summary.OpenTasks)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE company_id=$1 AND deleted_at IS NULL AND due_date < NOW() AND status NOT IN ('COMPLETED','CANCELLED','ARCHIVED','DONE')`, companyID).Scan(&out.Summary.OverdueTasks)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE company_id=$1 AND deleted_at IS NULL AND status IN ('COMPLETED','DONE')`, companyID).Scan(&out.Summary.CompletedTasks)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM notifications WHERE company_id=$1 AND is_read=false AND COALESCE(is_archived,false)=false`, companyID).Scan(&out.Summary.UnreadNotifs)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM employees WHERE company_id=$1`, companyID).Scan(&out.Summary.Employees)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM departments WHERE company_id=$1 AND status='ACTIVE'`, companyID).Scan(&out.Summary.Departments)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE company_id=$1 AND deleted_at IS NULL`, companyID).Scan(&out.Summary.Projects)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE company_id=$1 AND deleted_at IS NULL AND status IN ('ACTIVE','IN_PROGRESS','PLANNING')`, companyID).Scan(&out.Summary.ActiveProjects)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM features WHERE company_id=$1 AND deleted_at IS NULL`, companyID).Scan(&out.Summary.Features)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM features WHERE company_id=$1 AND deleted_at IS NULL AND status NOT IN ('COMPLETED','ARCHIVED','DONE')`, companyID).Scan(&out.Summary.OpenFeatures)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM features WHERE company_id=$1 AND deleted_at IS NULL AND status IN ('COMPLETED','DONE')`, companyID).Scan(&out.Summary.CompletedFeatures)
	_ = q.QueryRowContext(ctx, `SELECT COUNT(*) FROM products WHERE company_id=$1 AND deleted_at IS NULL AND status='ACTIVE'`, companyID).Scan(&out.Summary.ActiveWorkflows)

	out.Charts.ProductsByStatus = scanNamedCounts(ctx, q, `
		SELECT status, COUNT(*) FROM products WHERE company_id=$1 AND deleted_at IS NULL
		GROUP BY status ORDER BY COUNT(*) DESC`, companyID)
	out.Charts.TasksByStatus = scanNamedCounts(ctx, q, `
		SELECT status, COUNT(*) FROM tasks WHERE company_id=$1
		GROUP BY status ORDER BY COUNT(*) DESC`, companyID)
	out.Charts.TasksByPriority = scanNamedCounts(ctx, q, `
		SELECT priority, COUNT(*) FROM tasks WHERE company_id=$1
		GROUP BY priority ORDER BY COUNT(*) DESC`, companyID)
	out.Charts.StagesByStatus = scanNamedCounts(ctx, q, `
		SELECT status, COUNT(*) FROM stage_instances WHERE company_id=$1
		GROUP BY status ORDER BY COUNT(*) DESC`, companyID)
	out.Charts.ActivityByDay = scanActivityDays(ctx, q, companyID, 14)
	out.Flow = loadFlowGraph(ctx, q, companyID)

	if employeeID != nil && *employeeID != uuid.Nil {
		rows, err := q.QueryContext(ctx, `
			SELECT id, title, status, priority, due_date FROM tasks
			WHERE company_id=$1 AND assignee_id=$2 AND deleted_at IS NULL AND status NOT IN ('ARCHIVED','CANCELLED')
			ORDER BY created_at DESC LIMIT 10`, companyID, *employeeID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var t MyTask
				if err := rows.Scan(&t.ID, &t.Title, &t.Status, &t.Priority, &t.DueDate); err == nil {
					out.MyTasks = append(out.MyTasks, t)
				}
			}
		}

		prows, err := q.QueryContext(ctx, `
			SELECT id, name, status FROM products
			WHERE company_id=$1 AND deleted_at IS NULL AND (owner_id=$2 OR manager_id=$2)
			ORDER BY updated_at DESC LIMIT 8`, companyID, *employeeID)
		if err == nil {
			defer prows.Close()
			for prows.Next() {
				var n NamedID
				if err := prows.Scan(&n.ID, &n.Name, &n.Status); err == nil {
					out.MyProducts = append(out.MyProducts, n)
				}
			}
		}

		pjrows, err := q.QueryContext(ctx, `
			SELECT id, name, status FROM projects
			WHERE company_id=$1 AND deleted_at IS NULL AND (owner_id=$2 OR manager_id=$2)
			ORDER BY updated_at DESC LIMIT 8`, companyID, *employeeID)
		if err == nil {
			defer pjrows.Close()
			for pjrows.Next() {
				var n NamedID
				if err := pjrows.Scan(&n.ID, &n.Name, &n.Status); err == nil {
					out.MyProjects = append(out.MyProjects, n)
				}
			}
		}

		frows, err := q.QueryContext(ctx, `
			SELECT id, title, status FROM features
			WHERE company_id=$1 AND deleted_at IS NULL AND owner_id=$2
			ORDER BY updated_at DESC LIMIT 8`, companyID, *employeeID)
		if err == nil {
			defer frows.Close()
			for frows.Next() {
				var n NamedID
				if err := frows.Scan(&n.ID, &n.Name, &n.Status); err == nil {
					out.MyFeatures = append(out.MyFeatures, n)
				}
			}
		}

		_ = q.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM notifications
			WHERE company_id=$1 AND receiver_id=$2 AND is_read=false AND COALESCE(is_archived,false)=false`,
			companyID, *employeeID).Scan(&out.Summary.UnreadNotifs)

		nrows, err := q.QueryContext(ctx, `
			SELECT id::text, type, title, body, is_read, created_at
			FROM notifications
			WHERE company_id=$1 AND receiver_id=$2 AND COALESCE(is_archived,false)=false
			ORDER BY created_at DESC LIMIT 10`, companyID, *employeeID)
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
	}

	rows, err := q.QueryContext(ctx, `
		SELECT p.id, p.name, p.status, COALESCE(s.name,'')
		FROM products p
		LEFT JOIN stage_instances si ON si.product_id = p.id AND si.status = 'ACTIVE' AND si.company_id = p.company_id
		LEFT JOIN stages s ON s.id = si.stage_id
		WHERE p.company_id=$1 AND p.deleted_at IS NULL AND p.status IN ('ACTIVE','READY','DRAFT','PLANNING','ON_HOLD')
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

	if employeeID == nil || *employeeID == uuid.Nil {
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
	}

	return out, nil
}

func scanNamedCounts(ctx context.Context, q interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}, query string, companyID uuid.UUID) []NamedCount {
	out := []NamedCount{}
	rows, err := q.QueryContext(ctx, query, companyID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var item NamedCount
		if err := rows.Scan(&item.Name, &item.Count); err == nil && item.Name != "" {
			out = append(out, item)
		}
	}
	return out
}

// scanActivityDays returns a continuous last-N-days series (zeros filled) for this company.
func scanActivityDays(ctx context.Context, q interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}, companyID uuid.UUID, days int) []DayCount {
	if days < 1 {
		days = 14
	}
	counts := make(map[string]int64, days)
	rows, err := q.QueryContext(ctx, `
		SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)
		FROM activity_logs
		WHERE company_id=$1 AND created_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - ($2 * INTERVAL '1 day')
		GROUP BY day
		ORDER BY day`, companyID, days)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var day string
			var count int64
			if err := rows.Scan(&day, &count); err == nil {
				counts[day] = count
			}
		}
	}

	out := make([]DayCount, 0, days)
	now := time.Now().UTC()
	for i := days - 1; i >= 0; i-- {
		d := now.AddDate(0, 0, -i).Format("2006-01-02")
		out = append(out, DayCount{Day: d, Count: counts[d]})
	}
	return out
}

type flowQuerier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func loadFlowGraph(ctx context.Context, q flowQuerier, companyID uuid.UUID) FlowGraph {
	out := FlowGraph{Products: []FlowProduct{}}
	_ = q.QueryRowContext(ctx, `SELECT COALESCE(name,'') FROM companies WHERE id=$1`, companyID).Scan(&out.CompanyName)

	prows, err := q.QueryContext(ctx, `
		SELECT p.id, p.name, p.status, p.pipeline_id,
			COALESCE(pl.name, ''), COALESCE(pl.status, '')
		FROM products p
		LEFT JOIN pipelines pl ON pl.id = p.pipeline_id AND pl.company_id = p.company_id
		WHERE p.company_id=$1 AND p.status <> 'ARCHIVED' AND p.deleted_at IS NULL
		ORDER BY p.updated_at DESC
		LIMIT 50`, companyID)
	if err != nil {
		return out
	}
	defer prows.Close()

	byID := map[uuid.UUID]*FlowProduct{}
	order := []uuid.UUID{}
	for prows.Next() {
		var p FlowProduct
		var pipelineID uuid.NullUUID
		p.Stages = []FlowStage{}
		p.Projects = []FlowProject{}
		p.Features = []FlowFeature{}
		if err := prows.Scan(&p.ID, &p.Name, &p.Status, &pipelineID, &p.PipelineName, &p.PipelineStatus); err != nil {
			continue
		}
		if pipelineID.Valid {
			id := pipelineID.UUID
			p.PipelineID = &id
		}
		cp := p
		byID[p.ID] = &cp
		order = append(order, p.ID)
	}

	if len(order) == 0 {
		return out
	}

	srows, err := q.QueryContext(ctx, `
		SELECT p.id, s.id, s.name, s."order",
			COALESCE((
				SELECT si.status FROM stage_instances si
				WHERE si.company_id = p.company_id AND si.product_id = p.id AND si.stage_id = s.id
				ORDER BY si.updated_at DESC LIMIT 1
			), 'PENDING')
		FROM products p
		INNER JOIN pipelines pl ON pl.id = p.pipeline_id AND pl.company_id = p.company_id
		INNER JOIN stages s ON s.pipeline_id = pl.id
		WHERE p.company_id=$1 AND p.status <> 'ARCHIVED' AND p.deleted_at IS NULL
		ORDER BY p.updated_at DESC, s."order" ASC`, companyID)
	if err == nil {
		defer srows.Close()
		for srows.Next() {
			var productID, stageID uuid.UUID
			var name, status string
			var ord int
			if err := srows.Scan(&productID, &stageID, &name, &ord, &status); err != nil {
				continue
			}
			if fp, ok := byID[productID]; ok {
				fp.Stages = append(fp.Stages, FlowStage{
					ID: stageID, Name: name, Order: ord, Status: status,
				})
			}
		}
	}

	jrows, err := q.QueryContext(ctx, `
		SELECT id, product_id, name, status
		FROM projects
		WHERE company_id=$1 AND deleted_at IS NULL
		ORDER BY updated_at DESC
		LIMIT 120`, companyID)
	if err == nil {
		defer jrows.Close()
		for jrows.Next() {
			var projectID, productID uuid.UUID
			var name, status string
			if err := jrows.Scan(&projectID, &productID, &name, &status); err != nil {
				continue
			}
			if fp, ok := byID[productID]; ok && len(fp.Projects) < 12 {
				fp.Projects = append(fp.Projects, FlowProject{
					ID: projectID, Name: name, Status: status,
				})
			}
		}
	}

	frows, err := q.QueryContext(ctx, `
		SELECT id, product_id, project_id, title, status, COALESCE(priority, '')
		FROM features
		WHERE company_id=$1 AND deleted_at IS NULL
		ORDER BY updated_at DESC
		LIMIT 200`, companyID)
	if err == nil {
		defer frows.Close()
		for frows.Next() {
			var featureID, productID, projectID uuid.UUID
			var title, status, priority string
			if err := frows.Scan(&featureID, &productID, &projectID, &title, &status, &priority); err != nil {
				continue
			}
			if fp, ok := byID[productID]; ok && len(fp.Features) < 20 {
				fp.Features = append(fp.Features, FlowFeature{
					ID: featureID, ProjectID: projectID, Title: title, Status: status, Priority: priority,
				})
			}
		}
	}

	for _, id := range order {
		if fp, ok := byID[id]; ok {
			fillStagePointers(fp)
			out.Products = append(out.Products, *fp)
		}
	}
	return out
}

func fillStagePointers(fp *FlowProduct) {
	if len(fp.Stages) == 0 {
		return
	}
	activeIdx := -1
	for i, st := range fp.Stages {
		s := st.Status
		if s == "ACTIVE" || s == "IN_PROGRESS" {
			activeIdx = i
			break
		}
	}
	if activeIdx >= 0 {
		fp.ActiveStage = fp.Stages[activeIdx].Name
		if activeIdx+1 < len(fp.Stages) {
			fp.NextStage = fp.Stages[activeIdx+1].Name
		}
		return
	}
	// No active instance: next pending stage is the upcoming one.
	for i, st := range fp.Stages {
		if st.Status == "PENDING" || st.Status == "READY" {
			fp.NextStage = st.Name
			if i > 0 {
				fp.ActiveStage = fp.Stages[i-1].Name
			}
			return
		}
	}
	// All completed — show last stage as current.
	last := fp.Stages[len(fp.Stages)-1]
	fp.ActiveStage = last.Name
}
