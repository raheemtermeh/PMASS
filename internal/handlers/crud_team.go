package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"PMAS/internal/models"
)

// HandleTeamMembers routes GET/POST on collection and PUT/DELETE by id.
func (h *Handler) HandleTeamMembers(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/graph/members")
	path = strings.Trim(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			h.listTeamMembers(w, r)
		case http.MethodPost:
			h.createTeamMember(w, r)
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
		h.updateTeamMember(w, r, id)
	case http.MethodDelete:
		h.deleteTeamMember(w, r, id)
	default:
		methodNotAllowed(w)
	}
}

func (h *Handler) listTeamMembers(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, name, avatar_url, role, subsystem_id, capacity_weight
		FROM team_members WHERE tenant_id = $1 ORDER BY id
	`, tenantID)
	if err != nil {
		log.Printf("Error querying team members: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Database query failed")
		return
	}
	defer rows.Close()

	members := make([]models.TeamMember, 0)
	for rows.Next() {
		var m models.TeamMember
		if err := rows.Scan(&m.ID, &m.Name, &m.AvatarURL, &m.Role, &m.SubsystemID, &m.CapacityWeight); err != nil {
			log.Printf("Error scanning team member: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Database scan failed")
			return
		}
		members = append(members, m)
	}

	_ = json.NewEncoder(w).Encode(members)
}

func (h *Handler) createTeamMember(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.TeamMemberCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Role = strings.TrimSpace(req.Role)
	weight := derefFloat(req.CapacityWeight, 1.0)

	if req.Name == "" || req.Role == "" {
		writeJSONError(w, http.StatusBadRequest, "name and role are required")
		return
	}
	if req.SubsystemID != nil && !h.subsystemBelongsToTenant(r, tenantID, *req.SubsystemID) {
		writeJSONError(w, http.StatusBadRequest, "subsystem_id not found for tenant")
		return
	}

	var m models.TeamMember
	err := h.db.QueryRowContext(r.Context(), `
		INSERT INTO team_members (tenant_id, name, avatar_url, role, subsystem_id, capacity_weight)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, name, avatar_url, role, subsystem_id, capacity_weight
	`, tenantID, req.Name, req.AvatarURL, req.Role, req.SubsystemID, weight).Scan(
		&m.ID, &m.Name, &m.AvatarURL, &m.Role, &m.SubsystemID, &m.CapacityWeight,
	)
	if err != nil {
		log.Printf("Error creating team member: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to create team member")
		return
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(m)
}

func (h *Handler) updateTeamMember(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.TeamMemberUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	var existing models.TeamMember
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, name, avatar_url, role, subsystem_id, capacity_weight
		FROM team_members WHERE id = $1 AND tenant_id = $2
	`, id, tenantID).Scan(&existing.ID, &existing.Name, &existing.AvatarURL, &existing.Role, &existing.SubsystemID, &existing.CapacityWeight)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Team member not found")
		return
	}

	if req.Name != nil {
		existing.Name = strings.TrimSpace(*req.Name)
	}
	if req.AvatarURL != nil {
		existing.AvatarURL = req.AvatarURL
	}
	if req.Role != nil {
		existing.Role = strings.TrimSpace(*req.Role)
	}
	if req.SubsystemID != nil {
		if !h.subsystemBelongsToTenant(r, tenantID, *req.SubsystemID) {
			writeJSONError(w, http.StatusBadRequest, "subsystem_id not found for tenant")
			return
		}
		existing.SubsystemID = req.SubsystemID
	}
	if req.CapacityWeight != nil {
		existing.CapacityWeight = *req.CapacityWeight
	}

	if existing.Name == "" || existing.Role == "" {
		writeJSONError(w, http.StatusBadRequest, "name and role are required")
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		UPDATE team_members
		SET name = $1, avatar_url = $2, role = $3, subsystem_id = $4, capacity_weight = $5
		WHERE id = $6 AND tenant_id = $7
	`, existing.Name, existing.AvatarURL, existing.Role, existing.SubsystemID, existing.CapacityWeight, id, tenantID)
	if err != nil {
		log.Printf("Error updating team member: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to update team member")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Team member not found")
		return
	}

	_ = json.NewEncoder(w).Encode(existing)
}

func (h *Handler) deleteTeamMember(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		DELETE FROM team_members WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	if err != nil {
		log.Printf("Error deleting team member: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete team member")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Team member not found")
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Team member deleted"})
}
