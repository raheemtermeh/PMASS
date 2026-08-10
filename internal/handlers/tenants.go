package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"PMAS/internal/auth"
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

	id, err := strconv.Atoi(path)
	if err != nil || id <= 0 {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Not found"})
		return
	}

	switch r.Method {
	case http.MethodGet:
		h.GetTenant(w, r, id)
	case http.MethodPatch:
		h.UpdateTenant(w, r, id)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *Handler) ListTenants(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
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
	_ = json.NewEncoder(w).Encode(tenants)
}

func (h *Handler) GetTenant(w http.ResponseWriter, r *http.Request, id int) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}

	var (
		t         models.Tenant
		companyID sql.NullString
	)
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, slug, name, is_active, created_at, updated_at, company_id::text
		FROM tenants WHERE id = $1
	`, id).Scan(&t.ID, &t.Slug, &t.Name, &t.IsActive, &t.CreatedAt, &t.UpdatedAt, &companyID)
	if err == sql.ErrNoRows {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Company not found"})
		return
	}
	if err != nil {
		log.Printf("GetTenant load error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	detail := models.TenantDetail{Tenant: t}
	if companyID.Valid && companyID.String != "" {
		cid := companyID.String
		detail.CompanyID = &cid

		var logo, lang, tz, status sql.NullString
		_ = h.db.QueryRowContext(r.Context(), `
			SELECT COALESCE(status,''), COALESCE(logo_url,''), COALESCE(language,''), COALESCE(timezone,'')
			FROM companies WHERE id = $1::uuid
		`, cid).Scan(&status, &logo, &lang, &tz)
		detail.CompanyStatus = status.String
		detail.LogoURL = logo.String
		detail.Language = lang.String
		detail.Timezone = tz.String

		_ = h.db.QueryRowContext(r.Context(), `
			SELECT COUNT(*) FROM employees WHERE company_id = $1::uuid
		`, cid).Scan(&detail.EmployeeCount)
		_ = h.db.QueryRowContext(r.Context(), `
			SELECT COUNT(*) FROM products WHERE company_id = $1::uuid AND deleted_at IS NULL
		`, cid).Scan(&detail.ProductCount)
		_ = h.db.QueryRowContext(r.Context(), `
			SELECT COUNT(*) FROM projects WHERE company_id = $1::uuid AND deleted_at IS NULL
		`, cid).Scan(&detail.ProjectCount)
	}

	_ = h.db.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM app_users WHERE tenant_id = $1
	`, id).Scan(&detail.UserCount)
	_ = h.db.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM app_users WHERE tenant_id = $1 AND is_active = true
	`, id).Scan(&detail.ActiveUsers)

	var adminEmail, adminName sql.NullString
	_ = h.db.QueryRowContext(r.Context(), `
		SELECT email, full_name FROM app_users
		WHERE tenant_id = $1 AND role IN ('tenant_admin', 'super_admin')
		ORDER BY id ASC LIMIT 1
	`, id).Scan(&adminEmail, &adminName)
	detail.AdminEmail = adminEmail.String
	detail.AdminName = adminName.String

	_ = json.NewEncoder(w).Encode(detail)
}

func (h *Handler) UpdateTenant(w http.ResponseWriter, r *http.Request, id int) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}

	var req models.UpdateTenantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}
	if req.Name == nil && req.IsActive == nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Provide name and/or is_active"})
		return
	}

	name := ""
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
		if name == "" {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "name cannot be empty"})
			return
		}
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var (
		t         models.Tenant
		companyID sql.NullString
	)
	err = tx.QueryRowContext(r.Context(), `
		SELECT id, slug, name, is_active, created_at, updated_at, company_id::text
		FROM tenants WHERE id = $1
		FOR UPDATE
	`, id).Scan(&t.ID, &t.Slug, &t.Name, &t.IsActive, &t.CreatedAt, &t.UpdatedAt, &companyID)
	if err == sql.ErrNoRows {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Company not found"})
		return
	}
	if err != nil {
		log.Printf("UpdateTenant load error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if req.Name != nil {
		t.Name = name
	}
	if req.IsActive != nil {
		t.IsActive = *req.IsActive
	}

	err = tx.QueryRowContext(r.Context(), `
		UPDATE tenants
		SET name = $2, is_active = $3, updated_at = NOW()
		WHERE id = $1
		RETURNING id, slug, name, is_active, created_at, updated_at
	`, t.ID, t.Name, t.IsActive).Scan(
		&t.ID, &t.Slug, &t.Name, &t.IsActive, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		log.Printf("UpdateTenant save error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if companyID.Valid && companyID.String != "" {
		companyStatus := "ACTIVE"
		if !t.IsActive {
			companyStatus = "ON_HOLD"
		}
		if _, err := tx.ExecContext(r.Context(), `
			UPDATE companies
			SET name = $2, status = $3, updated_at = NOW()
			WHERE id = $1::uuid
		`, companyID.String, t.Name, companyStatus); err != nil {
			log.Printf("UpdateTenant company sync error: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	_ = json.NewEncoder(w).Encode(t)
}

func (h *Handler) ProvisionTenant(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}

	var req models.ProvisionTenantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	req.TenantName = strings.TrimSpace(req.TenantName)
	req.TenantSlug = strings.TrimSpace(strings.ToLower(req.TenantSlug))
	req.AdminEmail = strings.TrimSpace(strings.ToLower(req.AdminEmail))
	req.AdminFullName = strings.TrimSpace(req.AdminFullName)

	if req.TenantName == "" || req.TenantSlug == "" || req.AdminEmail == "" || req.AdminPassword == "" || req.AdminFullName == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "tenant_name, tenant_slug, admin_email, admin_password, and admin_full_name are required"})
		return
	}
	if !slugPattern.MatchString(req.TenantSlug) || req.TenantSlug == "platform" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Invalid tenant_slug (use lowercase letters, numbers, hyphens)"})
		return
	}
	if err := auth.ValidatePasswordStrength(req.AdminPassword); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
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
		WITH new_company AS (
			INSERT INTO companies (name, slug, status)
			VALUES ($1, $2, 'ACTIVE')
			RETURNING id
		)
		INSERT INTO tenants (slug, name, company_id)
		SELECT $2, $1, new_company.id FROM new_company
		RETURNING id, slug, name, is_active, created_at, updated_at
	`, req.TenantName, req.TenantSlug).Scan(
		&tenant.ID, &tenant.Slug, &tenant.Name, &tenant.IsActive, &tenant.CreatedAt, &tenant.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Company slug already exists"})
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
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Admin email already exists for this company"})
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
	_ = json.NewEncoder(w).Encode(models.ProvisionTenantResponse{
		Tenant: tenant,
		Admin:  *admin,
	})
}
