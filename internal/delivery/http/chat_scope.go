package httpapi

import (
	"net/http"
	"strconv"

	chatapp "PMAS/internal/application/chat"
	"PMAS/internal/domain/shared"
	"PMAS/internal/middleware"
)

// ChatScope resolves company + employee for chat requests.
type ChatScope struct {
	*CompanyScope
	Svc *chatapp.Service
}

func (c *ChatScope) RequireActor(w http.ResponseWriter, r *http.Request) (*chatapp.Actor, bool) {
	companyID, ok := c.CompanyScope.Require(w, r)
	if !ok {
		return nil, false
	}
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		WriteErr(w, shared.ErrUnauthorized)
		return nil, false
	}
	employeeID, err := c.Svc.ResolveEmployeeID(r.Context(), companyID, claims.UserID, claims.EmployeeID)
	if err != nil {
		WriteErr(w, err)
		return nil, false
	}
	return &chatapp.Actor{
		CompanyID:  companyID,
		EmployeeID: employeeID,
		Role:       claims.Role,
		Perms:      claims.Permissions,
	}, true
}

func chatLimitFromRequest(r *http.Request) int {
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	if v := r.URL.Query().Get("page_size"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return 50
}
