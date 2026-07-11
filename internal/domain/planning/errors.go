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
	ErrInvalidStatus        = shared.New("INVALID_STATUS", "Invalid status", 400)
)
