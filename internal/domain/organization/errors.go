package organization

import "PMAS/internal/domain/shared"

var (
	ErrCompanyNameRequired     = shared.New("COMPANY_NAME_REQUIRED", "Company name is required", 400)
	ErrCompanySlugRequired     = shared.New("COMPANY_SLUG_REQUIRED", "Company slug is required", 400)
	ErrCompanyDeleteForbidden  = shared.New("COMPANY_DELETE_FORBIDDEN", "Company cannot be deleted", 403)
	ErrCompanyNotFound         = shared.New("COMPANY_NOT_FOUND", "Company not found", 404)
	ErrCompanyRequired         = shared.New("COMPANY_REQUIRED", "Company is required", 400)
	ErrDepartmentNameRequired  = shared.New("DEPARTMENT_NAME_REQUIRED", "Department name is required", 400)
	ErrDepartmentRequired      = shared.New("DEPARTMENT_REQUIRED", "Department is required", 400)
	ErrDepartmentNotFound      = shared.New("DEPARTMENT_NOT_FOUND", "Department not found", 404)
	ErrManagerRequired         = shared.New("MANAGER_REQUIRED", "Department must have a manager", 400)
	ErrTeamNameRequired        = shared.New("TEAM_NAME_REQUIRED", "Team name is required", 400)
	ErrTeamLeadRequired        = shared.New("TEAM_LEAD_REQUIRED", "Team must have a lead", 400)
	ErrTeamNotFound            = shared.New("TEAM_NOT_FOUND", "Team not found", 404)
	ErrEmployeeNameRequired    = shared.New("EMPLOYEE_NAME_REQUIRED", "Employee first and last name are required", 400)
	ErrEmployeeEmailRequired   = shared.New("EMPLOYEE_EMAIL_REQUIRED", "Employee email is required", 400)
	ErrEmployeeNotFound        = shared.New("EMPLOYEE_NOT_FOUND", "Employee not found", 404)
)
