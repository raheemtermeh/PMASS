package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strings"

	"PMAS/internal/auth"
	"PMAS/internal/middleware"
	"PMAS/internal/models"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{1,62}[a-z0-9])?$`)

func (h *Handler) HandleTenants(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/tenants")
	path = strings.Trim(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			h.ListTenants(w, r)
		case http.MethodPost:
			h.ProvisionTenant(w, r)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}

	w.WriteHeader(http.StatusNotFound)
	json.NewEncoder(w).Encode(map[string]string{"error": "Not found"})
}

func (h *Handler) ListTenants(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil || !auth.IsPlatformAdmin(claims.Role) {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Platform admin only"})
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, slug, name, is_active, created_at, updated_at
		FROM tenants ORDER BY created_at DESC
	`)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	tenants := make([]models.Tenant, 0)
	for rows.Next() {
		var t models.Tenant
		if err := rows.Scan(&t.ID, &t.Slug, &t.Name, &t.IsActive, &t.CreatedAt, &t.UpdatedAt); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		tenants = append(tenants, t)
	}
	json.NewEncoder(w).Encode(tenants)
}

func (h *Handler) ProvisionTenant(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil || !auth.IsPlatformAdmin(claims.Role) {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Platform admin only"})
		return
	}

	var req models.ProvisionTenantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	req.TenantName = strings.TrimSpace(req.TenantName)
	req.TenantSlug = strings.TrimSpace(strings.ToLower(req.TenantSlug))
	req.AdminEmail = strings.TrimSpace(strings.ToLower(req.AdminEmail))
	req.AdminFullName = strings.TrimSpace(req.AdminFullName)

	if req.TenantName == "" || req.TenantSlug == "" || req.AdminEmail == "" || req.AdminPassword == "" || req.AdminFullName == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "tenant_name, tenant_slug, admin_email, admin_password, and admin_full_name are required"})
		return
	}
	if !slugPattern.MatchString(req.TenantSlug) || req.TenantSlug == "platform" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid tenant_slug (use lowercase letters, numbers, hyphens)"})
		return
	}
	if err := auth.ValidatePasswordStrength(req.AdminPassword); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	hash, err := auth.HashPassword(req.AdminPassword)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var tenant models.Tenant
	err = tx.QueryRowContext(r.Context(), `
		INSERT INTO tenants (slug, name)
		VALUES ($1, $2)
		RETURNING id, slug, name, is_active, created_at, updated_at
	`, req.TenantSlug, req.TenantName).Scan(
		&tenant.ID, &tenant.Slug, &tenant.Name, &tenant.IsActive, &tenant.CreatedAt, &tenant.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "Company slug already exists"})
			return
		}
		log.Printf("Provision tenant error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	var adminID int
	err = tx.QueryRowContext(r.Context(), `
		INSERT INTO app_users (tenant_id, email, password_hash, full_name, role)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, tenant.ID, req.AdminEmail, hash, req.AdminFullName, auth.RoleTenantAdmin).Scan(&adminID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "Admin email already exists for this company"})
			return
		}
		log.Printf("Provision admin error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	admin, err := h.loadUserWithPermissions(r, adminID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(models.ProvisionTenantResponse{
		Tenant: tenant,
		Admin:  *admin,
	})
}
