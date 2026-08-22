package dashboardapp

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"

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

// MyWork is personal Command Center counts for the scoped employee.
type MyWork struct {
	Assigned      int64 `json:"assigned"`
	DueToday      int64 `json:"due_today"`
	Overdue       int64 `json:"overdue"`
	WaitingReview int64 `json:"waiting_review"`
	Mentions      int64 `json:"mentions"`
	Approvals     int64 `json:"approvals"`
}

// UpcomingDeadline is a company-wide due task for the manager deadlines widget.
type UpcomingDeadline struct {
	ID          uuid.UUID  `json:"id"`
	Title       string     `json:"title"`
	Status      string     `json:"status"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	ProductName string     `json:"product_name,omitempty"`
}

// TeamWorkloadRow is one employee's open-task load for Team Workload.
type TeamWorkloadRow struct {
	EmployeeID  uuid.UUID `json:"employee_id"`
	Name        string    `json:"name"`
	OpenTasks   int64     `json:"open_tasks"`
	LoadPercent int64     `json:"load_percent"`
}

// PipelineAlert surfaces blocked / stuck / on-hold pipeline signals.
type PipelineAlert struct {
	Kind        string    `json:"kind"`
	ProductID   uuid.UUID `json:"product_id"`
	ProductName string    `json:"product_name"`
	StageName   string    `json:"stage_name,omitempty"`
	Detail      string    `json:"detail"`
	Days        int64     `json:"days"`
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
	ID             uuid.UUID     `json:"id"`
	Name           string        `json:"name"`
	Status         string        `json:"status"`
	PipelineID     *uuid.UUID    `json:"pipeline_id,omitempty"`
	PipelineName   string        `json:"pipeline_name,omitempty"`
	PipelineStatus string        `json:"pipeline_status,omitempty"`
	ActiveStage    string        `json:"active_stage,omitempty"`
	NextStage      string        `json:"next_stage,omitempty"`
	Stages         []FlowStage   `json:"stages"`
	Projects       []FlowProject `json:"projects"`
	Features       []FlowFeature `json:"features"`
}

// FlowGraph is the Command Center lifecycle graph (company-scoped, live DB).
type FlowGraph struct {
	CompanyName string        `json:"company_name"`
	Products    []FlowProduct `json:"products"`
}

type Dashboard struct {
	Summary           Summary            `json:"summary"`
	Charts            Charts             `json:"charts"`
	Flow              FlowGraph          `json:"flow"`
	MyTasks           []MyTask           `json:"my_tasks"`
	MyProducts        []NamedID          `json:"my_products"`
	MyProjects        []NamedID          `json:"my_projects"`
	MyFeatures        []NamedID          `json:"my_features"`
	MyWork            MyWork             `json:"my_work"`
	UpcomingDeadlines []UpcomingDeadline `json:"upcoming_deadlines"`
	TeamWorkload      []TeamWorkloadRow  `json:"team_workload"`
	PipelineAlerts    []PipelineAlert    `json:"pipeline_alerts"`
	PipelineStatuses  []PipelineStatus   `json:"pipeline_statuses"`
	DeptProducts      []DeptProduct      `json:"department_products"`
	RecentActivities  []ActivityItem     `json:"recent_activities"`
	Notifications     []NotificationItem `json:"notifications"`
}

type ActivityItem struct {
	ID         string    `json:"id"`
	EntityType string    `json:"entity_type"`
	EntityID   string    `json:"entity_id"`
	Action     string    `json:"action"`
	CreatedAt  time.Time `json:"created_at"`
}

type NotificationItem struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	IsRead    bool      `json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}

