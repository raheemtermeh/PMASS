package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"PMAS/internal/auth"
	"PMAS/internal/middleware"
	"PMAS/internal/models"
)

func (h *Handler) GetAuthStatus(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var count int
	err := h.db.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM app_users WHERE tenant_id IS NULL AND role IN ('platform_admin', 'super_admin')
	`).Scan(&count)
	if err != nil {
		log.Printf("Error checking bootstrap status: %v", err)
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Database unavailable. Ensure the API can reach Supabase and auth tables exist.",
		})
		return
	}

	json.NewEncoder(w).Encode(models.AuthStatusResponse{NeedsBootstrap: count == 0})
}

func (h *Handler) Bootstrap(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var count int
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(r.Context(), `SELECT pg_advisory_xact_lock(721001)`); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if err := tx.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM app_users WHERE tenant_id IS NULL AND role IN ('platform_admin', 'super_admin')
	`).Scan(&count); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if count > 0 {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "Platform already bootstrapped"})
		return
	}

	var req models.BootstrapRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.FullName = strings.TrimSpace(req.FullName)
	if req.Email == "" || req.Password == "" || req.FullName == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "email, password, and full_name are required"})
		return
	}
	if err := auth.ValidatePasswordStrength(req.Password); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	var userID int
	err = tx.QueryRowContext(r.Context(), `
		INSERT INTO app_users (tenant_id, email, password_hash, full_name, role)
		VALUES (NULL, $1, $2, $3, $4)
		RETURNING id
	`, req.Email, hash, req.FullName, auth.RolePlatformAdmin).Scan(&userID)
	if err != nil {
		log.Printf("Error creating platform admin: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to create platform admin"})
		return
	}
	if err := tx.Commit(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	user, err := h.loadUserWithPermissions(r, userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	token, err := h.issueSession(user)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(models.LoginResponse{Token: token, User: *user})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.TenantSlug = strings.TrimSpace(strings.ToLower(req.TenantSlug))
	if req.Email == "" || req.Password == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "email and password are required"})
		return
	}

	var (
		userID           int
		hash, fullName, role string
		isActive         bool
		tenantID         sql.NullInt64
	)

	var err error
	if req.TenantSlug == "" || req.TenantSlug == "platform" {
		err = h.db.QueryRowContext(r.Context(), `
			SELECT id, password_hash, full_name, role, is_active, tenant_id
			FROM app_users
			WHERE email = $1 AND tenant_id IS NULL
		`, req.Email).Scan(&userID, &hash, &fullName, &role, &isActive, &tenantID)
	} else {
		err = h.db.QueryRowContext(r.Context(), `
			SELECT u.id, u.password_hash, u.full_name, u.role, u.is_active, u.tenant_id
			FROM app_users u
			JOIN tenants t ON t.id = u.tenant_id
			WHERE u.email = $1 AND t.slug = $2 AND t.is_active = true
		`, req.Email, req.TenantSlug).Scan(&userID, &hash, &fullName, &role, &isActive, &tenantID)
	}

	if err == sql.ErrNoRows {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid company, email, or password"})
		return
	}
	if err != nil {
		log.Printf("Login query error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if !isActive {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Account is deactivated"})
		return
	}
	if !auth.CheckPassword(hash, req.Password) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid company, email, or password"})
		return
	}

	user, err := h.loadUserWithPermissions(r, userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	token, err := h.issueSession(user)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(models.LoginResponse{Token: token, User: *user})
}

