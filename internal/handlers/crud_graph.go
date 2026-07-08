package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"PMAS/internal/models"
)

// HandleGraphEdges routes GET/POST on collection and PUT/DELETE by id.
func (h *Handler) HandleGraphEdges(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/graph/edges")
	path = strings.Trim(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			h.listGraphEdges(w, r)
		case http.MethodPost:
			h.createGraphEdge(w, r)
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
		h.updateGraphEdge(w, r, id)
	case http.MethodDelete:
		h.deleteGraphEdge(w, r, id)
	default:
		methodNotAllowed(w)
	}
}

func (h *Handler) listGraphEdges(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, source_id, target_id, edge_type, weight
		FROM graph_edges WHERE tenant_id = $1 ORDER BY id
	`, tenantID)
	if err != nil {
		log.Printf("Error querying graph edges: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Database query failed")
		return
	}
	defer rows.Close()

	edges := make([]models.GraphEdge, 0)
	for rows.Next() {
		var e models.GraphEdge
		if err := rows.Scan(&e.ID, &e.SourceID, &e.TargetID, &e.EdgeType, &e.Weight); err != nil {
			log.Printf("Error scanning graph edge: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Database scan failed")
			return
		}
		edges = append(edges, e)
	}

	_ = json.NewEncoder(w).Encode(edges)
}

func (h *Handler) createGraphEdge(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.GraphEdgeCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.EdgeType = strings.TrimSpace(req.EdgeType)
	weight := derefFloat(req.Weight, 1.0)

	if req.SourceID <= 0 || req.TargetID <= 0 || req.EdgeType == "" {
		writeJSONError(w, http.StatusBadRequest, "source_id, target_id, and edge_type are required")
		return
	}
	if !h.subsystemBelongsToTenant(r, tenantID, req.SourceID) || !h.subsystemBelongsToTenant(r, tenantID, req.TargetID) {
		writeJSONError(w, http.StatusBadRequest, "source_id and target_id must belong to tenant")
		return
	}

	var e models.GraphEdge
	err := h.db.QueryRowContext(r.Context(), `
		INSERT INTO graph_edges (tenant_id, source_id, target_id, edge_type, weight)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, source_id, target_id, edge_type, weight
	`, tenantID, req.SourceID, req.TargetID, req.EdgeType, weight).Scan(
		&e.ID, &e.SourceID, &e.TargetID, &e.EdgeType, &e.Weight,
	)
	if err != nil {
		log.Printf("Error creating graph edge: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to create graph edge")
		return
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(e)
}

func (h *Handler) updateGraphEdge(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.GraphEdgeUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	var existing models.GraphEdge
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, source_id, target_id, edge_type, weight
		FROM graph_edges WHERE id = $1 AND tenant_id = $2
	`, id, tenantID).Scan(&existing.ID, &existing.SourceID, &existing.TargetID, &existing.EdgeType, &existing.Weight)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Graph edge not found")
		return
	}

	if req.SourceID != nil {
		existing.SourceID = *req.SourceID
	}
	if req.TargetID != nil {
		existing.TargetID = *req.TargetID
	}
	if req.EdgeType != nil {
		existing.EdgeType = strings.TrimSpace(*req.EdgeType)
	}
	if req.Weight != nil {
		existing.Weight = *req.Weight
	}

	if existing.SourceID <= 0 || existing.TargetID <= 0 || existing.EdgeType == "" {
		writeJSONError(w, http.StatusBadRequest, "source_id, target_id, and edge_type are required")
		return
	}
	if !h.subsystemBelongsToTenant(r, tenantID, existing.SourceID) || !h.subsystemBelongsToTenant(r, tenantID, existing.TargetID) {
		writeJSONError(w, http.StatusBadRequest, "source_id and target_id must belong to tenant")
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		UPDATE graph_edges
		SET source_id = $1, target_id = $2, edge_type = $3, weight = $4
		WHERE id = $5 AND tenant_id = $6
	`, existing.SourceID, existing.TargetID, existing.EdgeType, existing.Weight, id, tenantID)
	if err != nil {
		log.Printf("Error updating graph edge: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to update graph edge")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Graph edge not found")
		return
	}

	_ = json.NewEncoder(w).Encode(existing)
}

func (h *Handler) deleteGraphEdge(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		DELETE FROM graph_edges WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	if err != nil {
		log.Printf("Error deleting graph edge: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete graph edge")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Graph edge not found")
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Graph edge deleted"})
}
