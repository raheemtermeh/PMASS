package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"PMAS/internal/auth"
	rolesapp "PMAS/internal/application/roles"
	"PMAS/internal/infrastructure/postgres"
	"PMAS/internal/middleware"
)

// WorkspaceUser is the employee-centric User Management row.
type WorkspaceUser struct {
	EmployeeID  string   `json:"employee_id"`
	UserID      *int     `json:"user_id,omitempty"`
	FullName    string   `json:"full_name"`
	Email       string   `json:"email"`
	JobTitle    string   `json:"job_title"`
	Status      string   `json:"status"`
	IsActive    *bool    `json:"is_active,omitempty"`
	HasLogin    bool     `json:"has_login"`
	SystemRole  string   `json:"system_role,omitempty"`
	RoleID      *string  `json:"role_id,omitempty"`
	RoleName    string   `json:"role_name,omitempty"`
	Permissions []string `json:"permissions"`
}

type workspaceListMeta struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"page_size"`
	TotalItems int64 `json:"total_items"`
	TotalPages int   `json:"total_pages"`
}

type createWorkspaceUserRequest struct {
	EmployeeID  string   `json:"employee_id"`
	Email       string   `json:"email"`
	Password    string   `json:"password"`
	FullName    string   `json:"full_name"`
	JobTitle    string   `json:"job_title"`
	RoleID      string   `json:"role_id"`
	Permissions []string `json:"permissions"`
}

type updateWorkspaceUserRequest struct {
	FullName    *string  `json:"full_name,omitempty"`
	JobTitle    *string  `json:"job_title,omitempty"`
	Password    *string  `json:"password,omitempty"`
	RoleID      *string  `json:"role_id,omitempty"`
	IsActive    *bool    `json:"is_active,omitempty"`
	EmployeeStatus *string `json:"employee_status,omitempty"`
	Permissions []string `json:"permissions,omitempty"`
}

func (h *Handler) ListWorkspaceUsers(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil || claims.TenantID == nil {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Company workspace required"})
		return
	}
	companyID, err := h.resolveCompanyID(r, *claims.TenantID)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Company not found for tenant"})
		return
	}
	_ = rolesapp.NewService(postgres.New(h.db)).EnsureDefaults(r.Context(), companyID)

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		q = strings.TrimSpace(r.URL.Query().Get("search"))
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	roleID := strings.TrimSpace(r.URL.Query().Get("role_id"))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	where := `e.company_id = $1`
	args := []any{companyID}
	if status != "" {
		args = append(args, strings.ToUpper(status))
		where += ` AND e.status = $` + strconv.Itoa(len(args))
	}
	if roleID != "" {
		args = append(args, roleID)
		where += ` AND u.company_role_id = $` + strconv.Itoa(len(args)) + `::uuid`
	}
	if q != "" {
		args = append(args, "%"+strings.ToLower(q)+"%")
		n := strconv.Itoa(len(args))
		where += ` AND (LOWER(e.first_name) LIKE $` + n + ` OR LOWER(e.last_name) LIKE $` + n +
			` OR LOWER(e.email) LIKE $` + n + ` OR LOWER(COALESCE(e.job_title,'')) LIKE $` + n + `)`
	}

	var total int64
	if err := h.db.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM employees e
		LEFT JOIN app_users u ON u.id = e.user_id
		WHERE `+where, args...).Scan(&total); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	args = append(args, pageSize, offset)
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT e.id, e.first_name, e.last_name, e.email, COALESCE(e.job_title,''), e.status,
			e.user_id, u.is_active, COALESCE(u.role,''), u.company_role_id, COALESCE(cr.name,'')
		FROM employees e
		LEFT JOIN app_users u ON u.id = e.user_id
		LEFT JOIN company_roles cr ON cr.id = u.company_role_id
		WHERE `+where+`
		ORDER BY e.created_at DESC
		LIMIT $`+strconv.Itoa(len(args)-1)+` OFFSET $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	items := make([]WorkspaceUser, 0)
	for rows.Next() {
		var (
			empID, first, last, email, jobTitle, empStatus string
			userID                                         sql.NullInt64
			isActive                                       sql.NullBool
			sysRole                                        string
			roleID                                         uuid.NullUUID
			roleName                                       string
		)
		if err := rows.Scan(&empID, &first, &last, &email, &jobTitle, &empStatus, &userID, &isActive, &sysRole, &roleID, &roleName); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		item := WorkspaceUser{
			EmployeeID:  empID,
			FullName:    strings.TrimSpace(first + " " + last),
			Email:       email,
			JobTitle:    jobTitle,
			Status:      empStatus,
			SystemRole:  sysRole,
			RoleName:    roleName,
			Permissions: []string{},
		}
		if userID.Valid {
			id := int(userID.Int64)
			item.UserID = &id
			item.HasLogin = true
			active := isActive.Bool
			item.IsActive = &active
			perms, _ := h.loadPermissionList(r, id)
			item.Permissions = perms
		}
		if roleID.Valid {
			s := roleID.UUID.String()
			item.RoleID = &s
		}
		items = append(items, item)
	}

	totalPages := int(total) / pageSize
	if int(total)%pageSize != 0 {
		totalPages++
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"data":    items,
		"meta": workspaceListMeta{
			Page: page, PageSize: pageSize, TotalItems: total, TotalPages: totalPages,
		},
	})
}

