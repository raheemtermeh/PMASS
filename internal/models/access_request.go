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
	Website            *string    `json:"website,omitempty"`
	Country            *string    `json:"country,omitempty"`
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
	Website       *string `json:"website,omitempty"`
	Country       *string `json:"country,omitempty"`
	Message       *string `json:"message,omitempty"`
}

// CompanySizeBuckets are the only accepted company_size values, so reporting can
// group requests without normalising free text later.
var CompanySizeBuckets = []string{"1-10", "11-50", "51-200", "201-500", "500+"}

func IsValidCompanySize(v string) bool {
	for _, b := range CompanySizeBuckets {
		if v == b {
			return true
		}
	}
	return false
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
