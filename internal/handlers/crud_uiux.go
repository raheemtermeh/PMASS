package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"PMAS/internal/models"
)

// HandleUIUXTokens routes GET/POST on collection and PUT/DELETE by id.
func (h *Handler) HandleUIUXTokens(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/uiux/tokens")
	path = strings.Trim(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			h.listDesignTokens(w, r)
		case http.MethodPost:
			h.upsertDesignToken(w, r)
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
		h.updateDesignToken(w, r, id)
	case http.MethodDelete:
		h.deleteDesignToken(w, r, id)
	default:
		methodNotAllowed(w)
	}
}

func (h *Handler) listDesignTokens(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, category, token_data FROM design_tokens
		WHERE tenant_id = $1 ORDER BY id
	`, tenantID)
	if err != nil {
		log.Printf("Error querying design tokens: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Database query failed")
		return
	}
	defer rows.Close()

	tokens := make([]models.DesignToken, 0)
	for rows.Next() {
		var token models.DesignToken
		if err := rows.Scan(&token.ID, &token.Category, &token.TokenData); err != nil {
			log.Printf("Error scanning token: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Database scan failed")
			return
		}
		tokens = append(tokens, token)
	}

	_ = json.NewEncoder(w).Encode(tokens)
}

func (h *Handler) upsertDesignToken(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.DesignTokenUpsertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Category = strings.TrimSpace(req.Category)
	if req.Category == "" {
		writeJSONError(w, http.StatusBadRequest, "category is required")
		return
	}
	if len(req.TokenData) == 0 || !json.Valid(req.TokenData) {
		writeJSONError(w, http.StatusBadRequest, "token_data must be valid JSON")
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		UPDATE design_tokens SET token_data = $1
		WHERE tenant_id = $2 AND category = $3
	`, []byte(req.TokenData), tenantID, req.Category)
	if err != nil {
		log.Printf("Error updating design token: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to upsert design token")
		return
	}

	if n, _ := result.RowsAffected(); n == 0 {
		_, err = h.db.ExecContext(r.Context(), `
			INSERT INTO design_tokens (tenant_id, category, token_data)
			VALUES ($1, $2, $3)
		`, tenantID, req.Category, []byte(req.TokenData))
		if err != nil {
			log.Printf("Error inserting design token: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Failed to upsert design token")
			return
		}
	}

	var token models.DesignToken
	err = h.db.QueryRowContext(r.Context(), `
		SELECT id, category, token_data FROM design_tokens
		WHERE tenant_id = $1 AND category = $2
	`, tenantID, req.Category).Scan(&token.ID, &token.Category, &token.TokenData)
	if err != nil {
		log.Printf("Error reading design token: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to upsert design token")
		return
	}

	_ = json.NewEncoder(w).Encode(token)
}

