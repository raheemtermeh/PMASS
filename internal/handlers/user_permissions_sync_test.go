package handlers

import (
	"reflect"
	"testing"
)

func TestDiffAgainstRole(t *testing.T) {
	role := []string{"product.view", "product.create", "task.create"}
	requested := []string{"product.view", "task.create", "task.assign"}

	grants, revokes := diffAgainstRole(role, requested)

	if want := []string{"task.assign"}; !reflect.DeepEqual(grants, want) {
		t.Fatalf("grants = %v, want %v", grants, want)
	}
	if want := []string{"product.create"}; !reflect.DeepEqual(revokes, want) {
		t.Fatalf("revokes = %v, want %v", revokes, want)
	}
}

func TestDiffAgainstRoleNoOverrides(t *testing.T) {
	role := []string{"product.view", "task.create"}
	grants, revokes := diffAgainstRole(role, []string{"task.create", "product.view"})

	if len(grants) != 0 || len(revokes) != 0 {
		t.Fatalf("expected no overrides, got grants=%v revokes=%v", grants, revokes)
	}
}

// A role edit must reach its members while their personal tweaks survive.
func TestEffectivePermissionsAfterRoleEdit(t *testing.T) {
	grants := map[string]struct{}{"task.assign": {}}
	revokes := map[string]struct{}{"product.create": {}}

	// Role loses task.create and gains product.archive.
	newRole := []string{"product.view", "product.create", "product.archive"}

	got := effectivePermissions(newRole, grants, revokes)
	want := []string{"product.archive", "product.view", "task.assign"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("effective = %v, want %v", got, want)
	}
}

func TestEffectivePermissionsWithoutOverrides(t *testing.T) {
	got := effectivePermissions(
		[]string{"task.create", "product.view"},
		map[string]struct{}{},
		map[string]struct{}{},
	)
	want := []string{"product.view", "task.create"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("effective = %v, want %v", got, want)
	}
}
