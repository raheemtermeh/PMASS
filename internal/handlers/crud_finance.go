package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"PMAS/internal/models"
)

// HandleFinanceEntries routes GET/POST on collection and PUT/DELETE by id.
func (h *Handler) HandleFinanceEntries(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/finance/entries")
	path = strings.Trim(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			h.listFinanceEntries(w, r)
		case http.MethodPost:
			h.createFinanceEntry(w, r)
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
		h.updateFinanceEntry(w, r, id)
	case http.MethodDelete:
		h.deleteFinanceEntry(w, r, id)
	default:
		methodNotAllowed(w)
	}
}

func (h *Handler) listFinanceEntries(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, title, category, amount, period, status, notes, created_at
		FROM finance_entries WHERE tenant_id = $1 ORDER BY id
	`, tenantID)
	if err != nil {
		log.Printf("Error querying finance entries: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Database query failed")
		return
	}
	defer rows.Close()

	entries := make([]models.FinanceEntry, 0)
	for rows.Next() {
		var e models.FinanceEntry
		if err := rows.Scan(&e.ID, &e.Title, &e.Category, &e.Amount, &e.Period, &e.Status, &e.Notes, &e.CreatedAt); err != nil {
			log.Printf("Error scanning finance entry: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Database scan failed")
			return
		}
		entries = append(entries, e)
	}

	_ = json.NewEncoder(w).Encode(entries)
}

func (h *Handler) createFinanceEntry(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.FinanceEntryCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.Category = strings.TrimSpace(strings.ToLower(req.Category))
	req.Status = defaultString(req.Status, "Active")
	amount := derefFloat(req.Amount, 0)

	if req.Title == "" || req.Category == "" {
		writeJSONError(w, http.StatusBadRequest, "title and category are required")
		return
	}
	if req.Category != "opex" && req.Category != "capex" && req.Category != "revenue" {
		writeJSONError(w, http.StatusBadRequest, "category must be opex, capex, or revenue")
		return
	}

	var e models.FinanceEntry
	err := h.db.QueryRowContext(r.Context(), `
		INSERT INTO finance_entries (tenant_id, title, category, amount, period, status, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, title, category, amount, period, status, notes, created_at
	`, tenantID, req.Title, req.Category, amount, req.Period, req.Status, req.Notes).Scan(
		&e.ID, &e.Title, &e.Category, &e.Amount, &e.Period, &e.Status, &e.Notes, &e.CreatedAt,
	)
	if err != nil {
		log.Printf("Error creating finance entry: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to create finance entry")
		return
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(e)
}

func (h *Handler) updateFinanceEntry(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.FinanceEntryUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	var existing models.FinanceEntry
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, title, category, amount, period, status, notes, created_at
		FROM finance_entries WHERE id = $1 AND tenant_id = $2
	`, id, tenantID).Scan(
		&existing.ID, &existing.Title, &existing.Category, &existing.Amount,
		&existing.Period, &existing.Status, &existing.Notes, &existing.CreatedAt,
	)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Finance entry not found")
		return
	}

	if req.Title != nil {
		existing.Title = strings.TrimSpace(*req.Title)
	}
	if req.Category != nil {
		existing.Category = strings.TrimSpace(strings.ToLower(*req.Category))
	}
	if req.Amount != nil {
		existing.Amount = *req.Amount
	}
	if req.Period != nil {
		existing.Period = req.Period
	}
	if req.Status != nil {
		existing.Status = strings.TrimSpace(*req.Status)
	}
	if req.Notes != nil {
		existing.Notes = req.Notes
	}

	if existing.Title == "" || existing.Category == "" {
		writeJSONError(w, http.StatusBadRequest, "title and category are required")
		return
	}
	if existing.Category != "opex" && existing.Category != "capex" && existing.Category != "revenue" {
		writeJSONError(w, http.StatusBadRequest, "category must be opex, capex, or revenue")
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		UPDATE finance_entries
		SET title = $1, category = $2, amount = $3, period = $4, status = $5, notes = $6
		WHERE id = $7 AND tenant_id = $8
	`, existing.Title, existing.Category, existing.Amount, existing.Period, existing.Status, existing.Notes, id, tenantID)
	if err != nil {
		log.Printf("Error updating finance entry: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to update finance entry")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Finance entry not found")
		return
	}

	_ = json.NewEncoder(w).Encode(existing)
}

func (h *Handler) deleteFinanceEntry(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		DELETE FROM finance_entries WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	if err != nil {
		log.Printf("Error deleting finance entry: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete finance entry")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Finance entry not found")
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Finance entry deleted"})
}
