package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"PMAS/internal/models"
)

// HandleInfraNodes routes GET/POST on collection and PUT/DELETE by id.
func (h *Handler) HandleInfraNodes(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/infrastructure/nodes")
	path = strings.Trim(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			h.listInfraNodes(w, r)
		case http.MethodPost:
			h.createInfraNode(w, r)
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
		h.updateInfraNode(w, r, id)
	case http.MethodDelete:
		h.deleteInfraNode(w, r, id)
	default:
		methodNotAllowed(w)
	}
}

func (h *Handler) listInfraNodes(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, name, node_type, status, cpu_pct, ram_pct, region, notes, created_at
		FROM infra_nodes WHERE tenant_id = $1 ORDER BY id
	`, tenantID)
	if err != nil {
		log.Printf("Error querying infra nodes: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Database query failed")
		return
	}
	defer rows.Close()

	nodes := make([]models.InfraNode, 0)
	for rows.Next() {
		var n models.InfraNode
		if err := rows.Scan(&n.ID, &n.Name, &n.NodeType, &n.Status, &n.CPUPct, &n.RAMPct, &n.Region, &n.Notes, &n.CreatedAt); err != nil {
			log.Printf("Error scanning infra node: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Database scan failed")
			return
		}
		nodes = append(nodes, n)
	}

	_ = json.NewEncoder(w).Encode(nodes)
}

func (h *Handler) createInfraNode(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.InfraNodeCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.NodeType = strings.TrimSpace(req.NodeType)
	req.Status = defaultString(req.Status, "healthy")
	cpu := derefInt(req.CPUPct, 0)
	ram := derefInt(req.RAMPct, 0)

	if req.Name == "" || req.NodeType == "" {
		writeJSONError(w, http.StatusBadRequest, "name and node_type are required")
		return
	}

	var n models.InfraNode
	err := h.db.QueryRowContext(r.Context(), `
		INSERT INTO infra_nodes (tenant_id, name, node_type, status, cpu_pct, ram_pct, region, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, name, node_type, status, cpu_pct, ram_pct, region, notes, created_at
	`, tenantID, req.Name, req.NodeType, req.Status, cpu, ram, req.Region, req.Notes).Scan(
		&n.ID, &n.Name, &n.NodeType, &n.Status, &n.CPUPct, &n.RAMPct, &n.Region, &n.Notes, &n.CreatedAt,
	)
	if err != nil {
		log.Printf("Error creating infra node: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to create infra node")
		return
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(n)
}

func (h *Handler) updateInfraNode(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.InfraNodeUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	var existing models.InfraNode
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, name, node_type, status, cpu_pct, ram_pct, region, notes, created_at
		FROM infra_nodes WHERE id = $1 AND tenant_id = $2
	`, id, tenantID).Scan(
		&existing.ID, &existing.Name, &existing.NodeType, &existing.Status, &existing.CPUPct,
		&existing.RAMPct, &existing.Region, &existing.Notes, &existing.CreatedAt,
	)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Infra node not found")
		return
	}

	if req.Name != nil {
		existing.Name = strings.TrimSpace(*req.Name)
	}
	if req.NodeType != nil {
		existing.NodeType = strings.TrimSpace(*req.NodeType)
	}
	if req.Status != nil {
		existing.Status = strings.TrimSpace(*req.Status)
	}
	if req.CPUPct != nil {
		existing.CPUPct = *req.CPUPct
	}
	if req.RAMPct != nil {
		existing.RAMPct = *req.RAMPct
	}
	if req.Region != nil {
		existing.Region = req.Region
	}
	if req.Notes != nil {
		existing.Notes = req.Notes
	}

	if existing.Name == "" || existing.NodeType == "" {
		writeJSONError(w, http.StatusBadRequest, "name and node_type are required")
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		UPDATE infra_nodes
		SET name = $1, node_type = $2, status = $3, cpu_pct = $4, ram_pct = $5, region = $6, notes = $7
		WHERE id = $8 AND tenant_id = $9
	`, existing.Name, existing.NodeType, existing.Status, existing.CPUPct, existing.RAMPct, existing.Region, existing.Notes, id, tenantID)
	if err != nil {
		log.Printf("Error updating infra node: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to update infra node")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Infra node not found")
		return
	}

	_ = json.NewEncoder(w).Encode(existing)
}

func (h *Handler) deleteInfraNode(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		DELETE FROM infra_nodes WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	if err != nil {
		log.Printf("Error deleting infra node: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete infra node")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Infra node not found")
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Infra node deleted"})
}
