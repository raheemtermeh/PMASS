package handlers

import (
	"net/http"
	"strconv"
)

const (
	defaultMVPPageSize = 100
	maxMVPPageSize     = 100
)

// parseMVPPageQuery adds a safe cap to legacy MVP list endpoints that
// currently return all rows when clients omit pagination params.
//
// This does not change the response shape (still an array) to preserve API
// compatibility; it only bounds the SQL result set.
func parseMVPPageQuery(r *http.Request) (page, pageSize, offset int) {
	page = 1
	pageSize = defaultMVPPageSize

	if raw := r.URL.Query().Get("page"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 1 {
			page = n
		}
	}
	if raw := r.URL.Query().Get("page_size"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 1 {
			pageSize = n
		}
	}
	if pageSize > maxMVPPageSize {
		pageSize = maxMVPPageSize
	}
	return page, pageSize, (page - 1) * pageSize
}