// StatusDashboard is the compact read model used by the live Status Board.
// It intentionally excludes personal work, charts, notifications and widget data.
type StatusDashboard struct {
	Summary          Summary          `json:"summary"`
	Flow             FlowGraph        `json:"flow"`
	PipelineStatuses []PipelineStatus `json:"pipeline_statuses"`
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

func (s *Service) GetStatus(ctx context.Context, companyID uuid.UUID) (*StatusDashboard, error) {
	q := s.db.Q(ctx)
	out := &StatusDashboard{
		Flow:             FlowGraph{Products: []FlowProduct{}},
		PipelineStatuses: []PipelineStatus{},
	}
	_ = q.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FILTER (WHERE status='ACTIVE') FROM products WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FILTER (WHERE status='COMPLETED') FROM products WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FILTER (WHERE status='ON_HOLD') FROM products WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FROM tasks WHERE company_id=$1 AND deleted_at IS NULL
				AND status NOT IN ('COMPLETED','CANCELLED','ARCHIVED','DONE')),
			(SELECT COUNT(*) FROM projects WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FROM features WHERE company_id=$1 AND deleted_at IS NULL
				AND status NOT IN ('COMPLETED','ARCHIVED','DONE'))
	`, companyID).Scan(
		&out.Summary.ActiveProducts, &out.Summary.CompletedProducts, &out.Summary.OnHoldProducts,
		&out.Summary.OpenTasks, &out.Summary.Projects, &out.Summary.OpenFeatures,
	)
	out.Flow = loadFlowGraph(ctx, q, companyID)
	out.PipelineStatuses = loadPipelineStatuses(ctx, q, companyID)
	return out, nil
}

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
		MyTasks:           []MyTask{},
		MyProducts:        []NamedID{},
		MyProjects:        []NamedID{},
		MyFeatures:        []NamedID{},
		UpcomingDeadlines: []UpcomingDeadline{},
		TeamWorkload:      []TeamWorkloadRow{},
		PipelineAlerts:    []PipelineAlert{},
		PipelineStatuses:  []PipelineStatus{},
		DeptProducts:      []DeptProduct{},
		RecentActivities:  []ActivityItem{},
		Notifications:     []NotificationItem{},
	}

	loadSummary(ctx, q, companyID, &out.Summary)
	loadCharts(ctx, q, companyID, &out.Charts)
	out.Flow = loadFlowGraph(ctx, q, companyID)

	if employeeID != nil && *employeeID != uuid.Nil {
		loadPersonal(ctx, q, companyID, *employeeID, out)
		loadMyWork(ctx, q, companyID, *employeeID, &out.MyWork)
	}

	loadUpcomingDeadlines(ctx, q, companyID, &out.UpcomingDeadlines)
	loadTeamWorkload(ctx, q, companyID, &out.TeamWorkload)
	loadPipelineAlerts(ctx, q, companyID, &out.PipelineAlerts)
	out.PipelineStatuses = loadPipelineStatuses(ctx, q, companyID)
	loadDeptProducts(ctx, q, companyID, &out.DeptProducts)
	loadRecentActivities(ctx, q, companyID, &out.RecentActivities)

	if employeeID == nil || *employeeID == uuid.Nil {
		loadCompanyNotifications(ctx, q, companyID, &out.Notifications)
	}

	return out, nil
}

func loadSummary(ctx context.Context, q dashQuerier, companyID uuid.UUID, out *Summary) {
	_ = q.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FILTER (WHERE status='ACTIVE') FROM products WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FILTER (WHERE status='COMPLETED') FROM products WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FILTER (WHERE status IN ('DRAFT','READY','PLANNING')) FROM products WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FILTER (WHERE status='ON_HOLD') FROM products WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED','CANCELLED','ARCHIVED','DONE')) FROM tasks WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('COMPLETED','CANCELLED','ARCHIVED','DONE')) FROM tasks WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FILTER (WHERE status IN ('COMPLETED','DONE')) FROM tasks WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FROM notifications WHERE company_id=$1 AND is_read=false AND COALESCE(is_archived,false)=false),
			(SELECT COUNT(*) FROM employees WHERE company_id=$1),
			(SELECT COUNT(*) FROM departments WHERE company_id=$1 AND status='ACTIVE'),
			(SELECT COUNT(*) FROM projects WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FILTER (WHERE status IN ('ACTIVE','IN_PROGRESS','PLANNING')) FROM projects WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FROM features WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED','ARCHIVED','DONE')) FROM features WHERE company_id=$1 AND deleted_at IS NULL),
			(SELECT COUNT(*) FILTER (WHERE status IN ('COMPLETED','DONE')) FROM features WHERE company_id=$1 AND deleted_at IS NULL)
	`, companyID).Scan(
		&out.ActiveProducts, &out.CompletedProducts, &out.DraftReadyProducts, &out.OnHoldProducts,
		&out.OpenTasks, &out.OverdueTasks, &out.CompletedTasks, &out.UnreadNotifs,
		&out.Employees, &out.Departments, &out.Projects, &out.ActiveProjects,
		&out.Features, &out.OpenFeatures, &out.CompletedFeatures,
	)
	out.ActiveWorkflows = out.ActiveProducts
}

