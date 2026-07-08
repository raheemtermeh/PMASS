package models

import (
	"encoding/json"
	"time"
)

type SubsystemCreateRequest struct {
	Name           string `json:"name"`
	Slug           string `json:"slug"`
	Status         string `json:"status"`
	LoadPercentage *int   `json:"load_percentage"`
}

type SubsystemUpdateRequest struct {
	Name           *string `json:"name"`
	Slug           *string `json:"slug"`
	Status         *string `json:"status"`
	LoadPercentage *int    `json:"load_percentage"`
}

type OperationalItemCreateRequest struct {
	TicketCode        string  `json:"ticket_code"`
	Title             string  `json:"title"`
	Description       *string `json:"description"`
	Type              string  `json:"type"`
	Severity          string  `json:"severity"`
	Status            string  `json:"status"`
	OriginSubsystemID *int    `json:"origin_subsystem_id"`
	AssignedTo        *string `json:"assigned_to"`
	LinkedPR          *string `json:"linked_pr"`
}

type OperationalItemUpdateRequest struct {
	TicketCode        *string `json:"ticket_code"`
	Title             *string `json:"title"`
	Description       *string `json:"description"`
	Type              *string `json:"type"`
	Severity          *string `json:"severity"`
	Status            *string `json:"status"`
	OriginSubsystemID *int    `json:"origin_subsystem_id"`
	AssignedTo        *string `json:"assigned_to"`
	LinkedPR          *string `json:"linked_pr"`
}

type MarketingCampaignCreateRequest struct {
	Name                 string   `json:"name"`
	Leads                *int     `json:"leads"`
	Conversion           *float64 `json:"conversion"`
	Spend                *float64 `json:"spend"`
	Status               string   `json:"status"`
	DependentSubsystemID *int     `json:"dependent_subsystem_id"`
}

type MarketingCampaignUpdateRequest struct {
	Name                 *string  `json:"name"`
	Leads                *int     `json:"leads"`
	Conversion           *float64 `json:"conversion"`
	Spend                *float64 `json:"spend"`
	Status               *string  `json:"status"`
	DependentSubsystemID *int     `json:"dependent_subsystem_id"`
}

type DesignTokenUpsertRequest struct {
	Category  string          `json:"category"`
	TokenData json.RawMessage `json:"token_data"`
}

type UIAssetCreateRequest struct {
	Name      string `json:"name"`
	Size      string `json:"size"`
	CDNStatus string `json:"cdn_status"`
	Date      string `json:"date"`
}

type UIAssetUpdateRequest struct {
	Name      *string `json:"name"`
	Size      *string `json:"size"`
	CDNStatus *string `json:"cdn_status"`
	Date      *string `json:"date"`
}

type GraphEdgeCreateRequest struct {
	SourceID int      `json:"source_id"`
	TargetID int      `json:"target_id"`
	EdgeType string   `json:"edge_type"`
	Weight   *float64 `json:"weight"`
}

type GraphEdgeUpdateRequest struct {
	SourceID *int     `json:"source_id"`
	TargetID *int     `json:"target_id"`
	EdgeType *string  `json:"edge_type"`
	Weight   *float64 `json:"weight"`
}

type SectionWorkItem struct {
	ID          int       `json:"id"`
	Section     string    `json:"section"`
	Kind        string    `json:"kind"`
	Title       string    `json:"title"`
	Description *string   `json:"description"`
	Status      string    `json:"status"`
	Priority    string    `json:"priority"`
	Assignee    *string   `json:"assignee"`
	DueDate     *string   `json:"due_date"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type SectionWorkItemCreateRequest struct {
	Section     string  `json:"section"`
	Kind        string  `json:"kind"`
	Title       string  `json:"title"`
	Description *string `json:"description"`
	Status      string  `json:"status"`
	Priority    string  `json:"priority"`
	Assignee    *string `json:"assignee"`
	DueDate     *string `json:"due_date"`
}

type SectionWorkItemUpdateRequest struct {
	Kind        *string `json:"kind"`
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Status      *string `json:"status"`
	Priority    *string `json:"priority"`
	Assignee    *string `json:"assignee"`
	DueDate     *string `json:"due_date"`
}

type TeamMemberCreateRequest struct {
	Name           string   `json:"name"`
	AvatarURL      *string  `json:"avatar_url"`
	Role           string   `json:"role"`
	SubsystemID    *int     `json:"subsystem_id"`
	CapacityWeight *float64 `json:"capacity_weight"`
}

type TeamMemberUpdateRequest struct {
	Name           *string  `json:"name"`
	AvatarURL      *string  `json:"avatar_url"`
	Role           *string  `json:"role"`
	SubsystemID    *int     `json:"subsystem_id"`
	CapacityWeight *float64 `json:"capacity_weight"`
}

type InfraNode struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	NodeType  string    `json:"node_type"`
	Status    string    `json:"status"`
	CPUPct    int       `json:"cpu_pct"`
	RAMPct    int       `json:"ram_pct"`
	Region    *string   `json:"region"`
	Notes     *string   `json:"notes"`
	CreatedAt time.Time `json:"created_at"`
}

type InfraNodeCreateRequest struct {
	Name     string  `json:"name"`
	NodeType string  `json:"node_type"`
	Status   string  `json:"status"`
	CPUPct   *int    `json:"cpu_pct"`
	RAMPct   *int    `json:"ram_pct"`
	Region   *string `json:"region"`
	Notes    *string `json:"notes"`
}

type InfraNodeUpdateRequest struct {
	Name     *string `json:"name"`
	NodeType *string `json:"node_type"`
	Status   *string `json:"status"`
	CPUPct   *int    `json:"cpu_pct"`
	RAMPct   *int    `json:"ram_pct"`
	Region   *string `json:"region"`
	Notes    *string `json:"notes"`
}

type FinanceEntry struct {
	ID        int       `json:"id"`
	Title     string    `json:"title"`
	Category  string    `json:"category"`
	Amount    float64   `json:"amount"`
	Period    *string   `json:"period"`
	Status    string    `json:"status"`
	Notes     *string   `json:"notes"`
	CreatedAt time.Time `json:"created_at"`
}

type FinanceEntryCreateRequest struct {
	Title    string   `json:"title"`
	Category string   `json:"category"`
	Amount   *float64 `json:"amount"`
	Period   *string  `json:"period"`
	Status   string   `json:"status"`
	Notes    *string  `json:"notes"`
}

type FinanceEntryUpdateRequest struct {
	Title    *string  `json:"title"`
	Category *string  `json:"category"`
	Amount   *float64 `json:"amount"`
	Period   *string  `json:"period"`
	Status   *string  `json:"status"`
	Notes    *string  `json:"notes"`
}

type ComplianceControl struct {
	ID        int       `json:"id"`
	Code      string    `json:"code"`
	Title     string    `json:"title"`
	Framework *string   `json:"framework"`
	Status    string    `json:"status"`
	OwnerName *string   `json:"owner_name"`
	Notes     *string   `json:"notes"`
	CreatedAt time.Time `json:"created_at"`
}

type ComplianceControlCreateRequest struct {
	Code      string  `json:"code"`
	Title     string  `json:"title"`
	Framework *string `json:"framework"`
	Status    string  `json:"status"`
	OwnerName *string `json:"owner_name"`
	Notes     *string `json:"notes"`
}

type ComplianceControlUpdateRequest struct {
	Code      *string `json:"code"`
	Title     *string `json:"title"`
	Framework *string `json:"framework"`
	Status    *string `json:"status"`
	OwnerName *string `json:"owner_name"`
	Notes     *string `json:"notes"`
}
