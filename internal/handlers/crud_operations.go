package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"PMAS/internal/models"
)

// HandleOperationsItems routes GET/POST on collection and PUT/DELETE by id.
func (h *Handler) HandleOperationsItems(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/operations/items")
	path = strings.Trim(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			h.listOperationsItems(w, r)
		case http.MethodPost:
			h.createOperationsItem(w, r)
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
		h.updateOperationsItem(w, r, id)
	case http.MethodDelete:
		h.deleteOperationsItem(w, r, id)
	default:
		methodNotAllowed(w)
	}
}

func (h *Handler) listOperationsItems(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, ticket_code, title, description, type, severity, status,
		       origin_subsystem_id, assigned_to, linked_pr, created_at, completed_at
		FROM operational_items
		WHERE tenant_id = $1
		ORDER BY id
	`, tenantID)
	if err != nil {
		log.Printf("Error querying operational items: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Database query failed")
		return
	}
	defer rows.Close()

	items := make([]models.OperationalItem, 0)
	for rows.Next() {
		var item models.OperationalItem
		if err := rows.Scan(
			&item.ID, &item.TicketCode, &item.Title, &item.Description, &item.Type, &item.Severity,
			&item.Status, &item.OriginSubsystemID, &item.AssignedTo, &item.LinkedPR, &item.CreatedAt, &item.CompletedAt,
		); err != nil {
			log.Printf("Error scanning operational item: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Database scan failed")
			return
		}
		items = append(items, item)
	}

	_ = json.NewEncoder(w).Encode(items)
}

func (h *Handler) createOperationsItem(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.OperationalItemCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.TicketCode = strings.TrimSpace(req.TicketCode)
	req.Title = strings.TrimSpace(req.Title)
	req.Type = strings.TrimSpace(req.Type)
	req.Severity = defaultString(req.Severity, "Medium")
	req.Status = defaultString(req.Status, "Backlog")

	if req.TicketCode == "" || req.Title == "" || req.Type == "" {
		writeJSONError(w, http.StatusBadRequest, "ticket_code, title, and type are required")
		return
	}

	if req.OriginSubsystemID != nil {
		if !h.subsystemBelongsToTenant(r, tenantID, *req.OriginSubsystemID) {
			writeJSONError(w, http.StatusBadRequest, "origin_subsystem_id not found for tenant")
			return
		}
	}

	var item models.OperationalItem
	err := h.db.QueryRowContext(r.Context(), `
		INSERT INTO operational_items (
			tenant_id, ticket_code, title, description, type, severity, status,
			origin_subsystem_id, assigned_to, linked_pr
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, ticket_code, title, description, type, severity, status,
		          origin_subsystem_id, assigned_to, linked_pr, created_at, completed_at
	`, tenantID, req.TicketCode, req.Title, req.Description, req.Type, req.Severity, req.Status,
		req.OriginSubsystemID, req.AssignedTo, req.LinkedPR,
	).Scan(
		&item.ID, &item.TicketCode, &item.Title, &item.Description, &item.Type, &item.Severity,
		&item.Status, &item.OriginSubsystemID, &item.AssignedTo, &item.LinkedPR, &item.CreatedAt, &item.CompletedAt,
	)
	if err != nil {
		log.Printf("Error creating operational item: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to create operational item")
		return
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(item)
}

func (h *Handler) updateOperationsItem(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.OperationalItemUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	var existing models.OperationalItem
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, ticket_code, title, description, type, severity, status,
		       origin_subsystem_id, assigned_to, linked_pr, created_at, completed_at
		FROM operational_items WHERE id = $1 AND tenant_id = $2
	`, id, tenantID).Scan(
		&existing.ID, &existing.TicketCode, &existing.Title, &existing.Description, &existing.Type, &existing.Severity,
		&existing.Status, &existing.OriginSubsystemID, &existing.AssignedTo, &existing.LinkedPR, &existing.CreatedAt, &existing.CompletedAt,
	)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Operational item not found")
		return
	}

	if req.TicketCode != nil {
		existing.TicketCode = strings.TrimSpace(*req.TicketCode)
	}
	if req.Title != nil {
		existing.Title = strings.TrimSpace(*req.Title)
	}
	if req.Description != nil {
		existing.Description = req.Description
	}
	if req.Type != nil {
		existing.Type = strings.TrimSpace(*req.Type)
	}
	if req.Severity != nil {
		existing.Severity = strings.TrimSpace(*req.Severity)
	}
	if req.Status != nil {
		existing.Status = strings.TrimSpace(*req.Status)
	}
	if req.OriginSubsystemID != nil {
		if !h.subsystemBelongsToTenant(r, tenantID, *req.OriginSubsystemID) {
			writeJSONError(w, http.StatusBadRequest, "origin_subsystem_id not found for tenant")
			return
		}
		existing.OriginSubsystemID = req.OriginSubsystemID
	}
	if req.AssignedTo != nil {
		existing.AssignedTo = req.AssignedTo
	}
	if req.LinkedPR != nil {
		existing.LinkedPR = req.LinkedPR
	}

	if existing.TicketCode == "" || existing.Title == "" || existing.Type == "" {
		writeJSONError(w, http.StatusBadRequest, "ticket_code, title, and type are required")
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		UPDATE operational_items
		SET ticket_code = $1, title = $2, description = $3, type = $4, severity = $5,
		    status = $6, origin_subsystem_id = $7, assigned_to = $8, linked_pr = $9
		WHERE id = $10 AND tenant_id = $11
	`, existing.TicketCode, existing.Title, existing.Description, existing.Type, existing.Severity,
		existing.Status, existing.OriginSubsystemID, existing.AssignedTo, existing.LinkedPR, id, tenantID)
	if err != nil {
		log.Printf("Error updating operational item: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to update operational item")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Operational item not found")
		return
	}

	_ = json.NewEncoder(w).Encode(existing)
}

func (h *Handler) deleteOperationsItem(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		DELETE FROM operational_items WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	if err != nil {
		log.Printf("Error deleting operational item: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete operational item")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Operational item not found")
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Operational item deleted"})
}

func (h *Handler) subsystemBelongsToTenant(r *http.Request, tenantID, subsystemID int) bool {
	var count int
	err := h.db.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM subsystems WHERE id = $1 AND tenant_id = $2
	`, subsystemID, tenantID).Scan(&count)
	return err == nil && count > 0
}
