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

// VSMPermissions are the primary workspace grants (excludes legacy ops pages).
var VSMPermissions = []string{
	PermProductView,
	PermProductCreate,
	PermProductUpdate,
	PermProductArchive,
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
	PermUsers,
	PermSettings,
}

// RolePresetPermissions maps seeded company-role names → default permission sets.
var RolePresetPermissions = map[string][]string{
	"Company Admin": append([]string{}, VSMPermissions...),
	"Product Manager": {
		PermProductView, PermProductCreate, PermProductUpdate,
		PermProjectCreate, PermProjectUpdate,
		PermFeatureCreate, PermFeatureUpdate,
	},
	"Team Lead": {
		PermProductView,
		PermProjectUpdate,
		PermFeatureCreate, PermFeatureUpdate,
		PermTaskCreate, PermTaskAssign, PermTaskComplete,
	},
	"Employee": {
		PermProductView,
		PermTaskCreate, PermTaskComplete,
	},
	"Viewer": {
		PermProductView,
	},
}

// SystemRoleNames are seeded once per company and cannot be deleted.
var SystemRoleNames = []string{
	"Company Admin",
	"Product Manager",
	"Team Lead",
	"Employee",
	"Viewer",
}

// Login portal identifiers — keep in sync with frontend login pages.
const (
	PortalPlatform     = "platform"
	PortalCompanyAdmin = "company_admin"
	PortalEmployee     = "employee"
)

func IsPlatformAdmin(role string) bool {
	return role == RolePlatformAdmin || role == RoleSuperAdmin
}

func IsTenantAdmin(role string) bool {
	return role == RoleTenantAdmin || IsPlatformAdmin(role)
}

// PortalAllowsRole reports whether a successfully authenticated account may enter
// the given login portal. Empty portal allows any role (backward compatible).
// Unknown portals are rejected.
func PortalAllowsRole(portal, role string, hasTenant bool) bool {
	switch portal {
	case "":
		return true
	case PortalPlatform:
		return !hasTenant && IsPlatformAdmin(role)
	case PortalCompanyAdmin:
		return hasTenant && role == RoleTenantAdmin
	case PortalEmployee:
		return hasTenant && role == RoleUser
	default:
		return false
	}
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
