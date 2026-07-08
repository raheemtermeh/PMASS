package auth

const (
	RolePlatformAdmin = "platform_admin"
	RoleTenantAdmin   = "tenant_admin"
	RoleUser          = "user"

	// Kept for backward-compat JWT checks during migration.
	RoleSuperAdmin = "super_admin"

	PermExecutive      = "executive"
	PermUIUX           = "uiux"
	PermEngineering    = "engineering"
	PermInfrastructure = "infrastructure"
	PermMarketing      = "marketing"
	PermGraphView      = "graph-view"
	PermFinance        = "finance"
	PermLegalHR        = "legalhr"
	PermSettings       = "settings"
	PermUsers          = "users"
)

var AllPermissions = []string{
	PermExecutive,
	PermUIUX,
	PermEngineering,
	PermInfrastructure,
	PermMarketing,
	PermGraphView,
	PermFinance,
	PermLegalHR,
	PermSettings,
	PermUsers,
}

func IsPlatformAdmin(role string) bool {
	return role == RolePlatformAdmin || role == RoleSuperAdmin
}

func IsTenantAdmin(role string) bool {
	return role == RoleTenantAdmin || IsPlatformAdmin(role)
}

func HasPermission(role string, permissions []string, required string) bool {
	if IsPlatformAdmin(role) || role == RoleTenantAdmin {
		return true
	}
	for _, perm := range permissions {
		if perm == required {
			return true
		}
	}
	return false
}
