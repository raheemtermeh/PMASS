package handlers

import (
	"context"
	"database/sql"
	"sort"
)

// execer is satisfied by both *sql.DB and *sql.Tx so the helpers below work
// inside or outside a transaction.
type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

// effectivePermissions applies a user's personal deltas on top of their role.
// grants add permissions the role does not include; revokes remove ones it does.
func effectivePermissions(rolePerms []string, grants, revokes map[string]struct{}) []string {
	set := map[string]struct{}{}
	for _, p := range rolePerms {
		if _, revoked := revokes[p]; revoked {
			continue
		}
		set[p] = struct{}{}
	}
	for p := range grants {
		set[p] = struct{}{}
	}
	out := make([]string, 0, len(set))
	for p := range set {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}

// diffAgainstRole splits a requested permission set into additions and removals
// relative to the role defaults.
func diffAgainstRole(rolePerms, requested []string) (grants, revokes []string) {
	roleSet := map[string]struct{}{}
	for _, p := range rolePerms {
		roleSet[p] = struct{}{}
	}
	reqSet := map[string]struct{}{}
	for _, p := range requested {
		reqSet[p] = struct{}{}
	}
	for p := range reqSet {
		if _, inRole := roleSet[p]; !inRole {
			grants = append(grants, p)
		}
	}
	for p := range roleSet {
		if _, wanted := reqSet[p]; !wanted {
			revokes = append(revokes, p)
		}
	}
	sort.Strings(grants)
	sort.Strings(revokes)
	return grants, revokes
}

// writeUserPermissions stores the effective permission set plus the deltas that
// produced it, so a later role edit can be replayed without losing manual tweaks.
func writeUserPermissions(ctx context.Context, db execer, userID int, rolePerms, requested []string) error {
	requested = filterPerms(requested)
	grants, revokes := diffAgainstRole(filterPerms(rolePerms), requested)

	if _, err := db.ExecContext(ctx, `DELETE FROM user_permission_overrides WHERE user_id=$1`, userID); err != nil {
		return err
	}
	for _, p := range grants {
		if _, err := db.ExecContext(ctx, `
			INSERT INTO user_permission_overrides (user_id, permission, granted) VALUES ($1,$2,true)`,
			userID, p); err != nil {
			return err
		}
	}
	for _, p := range revokes {
		if _, err := db.ExecContext(ctx, `
			INSERT INTO user_permission_overrides (user_id, permission, granted) VALUES ($1,$2,false)`,
			userID, p); err != nil {
			return err
		}
	}
	return replaceEffectivePermissions(ctx, db, userID, requested)
}

// reapplyRoleToUser recomputes a user's effective permissions from the role
// defaults plus their stored overrides. Used when the role itself changes.
func reapplyRoleToUser(ctx context.Context, db execer, userID int, rolePerms []string) error {
	grants, revokes, err := loadOverrides(ctx, db, userID)
	if err != nil {
		return err
	}
	return replaceEffectivePermissions(ctx, db, userID, effectivePermissions(filterPerms(rolePerms), grants, revokes))
}

func loadOverrides(ctx context.Context, db execer, userID int) (grants, revokes map[string]struct{}, err error) {
	grants = map[string]struct{}{}
	revokes = map[string]struct{}{}
	rows, err := db.QueryContext(ctx, `
		SELECT permission, granted FROM user_permission_overrides WHERE user_id=$1`, userID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var perm string
		var granted bool
		if err := rows.Scan(&perm, &granted); err != nil {
			return nil, nil, err
		}
		if granted {
			grants[perm] = struct{}{}
		} else {
			revokes[perm] = struct{}{}
		}
	}
	return grants, revokes, rows.Err()
}

// rolePermissionsForUser reads the defaults of whichever company role the user
// currently holds. Returns nil when the user has no role assigned.
func (h *Handler) rolePermissionsForUser(ctx context.Context, db execer, userID int) ([]string, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT crp.permission
		FROM app_users u
		INNER JOIN company_role_permissions crp ON crp.role_id = u.company_role_id
		WHERE u.id=$1`, userID)
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
	return out, rows.Err()
}

func replaceEffectivePermissions(ctx context.Context, db execer, userID int, perms []string) error {
	if _, err := db.ExecContext(ctx, `DELETE FROM user_permissions WHERE user_id=$1`, userID); err != nil {
		return err
	}
	for _, p := range perms {
		if _, err := db.ExecContext(ctx, `
			INSERT INTO user_permissions (user_id, permission) VALUES ($1,$2)`, userID, p); err != nil {
			return err
		}
	}
	return nil
}
