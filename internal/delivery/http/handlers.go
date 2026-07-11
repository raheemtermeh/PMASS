package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	organizationapp "PMAS/internal/application/organization"
	planningapp "PMAS/internal/application/planning"
	productapp "PMAS/internal/application/product"
	"PMAS/internal/domain/shared"
)

type OrgHandler struct {
	Scope *CompanyScope
	Svc   *organizationapp.Service
}

func (h *OrgHandler) HandleDepartments(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/departments"), "/")
	parts := splitPath(path)

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		items, meta, err := h.Svc.ListDepartments(r.Context(), companyID, PageQueryFromRequest(r))
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, meta)
	case len(parts) == 0 && r.Method == http.MethodPost:
		var body struct {
			Name      string    `json:"name"`
			ManagerID uuid.UUID `json:"manager_id"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		d, err := h.Svc.CreateDepartment(r.Context(), companyID, organizationapp.CreateDepartmentInput{
			Name: body.Name, ManagerID: body.ManagerID,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, d, nil)
	case len(parts) == 1 && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		d, err := h.Svc.GetDepartment(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, d, nil)
	case len(parts) == 1 && r.Method == http.MethodDelete:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		d, err := h.Svc.ArchiveDepartment(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, d, nil)
	case len(parts) == 2 && parts[1] == "manager" && r.Method == http.MethodPut:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			ManagerID uuid.UUID `json:"manager_id"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		d, err := h.Svc.ChangeDepartmentManager(r.Context(), companyID, id, body.ManagerID)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, d, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *OrgHandler) HandleTeams(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/teams"), "/")
	parts := splitPath(path)

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		items, meta, err := h.Svc.ListTeams(r.Context(), companyID, PageQueryFromRequest(r))
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, meta)
	case len(parts) == 0 && r.Method == http.MethodPost:
		var body struct {
			DepartmentID uuid.UUID `json:"department_id"`
			LeadID       uuid.UUID `json:"lead_id"`
			Name         string    `json:"name"`
			Description  string    `json:"description"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		t, err := h.Svc.CreateTeam(r.Context(), companyID, organizationapp.CreateTeamInput(body))
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, t, nil)
	case len(parts) == 1 && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		t, err := h.Svc.GetTeam(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	case len(parts) == 1 && r.Method == http.MethodDelete:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		t, err := h.Svc.ArchiveTeam(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	case len(parts) == 2 && parts[1] == "lead" && r.Method == http.MethodPut:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			LeadID uuid.UUID `json:"lead_id"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		t, err := h.Svc.AssignTeamLead(r.Context(), companyID, id, body.LeadID)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *OrgHandler) HandleEmployees(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/employees"), "/")
	parts := splitPath(path)

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		items, meta, err := h.Svc.ListEmployees(r.Context(), companyID, PageQueryFromRequest(r))
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, meta)
	case len(parts) == 0 && r.Method == http.MethodPost:
		var body struct {
			FirstName string `json:"first_name"`
			LastName  string `json:"last_name"`
			Email     string `json:"email"`
			Phone     string `json:"phone"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		e, err := h.Svc.CreateEmployee(r.Context(), companyID, organizationapp.CreateEmployeeInput{
			FirstName: body.FirstName, LastName: body.LastName, Email: body.Email, Phone: body.Phone,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, e, nil)
	case len(parts) == 1 && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		e, err := h.Svc.GetEmployee(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, e, nil)
	case len(parts) == 1 && r.Method == http.MethodDelete:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		e, err := h.Svc.ArchiveEmployee(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, e, nil)
	case len(parts) == 3 && parts[1] == "teams" && r.Method == http.MethodPost:
		empID, err1 := ParseUUIDParam(parts[0])
		teamID, err2 := ParseUUIDParam(parts[2])
		if err1 != nil || err2 != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		if err := h.Svc.AssignEmployeeToTeam(r.Context(), companyID, empID, teamID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "assigned"}, nil)
	case len(parts) == 3 && parts[1] == "teams" && r.Method == http.MethodDelete:
		empID, err1 := ParseUUIDParam(parts[0])
		teamID, err2 := ParseUUIDParam(parts[2])
		if err1 != nil || err2 != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		if err := h.Svc.RemoveEmployeeFromTeam(r.Context(), companyID, empID, teamID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "removed"}, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *OrgHandler) HandleCompany(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		c, err := h.Svc.GetCompany(r.Context(), companyID)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, c, nil)
	case http.MethodPut, http.MethodPatch:
		var body struct {
			Name     string `json:"name"`
			LogoURL  string `json:"logo_url"`
			Language string `json:"language"`
			Timezone string `json:"timezone"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		c, err := h.Svc.UpdateCompany(r.Context(), companyID, body.Name, body.LogoURL, body.Language, body.Timezone)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, c, nil)
	case http.MethodDelete:
		WriteErr(w, h.Svc.DeleteCompany(r.Context(), companyID))
	default:
		WriteErr(w, shared.New("METHOD_NOT_ALLOWED", "Method not allowed", 405))
	}
}

