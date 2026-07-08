package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"PMAS/internal/models"
)

// HandleComplianceControls routes GET/POST on collection and PUT/DELETE by id.
func (h *Handler) HandleComplianceControls(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/legalhr/controls")
	path = strings.Trim(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			h.listComplianceControls(w, r)
		case http.MethodPost:
			h.createComplianceControl(w, r)
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
		h.updateComplianceControl(w, r, id)
	case http.MethodDelete:
		h.deleteComplianceControl(w, r, id)
	default:
		methodNotAllowed(w)
	}
}

func (h *Handler) listComplianceControls(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, code, title, framework, status, owner_name, notes, created_at
		FROM compliance_controls WHERE tenant_id = $1 ORDER BY id
	`, tenantID)
	if err != nil {
		log.Printf("Error querying compliance controls: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Database query failed")
		return
	}
	defer rows.Close()

	controls := make([]models.ComplianceControl, 0)
	for rows.Next() {
		var c models.ComplianceControl
		if err := rows.Scan(&c.ID, &c.Code, &c.Title, &c.Framework, &c.Status, &c.OwnerName, &c.Notes, &c.CreatedAt); err != nil {
			log.Printf("Error scanning compliance control: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Database scan failed")
			return
		}
		controls = append(controls, c)
	}

	_ = json.NewEncoder(w).Encode(controls)
}

func (h *Handler) createComplianceControl(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.ComplianceControlCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Code = strings.TrimSpace(req.Code)
	req.Title = strings.TrimSpace(req.Title)
	req.Status = defaultString(req.Status, "Pending")

	if req.Code == "" || req.Title == "" {
		writeJSONError(w, http.StatusBadRequest, "code and title are required")
		return
	}

	var c models.ComplianceControl
	err := h.db.QueryRowContext(r.Context(), `
		INSERT INTO compliance_controls (tenant_id, code, title, framework, status, owner_name, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, code, title, framework, status, owner_name, notes, created_at
	`, tenantID, req.Code, req.Title, req.Framework, req.Status, req.OwnerName, req.Notes).Scan(
		&c.ID, &c.Code, &c.Title, &c.Framework, &c.Status, &c.OwnerName, &c.Notes, &c.CreatedAt,
	)
	if err != nil {
		log.Printf("Error creating compliance control: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to create compliance control")
		return
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(c)
}

func (h *Handler) updateComplianceControl(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.ComplianceControlUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	var existing models.ComplianceControl
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, code, title, framework, status, owner_name, notes, created_at
		FROM compliance_controls WHERE id = $1 AND tenant_id = $2
	`, id, tenantID).Scan(
		&existing.ID, &existing.Code, &existing.Title, &existing.Framework,
		&existing.Status, &existing.OwnerName, &existing.Notes, &existing.CreatedAt,
	)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Compliance control not found")
		return
	}

	if req.Code != nil {
		existing.Code = strings.TrimSpace(*req.Code)
	}
	if req.Title != nil {
		existing.Title = strings.TrimSpace(*req.Title)
	}
	if req.Framework != nil {
		existing.Framework = req.Framework
	}
	if req.Status != nil {
		existing.Status = strings.TrimSpace(*req.Status)
	}
	if req.OwnerName != nil {
		existing.OwnerName = req.OwnerName
	}
	if req.Notes != nil {
		existing.Notes = req.Notes
	}

	if existing.Code == "" || existing.Title == "" {
		writeJSONError(w, http.StatusBadRequest, "code and title are required")
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		UPDATE compliance_controls
		SET code = $1, title = $2, framework = $3, status = $4, owner_name = $5, notes = $6
		WHERE id = $7 AND tenant_id = $8
	`, existing.Code, existing.Title, existing.Framework, existing.Status, existing.OwnerName, existing.Notes, id, tenantID)
	if err != nil {
		log.Printf("Error updating compliance control: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to update compliance control")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Compliance control not found")
		return
	}

	_ = json.NewEncoder(w).Encode(existing)
}

func (h *Handler) deleteComplianceControl(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		DELETE FROM compliance_controls WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	if err != nil {
		log.Printf("Error deleting compliance control: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete compliance control")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Compliance control not found")
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Compliance control deleted"})
}
