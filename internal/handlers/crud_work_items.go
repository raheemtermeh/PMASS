package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"PMAS/internal/auth"
	"PMAS/internal/middleware"
	"PMAS/internal/models"
)

var sectionPermissions = map[string]string{
	"executive":      auth.PermExecutive,
	"uiux":           auth.PermUIUX,
	"engineering":    auth.PermEngineering,
	"infrastructure": auth.PermInfrastructure,
	"marketing":      auth.PermMarketing,
	"graph-view":     auth.PermGraphView,
	"finance":        auth.PermFinance,
	"legalhr":        auth.PermLegalHR,
	"settings":       auth.PermSettings,
}

var workItemKinds = map[string]bool{
	"task":   true,
	"todo":   true,
	"status": true,
}

var workItemStatuses = map[string]bool{
	"Backlog":     true,
	"Todo":        true,
	"In Progress": true,
	"Blocked":     true,
	"Done":        true,
	"Cancelled":   true,
}

var workItemPriorities = map[string]bool{
	"Critical": true,
	"High":     true,
	"Medium":   true,
	"Low":      true,
}

// HandleSectionWorkItems routes GET/POST on collection and PUT/DELETE by id.
// Section scoped work (tasks / todos / status updates) defined by the employer per department.
func (h *Handler) HandleSectionWorkItems(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/work-items")
	path = strings.Trim(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			h.listSectionWorkItems(w, r)
		case http.MethodPost:
			h.createSectionWorkItem(w, r)
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
		h.updateSectionWorkItem(w, r, id)
	case http.MethodDelete:
		h.deleteSectionWorkItem(w, r, id)
	default:
		methodNotAllowed(w)
	}
}

func (h *Handler) authorizeSection(w http.ResponseWriter, r *http.Request, section string) bool {
	section = strings.TrimSpace(strings.ToLower(section))
	required, ok := sectionPermissions[section]
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid section")
		return false
	}
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil || !auth.HasPermission(claims.Role, claims.Permissions, required) {
		writeJSONError(w, http.StatusForbidden, "Insufficient permissions")
		return false
	}
	return true
}

func normalizeWorkKind(kind string) string {
	kind = strings.ToLower(strings.TrimSpace(kind))
	if kind == "" {
		return "task"
	}
	return kind
}

