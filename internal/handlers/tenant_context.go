package handlers

import (
	"encoding/json"
	"net/http"

	"PMAS/internal/auth"
	"PMAS/internal/middleware"
)

// requireTenantID extracts the active company id from JWT claims.
// Platform admins have no tenant workspace and cannot access company data APIs.
func (h *Handler) requireTenantID(w http.ResponseWriter, r *http.Request) (int, bool) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Authentication required"})
		return 0, false
	}
	if claims.TenantID == nil {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Company workspace required"})
		return 0, false
	}
	return *claims.TenantID, true
}

func (h *Handler) requirePlatformAdmin(w http.ResponseWriter, r *http.Request) bool {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil || !auth.IsPlatformAdmin(claims.Role) {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Platform admin only"})
		return false
	}
	return true
}