func loadCharts(ctx context.Context, q dashQuerier, companyID uuid.UUID, out *Charts) {
	rows, err := q.QueryContext(ctx, `
		SELECT 'products_by_status', status, COUNT(*) FROM products WHERE company_id=$1 AND deleted_at IS NULL GROUP BY status
		UNION ALL
		SELECT 'tasks_by_status', status, COUNT(*) FROM tasks WHERE company_id=$1 GROUP BY status
		UNION ALL
		SELECT 'tasks_by_priority', priority, COUNT(*) FROM tasks WHERE company_id=$1 GROUP BY priority
		UNION ALL
		SELECT 'stages_by_status', status, COUNT(*) FROM stage_instances WHERE company_id=$1 GROUP BY status`, companyID)
	if err != nil {
		out.ActivityByDay = scanActivityDays(ctx, q, companyID, 14)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var kind, name string
		var count int64
		if err := rows.Scan(&kind, &name, &count); err != nil || name == "" {
			continue
		}
		item := NamedCount{Name: name, Count: count}
		switch kind {
		case "products_by_status":
			out.ProductsByStatus = append(out.ProductsByStatus, item)
		case "tasks_by_status":
			out.TasksByStatus = append(out.TasksByStatus, item)
		case "tasks_by_priority":
			out.TasksByPriority = append(out.TasksByPriority, item)
		case "stages_by_status":
			out.StagesByStatus = append(out.StagesByStatus, item)
		}
	}
	out.ActivityByDay = scanActivityDays(ctx, q, companyID, 14)
}

