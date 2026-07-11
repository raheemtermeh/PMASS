package httpapi

import (
	"database/sql"
	"net/http"

	collabapp "PMAS/internal/application/collaboration"
	dashboardapp "PMAS/internal/application/dashboard"
	organizationapp "PMAS/internal/application/organization"
	planningapp "PMAS/internal/application/planning"
	productapp "PMAS/internal/application/product"
	searchapp "PMAS/internal/application/search"
	"PMAS/internal/auth"
	"PMAS/internal/infrastructure/postgres"
	"PMAS/internal/middleware"
)

// Dependencies wires VSM + MVP module HTTP handlers.
type Dependencies struct {
	Org       *OrgHandler
	Product   *ProductHandler
	Planning  *PlanningHandler
	Collab    *CollabHandler
	Dashboard *DashboardHandler
	Search    *SearchHandler
}

func NewDependencies(sqlDB *sql.DB) *Dependencies {
	db := postgres.New(sqlDB)
	scope := &CompanyScope{DB: db}

	co := postgres.NewCompanyRepo(db)
	dept := postgres.NewDepartmentRepo(db)
	team := postgres.NewTeamRepo(db)
	emp := postgres.NewEmployeeRepo(db)
	prod := postgres.NewProductRepo(db)
	pipe := postgres.NewPipelineRepo(db)
	stage := postgres.NewStageRepo(db)
	si := postgres.NewStageInstanceRepo(db)
	proj := postgres.NewProjectRepo(db)
	feat := postgres.NewFeatureRepo(db)
	task := postgres.NewTaskRepo(db)
	act := postgres.NewActivityRepo(db)
	notif := postgres.NewNotificationRepo(db)
	cmt := postgres.NewCommentRepo(db)
	att := postgres.NewAttachmentRepo(db)

	orgSvc := organizationapp.NewService(db, co, dept, team, emp)
	prodSvc := productapp.NewService(db, prod, pipe, stage, si, emp, act, notif)
	planSvc := planningapp.NewService(db, proj, feat, task, prod, act)
	collabSvc := collabapp.NewService(db, cmt, att, act, notif)
	dashSvc := dashboardapp.NewService(db)
	searchSvc := searchapp.NewService(db)

	return &Dependencies{
		Org:       &OrgHandler{Scope: scope, Svc: orgSvc},
		Product:   &ProductHandler{Scope: scope, Svc: prodSvc},
		Planning:  &PlanningHandler{Scope: scope, Svc: planSvc},
		Collab:    &CollabHandler{Scope: scope, Svc: collabSvc},
		Dashboard: &DashboardHandler{Scope: scope, Svc: dashSvc},
		Search:    &SearchHandler{Scope: scope, Svc: searchSvc},
	}
}

func (d *Dependencies) Register(mux *http.ServeMux, authz *middleware.Authenticator) {
	// Organization
	mux.HandleFunc("/api/v1/company", authz.RequirePermission(auth.PermEmployeeManage, d.Org.HandleCompany))
	mux.HandleFunc("/api/v1/departments", authz.RequirePermission(auth.PermDepartmentManage, d.Org.HandleDepartments))
	mux.HandleFunc("/api/v1/departments/", authz.RequirePermission(auth.PermDepartmentManage, d.Org.HandleDepartments))
	mux.HandleFunc("/api/v1/teams", authz.RequirePermission(auth.PermTeamManage, d.Org.HandleTeams))
	mux.HandleFunc("/api/v1/teams/", authz.RequirePermission(auth.PermTeamManage, d.Org.HandleTeams))
	mux.HandleFunc("/api/v1/employees", authz.RequirePermission(auth.PermEmployeeManage, d.Org.HandleEmployees))
	mux.HandleFunc("/api/v1/employees/", authz.RequirePermission(auth.PermEmployeeManage, d.Org.HandleEmployees))

	// Product aggregate
	mux.HandleFunc("/api/v1/products", authz.RequirePermission(auth.PermProductView, d.Product.HandleProducts))
	mux.HandleFunc("/api/v1/products/", authz.RequirePermission(auth.PermProductView, d.Product.HandleProducts))
	mux.HandleFunc("/api/v1/pipelines", authz.RequirePermission(auth.PermProductUpdate, d.Product.HandlePipelines))
	mux.HandleFunc("/api/v1/pipelines/", authz.RequirePermission(auth.PermProductUpdate, d.Product.HandlePipelines))
	mux.HandleFunc("/api/v1/stages", authz.RequirePermission(auth.PermProductUpdate, d.Product.HandleStages))
	mux.HandleFunc("/api/v1/stages/", authz.RequirePermission(auth.PermProductUpdate, d.Product.HandleStages))

	// Planning / Execution
	mux.HandleFunc("/api/v1/projects", authz.RequirePermission(auth.PermProjectCreate, d.Planning.HandleProjects))
	mux.HandleFunc("/api/v1/projects/", authz.RequirePermission(auth.PermProjectCreate, d.Planning.HandleProjects))
	mux.HandleFunc("/api/v1/features", authz.RequirePermission(auth.PermFeatureCreate, d.Planning.HandleFeatures))
	mux.HandleFunc("/api/v1/features/", authz.RequirePermission(auth.PermFeatureCreate, d.Planning.HandleFeatures))
	mux.HandleFunc("/api/v1/tasks", authz.RequirePermission(auth.PermTaskCreate, d.Planning.HandleTasks))
	mux.HandleFunc("/api/v1/tasks/", authz.RequirePermission(auth.PermTaskCreate, d.Planning.HandleTasks))

	// Collaboration (MVP)
	mux.HandleFunc("/api/v1/comments", authz.RequireAuth(d.Collab.HandleComments))
	mux.HandleFunc("/api/v1/comments/", authz.RequireAuth(d.Collab.HandleComments))
	mux.HandleFunc("/api/v1/attachments", authz.RequireAuth(d.Collab.HandleAttachments))
	mux.HandleFunc("/api/v1/attachments/", authz.RequireAuth(d.Collab.HandleAttachments))
	mux.HandleFunc("/api/v1/activities", authz.RequireAuth(d.Collab.HandleActivities))
	mux.HandleFunc("/api/v1/notifications", authz.RequireAuth(d.Collab.HandleNotifications))
	mux.HandleFunc("/api/v1/notifications/", authz.RequireAuth(d.Collab.HandleNotifications))

	// Dashboard + Search + Settings (company profile via /company)
	mux.HandleFunc("/api/v1/dashboard", authz.RequirePermission(auth.PermProductView, d.Dashboard.HandleDashboard))
	mux.HandleFunc("/api/v1/search", authz.RequireAuth(d.Search.HandleSearch))
}
