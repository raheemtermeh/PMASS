package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strings"

	"PMAS/internal/auth"
	"PMAS/internal/middleware"
	"PMAS/internal/models"
)

var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

func (h *Handler) HandleAccessRequests(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/access-requests")
	path = strings.Trim(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodPost:
			h.SubmitAccessRequest(w, r)
		case http.MethodGet:
			h.ListAccessRequests(w, r)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}

	parts := strings.Split(path, "/")
	id, ok := parsePathID(parts[0])
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request id"})
		return
	}

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			h.GetAccessRequest(w, r, id)
		case http.MethodPatch, http.MethodPut:
			h.UpdateAccessRequest(w, r, id)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}

	if len(parts) == 2 && parts[1] == "provision" && r.Method == http.MethodPost {
		h.ProvisionFromAccessRequest(w, r, id)
		return
	}

	w.WriteHeader(http.StatusNotFound)
	json.NewEncoder(w).Encode(map[string]string{"error": "Not found"})
}

func (h *Handler) SubmitAccessRequest(w http.ResponseWriter, r *http.Request) {
	var req models.SubmitAccessRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	req.CompanyName = strings.TrimSpace(req.CompanyName)
	req.ContactName = strings.TrimSpace(req.ContactName)
	req.ContactEmail = strings.TrimSpace(strings.ToLower(req.ContactEmail))

	if req.PreferredSlug != nil {
		s := strings.TrimSpace(strings.ToLower(*req.PreferredSlug))
		req.PreferredSlug = &s
		if s != "" && (!slugPattern.MatchString(s) || s == "platform") {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid preferred company ID"})
			return
		}
		if s == "" {
			req.PreferredSlug = nil
		}
	}

	if req.CompanyName == "" || req.ContactName == "" || req.ContactEmail == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "company_name, contact_name, and contact_email are required"})
		return
	}
	if !emailPattern.MatchString(req.ContactEmail) {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid contact email"})
		return
	}

	var pending int
	err := h.db.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM company_access_requests
		WHERE contact_email = $1 AND status = $2
	`, req.ContactEmail, models.AccessRequestPending).Scan(&pending)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if pending > 0 {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "A pending request already exists for this email"})
		return
	}

	var created models.CompanyAccessRequest
	err = h.db.QueryRowContext(r.Context(), `
		INSERT INTO company_access_requests (
			company_name, preferred_slug, contact_name, contact_email,
			contact_phone, company_size, industry, message
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, company_name, preferred_slug, contact_name, contact_email,
			contact_phone, company_size, industry, message, status,
			admin_notes, reviewed_by, reviewed_at, provisioned_tenant_id,
			created_at, updated_at
	`, req.CompanyName, req.PreferredSlug, req.ContactName, req.ContactEmail,
		req.ContactPhone, req.CompanySize, req.Industry, req.Message,
	).Scan(
		&created.ID, &created.CompanyName, &created.PreferredSlug, &created.ContactName,
		&created.ContactEmail, &created.ContactPhone, &created.CompanySize, &created.Industry,
		&created.Message, &created.Status, &created.AdminNotes, &created.ReviewedBy,
		&created.ReviewedAt, &created.ProvisionedTenantID, &created.CreatedAt, &created.UpdatedAt,
	)
	if err != nil {
		log.Printf("Submit access request error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

func (h *Handler) ListAccessRequests(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}

	status := strings.TrimSpace(r.URL.Query().Get("status"))
	query := `
		SELECT id, company_name, preferred_slug, contact_name, contact_email,
			contact_phone, company_size, industry, message, status,
			admin_notes, reviewed_by, reviewed_at, provisioned_tenant_id,
			created_at, updated_at
		FROM company_access_requests
	`
	args := []interface{}{}
	if status != "" {
		query += ` WHERE status = $1`
		args = append(args, status)
	}
	query += ` ORDER BY created_at DESC`

	rows, err := h.db.QueryContext(r.Context(), query, args...)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	list := make([]models.CompanyAccessRequest, 0)
	for rows.Next() {
		item, err := scanAccessRequest(rows)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		list = append(list, item)
	}
	json.NewEncoder(w).Encode(list)
}

func (h *Handler) GetAccessRequest(w http.ResponseWriter, r *http.Request, id int) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}

	item, err := h.loadAccessRequest(r, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Request not found"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(item)
}

func (h *Handler) UpdateAccessRequest(w http.ResponseWriter, r *http.Request, id int) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil || !auth.IsPlatformAdmin(claims.Role) {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Platform admin only"})
		return
	}

	var req models.UpdateAccessRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	if req.Status != nil {
		s := strings.TrimSpace(*req.Status)
		if s != models.AccessRequestRejected && s != models.AccessRequestPending {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Only reject or reopen (pending) is allowed via this endpoint"})
			return
		}
		req.Status = &s
	}

	existing, err := h.loadAccessRequest(r, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Request not found"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if existing.Status == models.AccessRequestApproved {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "Approved requests cannot be modified"})
		return
	}

	status := existing.Status
	if req.Status != nil {
		status = *req.Status
	}
	notes := existing.AdminNotes
	if req.AdminNotes != nil {
		n := strings.TrimSpace(*req.AdminNotes)
		if n == "" {
			notes = nil
		} else {
			notes = &n
		}
	}

	var reviewedBy *int
	if status == models.AccessRequestRejected {
		reviewedBy = &claims.UserID
	}

	_, err = h.db.ExecContext(r.Context(), `
		UPDATE company_access_requests
		SET status = $1, admin_notes = $2, reviewed_by = $3,
		    reviewed_at = CASE WHEN $4::bool THEN NOW() ELSE reviewed_at END,
		    updated_at = NOW()
		WHERE id = $5 AND status != $6
	`, status, notes, reviewedBy, status == models.AccessRequestRejected, id, models.AccessRequestApproved)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	updated, err := h.loadAccessRequest(r, id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(updated)
}

func (h *Handler) ProvisionFromAccessRequest(w http.ResponseWriter, r *http.Request, id int) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil || !auth.IsPlatformAdmin(claims.Role) {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Platform admin only"})
		return
	}

	var req models.ProvisionFromRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	req.TenantSlug = strings.TrimSpace(strings.ToLower(req.TenantSlug))
	if req.TenantSlug == "" || req.AdminPassword == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "tenant_slug and admin_password are required"})
		return
	}
	if !slugPattern.MatchString(req.TenantSlug) || req.TenantSlug == "platform" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid tenant_slug"})
		return
	}
	if err := auth.ValidatePasswordStrength(req.AdminPassword); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	accessReq, err := h.loadAccessRequest(r, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Request not found"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if accessReq.Status == models.AccessRequestApproved {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "Request already approved"})
		return
	}
	if accessReq.Status == models.AccessRequestRejected {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "Rejected requests must be reopened before provisioning"})
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
	`, accessReq.CompanyName, req.TenantSlug).Scan(
		&tenant.ID, &tenant.Slug, &tenant.Name, &tenant.IsActive, &tenant.CreatedAt, &tenant.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "Company slug already exists"})
			return
		}
		log.Printf("Provision from request tenant error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	var adminID int
	err = tx.QueryRowContext(r.Context(), `
		INSERT INTO app_users (tenant_id, email, password_hash, full_name, role)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, tenant.ID, accessReq.ContactEmail, hash, accessReq.ContactName, auth.RoleTenantAdmin).Scan(&adminID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "Admin email already exists"})
			return
		}
		log.Printf("Provision from request admin error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	notes := accessReq.AdminNotes
	if req.AdminNotes != nil {
		n := strings.TrimSpace(*req.AdminNotes)
		if n != "" {
			notes = &n
		}
	}

	_, err = tx.ExecContext(r.Context(), `
		UPDATE company_access_requests
		SET status = $1, admin_notes = $2, reviewed_by = $3, reviewed_at = NOW(),
		    provisioned_tenant_id = $4, updated_at = NOW()
		WHERE id = $5
	`, models.AccessRequestApproved, notes, claims.UserID, tenant.ID, id)
	if err != nil {
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

	updatedReq, err := h.loadAccessRequest(r, id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(models.ProvisionFromRequestResponse{
		Request: updatedReq,
		Tenant:  tenant,
		Admin:   *admin,
	})
}

type rowScanner interface {
	Scan(dest ...interface{}) error
}

func scanAccessRequest(scanner rowScanner) (models.CompanyAccessRequest, error) {
	var item models.CompanyAccessRequest
	err := scanner.Scan(
		&item.ID, &item.CompanyName, &item.PreferredSlug, &item.ContactName,
		&item.ContactEmail, &item.ContactPhone, &item.CompanySize, &item.Industry,
		&item.Message, &item.Status, &item.AdminNotes, &item.ReviewedBy,
		&item.ReviewedAt, &item.ProvisionedTenantID, &item.CreatedAt, &item.UpdatedAt,
	)
	return item, err
}

func (h *Handler) loadAccessRequest(r *http.Request, id int) (models.CompanyAccessRequest, error) {
	row := h.db.QueryRowContext(r.Context(), `
		SELECT id, company_name, preferred_slug, contact_name, contact_email,
			contact_phone, company_size, industry, message, status,
			admin_notes, reviewed_by, reviewed_at, provisioned_tenant_id,
			created_at, updated_at
		FROM company_access_requests WHERE id = $1
	`, id)
	item, err := scanAccessRequest(row)
	return item, err
}