func (h *Handler) updateDesignToken(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.DesignTokenUpsertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Category = strings.TrimSpace(req.Category)
	if req.Category == "" {
		writeJSONError(w, http.StatusBadRequest, "category is required")
		return
	}
	if len(req.TokenData) == 0 || !json.Valid(req.TokenData) {
		writeJSONError(w, http.StatusBadRequest, "token_data must be valid JSON")
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		UPDATE design_tokens
		SET category = $1, token_data = $2
		WHERE id = $3 AND tenant_id = $4
	`, req.Category, []byte(req.TokenData), id, tenantID)
	if err != nil {
		log.Printf("Error updating design token: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to update design token")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Design token not found")
		return
	}

	var token models.DesignToken
	err = h.db.QueryRowContext(r.Context(), `
		SELECT id, category, token_data FROM design_tokens
		WHERE id = $1 AND tenant_id = $2
	`, id, tenantID).Scan(&token.ID, &token.Category, &token.TokenData)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to update design token")
		return
	}

	_ = json.NewEncoder(w).Encode(token)
}

func (h *Handler) deleteDesignToken(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		DELETE FROM design_tokens WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	if err != nil {
		log.Printf("Error deleting design token: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete design token")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "Design token not found")
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Design token deleted"})
}

// HandleUIAssets routes GET/POST on collection and PUT/DELETE by id.
func (h *Handler) HandleUIAssets(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/uiux/assets")
	path = strings.Trim(path, "/")

	// Leave /push to PushAsset handler registered separately.
	if path == "push" {
		writeJSONError(w, http.StatusNotFound, "Not found")
		return
	}

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			h.listUIAssets(w, r)
		case http.MethodPost:
			h.createUIAsset(w, r)
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
		h.updateUIAsset(w, r, id)
	case http.MethodDelete:
		h.deleteUIAsset(w, r, id)
	default:
		methodNotAllowed(w)
	}
}

func (h *Handler) listUIAssets(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, name, size, cdn_status, date
		FROM ui_assets WHERE tenant_id = $1 ORDER BY id
	`, tenantID)
	if err != nil {
		log.Printf("Error querying UI assets: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Database query failed")
		return
	}
	defer rows.Close()

	assets := make([]models.UIAsset, 0)
	for rows.Next() {
		var a models.UIAsset
		if err := rows.Scan(&a.ID, &a.Name, &a.Size, &a.CDNStatus, &a.Date); err != nil {
			log.Printf("Error scanning UI asset: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Database scan failed")
			return
		}
		assets = append(assets, a)
	}

	_ = json.NewEncoder(w).Encode(assets)
}

func (h *Handler) createUIAsset(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.UIAssetCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Size = strings.TrimSpace(req.Size)
	req.CDNStatus = defaultString(req.CDNStatus, "Pending Sync")
	req.Date = defaultString(req.Date, "")

	if req.Name == "" || req.Size == "" {
		writeJSONError(w, http.StatusBadRequest, "name and size are required")
		return
	}

	var a models.UIAsset
	err := h.db.QueryRowContext(r.Context(), `
		INSERT INTO ui_assets (tenant_id, name, size, cdn_status, date)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, name, size, cdn_status, date
	`, tenantID, req.Name, req.Size, req.CDNStatus, req.Date).Scan(
		&a.ID, &a.Name, &a.Size, &a.CDNStatus, &a.Date,
	)
	if err != nil {
		log.Printf("Error creating UI asset: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to create UI asset")
		return
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(a)
}

func (h *Handler) updateUIAsset(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.UIAssetUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	var existing models.UIAsset
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, name, size, cdn_status, date
		FROM ui_assets WHERE id = $1 AND tenant_id = $2
	`, id, tenantID).Scan(&existing.ID, &existing.Name, &existing.Size, &existing.CDNStatus, &existing.Date)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "UI asset not found")
		return
	}

	if req.Name != nil {
		existing.Name = strings.TrimSpace(*req.Name)
	}
	if req.Size != nil {
		existing.Size = strings.TrimSpace(*req.Size)
	}
	if req.CDNStatus != nil {
		existing.CDNStatus = strings.TrimSpace(*req.CDNStatus)
	}
	if req.Date != nil {
		existing.Date = strings.TrimSpace(*req.Date)
	}

	if existing.Name == "" || existing.Size == "" {
		writeJSONError(w, http.StatusBadRequest, "name and size are required")
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		UPDATE ui_assets
		SET name = $1, size = $2, cdn_status = $3, date = $4
		WHERE id = $5 AND tenant_id = $6
	`, existing.Name, existing.Size, existing.CDNStatus, existing.Date, id, tenantID)
	if err != nil {
		log.Printf("Error updating UI asset: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to update UI asset")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "UI asset not found")
		return
	}

	_ = json.NewEncoder(w).Encode(existing)
}

func (h *Handler) deleteUIAsset(w http.ResponseWriter, r *http.Request, id int) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		DELETE FROM ui_assets WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	if err != nil {
		log.Printf("Error deleting UI asset: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete UI asset")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeJSONError(w, http.StatusNotFound, "UI asset not found")
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "UI asset deleted"})
}
