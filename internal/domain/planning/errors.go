package planning

import "PMAS/internal/domain/shared"

var (
	ErrCompanyRequired      = shared.New("COMPANY_REQUIRED", "Company is required", 400)
	ErrProductRequired      = shared.New("PRODUCT_REQUIRED", "Product is required", 400)
	ErrProjectRequired      = shared.New("PROJECT_REQUIRED", "Project is required", 400)
	ErrFeatureRequired      = shared.New("FEATURE_REQUIRED", "Feature is required", 400)
	ErrProjectNameRequired  = shared.New("PROJECT_NAME_REQUIRED", "Project name is required", 400)
	ErrProjectNotFound      = shared.New("PROJECT_NOT_FOUND", "Project not found", 404)
	ErrFeatureTitleRequired = shared.New("FEATURE_TITLE_REQUIRED", "Feature title is required", 400)
	ErrFeatureNotFound      = shared.New("FEATURE_NOT_FOUND", "Feature not found", 404)
	ErrTaskTitleRequired    = shared.New("TASK_TITLE_REQUIRED", "Task title is required", 400)
	ErrTaskNotFound         = shared.New("TASK_NOT_FOUND", "Task not found", 404)
	ErrTaskRequired         = shared.New("TASK_REQUIRED", "Task is required", 400)
	ErrInvalidStatus        = shared.New("INVALID_STATUS", "Invalid status", 400)
	ErrChecklistTitleRequired = shared.New("CHECKLIST_TITLE_REQUIRED", "Checklist item title is required", 400)
	ErrChecklistItemNotFound  = shared.New("CHECKLIST_ITEM_NOT_FOUND", "Checklist item not found", 404)
	ErrMemberEmployeeRequired = shared.New("MEMBER_EMPLOYEE_REQUIRED", "Employee is required for membership", 400)
	ErrFeatureDependencyInvalid = shared.New("FEATURE_DEPENDENCY_INVALID", "Feature cannot depend on itself", 400)
	ErrProjectDeleted       = shared.New("PROJECT_DELETED", "Project is deleted", 409)
	ErrFeatureDeleted       = shared.New("FEATURE_DELETED", "Feature is deleted", 409)
	ErrTaskDeleted          = shared.New("TASK_DELETED", "Task is deleted", 409)
	ErrProjectMemberNotFound = shared.New("PROJECT_MEMBER_NOT_FOUND", "Project member not found", 404)
	ErrFeatureMemberNotFound = shared.New("FEATURE_MEMBER_NOT_FOUND", "Feature member not found", 404)
)
