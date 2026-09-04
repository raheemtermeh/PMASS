package rolesapp

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/auth"
	"PMAS/internal/domain/shared"
	"PMAS/internal/infrastructure/postgres"
)

type Role struct {
	ID          uuid.UUID `json:"id"`
	CompanyID   uuid.UUID `json:"company_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	IsSystem    bool      `json:"is_system"`
	Permissions []string  `json:"permissions"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Service struct {
	db *postgres.DB
}

func NewService(db *postgres.DB) *Service { return &Service{db: db} }

func (s *Service) EnsureDefaults(ctx context.Context, companyID uuid.UUID) error {
	for _, name := range auth.SystemRoleNames {
		var id uuid.UUID
		err := s.db.Q(ctx).QueryRowContext(ctx, `
			SELECT id FROM company_roles WHERE company_id=$1 AND name=$2`, companyID, name).Scan(&id)
		if err == nil {
			if err := s.ensureRolePermissions(ctx, id, auth.RolePresetPermissions[name]); err != nil {
				return err
			}
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		id = uuid.New()
		if _, err := s.db.Q(ctx).ExecContext(ctx, `
			INSERT INTO company_roles (id, company_id, name, description, is_system, created_at, updated_at)
			VALUES ($1,$2,$3,$4,true,NOW(),NOW())`,
			id, companyID, name, "System role: "+name); err != nil {
			return err
		}
		for _, p := range auth.RolePresetPermissions[name] {
			if _, err := s.db.Q(ctx).ExecContext(ctx, `
				INSERT INTO company_role_permissions (role_id, permission) VALUES ($1,$2)
				ON CONFLICT DO NOTHING`, id, p); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Service) List(ctx context.Context, companyID uuid.UUID) ([]Role, error) {
	if err := s.EnsureDefaults(ctx, companyID); err != nil {
		return nil, err
	}
	rows, err := s.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, name, description, is_system, created_at, updated_at
		FROM company_roles WHERE company_id=$1 ORDER BY is_system DESC, name ASC`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Role, 0)
	for rows.Next() {
		var r Role
		if err := rows.Scan(&r.ID, &r.CompanyID, &r.Name, &r.Description, &r.IsSystem, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		perms, err := s.loadPerms(ctx, r.ID)
		if err != nil {
			return nil, err
		}
		r.Permissions = perms
		out = append(out, r)
	}
	return out, nil
}

func (s *Service) Get(ctx context.Context, companyID, id uuid.UUID) (*Role, error) {
	if err := s.EnsureDefaults(ctx, companyID); err != nil {
		return nil, err
	}
	var r Role
	err := s.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, name, description, is_system, created_at, updated_at
		FROM company_roles WHERE company_id=$1 AND id=$2`, companyID, id).
		Scan(&r.ID, &r.CompanyID, &r.Name, &r.Description, &r.IsSystem, &r.CreatedAt, &r.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, shared.New("ROLE_NOT_FOUND", "Role not found", 404)
	}
	if err != nil {
		return nil, err
	}
	perms, err := s.loadPerms(ctx, r.ID)
	if err != nil {
		return nil, err
	}
	r.Permissions = perms
	return &r, nil
}

type UpsertInput struct {
	Name        string
	Description string
	Permissions []string
}

func (s *Service) Create(ctx context.Context, companyID uuid.UUID, in UpsertInput) (*Role, error) {
	if err := s.EnsureDefaults(ctx, companyID); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, shared.New("ROLE_NAME_REQUIRED", "Role name is required", 400)
	}
	perms := filterValidPerms(in.Permissions)
	id := uuid.New()
	_, err := s.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO company_roles (id, company_id, name, description, is_system, created_at, updated_at)
		VALUES ($1,$2,$3,$4,false,NOW(),NOW())`, id, companyID, name, strings.TrimSpace(in.Description))
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return nil, shared.New("ROLE_EXISTS", "A role with this name already exists", 409)
		}
		return nil, err
	}
	if err := s.replacePerms(ctx, id, perms); err != nil {
		return nil, err
	}
	return s.Get(ctx, companyID, id)
}

func (s *Service) Update(ctx context.Context, companyID, id uuid.UUID, in UpsertInput) (*Role, error) {
	r, err := s.Get(ctx, companyID, id)
	if err != nil {
		return nil, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = r.Name
	}
	if r.IsSystem {
		// System roles: permissions + description editable; name locked.
		name = r.Name
	}
	_, err = s.db.Q(ctx).ExecContext(ctx, `
		UPDATE company_roles SET name=$1, description=$2, updated_at=NOW()
		WHERE company_id=$3 AND id=$4`, name, strings.TrimSpace(in.Description), companyID, id)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return nil, shared.New("ROLE_EXISTS", "A role with this name already exists", 409)
		}
		return nil, err
	}
	perms := filterValidPerms(in.Permissions)
	if err := s.replacePerms(ctx, id, perms); err != nil {
		return nil, err
	}
	// A role is only meaningful if editing it reaches the people who hold it.
	if err := s.reapplyToMembers(ctx, id, perms); err != nil {
		return nil, err
	}
	return s.Get(ctx, companyID, id)
}

// reapplyToMembers rebuilds the effective permissions of every user holding this
// role: role defaults, plus each user's own additions, minus their own removals.
// Middleware re-reads user_permissions on every request, so this takes effect
// immediately without forcing anyone to sign in again.
func (s *Service) reapplyToMembers(ctx context.Context, roleID uuid.UUID, rolePerms []string) error {
	rows, err := s.db.Q(ctx).QueryContext(ctx, `
		SELECT id FROM app_users WHERE company_role_id=$1`, roleID)
	if err != nil {
		return err
	}
	userIDs := make([]int, 0)
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		userIDs = append(userIDs, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, userID := range userIDs {
		effective, err := s.effectiveForUser(ctx, userID, rolePerms)
		if err != nil {
			return err
		}
		if _, err := s.db.Q(ctx).ExecContext(ctx,
			`DELETE FROM user_permissions WHERE user_id=$1`, userID); err != nil {
			return err
		}
		for _, p := range effective {
			if _, err := s.db.Q(ctx).ExecContext(ctx,
				`INSERT INTO user_permissions (user_id, permission) VALUES ($1,$2)`, userID, p); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Service) effectiveForUser(ctx context.Context, userID int, rolePerms []string) ([]string, error) {
	rows, err := s.db.Q(ctx).QueryContext(ctx, `
		SELECT permission, granted FROM user_permission_overrides WHERE user_id=$1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	granted := map[string]struct{}{}
	revoked := map[string]struct{}{}
	for rows.Next() {
		var perm string
		var isGrant bool
		if err := rows.Scan(&perm, &isGrant); err != nil {
			return nil, err
		}
		if isGrant {
			granted[perm] = struct{}{}
		} else {
			revoked[perm] = struct{}{}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	set := map[string]struct{}{}
	for _, p := range rolePerms {
		if _, gone := revoked[p]; !gone {
			set[p] = struct{}{}
		}
	}
	for p := range granted {
		set[p] = struct{}{}
	}
	out := make([]string, 0, len(set))
	for p := range set {
		out = append(out, p)
	}
	sort.Strings(out)
	return out, nil
}

func (s *Service) Delete(ctx context.Context, companyID, id uuid.UUID) error {
	r, err := s.Get(ctx, companyID, id)
	if err != nil {
		return err
	}
	if r.IsSystem {
		return shared.New("ROLE_SYSTEM_LOCKED", "System roles cannot be deleted", 403)
	}
	var n int64
	if err := s.db.Q(ctx).QueryRowContext(ctx, `
		SELECT COUNT(*) FROM app_users WHERE company_role_id=$1`, id).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return shared.New("ROLE_IN_USE", "Role is assigned to users and cannot be deleted", 409)
	}
	_, err = s.db.Q(ctx).ExecContext(ctx, `DELETE FROM company_roles WHERE company_id=$1 AND id=$2`, companyID, id)
	return err
}

func (s *Service) loadPerms(ctx context.Context, roleID uuid.UUID) ([]string, error) {
	rows, err := s.db.Q(ctx).QueryContext(ctx, `
		SELECT permission FROM company_role_permissions WHERE role_id=$1 ORDER BY permission`, roleID)
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

func (s *Service) replacePerms(ctx context.Context, roleID uuid.UUID, perms []string) error {
	if _, err := s.db.Q(ctx).ExecContext(ctx, `DELETE FROM company_role_permissions WHERE role_id=$1`, roleID); err != nil {
		return err
	}
	for _, p := range perms {
		if _, err := s.db.Q(ctx).ExecContext(ctx, `
			INSERT INTO company_role_permissions (role_id, permission) VALUES ($1,$2)`, roleID, p); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) ensureRolePermissions(ctx context.Context, roleID uuid.UUID, perms []string) error {
	for _, p := range perms {
		if _, err := s.db.Q(ctx).ExecContext(ctx, `
			INSERT INTO company_role_permissions (role_id, permission) VALUES ($1,$2)
			ON CONFLICT DO NOTHING`, roleID, p); err != nil {
			return err
		}
	}
	return nil
}

func filterValidPerms(in []string) []string {
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
		if _, dup := seen[p]; dup {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	return out
}
