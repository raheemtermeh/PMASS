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

	// Product-domain permissions (Backend Analysis Document §7.6).
	PermProductCreate  = "product.create"
	PermProductUpdate  = "product.update"
	PermProductArchive = "product.archive"
	PermProductView    = "product.view"
	PermProjectCreate  = "project.create"
	PermProjectUpdate  = "project.update"
	PermFeatureCreate  = "feature.create"
	PermFeatureUpdate  = "feature.update"
	PermTaskCreate     = "task.create"
	PermTaskAssign     = "task.assign"
	PermTaskComplete   = "task.complete"
	PermDepartmentManage = "department.manage"
	PermTeamManage       = "team.manage"
	PermEmployeeManage   = "employee.manage"
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
	PermProductCreate,
	PermProductUpdate,
	PermProductArchive,
	PermProductView,
	PermProjectCreate,
	PermProjectUpdate,
	PermFeatureCreate,
	PermFeatureUpdate,
	PermTaskCreate,
	PermTaskAssign,
	PermTaskComplete,
	PermDepartmentManage,
	PermTeamManage,
	PermEmployeeManage,
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
