package handlers

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"PMAS/internal/middleware"
)

var layoutKeyRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$`)

const maxLayoutJSONBytes = 256 * 1024

// HandleUILayouts serves GET/PUT /api/v1/ui-layouts/{key} for the authenticated user.
// Layouts are opaque JSON blobs (node positions, pan/zoom, etc.) persisted server-side
// so clients can debounce saves instead of writing localStorage-only state.
func (h *Handler) HandleUILayouts(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	key := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/ui-layouts"), "/")
	if key == "" || strings.Contains(key, "/") || !layoutKeyRe.MatchString(key) {
		writeJSONError(w, http.StatusBadRequest, "Invalid layout key")
		return
	}

	switch r.Method {
	case http.MethodGet:
		h.getUILayout(w, r, claims.UserID, key)
	case http.MethodPut:
		h.putUILayout(w, r, claims.UserID, key)
	default:
		methodNotAllowed(w)
	}
}

func (h *Handler) getUILayout(w http.ResponseWriter, r *http.Request, userID int, key string) {
	var raw []byte
	err := h.db.QueryRowContext(r.Context(), `
		SELECT layout_json FROM ui_layouts WHERE user_id = $1 AND layout_key = $2
	`, userID, key).Scan(&raw)
	if err != nil {
		// Missing layout is not an error — return empty object.
		_ = json.NewEncoder(w).Encode(map[string]any{
			"key":    key,
			"layout": map[string]any{},
		})
		return
	}

	var layout any
	if len(raw) == 0 {
		layout = map[string]any{}
	} else if err := json.Unmarshal(raw, &layout); err != nil {
		layout = map[string]any{}
	}

	_ = json.NewEncoder(w).Encode(map[string]any{
		"key":    key,
		"layout": layout,
	})
}

func (h *Handler) putUILayout(w http.ResponseWriter, r *http.Request, userID int, key string) {
	r.Body = http.MaxBytesReader(w, r.Body, maxLayoutJSONBytes)
	var body struct {
		Layout json.RawMessage `json:"layout"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	if len(body.Layout) == 0 || !json.Valid(body.Layout) {
		writeJSONError(w, http.StatusBadRequest, "layout must be valid JSON")
		return
	}
	if utf8.RuneCountInString(string(body.Layout)) == 0 {
		writeJSONError(w, http.StatusBadRequest, "layout is required")
		return
	}

	_, err := h.db.ExecContext(r.Context(), `
		INSERT INTO ui_layouts (user_id, layout_key, layout_json, updated_at)
		VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
		ON CONFLICT (user_id, layout_key) DO UPDATE
		SET layout_json = EXCLUDED.layout_json,
		    updated_at = CURRENT_TIMESTAMP
	`, userID, key, []byte(body.Layout))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to save layout")
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"key":    key,
		"ok":     true,
		"layout": json.RawMessage(body.Layout),
	})
}
