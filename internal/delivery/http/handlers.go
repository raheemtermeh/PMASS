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
	"PMAS/internal/middleware"
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
	case len(parts) == 1 && (r.Method == http.MethodPut || r.Method == http.MethodPatch):
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Name      string    `json:"name"`
			ManagerID uuid.UUID `json:"manager_id"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		d, err := h.Svc.UpdateDepartment(r.Context(), companyID, id, body.Name, body.ManagerID)
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
	case len(parts) == 1 && (r.Method == http.MethodPut || r.Method == http.MethodPatch):
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Name        string    `json:"name"`
			Description string    `json:"description"`
			LeadID      uuid.UUID `json:"lead_id"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		t, err := h.Svc.UpdateTeam(r.Context(), companyID, id, body.Name, body.Description, body.LeadID)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	case len(parts) == 2 && parts[1] == "move" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			DepartmentID uuid.UUID `json:"department_id"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		t, err := h.Svc.MoveTeamBetweenDepartments(r.Context(), companyID, id, body.DepartmentID)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	case len(parts) == 2 && parts[1] == "members" && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		members, err := h.Svc.ListTeamMembers(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, members, nil)
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
	case len(parts) == 1 && (r.Method == http.MethodPut || r.Method == http.MethodPatch):
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
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
		e, err := h.Svc.UpdateEmployee(r.Context(), companyID, id, organizationapp.CreateEmployeeInput{
			FirstName: body.FirstName, LastName: body.LastName, Email: body.Email, Phone: body.Phone,
		})
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
			Status   string `json:"status"`
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
		if strings.TrimSpace(body.Status) != "" {
			c, err = h.Svc.UpdateCompanyStatus(r.Context(), companyID, body.Status)
			if err != nil {
				WriteErr(w, err)
				return
			}
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
			OwnerID        uuid.UUID  `json:"owner_id"`
			Name           string     `json:"name"`
			Description    string     `json:"description"`
			Category       string     `json:"category"`
			ExecutionModel string     `json:"execution_model"`
			Code           string     `json:"code"`
			ProductType    string     `json:"product_type"`
			ManagerID      *uuid.UUID `json:"manager_id"`
			Priority       string     `json:"priority"`
			Vision         string     `json:"vision"`
			Goal           string     `json:"goal"`
			SuccessMetrics string     `json:"success_metrics"`
			BusinessValue  string     `json:"business_value"`
			Visibility     string     `json:"visibility"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		p, err := h.Svc.CreateProduct(r.Context(), companyID, productapp.CreateProductInput{
			OwnerID: body.OwnerID, Name: body.Name, Description: body.Description,
			Category: body.Category, ExecutionModel: body.ExecutionModel,
			Code: body.Code, ProductType: body.ProductType, ManagerID: body.ManagerID,
			Priority: body.Priority, Vision: body.Vision, Goal: body.Goal,
			SuccessMetrics: body.SuccessMetrics, BusinessValue: body.BusinessValue, Visibility: body.Visibility,
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
			Code           *string `json:"code"`
			ProductType    *string `json:"product_type"`
			Priority       *string `json:"priority"`
			Vision         *string `json:"vision"`
			Goal           *string `json:"goal"`
			SuccessMetrics *string `json:"success_metrics"`
			BusinessValue  *string `json:"business_value"`
			Visibility     *string `json:"visibility"`
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
			Code: body.Code, ProductType: body.ProductType, Priority: body.Priority,
			Vision: body.Vision, Goal: body.Goal, SuccessMetrics: body.SuccessMetrics,
			BusinessValue: body.BusinessValue, Visibility: body.Visibility,
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
	case len(parts) == 2 && parts[1] == "manager" && r.Method == http.MethodPut:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			ManagerID *uuid.UUID `json:"manager_id"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		p, err := h.Svc.ChangeManager(r.Context(), companyID, id, body.ManagerID, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, p, nil)
	case len(parts) == 2 && parts[1] == "restore" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		p, err := h.Svc.RestoreProduct(r.Context(), companyID, id, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, p, nil)
	case len(parts) == 2 && parts[1] == "soft-delete" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		p, err := h.Svc.SoftDeleteProduct(r.Context(), companyID, id, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, p, nil)
	case len(parts) == 2 && parts[1] == "hold" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		p, err := h.Svc.HoldProduct(r.Context(), companyID, id, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, p, nil)
	case len(parts) == 2 && parts[1] == "resume" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		p, err := h.Svc.ResumeProduct(r.Context(), companyID, id, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, p, nil)
	case len(parts) == 2 && parts[1] == "members" && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		items, err := h.Svc.ListProductMembers(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, nil)
	case len(parts) == 2 && parts[1] == "members" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			EmployeeID uuid.UUID `json:"employee_id"`
			Role       string    `json:"role"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		m, err := h.Svc.AddProductMember(r.Context(), companyID, id, productapp.AddProductMemberInput{
			EmployeeID: body.EmployeeID, Role: body.Role,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, m, nil)
	case len(parts) == 3 && parts[1] == "members" && r.Method == http.MethodDelete:
		id, err1 := ParseUUIDParam(parts[0])
		empID, err2 := ParseUUIDParam(parts[2])
		if err1 != nil || err2 != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		if err := h.Svc.RemoveProductMember(r.Context(), companyID, id, empID, nil); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "removed"}, nil)
	case len(parts) == 2 && parts[1] == "move-prev" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Reason string `json:"reason"`
		}
		_ = DecodeJSON(r, &body)
		si, err := h.Svc.MoveToPreviousStage(r.Context(), companyID, id, body.Reason, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, si, nil)
	case len(parts) == 2 && parts[1] == "reopen-stage" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		si, err := h.Svc.ReopenStage(r.Context(), companyID, id, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, si, nil)
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
	case len(parts) == 1 && (r.Method == http.MethodPut || r.Method == http.MethodPatch):
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Name        *string `json:"name"`
			Description *string `json:"description"`
			Status      *string `json:"status"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		pl, err := h.Svc.UpdatePipeline(r.Context(), companyID, id, productapp.UpdatePipelineInput{
			Name: body.Name, Description: body.Description, Status: body.Status,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, pl, nil)
	case len(parts) == 2 && parts[1] == "archive" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		pl, err := h.Svc.ArchivePipeline(r.Context(), companyID, id, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, pl, nil)
	case len(parts) == 2 && parts[1] == "restore" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		pl, err := h.Svc.RestorePipeline(r.Context(), companyID, id, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, pl, nil)
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

	switch {
	case len(parts) == 1 && r.Method == http.MethodDelete:
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
	case len(parts) == 1 && (r.Method == http.MethodPut || r.Method == http.MethodPatch):
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Name          *string `json:"name"`
			Description   *string `json:"description"`
			EntryCriteria *string `json:"entry_criteria"`
			ExitCriteria  *string `json:"exit_criteria"`
			Color         *string `json:"color"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		st, err := h.Svc.UpdateStage(r.Context(), companyID, id, productapp.UpdateStageInput{
			Name: body.Name, Description: body.Description,
			EntryCriteria: body.EntryCriteria, ExitCriteria: body.ExitCriteria, Color: body.Color,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, st, nil)
	case len(parts) == 1 && parts[0] == "reorder" && r.Method == http.MethodPost:
		var body struct {
			PipelineID uuid.UUID   `json:"pipeline_id"`
			OrderedIDs []uuid.UUID `json:"ordered_ids"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		stages, err := h.Svc.ReorderStages(r.Context(), companyID, body.PipelineID, body.OrderedIDs)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, stages, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
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
		if oid := r.URL.Query().Get("owner_id"); oid != "" {
			ownerID, err := ParseUUIDParam(oid)
			if err != nil {
				WriteErr(w, shared.New("INVALID_ID", "Invalid owner_id", 400))
				return
			}
			items, meta, err := h.Svc.ListProjectsByOwner(r.Context(), companyID, ownerID, q)
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
			ProductID             uuid.UUID  `json:"product_id"`
			Name                  string     `json:"name"`
			Description           string     `json:"description"`
			Code                  string     `json:"code"`
			Goal                  string     `json:"goal"`
			Priority              string     `json:"priority"`
			Status                string     `json:"status"`
			OwnerID               *uuid.UUID `json:"owner_id"`
			ManagerID             *uuid.UUID `json:"manager_id"`
			StartDate             *time.Time `json:"start_date"`
			TargetEndDate         *time.Time `json:"target_end_date"`
			EstimatedDurationDays *int       `json:"estimated_duration_days"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		p, err := h.Svc.CreateProject(r.Context(), companyID, planningapp.CreateProjectInput{
			ProductID:             body.ProductID,
			Name:                  body.Name,
			Description:           body.Description,
			Code:                  body.Code,
			Goal:                  body.Goal,
			Priority:              body.Priority,
			Status:                body.Status,
			OwnerID:               body.OwnerID,
			ManagerID:             body.ManagerID,
			StartDate:             body.StartDate,
			TargetEndDate:         body.TargetEndDate,
			EstimatedDurationDays: body.EstimatedDurationDays,
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
	case len(parts) == 1 && (r.Method == http.MethodPut || r.Method == http.MethodPatch):
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Name                  *string    `json:"name"`
			Description           *string    `json:"description"`
			Code                  *string    `json:"code"`
			Goal                  *string    `json:"goal"`
			Priority              *string    `json:"priority"`
			Status                *string    `json:"status"`
			OwnerID               *uuid.UUID `json:"owner_id"`
			ManagerID             *uuid.UUID `json:"manager_id"`
			StartDate             *time.Time `json:"start_date"`
			TargetEndDate         *time.Time `json:"target_end_date"`
			EstimatedDurationDays *int       `json:"estimated_duration_days"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		p, err := h.Svc.UpdateProject(r.Context(), companyID, id, planningapp.UpdateProjectInput{
			Name: body.Name, Description: body.Description, Code: body.Code, Goal: body.Goal,
			Priority: body.Priority, Status: body.Status, OwnerID: body.OwnerID, ManagerID: body.ManagerID,
			StartDate: body.StartDate, TargetEndDate: body.TargetEndDate, EstimatedDurationDays: body.EstimatedDurationDays,
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
		p, err := h.Svc.ArchiveProject(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, p, nil)
	case len(parts) == 2 && parts[1] == "restore" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		p, err := h.Svc.RestoreProject(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, p, nil)
	case len(parts) == 2 && parts[1] == "soft-delete" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		p, err := h.Svc.SoftDeleteProject(r.Context(), companyID, id, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, p, nil)
	case len(parts) == 2 && parts[1] == "members" && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		items, err := h.Svc.ListProjectMembers(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, nil)
	case len(parts) == 2 && parts[1] == "members" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			EmployeeID uuid.UUID `json:"employee_id"`
			Role       string    `json:"role"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		m, err := h.Svc.AddProjectMember(r.Context(), companyID, id, body.EmployeeID, body.Role)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, m, nil)
	case len(parts) == 3 && parts[1] == "members" && r.Method == http.MethodDelete:
		id, err1 := ParseUUIDParam(parts[0])
		employeeID, err2 := ParseUUIDParam(parts[2])
		if err1 != nil || err2 != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		if err := h.Svc.RemoveProjectMember(r.Context(), companyID, id, employeeID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "removed"}, nil)
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
		q := PageQueryFromRequest(r)
		if oid := r.URL.Query().Get("owner_id"); oid != "" {
			ownerID, err := ParseUUIDParam(oid)
			if err != nil {
				WriteErr(w, shared.New("INVALID_ID", "Invalid owner_id", 400))
				return
			}
			items, meta, err := h.Svc.ListFeaturesByOwner(r.Context(), companyID, ownerID, q)
			if err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusOK, items, meta)
			return
		}
		projectID, err := ParseUUIDParam(r.URL.Query().Get("project_id"))
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "project_id is required", 400))
			return
		}
		items, meta, err := h.Svc.ListFeaturesByProject(r.Context(), companyID, projectID, q)
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
	case len(parts) == 1 && (r.Method == http.MethodPut || r.Method == http.MethodPatch):
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Title           *string    `json:"title"`
			Description     *string    `json:"description"`
			Code            *string    `json:"code"`
			Goal            *string    `json:"goal"`
			FeatureType     *string    `json:"feature_type"`
			Priority        *string    `json:"priority"`
			Status          *string    `json:"status"`
			OwnerID         *uuid.UUID `json:"owner_id"`
			TeamID          *uuid.UUID `json:"team_id"`
			ParentFeatureID *uuid.UUID `json:"parent_feature_id"`
			StartDate       *time.Time `json:"start_date"`
			TargetEndDate   *time.Time `json:"target_end_date"`
			EstimatedEffort *int       `json:"estimated_effort"`
			ProgressPct     *int       `json:"progress_pct"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		f, err := h.Svc.UpdateFeature(r.Context(), companyID, id, planningapp.UpdateFeatureInput{
			Title: body.Title, Description: body.Description, Code: body.Code, Goal: body.Goal,
			FeatureType: body.FeatureType, Priority: body.Priority, Status: body.Status,
			OwnerID: body.OwnerID, TeamID: body.TeamID, ParentFeatureID: body.ParentFeatureID,
			StartDate: body.StartDate, TargetEndDate: body.TargetEndDate,
			EstimatedEffort: body.EstimatedEffort, ProgressPct: body.ProgressPct,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, f, nil)
	case len(parts) == 1 && r.Method == http.MethodDelete:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		f, err := h.Svc.ArchiveFeature(r.Context(), companyID, id, nil)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, f, nil)
	case len(parts) == 2 && parts[1] == "restore" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		f, err := h.Svc.RestoreFeature(r.Context(), companyID, id)
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
	case len(parts) == 2 && parts[1] == "dependencies" && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		deps, err := h.Svc.ListFeatureDependencies(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, deps, nil)
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
		f, err := h.Svc.SetFeatureDependencies(r.Context(), companyID, id, body.DependsOn)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, f, nil)
	case len(parts) == 2 && parts[1] == "members" && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		items, err := h.Svc.ListFeatureMembers(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, nil)
	case len(parts) == 2 && parts[1] == "members" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			EmployeeID uuid.UUID `json:"employee_id"`
			Role       string    `json:"role"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		m, err := h.Svc.AddFeatureMember(r.Context(), companyID, id, body.EmployeeID, body.Role)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, m, nil)
	case len(parts) == 3 && parts[1] == "members" && r.Method == http.MethodDelete:
		id, err1 := ParseUUIDParam(parts[0])
		employeeID, err2 := ParseUUIDParam(parts[2])
		if err1 != nil || err2 != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		if err := h.Svc.RemoveFeatureMember(r.Context(), companyID, id, employeeID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "removed"}, nil)
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
	case len(parts) == 1 && parts[0] == "my" && r.Method == http.MethodGet:
		var assigneeOverride *uuid.UUID
		if aid := r.URL.Query().Get("assignee_id"); aid != "" {
			id, err := ParseUUIDParam(aid)
			if err != nil {
				WriteErr(w, shared.New("INVALID_ID", "Invalid assignee_id", 400))
				return
			}
			assigneeOverride = &id
		}
		email := ""
		if claims := middleware.ClaimsFromContext(r.Context()); claims != nil {
			email = claims.Email
		}
		items, meta, err := h.Svc.ListMyTasks(r.Context(), companyID, email, assigneeOverride, PageQueryFromRequest(r))
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, meta)
	case len(parts) == 0 && r.Method == http.MethodGet:
		q := PageQueryFromRequest(r)
		if aid := r.URL.Query().Get("assignee_id"); aid != "" {
			assigneeID, err := ParseUUIDParam(aid)
			if err != nil {
				WriteErr(w, shared.New("INVALID_ID", "Invalid assignee_id", 400))
				return
			}
			items, meta, err := h.Svc.ListMyTasks(r.Context(), companyID, "", &assigneeID, q)
			if err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusOK, items, meta)
			return
		}
		if r.URL.Query().Get("overdue") == "true" {
			items, meta, err := h.Svc.ListOverdueTasks(r.Context(), companyID, q)
			if err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusOK, items, meta)
			return
		}
		featureID, err := ParseUUIDParam(r.URL.Query().Get("feature_id"))
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "feature_id is required", 400))
			return
		}
		items, meta, err := h.Svc.ListTasksByFeature(r.Context(), companyID, featureID, q)
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
			DueDate    *time.Time `json:"due_date"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		t, err := h.Svc.CreateTask(r.Context(), companyID, planningapp.CreateTaskInput{
			FeatureID: body.FeatureID, Title: body.Title, Priority: body.Priority, AssigneeID: body.AssigneeID, DueDate: body.DueDate,
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
	case len(parts) == 2 && parts[1] == "pause" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		t, err := h.Svc.PauseTask(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	case len(parts) == 2 && parts[1] == "resume" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		t, err := h.Svc.ResumeTask(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	case len(parts) == 2 && parts[1] == "reopen" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		t, err := h.Svc.ReopenTask(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	case len(parts) == 2 && parts[1] == "restore" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		t, err := h.Svc.RestoreTask(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, t, nil)
	case len(parts) == 2 && parts[1] == "soft-delete" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		t, err := h.Svc.SoftDeleteTask(r.Context(), companyID, id, nil)
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
			Title            *string    `json:"title"`
			Description      *string    `json:"description"`
			TaskType         *string    `json:"task_type"`
			Priority         *string    `json:"priority"`
			Status           *string    `json:"status"`
			DueDate          *time.Time `json:"due_date"`
			StartDate        *time.Time `json:"start_date"`
			EstimatedMinutes *int       `json:"estimated_minutes"`
			ActualMinutes    *int       `json:"actual_minutes"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		t, err := h.Svc.UpdateTask(r.Context(), companyID, id, planningapp.UpdateTaskInput{
			Title: body.Title, Description: body.Description, TaskType: body.TaskType, Priority: body.Priority,
			Status: body.Status, DueDate: body.DueDate, StartDate: body.StartDate,
			EstimatedMinutes: body.EstimatedMinutes, ActualMinutes: body.ActualMinutes,
		})
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
	case len(parts) == 2 && parts[1] == "checklist" && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		items, err := h.Svc.ListChecklist(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, nil)
	case len(parts) == 2 && parts[1] == "checklist" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Title string `json:"title"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		item, err := h.Svc.CreateChecklistItem(r.Context(), companyID, id, body.Title)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, item, nil)
	case len(parts) == 3 && parts[1] == "checklist" && parts[2] == "reorder" && r.Method == http.MethodPut:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			OrderedIDs []uuid.UUID `json:"ordered_ids"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		items, err := h.Svc.ReorderChecklist(r.Context(), companyID, id, body.OrderedIDs)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, nil)
	case len(parts) == 3 && parts[1] == "checklist" && (r.Method == http.MethodPut || r.Method == http.MethodPatch):
		itemID, err := ParseUUIDParam(parts[2])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			IsDone bool `json:"is_done"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		item, err := h.Svc.ToggleChecklist(r.Context(), companyID, itemID, body.IsDone)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, item, nil)
	case len(parts) == 3 && parts[1] == "checklist" && r.Method == http.MethodDelete:
		itemID, err := ParseUUIDParam(parts[2])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		if err := h.Svc.DeleteChecklistItem(r.Context(), companyID, itemID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "deleted"}, nil)
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
