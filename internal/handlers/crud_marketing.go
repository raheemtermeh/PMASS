package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"PMAS/internal/models"
)

// HandleMarketingCampaigns routes GET/POST on collection and PUT/DELETE by id.
func (h *Handler) HandleMarketingCampaigns(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/marketing/campaigns")
	path = strings.Trim(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			h.listMarketingCampaigns(w, r)
		case http.MethodPost:
			h.createMarketingCampaign(w, r)
		default:
			methodNotAllowed(w)
		}
		return
	}

	id, ok := parsePathID(path)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "Not found")
		return
	}

	switch r.Method {
	case http.MethodPut:
		h.updateMarketingCampaign(w, r, id)
	case http.MethodDelete:
		h.deleteMarketingCampaign(w, r, id)
	default:
		methodNotAllowed(w)
	}
}

func (h *Handler) listMarketingCampaigns(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT c.id, c.name, c.leads, c.conversion, c.spend, c.status, c.dependent_subsystem_id, COALESCE(s.status, 'healthy')
		FROM marketing_campaigns c
		LEFT JOIN subsystems s ON c.dependent_subsystem_id = s.id AND s.tenant_id = c.tenant_id
		WHERE c.tenant_id = $1
		ORDER BY c.id
	`, tenantID)
	if err != nil {
		log.Printf("Error querying campaigns: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Database query failed")
		return
	}
	defer rows.Close()

	campaigns := make([]models.MarketingCampaign, 0)
	for rows.Next() {
		var c models.MarketingCampaign
		if err := rows.Scan(&c.ID, &c.Name, &c.Leads, &c.Conversion, &c.Spend, &c.Status, &c.DependentSubsystemID, &c.DependentSubsysStatus); err != nil {
			log.Printf("Error scanning campaign: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Database scan failed")
			return
		}
		campaigns = append(campaigns, c)
	}

	_ = json.NewEncoder(w).Encode(campaigns)
}

func (h *Handler) createMarketingCampaign(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.MarketingCampaignCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Status = defaultString(req.Status, "Active")
	leads := derefInt(req.Leads, 0)
	conversion := derefFloat(req.Conversion, 0)
	spend := derefFloat(req.Spend, 0)

	if req.Name == "" {
		writeJSONError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.DependentSubsystemID != nil && !h.subsystemBelongsToTenant(r, tenantID, *req.DependentSubsystemID) {
		writeJSONError(w, http.StatusBadRequest, "dependent_subsystem_id not found for tenant")
		return
	}

	var c models.MarketingCampaign
	err := h.db.QueryRowContext(r.Context(), `
		INSERT INTO marketing_campaigns (tenant_id, name, leads, conversion, spend, status, dependent_subsystem_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, name, leads, conversion, spend, status, dependent_subsystem_id
	`, tenantID, req.Name, leads, conversion, spend, req.Status, req.DependentSubsystemID).Scan(
		&c.ID, &c.Name, &c.Leads, &c.Conversion, &c.Spend, &c.Status, &c.DependentSubsystemID,
	)
	if err != nil {
		log.Printf("Error creating campaign: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to create campaign")
		return
	}
	c.DependentSubsysStatus = "healthy"

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(c)
}

func (h *Handler) updateMarketingCampaign(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.MarketingCampaignUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	var existing models.MarketingCampaign
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, name, leads, conversion, spend, status, dependent_subsystem_id
		FROM marketing_campaigns WHERE id = $1 AND tenant_id = $2
	`, id, tenantID).Scan(&existing.ID, &existing.Name, &existing.Leads, &existing.Conversion, &existing.Spend, &existing.Status, &existing.DependentSubsystemID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Campaign not found")
		return
	}

	if req.Name != nil {
		existing.Name = strings.TrimSpace(*req.Name)
	}
	if req.Leads != nil {
		existing.Leads = *req.Leads
	}
	if req.Conversion != nil {
		existing.Conversion = *req.Conversion
	}
	if req.Spend != nil {
		existing.Spend = *req.Spend
	}
	if req.Status != nil {
		existing.Status = strings.TrimSpace(*req.Status)
	}
	if req.DependentSubsystemID != nil {
		if !h.subsystemBelongsToTenant(r, tenantID, *req.DependentSubsystemID) {
			writeJSONError(w, http.StatusBadRequest, "dependent_subsystem_id not found for tenant")
			return
		}
		existing.DependentSubsystemID = req.DependentSubsystemID
	}

	if existing.Name == "" {
		writeJSONError(w, http.StatusBadRequest, "name is required")
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		UPDATE marketing_campaigns
		SET name = $1, leads = $2, conversion = $3, spend = $4, status = $5, dependent_subsystem_id = $6
		WHERE id = $7 AND tenant_id = $8
	`, existing.Name, existing.Leads, existing.Conversion, existing.Spend, existing.Status, existing.DependentSubsystemID, id, tenantID)
	if err != nil {
		log.Printf("Error updating campaign: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to update campaign")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Campaign not found")
		return
	}

	_ = json.NewEncoder(w).Encode(existing)
}

func (h *Handler) deleteMarketingCampaign(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		DELETE FROM marketing_campaigns WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	if err != nil {
		log.Printf("Error deleting campaign: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete campaign")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Campaign not found")
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Campaign deleted"})
}
