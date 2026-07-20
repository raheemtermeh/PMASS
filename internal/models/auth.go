package models

import "time"

type Tenant struct {
	ID        int       `json:"id"`
	Slug      string    `json:"slug"`
	Name      string    `json:"name"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type AppUser struct {
	ID             int       `json:"id"`
	TenantID       *int      `json:"tenant_id"`
	Email          string    `json:"email"`
	Username       *string   `json:"username"`
	FullName       string    `json:"full_name"`
	FirstName      string    `json:"first_name"`
	LastName       string    `json:"last_name"`
	JobTitle       *string   `json:"job_title"`
	Phone          *string   `json:"phone"`
	Bio            *string   `json:"bio"`
	Role           string    `json:"role"`
	IsActive       bool      `json:"is_active"`
	SessionVersion int       `json:"session_version"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type AppUserWithPermissions struct {
	AppUser
	Permissions []string `json:"permissions"`
	Tenant      *Tenant  `json:"tenant,omitempty"`
}

type AuthStatusResponse struct {
	NeedsBootstrap bool `json:"needs_bootstrap"`
}

type BootstrapRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
}

type LoginRequest struct {
	TenantSlug string `json:"tenant_slug"`
	Email      string `json:"email"`
	Username   string `json:"username"`
	Password   string `json:"password"`
}

type ForgotPasswordRequest struct {
	TenantSlug string `json:"tenant_slug"`
	Email      string `json:"email"`
}

type ResetPasswordRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type LoginResponse struct {
	Token        string                 `json:"token"`
	RefreshToken string                 `json:"refresh_token"`
	User         AppUserWithPermissions `json:"user"`
}

type CreateUserRequest struct {
	Email       string   `json:"email"`
	Username    string   `json:"username,omitempty"`
	Password    string   `json:"password"`
	FullName    string   `json:"full_name"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
}

type UpdateUserRequest struct {
	FullName    *string  `json:"full_name,omitempty"`
	Password    *string  `json:"password,omitempty"`
	Role        *string  `json:"role,omitempty"`
	IsActive    *bool    `json:"is_active,omitempty"`
	Permissions []string `json:"permissions,omitempty"`
}

type UpdateProfileRequest struct {
	FirstName       string  `json:"first_name"`
	LastName        string  `json:"last_name"`
	JobTitle        *string `json:"job_title"`
	Phone           *string `json:"phone"`
	Bio             *string `json:"bio"`
	Password        *string `json:"password,omitempty"`
	CurrentPassword *string `json:"current_password,omitempty"`
}

type ProvisionTenantRequest struct {
	TenantName    string `json:"tenant_name"`
	TenantSlug    string `json:"tenant_slug"`
	AdminEmail    string `json:"admin_email"`
	AdminPassword string `json:"admin_password"`
	AdminFullName string `json:"admin_full_name"`
}

type ProvisionTenantResponse struct {
	Tenant Tenant                 `json:"tenant"`
	Admin  AppUserWithPermissions `json:"admin"`
}
