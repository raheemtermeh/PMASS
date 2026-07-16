package models

import "time"

const (
	AccessRequestPending  = "pending"
	AccessRequestApproved = "approved"
	AccessRequestRejected = "rejected"
)

type CompanyAccessRequest struct {
	ID                 int        `json:"id"`
	CompanyName        string     `json:"company_name"`
	PreferredSlug      *string    `json:"preferred_slug,omitempty"`
	ContactName        string     `json:"contact_name"`
	ContactEmail       string     `json:"contact_email"`
	ContactPhone       *string    `json:"contact_phone,omitempty"`
	CompanySize        *string    `json:"company_size,omitempty"`
	Industry           *string    `json:"industry,omitempty"`
	Message            *string    `json:"message,omitempty"`
	Status             string     `json:"status"`
	AdminNotes         *string    `json:"admin_notes,omitempty"`
	ReviewedBy         *int       `json:"reviewed_by,omitempty"`
	ReviewedAt         *time.Time `json:"reviewed_at,omitempty"`
	ProvisionedTenantID *int      `json:"provisioned_tenant_id,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type SubmitAccessRequestPayload struct {
	CompanyName   string  `json:"company_name"`
	PreferredSlug *string `json:"preferred_slug,omitempty"`
	ContactName   string  `json:"contact_name"`
	ContactEmail  string  `json:"contact_email"`
	ContactPhone  *string `json:"contact_phone,omitempty"`
	CompanySize   *string `json:"company_size,omitempty"`
	Industry      *string `json:"industry,omitempty"`
	Message       *string `json:"message,omitempty"`
}

type UpdateAccessRequestPayload struct {
	Status     *string `json:"status,omitempty"`
	AdminNotes *string `json:"admin_notes,omitempty"`
}

type ProvisionFromRequestPayload struct {
	TenantSlug    string `json:"tenant_slug"`
	AdminPassword string `json:"admin_password"`
	AdminNotes    *string `json:"admin_notes,omitempty"`
}

type ProvisionFromRequestResponse struct {
	Request CompanyAccessRequest   `json:"request"`
	Tenant  Tenant                 `json:"tenant"`
	Admin   AppUserWithPermissions `json:"admin"`
}
