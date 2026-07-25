package httpapi

import (
	"net/http"
	"strings"

	rolesapp "PMAS/internal/application/roles"
	"PMAS/internal/domain/shared"
)

type RolesHandler struct {
	Scope *CompanyScope
	Svc   *rolesapp.Service
}

func (h *RolesHandler) HandleRoles(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/roles"), "/")
	parts := splitPath(path)

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		items, err := h.Svc.List(r.Context(), companyID)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, nil)
	case len(parts) == 0 && r.Method == http.MethodPost:
		var body struct {
			Name        string   `json:"name"`
			Description string   `json:"description"`
			Permissions []string `json:"permissions"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		role, err := h.Svc.Create(r.Context(), companyID, rolesapp.UpsertInput{
			Name: body.Name, Description: body.Description, Permissions: body.Permissions,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, role, nil)
	case len(parts) == 1 && r.Method == http.MethodGet:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		role, err := h.Svc.Get(r.Context(), companyID, id)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, role, nil)
	case len(parts) == 1 && (r.Method == http.MethodPut || r.Method == http.MethodPatch):
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Name        string   `json:"name"`
			Description string   `json:"description"`
			Permissions []string `json:"permissions"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		role, err := h.Svc.Update(r.Context(), companyID, id, rolesapp.UpsertInput{
			Name: body.Name, Description: body.Description, Permissions: body.Permissions,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, role, nil)
	case len(parts) == 1 && r.Method == http.MethodDelete:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		if err := h.Svc.Delete(r.Context(), companyID, id); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "deleted"}, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}
