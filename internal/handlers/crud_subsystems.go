package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"PMAS/internal/models"
)

// HandleEngineeringSubsystems routes GET/POST on collection and PUT/DELETE by id.
func (h *Handler) HandleEngineeringSubsystems(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/engineering/subsystems")
	path = strings.Trim(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			h.listSubsystems(w, r)
		case http.MethodPost:
			h.createSubsystem(w, r)
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
		h.updateSubsystem(w, r, id)
	case http.MethodDelete:
		h.deleteSubsystem(w, r, id)
	default:
		methodNotAllowed(w)
	}
}

func (h *Handler) listSubsystems(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, name, slug, status, load_percentage
		FROM subsystems WHERE tenant_id = $1 ORDER BY id
	`, tenantID)
	if err != nil {
		log.Printf("Error querying subsystems: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Database query failed")
		return
	}
	defer rows.Close()

	subsystems := make([]models.Subsystem, 0)
	for rows.Next() {
		var sub models.Subsystem
		if err := rows.Scan(&sub.ID, &sub.Name, &sub.Slug, &sub.Status, &sub.LoadPercentage); err != nil {
			log.Printf("Error scanning subsystem: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Database scan failed")
			return
		}
		subsystems = append(subsystems, sub)
	}

	_ = json.NewEncoder(w).Encode(subsystems)
}

func (h *Handler) createSubsystem(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.SubsystemCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Slug = strings.TrimSpace(strings.ToLower(req.Slug))
	req.Status = defaultString(req.Status, "healthy")
	load := derefInt(req.LoadPercentage, 0)

	if req.Name == "" || req.Slug == "" {
		writeJSONError(w, http.StatusBadRequest, "name and slug are required")
		return
	}
	if load < 0 || load > 100 {
		writeJSONError(w, http.StatusBadRequest, "load_percentage must be between 0 and 100")
		return
	}

	var sub models.Subsystem
	err := h.db.QueryRowContext(r.Context(), `
		INSERT INTO subsystems (tenant_id, name, slug, status, load_percentage)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, name, slug, status, load_percentage
	`, tenantID, req.Name, req.Slug, req.Status, load).Scan(
		&sub.ID, &sub.Name, &sub.Slug, &sub.Status, &sub.LoadPercentage,
	)
	if err != nil {
		log.Printf("Error creating subsystem: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to create subsystem")
		return
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(sub)
}

func (h *Handler) updateSubsystem(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.SubsystemUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	var existing models.Subsystem
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, name, slug, status, load_percentage
		FROM subsystems WHERE id = $1 AND tenant_id = $2
	`, id, tenantID).Scan(&existing.ID, &existing.Name, &existing.Slug, &existing.Status, &existing.LoadPercentage)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Subsystem not found")
		return
	}

	if req.Name != nil {
		existing.Name = strings.TrimSpace(*req.Name)
	}
	if req.Slug != nil {
		existing.Slug = strings.TrimSpace(strings.ToLower(*req.Slug))
	}
	if req.Status != nil {
		existing.Status = strings.TrimSpace(*req.Status)
	}
	if req.LoadPercentage != nil {
		existing.LoadPercentage = *req.LoadPercentage
	}

	if existing.Name == "" || existing.Slug == "" {
		writeJSONError(w, http.StatusBadRequest, "name and slug are required")
		return
	}
	if existing.LoadPercentage < 0 || existing.LoadPercentage > 100 {
		writeJSONError(w, http.StatusBadRequest, "load_percentage must be between 0 and 100")
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		UPDATE subsystems
		SET name = $1, slug = $2, status = $3, load_percentage = $4
		WHERE id = $5 AND tenant_id = $6
	`, existing.Name, existing.Slug, existing.Status, existing.LoadPercentage, id, tenantID)
	if err != nil {
		log.Printf("Error updating subsystem: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to update subsystem")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Subsystem not found")
		return
	}

	_ = json.NewEncoder(w).Encode(existing)
}

func (h *Handler) deleteSubsystem(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		DELETE FROM subsystems WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	if err != nil {
		log.Printf("Error deleting subsystem: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete subsystem")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Subsystem not found")
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Subsystem deleted"})
}
