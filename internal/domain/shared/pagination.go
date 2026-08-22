package shared

import (
	"strings"
	"time"
)

type PageQuery struct {
	Page     int
	PageSize int
	Search   string
	Sort     string
	Status   string
	Cursor   string
}

func (p PageQuery) Normalize() PageQuery {
	if p.Page < 1 {
		p.Page = 1
	}
	if p.PageSize < 1 {
		p.PageSize = 20
	}
	if p.PageSize > 100 {
		p.PageSize = 100
	}
	return p
}

func (p PageQuery) Offset() int {
	return (p.Page - 1) * p.PageSize
}

type PageMeta struct {
	Page       int    `json:"page"`
	PageSize   int    `json:"page_size"`
	TotalItems int64  `json:"total_items"`
	TotalPages int    `json:"total_pages"`
	NextCursor string `json:"next_cursor,omitempty"`
}

func NewPageMeta(q PageQuery, total int64) PageMeta {
	q = q.Normalize()
	pages := int(total) / q.PageSize
	if int(total)%q.PageSize != 0 {
		pages++
	}
	if pages == 0 && total > 0 {
		pages = 1
	}
	return PageMeta{
		Page:       q.Page,
		PageSize:   q.PageSize,
		TotalItems: total,
		TotalPages: pages,
	}
}

func FormatCursor(t time.Time, id string) string {
	if t.IsZero() || id == "" {
		return ""
	}
	return t.UTC().Format(time.RFC3339Nano) + "|" + id
}

func ParseCursor(raw string) (time.Time, string, bool) {
	raw = strings.TrimSpace(raw)
	i := strings.LastIndex(raw, "|")
	if i <= 0 || i == len(raw)-1 {
		return time.Time{}, "", false
	}
	t, err := time.Parse(time.RFC3339Nano, raw[:i])
	if err != nil {
		t, err = time.Parse(time.RFC3339, raw[:i])
		if err != nil {
			return time.Time{}, "", false
		}
	}
	return t, raw[i+1:], true
}
