package httpapi

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
	"PMAS/internal/infrastructure/postgres"
	"PMAS/internal/middleware"
)

func PageQueryFromRequest(r *http.Request) shared.PageQuery {
	q := shared.PageQuery{
		Search: r.URL.Query().Get("search"),
		Sort:   r.URL.Query().Get("sort"),
		Status: r.URL.Query().Get("status"),
	}
	if v := r.URL.Query().Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			q.Page = n
		}
	}
	if v := r.URL.Query().Get("page_size"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			q.PageSize = n
		}
	}
	return q.Normalize()
}

func ParseUUIDParam(raw string) (uuid.UUID, error) {
	return uuid.Parse(raw)
}

// CompanyScope resolves Tenant → Company UUID for the authenticated user.
type CompanyScope struct {
	DB *postgres.DB
}

func (c *CompanyScope) Require(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		WriteErr(w, shared.ErrUnauthorized)
		return uuid.Nil, false
	}
	if claims.TenantID == nil {
		WriteErr(w, shared.New("COMPANY_WORKSPACE_REQUIRED", "Company workspace required", 403))
		return uuid.Nil, false
	}
	companyID, err := c.DB.ResolveCompanyID(r.Context(), *claims.TenantID)
	if err != nil {
		WriteErr(w, err)
		return uuid.Nil, false
	}
	return companyID, true
}