func loadPersonal(ctx context.Context, q dashQuerier, companyID, employeeID uuid.UUID, out *Dashboard) {
	if rows, err := q.QueryContext(ctx, `
		SELECT id, title, status, priority, due_date FROM tasks
		WHERE company_id=$1 AND assignee_id=$2 AND deleted_at IS NULL AND status NOT IN ('ARCHIVED','CANCELLED')
		ORDER BY created_at DESC LIMIT 10`, companyID, employeeID); err == nil {
		for rows.Next() {
			var t MyTask
			if err := rows.Scan(&t.ID, &t.Title, &t.Status, &t.Priority, &t.DueDate); err == nil {
				out.MyTasks = append(out.MyTasks, t)
			}
		}
		rows.Close()
	}
	if rows, err := q.QueryContext(ctx, `
		SELECT id, name, status FROM products
		WHERE company_id=$1 AND deleted_at IS NULL AND (owner_id=$2 OR manager_id=$2)
		ORDER BY updated_at DESC LIMIT 8`, companyID, employeeID); err == nil {
		for rows.Next() {
			var n NamedID
			if err := rows.Scan(&n.ID, &n.Name, &n.Status); err == nil {
				out.MyProducts = append(out.MyProducts, n)
			}
		}
		rows.Close()
	}
	if rows, err := q.QueryContext(ctx, `
		SELECT id, name, status FROM projects
		WHERE company_id=$1 AND deleted_at IS NULL AND (owner_id=$2 OR manager_id=$2)
		ORDER BY updated_at DESC LIMIT 8`, companyID, employeeID); err == nil {
		for rows.Next() {
			var n NamedID
			if err := rows.Scan(&n.ID, &n.Name, &n.Status); err == nil {
				out.MyProjects = append(out.MyProjects, n)
			}
		}
		rows.Close()
	}
	if rows, err := q.QueryContext(ctx, `
		SELECT id, title, status FROM features
		WHERE company_id=$1 AND deleted_at IS NULL AND owner_id=$2
		ORDER BY updated_at DESC LIMIT 8`, companyID, employeeID); err == nil {
		for rows.Next() {
			var n NamedID
			if err := rows.Scan(&n.ID, &n.Name, &n.Status); err == nil {
				out.MyFeatures = append(out.MyFeatures, n)
			}
		}
		rows.Close()
	}
	_ = q.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM notifications
		WHERE company_id=$1 AND receiver_id=$2 AND is_read=false AND COALESCE(is_archived,false)=false`,
		companyID, employeeID).Scan(&out.Summary.UnreadNotifs)
	loadNotifications(ctx, q, `
		SELECT id::text, type, title, body, is_read, created_at
		FROM notifications
		WHERE company_id=$1 AND receiver_id=$2 AND COALESCE(is_archived,false)=false
		ORDER BY created_at DESC LIMIT 10`, []any{companyID, employeeID}, &out.Notifications)
}

func loadPipelineStatuses(ctx context.Context, q dashQuerier, companyID uuid.UUID) []PipelineStatus {
	out := []PipelineStatus{}
	rows, err := q.QueryContext(ctx, `
		SELECT p.id, p.name, p.status, COALESCE(s.name,'')
		FROM products p
		LEFT JOIN stage_instances si ON si.product_id = p.id AND si.status = 'ACTIVE' AND si.company_id = p.company_id
		LEFT JOIN stages s ON s.id = si.stage_id
		WHERE p.company_id=$1 AND p.deleted_at IS NULL AND p.status IN ('ACTIVE','READY','DRAFT','PLANNING','ON_HOLD')
		ORDER BY p.updated_at DESC LIMIT 15`, companyID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var ps PipelineStatus
		if err := rows.Scan(&ps.ProductID, &ps.ProductName, &ps.Status, &ps.ActiveStage); err == nil {
			out = append(out, ps)
		}
	}
	return out
}

func loadDeptProducts(ctx context.Context, q dashQuerier, companyID uuid.UUID, out *[]DeptProduct) {
	rows, err := q.QueryContext(ctx, `
		SELECT d.id, d.name, COUNT(DISTINCT si.product_id)
		FROM departments d
		LEFT JOIN stage_instances si ON si.department_id = d.id AND si.status = 'ACTIVE' AND si.company_id = d.company_id
		WHERE d.company_id=$1 AND d.status='ACTIVE'
		GROUP BY d.id, d.name
		ORDER BY d.name`, companyID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var dp DeptProduct
		if err := rows.Scan(&dp.DepartmentID, &dp.DepartmentName, &dp.ProductCount); err == nil {
			*out = append(*out, dp)
		}
	}
}

func loadRecentActivities(ctx context.Context, q dashQuerier, companyID uuid.UUID, out *[]ActivityItem) {
	rows, err := q.QueryContext(ctx, `
		SELECT id::text, entity_type, entity_id::text, action, created_at
		FROM activity_logs WHERE company_id=$1
		ORDER BY created_at DESC LIMIT 15`, companyID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var a ActivityItem
		if err := rows.Scan(&a.ID, &a.EntityType, &a.EntityID, &a.Action, &a.CreatedAt); err == nil {
			*out = append(*out, a)
		}
	}
}

func loadCompanyNotifications(ctx context.Context, q dashQuerier, companyID uuid.UUID, out *[]NotificationItem) {
	loadNotifications(ctx, q, `
		SELECT id::text, type, title, body, is_read, created_at
		FROM notifications WHERE company_id=$1 AND COALESCE(is_archived,false)=false
		ORDER BY created_at DESC LIMIT 10`, []any{companyID}, out)
}

func loadNotifications(ctx context.Context, q dashQuerier, query string, args []any, out *[]NotificationItem) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var n NotificationItem
		if err := rows.Scan(&n.ID, &n.Type, &n.Title, &n.Body, &n.IsRead, &n.CreatedAt); err == nil {
			*out = append(*out, n)
		}
	}
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

	// Company name + product list in one round trip.
	// If there are no products, this still returns a single row with company_name.
	prows, err := q.QueryContext(ctx, `
		WITH company AS (
			SELECT COALESCE(name,'') AS name FROM companies WHERE id=$1
		)
		SELECT
			company.name,
			p.id, p.name, p.status, p.pipeline_id,
			COALESCE(pl.name, ''), COALESCE(pl.status, '')
		FROM company
		LEFT JOIN products p
			ON p.company_id=$1 AND p.status <> 'ARCHIVED' AND p.deleted_at IS NULL
		LEFT JOIN pipelines pl ON pl.id = p.pipeline_id AND pl.company_id = p.company_id
		ORDER BY p.updated_at DESC NULLS LAST
		LIMIT 50`, companyID)
	if err != nil {
		return out
	}

	byID := map[uuid.UUID]*FlowProduct{}
	order := []uuid.UUID{}
	for prows.Next() {
		var (
			companyName string
			productID   uuid.NullUUID
			pName       sql.NullString
			pStatus     sql.NullString
			pipelineID  uuid.NullUUID
		)

		var pipelineName, pipelineStatus string
		if err := prows.Scan(
			&companyName,
			&productID,
			&pName,
			&pStatus,
			&pipelineID,
			&pipelineName,
			&pipelineStatus,
		); err != nil {
			continue
		}

		if out.CompanyName == "" {
			out.CompanyName = companyName
		}
		if !productID.Valid {
			continue
		}

		p := FlowProduct{
			ID:             productID.UUID,
			Name:           pName.String,
			Status:         pStatus.String,
			Stages:         []FlowStage{},
			Projects:       []FlowProject{},
			Features:       []FlowFeature{},
			PipelineName:   pipelineName,
			PipelineStatus: pipelineStatus,
		}
		if pipelineID.Valid {
			id := pipelineID.UUID
			p.PipelineID = &id
		}

		cp := p
		byID[p.ID] = &cp
		order = append(order, p.ID)
	}
	_ = prows.Err()
	prows.Close()

	if len(order) == 0 {
		return out
	}

	ids := make([]string, len(order))
	for i, id := range order {
		ids[i] = id.String()
	}

	// One query returns stage chain + latest instance status per (product, stage).
	if srows, err := q.QueryContext(ctx, `
		WITH latest AS (
			SELECT product_id, stage_id,
				CASE
					WHEN status IS NULL OR status='' THEN 'PENDING'
					ELSE status
				END AS status
			FROM (
				SELECT
					product_id, stage_id, status,
					ROW_NUMBER() OVER (
						PARTITION BY product_id, stage_id
						ORDER BY updated_at DESC
					) AS rn
				FROM stage_instances
				WHERE company_id=$1 AND product_id = ANY($2::uuid[])
			) ranked
			WHERE rn=1
		)
		SELECT p.id, s.id, s.name, s."order",
			COALESCE(latest.status, 'PENDING') AS status
		FROM products p
		INNER JOIN pipelines pl ON pl.id = p.pipeline_id AND pl.company_id = p.company_id
		INNER JOIN stages s ON s.pipeline_id = pl.id
		LEFT JOIN latest ON latest.product_id = p.id AND latest.stage_id = s.id
		WHERE p.company_id=$1 AND p.id = ANY($2::uuid[])
		ORDER BY p.updated_at DESC, s."order" ASC`, companyID, pq.Array(ids)); err == nil {
		for srows.Next() {
			var (
				productID uuid.UUID
				stageID   uuid.UUID
				name      string
				ord       int
				status    string
			)
			if err := srows.Scan(&productID, &stageID, &name, &ord, &status); err != nil {
				continue
			}
			if fp, ok := byID[productID]; ok {
				fp.Stages = append(fp.Stages, FlowStage{
					ID: stageID, Name: name, Order: ord, Status: status,
				})
			}
		}
		srows.Close()
	}

	if jrows, err := q.QueryContext(ctx, `
		SELECT id, product_id, name, status
		FROM projects
		WHERE company_id=$1 AND deleted_at IS NULL AND product_id = ANY($2::uuid[])
		ORDER BY updated_at DESC
		LIMIT 120`, companyID, pq.Array(ids)); err == nil {
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
		jrows.Close()
	}

	if frows, err := q.QueryContext(ctx, `
		SELECT id, product_id, project_id, title, status, COALESCE(priority, '')
		FROM features
		WHERE company_id=$1 AND deleted_at IS NULL AND product_id = ANY($2::uuid[])
		ORDER BY updated_at DESC
		LIMIT 200`, companyID, pq.Array(ids)); err == nil {
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
		frows.Close()
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

type dashQuerier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

const openTaskSQL = `status NOT IN ('COMPLETED','CANCELLED','ARCHIVED','DONE')`

func loadMyWork(ctx context.Context, q dashQuerier, companyID, employeeID uuid.UUID, out *MyWork) {
	_ = q.QueryRowContext(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE `+openTaskSQL+`),
			COUNT(*) FILTER (WHERE `+openTaskSQL+` AND due_date IS NOT NULL
				AND due_date::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date),
			COUNT(*) FILTER (WHERE `+openTaskSQL+` AND due_date IS NOT NULL AND due_date < NOW()),
			COUNT(*) FILTER (WHERE status='REVIEW')
		FROM tasks
		WHERE company_id=$1 AND assignee_id=$2 AND deleted_at IS NULL`,
		companyID, employeeID).Scan(&out.Assigned, &out.DueToday, &out.Overdue, &out.WaitingReview)

	_ = q.QueryRowContext(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE type='MENTION'),
			COUNT(*) FILTER (WHERE type ILIKE '%APPROVAL%' OR type ILIKE '%STAGE%' OR type='STAGE_REJECTED')
		FROM notifications
		WHERE company_id=$1 AND receiver_id=$2 AND is_read=false AND COALESCE(is_archived,false)=false`,
		companyID, employeeID).Scan(&out.Mentions, &out.Approvals)
}

func loadUpcomingDeadlines(ctx context.Context, q dashQuerier, companyID uuid.UUID, out *[]UpcomingDeadline) {
	rows, err := q.QueryContext(ctx, `
		SELECT t.id, t.title, t.status, t.due_date, COALESCE(p.name, '')
		FROM tasks t
		LEFT JOIN features f ON f.id = t.feature_id AND f.company_id = t.company_id
		LEFT JOIN products p ON p.id = f.product_id AND p.company_id = t.company_id
		WHERE t.company_id=$1 AND t.deleted_at IS NULL AND t.due_date IS NOT NULL
		  AND t.status NOT IN ('COMPLETED','CANCELLED','ARCHIVED','DONE')
		  AND t.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '14 days'
		ORDER BY t.due_date ASC
		LIMIT 12`, companyID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var d UpcomingDeadline
		if err := rows.Scan(&d.ID, &d.Title, &d.Status, &d.DueDate, &d.ProductName); err == nil {
			*out = append(*out, d)
		}
	}
}

func loadTeamWorkload(ctx context.Context, q dashQuerier, companyID uuid.UUID, out *[]TeamWorkloadRow) {
	rows, err := q.QueryContext(ctx, `
		SELECT e.id, TRIM(CONCAT(COALESCE(e.first_name,''), ' ', COALESCE(e.last_name,''))),
			COUNT(t.id) FILTER (
				WHERE t.deleted_at IS NULL AND t.status NOT IN ('COMPLETED','CANCELLED','ARCHIVED','DONE')
			)
		FROM employees e
		LEFT JOIN tasks t ON t.assignee_id = e.id AND t.company_id = e.company_id
		WHERE e.company_id=$1 AND e.status='ACTIVE'
		GROUP BY e.id, e.first_name, e.last_name
		ORDER BY COUNT(t.id) FILTER (
			WHERE t.deleted_at IS NULL AND t.status NOT IN ('COMPLETED','CANCELLED','ARCHIVED','DONE')
		) DESC, e.first_name ASC
		LIMIT 20`, companyID)
	if err != nil {
		return
	}
	defer rows.Close()

	var rowsBuf []TeamWorkloadRow
	var maxOpen int64
	for rows.Next() {
		var r TeamWorkloadRow
		if err := rows.Scan(&r.EmployeeID, &r.Name, &r.OpenTasks); err != nil {
			continue
		}
		if r.Name == "" {
			r.Name = "—"
		}
		if r.OpenTasks > maxOpen {
			maxOpen = r.OpenTasks
		}
		rowsBuf = append(rowsBuf, r)
	}
	if maxOpen < 1 {
		maxOpen = 1
	}
	for i := range rowsBuf {
		pct := (rowsBuf[i].OpenTasks * 100) / maxOpen
		if pct > 100 {
			pct = 100
		}
		rowsBuf[i].LoadPercent = pct
		*out = append(*out, rowsBuf[i])
	}
}

func loadPipelineAlerts(ctx context.Context, q dashQuerier, companyID uuid.UUID, out *[]PipelineAlert) {
	// UNION query preserves the same ordering/capping as the previous
	// sequential per-widget queries: ON_HOLD (up to 8), then STAGE_BLOCKED
	// (up to 8), then BLOCKED tasks (up to 8), then REVIEW tasks (up to 8),
	// finally capping to 12 items.
	rows, err := q.QueryContext(ctx, `
		WITH
		on_hold AS (
			SELECT
				1 AS kind_order,
				'ON_HOLD'::text AS kind,
				p.id AS product_id,
				p.name AS product_name,
				''::text AS stage_name,
				'Product on hold'::text AS detail,
				GREATEST(0, EXTRACT(DAY FROM NOW() - p.updated_at)::bigint) AS days,
				p.updated_at AS sort_ts
			FROM products p
			WHERE p.company_id=$1 AND p.deleted_at IS NULL AND p.status='ON_HOLD'
			ORDER BY p.updated_at ASC
			LIMIT 8
		),
		stage_blocked AS (
			SELECT
				2 AS kind_order,
				'STAGE_BLOCKED'::text AS kind,
				p.id AS product_id,
				p.name AS product_name,
				COALESCE(s.name,'') AS stage_name,
				'Stage idle'::text AS detail,
				GREATEST(0, EXTRACT(DAY FROM NOW() - si.updated_at)::bigint) AS days,
				si.updated_at AS sort_ts
			FROM stage_instances si
			INNER JOIN products p ON p.id = si.product_id AND p.company_id = si.company_id
			LEFT JOIN stages s ON s.id = si.stage_id
			WHERE si.company_id=$1 AND si.status='ACTIVE'
			  AND si.updated_at < NOW() - INTERVAL '3 days'
			  AND p.deleted_at IS NULL
			ORDER BY si.updated_at ASC
			LIMIT 8
		),
		blocked_tasks AS (
			SELECT
				3 AS kind_order,
				'STAGE_BLOCKED'::text AS kind,
				COALESCE(p.id, '00000000-0000-0000-0000-000000000000'::uuid) AS product_id,
				COALESCE(p.name, t.title) AS product_name,
				COALESCE(t.title,'') AS stage_name,
				'Blocked: ' || COALESCE(t.title,'') AS detail,
				GREATEST(0, EXTRACT(DAY FROM NOW() - t.updated_at)::bigint) AS days,
				t.updated_at AS sort_ts
			FROM tasks t
			LEFT JOIN features f ON f.id = t.feature_id AND f.company_id = t.company_id
			LEFT JOIN products p ON p.id = f.product_id AND p.company_id = t.company_id
			WHERE t.company_id=$1 AND t.deleted_at IS NULL AND t.status='BLOCKED'
			ORDER BY t.updated_at ASC
			LIMIT 8
		),
		waiting_review AS (
			SELECT
				4 AS kind_order,
				'WAITING_APPROVAL'::text AS kind,
				COALESCE(p.id, '00000000-0000-0000-0000-000000000000'::uuid) AS product_id,
				COALESCE(p.name, t.title) AS product_name,
				COALESCE(t.title,'') AS stage_name,
				'Waiting review'::text AS detail,
				GREATEST(0, EXTRACT(DAY FROM NOW() - t.updated_at)::bigint) AS days,
				t.updated_at AS sort_ts
			FROM tasks t
			LEFT JOIN features f ON f.id = t.feature_id AND f.company_id = t.company_id
			LEFT JOIN products p ON p.id = f.product_id AND p.company_id = t.company_id
			WHERE t.company_id=$1 AND t.deleted_at IS NULL AND t.status='REVIEW'
			ORDER BY t.updated_at ASC
			LIMIT 8
		)
		SELECT
			kind, product_id, product_name, stage_name, detail, days, kind_order, sort_ts
		FROM (
			SELECT * FROM on_hold
			UNION ALL
			SELECT * FROM stage_blocked
			UNION ALL
			SELECT * FROM blocked_tasks
			UNION ALL
			SELECT * FROM waiting_review
		) alerts
		ORDER BY kind_order ASC, sort_ts ASC
		LIMIT 12`, companyID)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var (
			a         PipelineAlert
			kindOrder int
			sortTS    time.Time
		)
		if err := rows.Scan(
			&a.Kind,
			&a.ProductID,
			&a.ProductName,
			&a.StageName,
			&a.Detail,
			&a.Days,
			&kindOrder,
			&sortTS,
		); err == nil {
			*out = append(*out, a)
		}
	}
}