func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	user, err := h.loadUserWithPermissions(r, claims.UserID)
	if err != nil || !user.IsActive {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Session revoked or expired"})
		return
	}

	switch r.Method {
	case http.MethodGet:
		json.NewEncoder(w).Encode(user)
	case http.MethodPut, http.MethodPatch:
		h.UpdateProfile(w, r, claims.UserID)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request, userID int) {
	var req models.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	req.FirstName = strings.TrimSpace(req.FirstName)
	req.LastName = strings.TrimSpace(req.LastName)
	if req.FirstName == "" || req.LastName == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "first_name and last_name are required"})
		return
	}
	if len(req.FirstName) > 120 || len(req.LastName) > 120 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Name fields are too long"})
		return
	}

	fullName := strings.TrimSpace(req.FirstName + " " + req.LastName)
	var jobTitle, phone, bio *string
	if req.JobTitle != nil {
		v := strings.TrimSpace(*req.JobTitle)
		if v != "" {
			jobTitle = &v
		}
	}
	if req.Phone != nil {
		v := strings.TrimSpace(*req.Phone)
		if v != "" {
			phone = &v
		}
	}
	if req.Bio != nil {
		v := strings.TrimSpace(*req.Bio)
		if len(v) > 1000 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Bio must be at most 1000 characters"})
			return
		}
		if v != "" {
			bio = &v
		}
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(r.Context(), `
		UPDATE app_users
		SET first_name = $1,
		    last_name = $2,
		    full_name = $3,
		    job_title = $4,
		    phone = $5,
		    bio = $6,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $7
	`, req.FirstName, req.LastName, fullName, jobTitle, phone, bio, userID)
	if err != nil {
		log.Printf("Error updating profile: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to update profile"})
		return
	}

	if req.Password != nil && strings.TrimSpace(*req.Password) != "" {
		if err := auth.ValidatePasswordStrength(*req.Password); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		hash, err := auth.HashPassword(*req.Password)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if _, err := tx.ExecContext(r.Context(), `
			UPDATE app_users
			SET password_hash = $1, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2
		`, hash, userID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	user, err := h.loadUserWithPermissions(r, userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(user)
}

func (h *Handler) HandleUsers(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/users")
	path = strings.Trim(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			h.ListUsers(w, r)
		case http.MethodPost:
			h.CreateUser(w, r)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}

	id, err := strconv.Atoi(path)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid user id"})
		return
	}

	switch r.Method {
	case http.MethodPut:
		h.UpdateUser(w, r, id)
	case http.MethodDelete:
		h.DeleteUser(w, r, id)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var (
		rows *sql.Rows
		err  error
	)

	if auth.IsPlatformAdmin(claims.Role) && claims.TenantID == nil {
		rows, err = h.db.QueryContext(r.Context(), `
			SELECT id, tenant_id, email, full_name, role, is_active, created_at, updated_at
			FROM app_users WHERE tenant_id IS NULL ORDER BY id
		`)
	} else if claims.TenantID != nil {
		rows, err = h.db.QueryContext(r.Context(), `
			SELECT id, tenant_id, email, full_name, role, is_active, created_at, updated_at
			FROM app_users WHERE tenant_id = $1 ORDER BY id
		`, *claims.TenantID)
	} else {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "No tenant context"})
		return
	}
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	users := make([]models.AppUserWithPermissions, 0)
	for rows.Next() {
		var u models.AppUser
		var tid sql.NullInt64
		if err := rows.Scan(&u.ID, &tid, &u.Email, &u.FullName, &u.Role, &u.IsActive, &u.CreatedAt, &u.UpdatedAt); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if tid.Valid {
			id := int(tid.Int64)
			u.TenantID = &id
		}
		full, err := h.loadUserWithPermissions(r, u.ID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		users = append(users, *full)
	}
	json.NewEncoder(w).Encode(users)
}

func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil || claims.TenantID == nil {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Only tenant admins can create company users"})
		return
	}

	var req models.CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.FullName = strings.TrimSpace(req.FullName)
	if req.Email == "" || req.Password == "" || req.FullName == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "email, password, and full_name are required"})
		return
	}
	if err := auth.ValidatePasswordStrength(req.Password); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	role := req.Role
	if role == "" {
		role = auth.RoleUser
	}
	if role != auth.RoleUser && role != auth.RoleTenantAdmin {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid role for tenant user"})
		return
	}

	hash, err := auth.HashPassword(req.Password)
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

	var userID int
	err = tx.QueryRowContext(r.Context(), `
		INSERT INTO app_users (tenant_id, email, password_hash, full_name, role)
		VALUES ($1, $2, $3, $4, $5) RETURNING id
	`, *claims.TenantID, req.Email, hash, req.FullName, role).Scan(&userID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "Email already exists in this company"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if role == auth.RoleUser {
		for _, perm := range req.Permissions {
			if !isValidPermission(perm) {
				continue
			}
			if _, err := tx.ExecContext(r.Context(), `
				INSERT INTO user_permissions (user_id, permission) VALUES ($1, $2)
			`, userID, perm); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
		}
	}

	if err := tx.Commit(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	user, err := h.loadUserWithPermissions(r, userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(user)
}

func (h *Handler) UpdateUser(w http.ResponseWriter, r *http.Request, userID int) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var targetTenant sql.NullInt64
	if err := h.db.QueryRowContext(r.Context(), `SELECT tenant_id FROM app_users WHERE id = $1`, userID).Scan(&targetTenant); err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "User not found"})
		return
	}

	if !auth.IsPlatformAdmin(claims.Role) {
		if claims.TenantID == nil || !targetTenant.Valid || int(targetTenant.Int64) != *claims.TenantID {
			w.WriteHeader(http.StatusForbidden)
			return
		}
	}

	var req models.UpdateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	if claims.UserID == userID && req.IsActive != nil && !*req.IsActive {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Cannot deactivate your own account"})
		return
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	if req.FullName != nil {
		if _, err := tx.ExecContext(r.Context(), `UPDATE app_users SET full_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, *req.FullName, userID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}
	if req.Password != nil && *req.Password != "" {
		if err := auth.ValidatePasswordStrength(*req.Password); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		hash, err := auth.HashPassword(*req.Password)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if _, err := tx.ExecContext(r.Context(), `
			UPDATE app_users
			SET password_hash = $1, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2
		`, hash, userID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}
	if req.Role != nil {
		if *req.Role != auth.RoleUser && *req.Role != auth.RoleTenantAdmin {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid role"})
			return
		}
		if _, err := tx.ExecContext(r.Context(), `
			UPDATE app_users
			SET role = $1, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2
		`, *req.Role, userID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}
	if req.IsActive != nil {
		if _, err := tx.ExecContext(r.Context(), `
			UPDATE app_users
			SET is_active = $1, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2
		`, *req.IsActive, userID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}
	if req.Permissions != nil {
		if _, err := tx.ExecContext(r.Context(), `DELETE FROM user_permissions WHERE user_id = $1`, userID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		for _, perm := range req.Permissions {
			if !isValidPermission(perm) {
				continue
			}
			if _, err := tx.ExecContext(r.Context(), `INSERT INTO user_permissions (user_id, permission) VALUES ($1, $2)`, userID, perm); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
		}
		if _, err := tx.ExecContext(r.Context(), `
			UPDATE app_users SET session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1
		`, userID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	user, err := h.loadUserWithPermissions(r, userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(user)
}

func (h *Handler) DeleteUser(w http.ResponseWriter, r *http.Request, userID int) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	if claims.UserID == userID {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Cannot delete your own account"})
		return
	}

	var targetTenant sql.NullInt64
	if err := h.db.QueryRowContext(r.Context(), `SELECT tenant_id FROM app_users WHERE id = $1`, userID).Scan(&targetTenant); err != nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if !auth.IsPlatformAdmin(claims.Role) {
		if claims.TenantID == nil || !targetTenant.Valid || int(targetTenant.Int64) != *claims.TenantID {
			w.WriteHeader(http.StatusForbidden)
			return
		}
	}

	result, err := h.db.ExecContext(r.Context(), `DELETE FROM app_users WHERE id = $1`, userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "User not found"})
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "User deleted"})
}

func (h *Handler) GetPermissionsCatalog(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	json.NewEncoder(w).Encode(auth.AllPermissions)
}

func (h *Handler) issueSession(user *models.AppUserWithPermissions) (string, error) {
	var slug, name string
	if user.Tenant != nil {
		slug = user.Tenant.Slug
		name = user.Tenant.Name
	}
	return auth.IssueToken(
		user.ID,
		user.TenantID,
		slug,
		name,
		user.Email,
		user.FullName,
		user.Role,
		user.Permissions,
		user.SessionVersion,
	)
}

func (h *Handler) loadUserWithPermissions(r *http.Request, userID int) (*models.AppUserWithPermissions, error) {
	var u models.AppUser
	var tid sql.NullInt64
	var firstName, lastName sql.NullString
	var jobTitle, phone, bio sql.NullString
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, tenant_id, email, full_name,
		       COALESCE(first_name, ''), COALESCE(last_name, ''),
		       job_title, phone, bio,
		       role, is_active, COALESCE(session_version, 1), created_at, updated_at
		FROM app_users WHERE id = $1
	`, userID).Scan(
		&u.ID, &tid, &u.Email, &u.FullName,
		&firstName, &lastName,
		&jobTitle, &phone, &bio,
		&u.Role, &u.IsActive, &u.SessionVersion, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if tid.Valid {
		id := int(tid.Int64)
		u.TenantID = &id
	}
	u.FirstName = strings.TrimSpace(firstName.String)
	u.LastName = strings.TrimSpace(lastName.String)
	if u.FirstName == "" && u.FullName != "" {
		parts := strings.Fields(u.FullName)
		if len(parts) > 0 {
			u.FirstName = parts[0]
		}
		if len(parts) > 1 {
			u.LastName = strings.Join(parts[1:], " ")
		}
	}
	if jobTitle.Valid {
		v := jobTitle.String
		u.JobTitle = &v
	}
	if phone.Valid {
		v := phone.String
		u.Phone = &v
	}
	if bio.Valid {
		v := bio.String
		u.Bio = &v
	}

	perms, err := h.loadPermissions(r, userID)
	if err != nil {
		return nil, err
	}
	if auth.IsPlatformAdmin(u.Role) || u.Role == auth.RoleTenantAdmin {
		perms = auth.AllPermissions
	}

	out := &models.AppUserWithPermissions{AppUser: u, Permissions: perms}
	if u.TenantID != nil {
		tenant, err := h.loadTenant(r, *u.TenantID)
		if err != nil {
			return nil, err
		}
		out.Tenant = tenant
	}
	return out, nil
}

func (h *Handler) loadTenant(r *http.Request, tenantID int) (*models.Tenant, error) {
	var t models.Tenant
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, slug, name, is_active, created_at, updated_at FROM tenants WHERE id = $1
	`, tenantID).Scan(&t.ID, &t.Slug, &t.Name, &t.IsActive, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (h *Handler) loadPermissions(r *http.Request, userID int) ([]string, error) {
	rows, err := h.db.QueryContext(r.Context(), `SELECT permission FROM user_permissions WHERE user_id = $1 ORDER BY permission`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	perms := make([]string, 0)
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		perms = append(perms, p)
	}
	return perms, nil
}

func isValidPermission(perm string) bool {
	for _, p := range auth.AllPermissions {
		if p == perm {
			return true
		}
	}
	return false
}