func (h *Handler) CreateWorkspaceUser(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil || claims.TenantID == nil {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Only tenant admins can create company users"})
		return
	}
	companyID, err := h.resolveCompanyID(r, *claims.TenantID)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Company not found for tenant"})
		return
	}
	rolesSvc := rolesapp.NewService(postgres.New(h.db))
	_ = rolesSvc.EnsureDefaults(r.Context(), companyID)

	var req createWorkspaceUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.FullName = strings.TrimSpace(req.FullName)
	req.JobTitle = strings.TrimSpace(req.JobTitle)
	if req.Password == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "password is required"})
		return
	}
	if err := auth.ValidatePasswordStrength(req.Password); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	perms := req.Permissions
	var roleUUID *uuid.UUID
	if req.RoleID != "" {
		rid, err := uuid.Parse(req.RoleID)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid role_id"})
			return
		}
		role, err := rolesSvc.Get(r.Context(), companyID, rid)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Role not found"})
			return
		}
		roleUUID = &rid
		if len(perms) == 0 {
			perms = role.Permissions
		}
		// Company Admin business role → tenant_admin system role for full access.
		if role.Name == "Company Admin" {
			// keep system role as user with all perms OR promote — plan keeps tenant_admin separate.
			// Grant all VSM perms via permissions table with role=user.
		}
	}
	perms = filterPerms(perms)

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

	var empID uuid.UUID
	var first, last string
	if req.EmployeeID != "" {
		empID, err = uuid.Parse(req.EmployeeID)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid employee_id"})
			return
		}
		var existingUser sql.NullInt64
		err = tx.QueryRowContext(r.Context(), `
			SELECT first_name, last_name, email, user_id FROM employees WHERE company_id=$1 AND id=$2`,
			companyID, empID).Scan(&first, &last, &req.Email, &existingUser)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Employee not found"})
			return
		}
		if existingUser.Valid {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "Employee already has a login"})
			return
		}
		if req.FullName == "" {
			req.FullName = strings.TrimSpace(first + " " + last)
		}
	} else {
		if req.Email == "" || req.FullName == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "email, password, and full_name are required"})
			return
		}
		first, last = splitFullName(req.FullName)
		empID = uuid.New()
		_, err = tx.ExecContext(r.Context(), `
			INSERT INTO employees (id, company_id, first_name, last_name, email, phone, job_title, status, version, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,'',$6,'ACTIVE',1,NOW(),NOW())`,
			empID, companyID, first, last, req.Email, req.JobTitle)
		if err != nil {
			if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
				w.WriteHeader(http.StatusConflict)
				json.NewEncoder(w).Encode(map[string]string{"error": "Employee email already exists"})
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
	}

	sysRole := auth.RoleUser
	var userID int
	err = tx.QueryRowContext(r.Context(), `
		INSERT INTO app_users (tenant_id, email, password_hash, full_name, role, job_title, company_role_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		*claims.TenantID, req.Email, hash, req.FullName, sysRole, nullStr(req.JobTitle), roleUUID).Scan(&userID)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "Email already exists in this company"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	for _, p := range perms {
		if _, err := tx.ExecContext(r.Context(), `
			INSERT INTO user_permissions (user_id, permission) VALUES ($1,$2)`, userID, p); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}

	if _, err := tx.ExecContext(r.Context(), `
		UPDATE employees SET user_id=$1, job_title=COALESCE(NULLIF($2,''), job_title), updated_at=NOW()
		WHERE company_id=$3 AND id=$4`, userID, req.JobTitle, companyID, empID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	item, err := h.loadWorkspaceUser(r, companyID, empID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"success": true, "data": item})
}

func (h *Handler) UpdateWorkspaceUser(w http.ResponseWriter, r *http.Request, userID int) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil || claims.TenantID == nil {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	companyID, err := h.resolveCompanyID(r, *claims.TenantID)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	var empID uuid.UUID
	var targetTenant sql.NullInt64
	err = h.db.QueryRowContext(r.Context(), `
		SELECT e.id, u.tenant_id FROM app_users u
		INNER JOIN employees e ON e.user_id = u.id
		WHERE u.id=$1 AND e.company_id=$2`, userID, companyID).Scan(&empID, &targetTenant)
	if err != nil {
		// fallback: update by user id if employee link missing
		err = h.db.QueryRowContext(r.Context(), `SELECT tenant_id FROM app_users WHERE id=$1`, userID).Scan(&targetTenant)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "User not found"})
			return
		}
	}
	if !targetTenant.Valid || int(targetTenant.Int64) != *claims.TenantID {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	var req updateWorkspaceUserRequest
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
		if _, err := tx.ExecContext(r.Context(), `
			UPDATE app_users SET full_name=$1, updated_at=NOW() WHERE id=$2`, *req.FullName, userID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		first, last := splitFullName(*req.FullName)
		if empID != uuid.Nil {
			_, _ = tx.ExecContext(r.Context(), `
				UPDATE employees SET first_name=$1, last_name=$2, updated_at=NOW() WHERE id=$3`, first, last, empID)
		}
	}
	if req.JobTitle != nil {
		if _, err := tx.ExecContext(r.Context(), `
			UPDATE app_users SET job_title=$1, updated_at=NOW() WHERE id=$2`, *req.JobTitle, userID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if empID != uuid.Nil {
			_, _ = tx.ExecContext(r.Context(), `
				UPDATE employees SET job_title=$1, updated_at=NOW() WHERE id=$2`, *req.JobTitle, empID)
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
			UPDATE app_users SET password_hash=$1, session_version=session_version+1, updated_at=NOW() WHERE id=$2`,
			hash, userID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}
	if req.RoleID != nil {
		rolesSvc := rolesapp.NewService(postgres.New(h.db))
		if *req.RoleID == "" {
			_, _ = tx.ExecContext(r.Context(), `UPDATE app_users SET company_role_id=NULL, updated_at=NOW() WHERE id=$1`, userID)
		} else {
			rid, err := uuid.Parse(*req.RoleID)
			if err != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "Invalid role_id"})
				return
			}
			if _, err := rolesSvc.Get(r.Context(), companyID, rid); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "Role not found"})
				return
			}
			if _, err := tx.ExecContext(r.Context(), `
				UPDATE app_users SET company_role_id=$1, updated_at=NOW() WHERE id=$2`, rid, userID); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
		}
	}
	if req.IsActive != nil {
		if _, err := tx.ExecContext(r.Context(), `
			UPDATE app_users SET is_active=$1, session_version=session_version+1, updated_at=NOW() WHERE id=$2`,
			*req.IsActive, userID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if empID != uuid.Nil {
			st := "INACTIVE"
			if *req.IsActive {
				st = "ACTIVE"
			}
			_, _ = tx.ExecContext(r.Context(), `UPDATE employees SET status=$1, updated_at=NOW() WHERE id=$2`, st, empID)
		}
	}
	if req.EmployeeStatus != nil && empID != uuid.Nil {
		st := strings.ToUpper(strings.TrimSpace(*req.EmployeeStatus))
		if st == "ACTIVE" || st == "INACTIVE" || st == "ARCHIVED" {
			_, _ = tx.ExecContext(r.Context(), `UPDATE employees SET status=$1, updated_at=NOW() WHERE id=$2`, st, empID)
		}
	}
	if req.Permissions != nil {
		if _, err := tx.ExecContext(r.Context(), `DELETE FROM user_permissions WHERE user_id=$1`, userID); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		for _, p := range filterPerms(req.Permissions) {
			if _, err := tx.ExecContext(r.Context(), `
				INSERT INTO user_permissions (user_id, permission) VALUES ($1,$2)`, userID, p); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
		}
		_, _ = tx.ExecContext(r.Context(), `
			UPDATE app_users SET session_version=session_version+1, updated_at=NOW() WHERE id=$1`, userID)
	}

	if err := tx.Commit(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if empID == uuid.Nil {
		// return classic shape
		user, err := h.loadUserWithPermissions(r, userID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"success": true, "data": user})
		return
	}
	item, err := h.loadWorkspaceUser(r, companyID, empID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]any{"success": true, "data": item})
}

