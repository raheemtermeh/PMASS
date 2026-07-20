package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"

	collabapp "PMAS/internal/application/collaboration"
	dashboardapp "PMAS/internal/application/dashboard"
	searchapp "PMAS/internal/application/search"
	"PMAS/internal/domain/shared"
)

type CollabHandler struct {
	Scope *CompanyScope
	Svc   *collabapp.Service
}

func (h *CollabHandler) HandleComments(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/comments"), "/")
	parts := splitPath(path)

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		et := r.URL.Query().Get("entity_type")
		eid, err := ParseUUIDParam(r.URL.Query().Get("entity_id"))
		if et == "" || err != nil {
			WriteErr(w, shared.New("INVALID_QUERY", "entity_type and entity_id required", 400))
			return
		}
		items, err := h.Svc.ListComments(r.Context(), companyID, et, eid)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, nil)
	case len(parts) == 0 && r.Method == http.MethodPost:
		var body struct {
			EntityType         string      `json:"entity_type"`
			EntityID           uuid.UUID   `json:"entity_id"`
			AuthorID           uuid.UUID   `json:"author_id"`
			Body               string      `json:"body"`
			ParentID           *uuid.UUID  `json:"parent_id"`
			MentionEmployeeIDs []uuid.UUID `json:"mention_employee_ids"`
			MentionTeamIDs     []uuid.UUID `json:"mention_team_ids"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		c, err := h.Svc.CreateComment(r.Context(), companyID, collabapp.CreateCommentInput{
			EntityType: body.EntityType, EntityID: body.EntityID, AuthorID: body.AuthorID,
			Body: body.Body, ParentID: body.ParentID,
			MentionEmployeeIDs: body.MentionEmployeeIDs, MentionTeamIDs: body.MentionTeamIDs,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, c, nil)
	case len(parts) == 1 && r.Method == http.MethodPatch:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Body string `json:"body"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		if err := h.Svc.EditComment(r.Context(), companyID, id, body.Body); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "updated"}, nil)
	case len(parts) == 1 && r.Method == http.MethodDelete:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		if err := h.Svc.ArchiveComment(r.Context(), companyID, id); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "archived"}, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *CollabHandler) HandleAttachments(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/attachments"), "/")
	parts := splitPath(path)

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		et := r.URL.Query().Get("entity_type")
		eid, err := ParseUUIDParam(r.URL.Query().Get("entity_id"))
		if et == "" || err != nil {
			WriteErr(w, shared.New("INVALID_QUERY", "entity_type and entity_id required", 400))
			return
		}
		items, err := h.Svc.ListAttachments(r.Context(), companyID, et, eid)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, nil)
	case len(parts) == 0 && r.Method == http.MethodPost:
		// MVP: metadata registration (path/URL). Binary upload can use local path from client/CDN.
		var body struct {
			EntityType string    `json:"entity_type"`
			EntityID   uuid.UUID `json:"entity_id"`
			FileName   string    `json:"file_name"`
			Path       string    `json:"path"`
			MimeType   string    `json:"mime_type"`
			Category   string    `json:"category"`
			Size       int64     `json:"size"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		a, err := h.Svc.CreateAttachment(r.Context(), companyID, collabapp.CreateAttachmentInput{
			EntityType: body.EntityType, EntityID: body.EntityID, FileName: body.FileName,
			Path: body.Path, MimeType: body.MimeType, Category: body.Category, Size: body.Size,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, a, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *CollabHandler) HandleActivities(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		WriteErr(w, shared.New("METHOD_NOT_ALLOWED", "Method not allowed", 405))
		return
	}
	et := r.URL.Query().Get("entity_type")
	eid, err := ParseUUIDParam(r.URL.Query().Get("entity_id"))
	if et == "" || err != nil {
		WriteErr(w, shared.New("INVALID_QUERY", "entity_type and entity_id required", 400))
		return
	}
	items, meta, err := h.Svc.ListActivity(r.Context(), companyID, et, eid, PageQueryFromRequest(r))
	if err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, items, meta)
}

func (h *CollabHandler) HandleNotifications(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/notifications"), "/")
	parts := splitPath(path)

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		q := PageQueryFromRequest(r)
		if raw := r.URL.Query().Get("receiver_id"); raw != "" {
			rid, err := ParseUUIDParam(raw)
			if err != nil {
				WriteErr(w, shared.New("INVALID_ID", "Invalid receiver_id", 400))
				return
			}
			items, meta, err := h.Svc.ListNotificationsForReceiver(r.Context(), companyID, rid, q)
			if err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusOK, items, meta)
			return
		}
		items, meta, err := h.Svc.ListNotifications(r.Context(), companyID, q)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, items, meta)
	case len(parts) == 2 && parts[1] == "read" && r.Method == http.MethodPost:
		id, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		if err := h.Svc.MarkNotificationRead(r.Context(), companyID, id); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "read"}, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

type DashboardHandler struct {
	Scope *CompanyScope
	Svc   *dashboardapp.Service
}

func (h *DashboardHandler) HandleDashboard(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		WriteErr(w, shared.New("METHOD_NOT_ALLOWED", "Method not allowed", 405))
		return
	}
	var empID *uuid.UUID
	if raw := r.URL.Query().Get("employee_id"); raw != "" {
		id, err := ParseUUIDParam(raw)
		if err == nil {
			empID = &id
		}
	}
	data, err := h.Svc.Get(r.Context(), companyID, empID)
	if err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, data, nil)
}

type SearchHandler struct {
	Scope *CompanyScope
	Svc   *searchapp.Service
}

func (h *SearchHandler) HandleSearch(w http.ResponseWriter, r *http.Request) {
	companyID, ok := h.Scope.Require(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		WriteErr(w, shared.New("METHOD_NOT_ALLOWED", "Method not allowed", 405))
		return
	}
	q := r.URL.Query().Get("q")
	if q == "" {
		q = r.URL.Query().Get("search")
	}
	data, err := h.Svc.Search(r.Context(), companyID, q)
	if err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, data, map[string]any{"q": q, "count": strconv.Itoa(len(data.Hits))})
}
