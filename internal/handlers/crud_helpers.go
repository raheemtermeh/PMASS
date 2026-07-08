package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func parsePathID(path string) (int, bool) {
	path = strings.Trim(path, "/")
	if path == "" || strings.Contains(path, "/") {
		return 0, false
	}
	id, err := strconv.Atoi(path)
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

func defaultString(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func derefInt(v *int, fallback int) int {
	if v == nil {
		return fallback
	}
	return *v
}

func derefFloat(v *float64, fallback float64) float64 {
	if v == nil {
		return fallback
	}
	return *v
}

func methodNotAllowed(w http.ResponseWriter) {
	writeJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
}