// helpers

func (h *Handler) resolveCompanyID(r *http.Request, tenantID int) (uuid.UUID, error) {
	db := postgres.New(h.db)
	return db.ResolveCompanyID(r.Context(), tenantID)
}

func (h *Handler) loadPermissionList(r *http.Request, userID int) ([]string, error) {
	rows, err := h.db.QueryContext(r.Context(), `SELECT permission FROM user_permissions WHERE user_id=$1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

func (h *Handler) loadWorkspaceUser(r *http.Request, companyID, empID uuid.UUID) (*WorkspaceUser, error) {
	var (
		first, last, email, jobTitle, empStatus string
		userID                                   sql.NullInt64
		isActive                                 sql.NullBool
		sysRole                                  string
		roleID                                   uuid.NullUUID
		roleName                                 string
	)
	err := h.db.QueryRowContext(r.Context(), `
		SELECT e.first_name, e.last_name, e.email, COALESCE(e.job_title,''), e.status,
			e.user_id, u.is_active, COALESCE(u.role,''), u.company_role_id, COALESCE(cr.name,'')
		FROM employees e
		LEFT JOIN app_users u ON u.id = e.user_id
		LEFT JOIN company_roles cr ON cr.id = u.company_role_id
		WHERE e.company_id=$1 AND e.id=$2`, companyID, empID).
		Scan(&first, &last, &email, &jobTitle, &empStatus, &userID, &isActive, &sysRole, &roleID, &roleName)
	if err != nil {
		return nil, err
	}
	item := &WorkspaceUser{
		EmployeeID:  empID.String(),
		FullName:    strings.TrimSpace(first + " " + last),
		Email:       email,
		JobTitle:    jobTitle,
		Status:      empStatus,
		SystemRole:  sysRole,
		RoleName:    roleName,
		Permissions: []string{},
	}
	if userID.Valid {
		id := int(userID.Int64)
		item.UserID = &id
		item.HasLogin = true
		active := isActive.Bool
		item.IsActive = &active
		perms, _ := h.loadPermissionList(r, id)
		item.Permissions = perms
	}
	if roleID.Valid {
		s := roleID.UUID.String()
		item.RoleID = &s
	}
	return item, nil
}

func splitFullName(full string) (string, string) {
	full = strings.TrimSpace(full)
	parts := strings.Fields(full)
	if len(parts) == 0 {
		return "User", "Account"
	}
	if len(parts) == 1 {
		return parts[0], parts[0]
	}
	return parts[0], strings.Join(parts[1:], " ")
}

func filterPerms(in []string) []string {
	allowed := map[string]struct{}{}
	for _, p := range auth.AllPermissions {
		allowed[p] = struct{}{}
	}
	out := make([]string, 0, len(in))
	seen := map[string]struct{}{}
	for _, p := range in {
		p = strings.TrimSpace(p)
		if _, ok := allowed[p]; !ok {
			continue
		}
		if _, d := seen[p]; d {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	return out
}

func nullStr(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

type stringReadCloser struct {
	*strings.Reader
}

func (stringReadCloser) Close() error { return nil }

func ioNopCloser(s string) stringReadCloser {
	return stringReadCloser{strings.NewReader(s)}
}