func (h *Handler) listSectionWorkItems(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	section := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("section")))
	if section == "" {
		writeJSONError(w, http.StatusBadRequest, "section query parameter is required")
		return
	}
	if !h.authorizeSection(w, r, section) {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, section, kind, title, description, status, priority, assignee, due_date, created_at, updated_at
		FROM section_work_items
		WHERE tenant_id = $1 AND section = $2
		ORDER BY
			CASE status
				WHEN 'In Progress' THEN 0
				WHEN 'Blocked' THEN 1
				WHEN 'Todo' THEN 2
				WHEN 'Backlog' THEN 3
				WHEN 'Done' THEN 4
				ELSE 5
			END,
			CASE priority
				WHEN 'Critical' THEN 0
				WHEN 'High' THEN 1
				WHEN 'Medium' THEN 2
				ELSE 3
			END,
			id DESC
	`, tenantID, section)
	if err != nil {
		log.Printf("Error querying section work items: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Database query failed")
		return
	}
	defer rows.Close()

	items := make([]models.SectionWorkItem, 0)
	for rows.Next() {
		var item models.SectionWorkItem
		if err := rows.Scan(
			&item.ID, &item.Section, &item.Kind, &item.Title, &item.Description,
			&item.Status, &item.Priority, &item.Assignee, &item.DueDate,
			&item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			log.Printf("Error scanning section work item: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Database scan failed")
			return
		}
		items = append(items, item)
	}

	_ = json.NewEncoder(w).Encode(items)
}

func (h *Handler) createSectionWorkItem(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.SectionWorkItemCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Section = strings.TrimSpace(strings.ToLower(req.Section))
	req.Title = strings.TrimSpace(req.Title)
	req.Kind = normalizeWorkKind(req.Kind)
	req.Status = defaultString(req.Status, "Backlog")
	req.Priority = defaultString(req.Priority, "Medium")

	if !h.authorizeSection(w, r, req.Section) {
		return
	}
	if req.Title == "" {
		writeJSONError(w, http.StatusBadRequest, "title is required")
		return
	}
	if !workItemKinds[req.Kind] {
		writeJSONError(w, http.StatusBadRequest, "kind must be task, todo, or status")
		return
	}
	if !workItemStatuses[req.Status] {
		writeJSONError(w, http.StatusBadRequest, "invalid status")
		return
	}
	if !workItemPriorities[req.Priority] {
		writeJSONError(w, http.StatusBadRequest, "invalid priority")
		return
	}

	var due *string
	if req.DueDate != nil {
		trimmed := strings.TrimSpace(*req.DueDate)
		if trimmed != "" {
			due = &trimmed
		}
	}

	var item models.SectionWorkItem
	err := h.db.QueryRowContext(r.Context(), `
		INSERT INTO section_work_items (
			tenant_id, section, kind, title, description, status, priority, assignee, due_date
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, section, kind, title, description, status, priority, assignee, due_date, created_at, updated_at
	`, tenantID, req.Section, req.Kind, req.Title, req.Description, req.Status, req.Priority, req.Assignee, due).Scan(
		&item.ID, &item.Section, &item.Kind, &item.Title, &item.Description,
		&item.Status, &item.Priority, &item.Assignee, &item.DueDate,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		log.Printf("Error creating section work item: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to create work item")
		return
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(item)
}

func (h *Handler) updateSectionWorkItem(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var existing models.SectionWorkItem
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, section, kind, title, description, status, priority, assignee, due_date, created_at, updated_at
		FROM section_work_items WHERE id = $1 AND tenant_id = $2
	`, id, tenantID).Scan(
		&existing.ID, &existing.Section, &existing.Kind, &existing.Title, &existing.Description,
		&existing.Status, &existing.Priority, &existing.Assignee, &existing.DueDate,
		&existing.CreatedAt, &existing.UpdatedAt,
	)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Work item not found")
		return
	}
	if !h.authorizeSection(w, r, existing.Section) {
		return
	}

	var req models.SectionWorkItemUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if req.Kind != nil {
		kind := normalizeWorkKind(*req.Kind)
		if !workItemKinds[kind] {
			writeJSONError(w, http.StatusBadRequest, "kind must be task, todo, or status")
			return
		}
		existing.Kind = kind
	}
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if title == "" {
			writeJSONError(w, http.StatusBadRequest, "title is required")
			return
		}
		existing.Title = title
	}
	if req.Description != nil {
		existing.Description = req.Description
	}
	if req.Status != nil {
		status := strings.TrimSpace(*req.Status)
		if !workItemStatuses[status] {
			writeJSONError(w, http.StatusBadRequest, "invalid status")
			return
		}
		existing.Status = status
	}
	if req.Priority != nil {
		priority := strings.TrimSpace(*req.Priority)
		if !workItemPriorities[priority] {
			writeJSONError(w, http.StatusBadRequest, "invalid priority")
			return
		}
		existing.Priority = priority
	}
	if req.Assignee != nil {
		trimmed := strings.TrimSpace(*req.Assignee)
		if trimmed == "" {
			existing.Assignee = nil
		} else {
			existing.Assignee = &trimmed
		}
	}
	if req.DueDate != nil {
		trimmed := strings.TrimSpace(*req.DueDate)
		if trimmed == "" {
			existing.DueDate = nil
		} else {
			existing.DueDate = &trimmed
		}
	}

	existing.UpdatedAt = time.Now().UTC()
	result, err := h.db.ExecContext(r.Context(), `
		UPDATE section_work_items
		SET kind = $1, title = $2, description = $3, status = $4, priority = $5,
		    assignee = $6, due_date = $7, updated_at = $8
		WHERE id = $9 AND tenant_id = $10
	`, existing.Kind, existing.Title, existing.Description, existing.Status, existing.Priority,
		existing.Assignee, existing.DueDate, existing.UpdatedAt, id, tenantID)
	if err != nil {
		log.Printf("Error updating section work item: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to update work item")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Work item not found")
		return
	}

	_ = json.NewEncoder(w).Encode(existing)
}

func (h *Handler) deleteSectionWorkItem(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var section string
	err := h.db.QueryRowContext(r.Context(), `
		SELECT section FROM section_work_items WHERE id = $1 AND tenant_id = $2
	`, id, tenantID).Scan(&section)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Work item not found")
		return
	}
	if !h.authorizeSection(w, r, section) {
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		DELETE FROM section_work_items WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	if err != nil {
		log.Printf("Error deleting section work item: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete work item")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Work item not found")
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Work item deleted"})
}
