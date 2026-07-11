package httpapi

import (
	"database/sql"
	"net/http"

	organizationapp "PMAS/internal/application/organization"
	planningapp "PMAS/internal/application/planning"
	productapp "PMAS/internal/application/product"
	"PMAS/internal/auth"
	"PMAS/internal/infrastructure/postgres"
	"PMAS/internal/middleware"
)

// Dependencies wires VSM (Product-domain) HTTP handlers.
type Dependencies struct {
	Org      *OrgHandler
	Product  *ProductHandler
	Planning *PlanningHandler
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

	orgSvc := organizationapp.NewService(db, co, dept, team, emp)
	prodSvc := productapp.NewService(db, prod, pipe, stage, si, emp, act, notif)
	planSvc := planningapp.NewService(db, proj, feat, task, prod, act)

	return &Dependencies{
		Org:      &OrgHandler{Scope: scope, Svc: orgSvc},
		Product:  &ProductHandler{Scope: scope, Svc: prodSvc},
		Planning: &PlanningHandler{Scope: scope, Svc: planSvc},
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

	// Planning
	mux.HandleFunc("/api/v1/projects", authz.RequirePermission(auth.PermProjectCreate, d.Planning.HandleProjects))
	mux.HandleFunc("/api/v1/projects/", authz.RequirePermission(auth.PermProjectCreate, d.Planning.HandleProjects))
	mux.HandleFunc("/api/v1/features", authz.RequirePermission(auth.PermFeatureCreate, d.Planning.HandleFeatures))
	mux.HandleFunc("/api/v1/features/", authz.RequirePermission(auth.PermFeatureCreate, d.Planning.HandleFeatures))
	mux.HandleFunc("/api/v1/tasks", authz.RequirePermission(auth.PermTaskCreate, d.Planning.HandleTasks))
	mux.HandleFunc("/api/v1/tasks/", authz.RequirePermission(auth.PermTaskCreate, d.Planning.HandleTasks))
}