type ProductHandler struct {
	Scope *CompanyScope
	Svc   *productapp.Service
}

func (h *ProductHandler) HandleProducts(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/products"), "/")
	parts := splitPath(path)

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		items, meta, err := h.Svc.ListProducts(r.Context(), companyID, PageQueryFromRequest(r))
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, meta)
	case len(parts) == 0 && r.Method == http.MethodPost:
		var body struct {
			OwnerID        uuid.UUID `json:"owner_id"`
			Name           string    `json:"name"`
			Description    string    `json:"description"`
			Category       string    `json:"category"`
			ExecutionModel string    `json:"execution_model"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		p, err := h.Svc.CreateProduct(r.Context(), companyID, productapp.CreateProductInput{
			OwnerID: body.OwnerID, Name: body.Name, Description: body.Description,
			Category: body.Category, ExecutionModel: body.ExecutionModel,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, p, nil)
	case len(parts) == 1 && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		p, err := h.Svc.GetProduct(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, p, nil)
	case len(parts) == 1 && (r.Method == http.MethodPut || r.Method == http.MethodPatch):
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Name           *string `json:"name"`
			Description    *string `json:"description"`
			Category       *string `json:"category"`
			ExecutionModel *string `json:"execution_model"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		if body.ExecutionModel != nil {
			WriteErr(w, shared.New("EXECUTION_MODEL_LOCKED", "Execution model cannot be changed after create", 409))
			return
		}
		p, err := h.Svc.UpdateProduct(r.Context(), companyID, id, productapp.UpdateProductInput{
			Name: body.Name, Description: body.Description, Category: body.Category,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, p, nil)
	case len(parts) == 1 && r.Method == http.MethodDelete:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		p, err := h.Svc.ArchiveProduct(r.Context(), companyID, id, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, p, nil)
	case len(parts) == 2 && parts[1] == "owner" && r.Method == http.MethodPut:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			OwnerID uuid.UUID `json:"owner_id"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		p, err := h.Svc.ChangeProductOwner(r.Context(), companyID, id, body.OwnerID, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, p, nil)
	case len(parts) == 2 && parts[1] == "start" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		si, err := h.Svc.StartExecution(r.Context(), companyID, id, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, si, nil)
	case len(parts) == 2 && parts[1] == "move-next" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			ExitCriteriaMet bool `json:"exit_criteria_met"`
		}
		_ = DecodeJSON(r, &body)
		si, err := h.Svc.MoveToNextStage(r.Context(), companyID, id, body.ExitCriteriaMet, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, si, nil)
	case len(parts) == 2 && parts[1] == "complete-stage" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			ExitCriteriaMet bool `json:"exit_criteria_met"`
		}
		_ = DecodeJSON(r, &body)
		si, err := h.Svc.CompleteCurrentStage(r.Context(), companyID, id, productapp.CompleteStageInput{ExitCriteriaMet: body.ExitCriteriaMet})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, si, nil)
	case len(parts) == 2 && parts[1] == "reject-stage" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Reason string `json:"reason"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		si, err := h.Svc.RejectCurrentStage(r.Context(), companyID, id, productapp.RejectStageInput{Reason: body.Reason})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, si, nil)
	case len(parts) == 2 && parts[1] == "stage-instances" && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		items, err := h.Svc.ListStageInstances(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, nil)
	case len(parts) == 2 && parts[1] == "projects" && r.Method == http.MethodGet:
		// nested list handled by planning handler registration preference; fallback 404
		WriteErr(w, shared.New("NOT_FOUND", "Use /api/v1/projects?product_id=", 404))
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *ProductHandler) HandlePipelines(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/pipelines"), "/")
	parts := splitPath(path)

	switch {
	case len(parts) == 0 && r.Method == http.MethodPost:
		var body struct {
			ProductID   uuid.UUID                     `json:"product_id"`
			Name        string                        `json:"name"`
			Description string                        `json:"description"`
			Stages      []productapp.CreateStageInput `json:"stages"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		pl, stages, err := h.Svc.CreatePipeline(r.Context(), companyID, productapp.CreatePipelineInput{
			ProductID: body.ProductID, Name: body.Name, Description: body.Description, Stages: body.Stages,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, map[string]any{"pipeline": pl, "stages": stages}, nil)
	case len(parts) == 1 && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		pl, stages, err := h.Svc.GetPipeline(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]any{"pipeline": pl, "stages": stages}, nil)
	case len(parts) == 1 && r.Method == http.MethodDelete:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		if err := h.Svc.DeletePipeline(r.Context(), companyID, id); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "deleted"}, nil)
	case len(parts) == 2 && parts[1] == "stages" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body productapp.CreateStageInput
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		st, err := h.Svc.AddStage(r.Context(), companyID, id, body)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, st, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *ProductHandler) HandleStages(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/stages"), "/")
	parts := splitPath(path)
	if len(parts) == 1 && r.Method == http.MethodDelete {
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		if err := h.Svc.DeleteStage(r.Context(), companyID, id); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "deleted"}, nil)
		return
	}
	WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
}

type PlanningHandler struct {
	Scope *CompanyScope
	Svc   *planningapp.Service
}

func (h *PlanningHandler) HandleProjects(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/projects"), "/")
	parts := splitPath(path)

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		q := PageQueryFromRequest(r)
		if pid := r.URL.Query().Get("product_id"); pid != "" {
			productID, err := ParseUUIDParam(pid)
			if err != nil {
				WriteErr(w, shared.New("INVALID_ID", "Invalid product_id", 400))
				return
			}
			items, meta, err := h.Svc.ListProjectsByProduct(r.Context(), companyID, productID, q)
			if err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusOK, items, meta)
			return
		}
		items, meta, err := h.Svc.ListProjects(r.Context(), companyID, q)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, meta)
	case len(parts) == 0 && r.Method == http.MethodPost:
		var body struct {
			ProductID   uuid.UUID `json:"product_id"`
			Name        string    `json:"name"`
			Description string    `json:"description"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		p, err := h.Svc.CreateProject(r.Context(), companyID, planningapp.CreateProjectInput{
			ProductID: body.ProductID, Name: body.Name, Description: body.Description,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, p, nil)
	case len(parts) == 1 && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		p, err := h.Svc.GetProject(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, p, nil)
	case len(parts) == 1 && r.Method == http.MethodDelete:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		p, err := h.Svc.ArchiveProject(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, p, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *PlanningHandler) HandleFeatures(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/features"), "/")
	parts := splitPath(path)

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		projectID, err := ParseUUIDParam(r.URL.Query().Get("project_id"))
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "project_id is required", 400))
			return
		}
		items, meta, err := h.Svc.ListFeaturesByProject(r.Context(), companyID, projectID, PageQueryFromRequest(r))
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, meta)
	case len(parts) == 0 && r.Method == http.MethodPost:
		var body struct {
			ProjectID uuid.UUID `json:"project_id"`
			Title     string    `json:"title"`
			Priority  string    `json:"priority"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		f, err := h.Svc.CreateFeature(r.Context(), companyID, planningapp.CreateFeatureInput{
			ProjectID: body.ProjectID, Title: body.Title, Priority: body.Priority,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, f, nil)
	case len(parts) == 1 && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		f, err := h.Svc.GetFeature(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, f, nil)
	case len(parts) == 2 && parts[1] == "status" && r.Method == http.MethodPut:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Status string `json:"status"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		f, err := h.Svc.ChangeFeatureStatus(r.Context(), companyID, id, body.Status)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, f, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *PlanningHandler) HandleTasks(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/tasks"), "/")
	parts := splitPath(path)

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		featureID, err := ParseUUIDParam(r.URL.Query().Get("feature_id"))
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "feature_id is required", 400))
			return
		}
		items, meta, err := h.Svc.ListTasksByFeature(r.Context(), companyID, featureID, PageQueryFromRequest(r))
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, meta)
	case len(parts) == 0 && r.Method == http.MethodPost:
		var body struct {
			FeatureID  uuid.UUID  `json:"feature_id"`
			Title      string     `json:"title"`
			Priority   string     `json:"priority"`
			AssigneeID *uuid.UUID `json:"assignee_id"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		t, err := h.Svc.CreateTask(r.Context(), companyID, planningapp.CreateTaskInput{
			FeatureID: body.FeatureID, Title: body.Title, Priority: body.Priority, AssigneeID: body.AssigneeID,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, t, nil)
	case len(parts) == 1 && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		t, err := h.Svc.GetTask(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	case len(parts) == 2 && parts[1] == "assign" && r.Method == http.MethodPut:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			AssigneeID *uuid.UUID `json:"assignee_id"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		t, err := h.Svc.AssignTask(r.Context(), companyID, id, body.AssigneeID)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	case len(parts) == 2 && parts[1] == "complete" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		t, err := h.Svc.CompleteTask(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	case len(parts) == 2 && parts[1] == "reject" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		t, err := h.Svc.RejectTask(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	case len(parts) == 1 && r.Method == http.MethodDelete:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		t, err := h.Svc.ArchiveTask(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	case len(parts) == 1 && (r.Method == http.MethodPut || r.Method == http.MethodPatch):
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Title    string     `json:"title"`
			Priority string     `json:"priority"`
			Status   string     `json:"status"`
			DueDate  *time.Time `json:"due_date"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		t, err := h.Svc.UpdateTask(r.Context(), companyID, id, body.Title, body.Priority, body.Status, body.DueDate)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	case len(parts) == 2 && parts[1] == "dependencies" && r.Method == http.MethodPut:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			DependsOn []uuid.UUID `json:"depends_on"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		t, err := h.Svc.SetTaskDependencies(r.Context(), companyID, id, body.DependsOn)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func splitPath(path string) []string {
	path = strings.Trim(path, "/")
	if path == "" {
		return nil
	}
	return strings.Split(path, "/")
}
