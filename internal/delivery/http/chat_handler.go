package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	chatapp "PMAS/internal/application/chat"
	"PMAS/internal/auth"
	"PMAS/internal/domain/chat"
	"PMAS/internal/domain/shared"
	"PMAS/internal/middleware"
	"PMAS/internal/realtime"
)

// ChatHandler serves REST chat endpoints.
type ChatHandler struct {
	Scope *ChatScope
	Hub   *realtime.Hub // optional; used for live presence hydration
}

func (h *ChatHandler) Handle(w http.ResponseWriter, r *http.Request) {
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/chat"), "/")
	parts := splitPath(path)

	// WebSocket is registered on a dedicated route; reject accidental REST hits.
	if len(parts) == 1 && parts[0] == "ws" {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}

	switch {
	case len(parts) == 1 && parts[0] == "sync":
		h.handleSync(w, r)
	case len(parts) == 1 && parts[0] == "search":
		h.handleGlobalSearch(w, r)
	case len(parts) == 1 && parts[0] == "presence":
		h.handlePresence(w, r)
	case len(parts) == 1 && parts[0] == "bookmarks":
		h.handleBookmarks(w, r)
	case len(parts) == 1 && parts[0] == "invitations":
		h.handleInvitationsList(w, r)
	case len(parts) >= 1 && parts[0] == "invitations":
		h.handleInvitationActions(w, r, parts[1:])
	case len(parts) == 1 && parts[0] == "reports":
		h.handleReports(w, r)
	case len(parts) >= 1 && parts[0] == "reports":
		h.handleReportActions(w, r, parts[1:])
	case len(parts) == 1 && parts[0] == "conversations":
		h.handleConversations(w, r)
	case len(parts) >= 1 && parts[0] == "conversations":
		h.handleConversationSubroutes(w, r, parts[1:])
	case len(parts) >= 1 && parts[0] == "messages":
		h.handleMessageSubroutes(w, r, parts[1:])
	case len(parts) == 1 && parts[0] == "blocks" && r.Method == http.MethodGet:
		h.handleListBlocks(w, r)
	case len(parts) == 1 && parts[0] == "blocks" && r.Method == http.MethodPost:
		h.handleBlockUser(w, r)
	case len(parts) == 2 && parts[0] == "blocks" && r.Method == http.MethodDelete:
		h.handleUnblockUser(w, r, parts[1])
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *ChatHandler) handleConversations(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.Scope.RequireActor(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		if !auth.HasPermission(actor.Role, actor.Perms, auth.PermChatView) {
			WriteErr(w, shared.ErrForbidden)
			return
		}
		page, err := h.Scope.Svc.ListConversations(r.Context(), *actor, r.URL.Query().Get("cursor"), chatLimitFromRequest(r))
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, page, nil)
	case http.MethodPost:
		var body struct {
			Type            string      `json:"type"`
			Name            string      `json:"name"`
			Slug            string      `json:"slug"`
			Description     string      `json:"description"`
			Visibility      string      `json:"visibility"`
			MemberIDs       []uuid.UUID `json:"member_ids"`
			OtherEmployeeID uuid.UUID   `json:"other_employee_id"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		switch strings.ToUpper(strings.TrimSpace(body.Type)) {
		case chat.ConversationTypeDM:
			c, err := h.Scope.Svc.CreateDM(r.Context(), *actor, chatapp.CreateDMInput{OtherEmployeeID: body.OtherEmployeeID})
			if err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusCreated, c, nil)
		case chat.ConversationTypeGroup:
			c, err := h.Scope.Svc.CreateGroup(r.Context(), *actor, chatapp.CreateGroupInput{Name: body.Name, MemberIDs: body.MemberIDs})
			if err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusCreated, c, nil)
		case chat.ConversationTypeChannel:
			c, err := h.Scope.Svc.CreateChannel(r.Context(), *actor, chatapp.CreateChannelInput{
				Name: body.Name, Slug: body.Slug, Description: body.Description, Visibility: body.Visibility,
			})
			if err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusCreated, c, nil)
		default:
			WriteErr(w, chat.ErrInvalidConversationType)
		}
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *ChatHandler) handleConversationSubroutes(w http.ResponseWriter, r *http.Request, parts []string) {
	if len(parts) == 0 {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	convID, err := ParseUUIDParam(parts[0])
	if err != nil {
		WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
		return
	}
	actor, ok := h.Scope.RequireActor(w, r)
	if !ok {
		return
	}

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			c, err := h.Scope.Svc.GetConversation(r.Context(), *actor, convID)
			if err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusOK, c, nil)
		case http.MethodPatch:
			var body struct {
				Name        *string `json:"name"`
				Description *string `json:"description"`
				AvatarURL   *string `json:"avatar_url"`
				Visibility  *string `json:"visibility"`
				Slug        *string `json:"slug"`
			}
			if err := DecodeJSON(r, &body); err != nil {
				WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
				return
			}
			c, err := h.Scope.Svc.UpdateConversation(r.Context(), *actor, convID, chatapp.UpdateConversationInput{
				Name: body.Name, Description: body.Description, AvatarURL: body.AvatarURL,
				Visibility: body.Visibility, Slug: body.Slug,
			})
			if err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusOK, c, nil)
		default:
			WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		}
		return
	}

	switch parts[1] {
	case "archive":
		if r.Method != http.MethodPost {
			WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
			return
		}
		if err := h.Scope.Svc.ArchiveConversation(r.Context(), *actor, convID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]bool{"archived": true}, nil)
	case "unarchive":
		if r.Method != http.MethodPost {
			WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
			return
		}
		if err := h.Scope.Svc.UnarchiveConversation(r.Context(), *actor, convID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]bool{"archived": false}, nil)
	case "leave":
		if r.Method != http.MethodPost {
			WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
			return
		}
		if err := h.Scope.Svc.LeaveConversation(r.Context(), *actor, convID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "left"}, nil)
	case "members":
		h.handleConversationMembers(w, r, actor, convID, parts[2:])
	case "messages":
		h.handleConversationMessages(w, r, actor, convID)
	case "read":
		h.handleConversationRead(w, r, actor, convID)
	case "pins":
		h.handleConversationPins(w, r, actor, convID, parts[2:])
	case "search":
		h.handleConversationSearch(w, r, actor, convID)
	case "draft":
		h.handleConversationDraft(w, r, actor, convID)
	case "settings":
		h.handleConversationSettings(w, r, actor, convID)
	case "transfer-owner":
		h.handleTransferOwner(w, r, actor, convID)
	case "invitations":
		h.handleConversationInvitations(w, r, actor, convID)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *ChatHandler) handleConversationMembers(w http.ResponseWriter, r *http.Request, actor *chatapp.Actor, convID uuid.UUID, parts []string) {
	if len(parts) == 0 {
		switch r.Method {
		case http.MethodGet:
			items, err := h.Scope.Svc.ListMembers(r.Context(), *actor, convID, chatLimitFromRequest(r))
			if err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusOK, items, nil)
		case http.MethodPost:
			var body struct {
				EmployeeID uuid.UUID `json:"employee_id"`
			}
			if err := DecodeJSON(r, &body); err != nil {
				WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
				return
			}
			if err := h.Scope.Svc.AddMember(r.Context(), *actor, convID, body.EmployeeID); err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusCreated, map[string]string{"status": "added"}, nil)
		default:
			WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		}
		return
	}
	if len(parts) == 1 && r.Method == http.MethodDelete {
		empID, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		if err := h.Scope.Svc.RemoveMember(r.Context(), *actor, convID, empID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "removed"}, nil)
		return
	}
	if len(parts) == 2 && parts[1] == "role" && (r.Method == http.MethodPut || r.Method == http.MethodPatch) {
		empID, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		var body struct {
			Role string `json:"role"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		if err := h.Scope.Svc.UpdateMemberRole(r.Context(), *actor, convID, empID, body.Role); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "updated", "role": body.Role}, nil)
		return
	}
	WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
}

func (h *ChatHandler) handleConversationMessages(w http.ResponseWriter, r *http.Request, actor *chatapp.Actor, convID uuid.UUID) {
	switch r.Method {
	case http.MethodGet:
		q := chat.MessageListQuery{
			Cursor:    r.URL.Query().Get("cursor"),
			Limit:     chatLimitFromRequest(r),
			Direction: r.URL.Query().Get("direction"),
		}
		page, err := h.Scope.Svc.ListMessages(r.Context(), *actor, convID, q)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, page, nil)
	case http.MethodPost:
		var body struct {
			Content         string     `json:"content"`
			MessageType     string     `json:"message_type"`
			ContentFormat   string     `json:"content_format"`
			ParentMessageID *uuid.UUID `json:"parent_message_id"`
			ThreadRootID    *uuid.UUID `json:"thread_root_id"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		m, err := h.Scope.Svc.SendMessage(r.Context(), *actor, convID, chatapp.SendMessageInput{
			Content: body.Content, MessageType: body.MessageType, ContentFormat: body.ContentFormat,
			ParentMessageID: body.ParentMessageID, ThreadRootID: body.ThreadRootID,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, m, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *ChatHandler) handleConversationRead(w http.ResponseWriter, r *http.Request, actor *chatapp.Actor, convID uuid.UUID) {
	if r.Method != http.MethodPost {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	var body struct {
		MessageID uuid.UUID `json:"message_id"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
		return
	}
	if body.MessageID == uuid.Nil {
		WriteErr(w, shared.New("INVALID_PAYLOAD", "message_id required", 400))
		return
	}
	if err := h.Scope.Svc.MarkConversationReadUpTo(r.Context(), *actor, convID, body.MessageID); err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, map[string]any{"status": "read", "up_to": body.MessageID}, nil)
}

func (h *ChatHandler) handleSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	actor, ok := h.Scope.RequireActor(w, r)
	if !ok {
		return
	}
	if !auth.HasPermission(actor.Role, actor.Perms, auth.PermChatView) {
		WriteErr(w, shared.ErrForbidden)
		return
	}
	rawConv := strings.TrimSpace(r.URL.Query().Get("conversation_id"))
	if rawConv == "" {
		WriteErr(w, shared.New("INVALID_QUERY", "conversation_id required", 400))
		return
	}
	convID, err := ParseUUIDParam(rawConv)
	if err != nil {
		WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
		return
	}
	var afterID *uuid.UUID
	if raw := strings.TrimSpace(r.URL.Query().Get("after_message_id")); raw != "" {
		id, err := ParseUUIDParam(raw)
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		afterID = &id
	}
	page, err := h.Scope.Svc.SyncMessages(r.Context(), *actor, convID, afterID, chatLimitFromRequest(r))
	if err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, page, nil)
}

func (h *ChatHandler) handleConversationPins(w http.ResponseWriter, r *http.Request, actor *chatapp.Actor, convID uuid.UUID, parts []string) {
	if len(parts) == 0 && r.Method == http.MethodGet {
		pins, err := h.Scope.Svc.ListPinnedMessages(r.Context(), *actor, convID)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, pins, nil)
		return
	}
	if len(parts) == 0 && r.Method == http.MethodPost {
		var body struct {
			MessageID uuid.UUID `json:"message_id"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		pin, err := h.Scope.Svc.PinMessage(r.Context(), *actor, convID, body.MessageID)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, pin, nil)
		return
	}
	if len(parts) == 1 && r.Method == http.MethodDelete {
		msgID, err := ParseUUIDParam(parts[0])
		if err != nil {
			WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
			return
		}
		if err := h.Scope.Svc.UnpinMessage(r.Context(), *actor, convID, msgID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "unpinned"}, nil)
		return
	}
	WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
}

func (h *ChatHandler) handleMessageSubroutes(w http.ResponseWriter, r *http.Request, parts []string) {
	if len(parts) == 0 {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	msgID, err := ParseUUIDParam(parts[0])
	if err != nil {
		WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
		return
	}
	actor, ok := h.Scope.RequireActor(w, r)
	if !ok {
		return
	}

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			m, err := h.Scope.Svc.GetMessage(r.Context(), *actor, msgID)
			if err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusOK, m, nil)
		case http.MethodPatch:
			var body struct {
				Content string `json:"content"`
			}
			if err := DecodeJSON(r, &body); err != nil {
				WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
				return
			}
			m, err := h.Scope.Svc.EditMessage(r.Context(), *actor, msgID, body.Content)
			if err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusOK, m, nil)
		case http.MethodDelete:
			if err := h.Scope.Svc.DeleteMessage(r.Context(), *actor, msgID); err != nil {
				WriteErr(w, err)
				return
			}
			WriteOK(w, http.StatusOK, map[string]bool{"deleted": true}, nil)
		default:
			WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		}
		return
	}

	switch parts[1] {
	case "reactions":
		h.handleReactions(w, r, actor, msgID)
	case "bookmark":
		h.handleBookmark(w, r, actor, msgID)
	case "read":
		if r.Method != http.MethodPost {
			WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
			return
		}
		if err := h.Scope.Svc.MarkMessageRead(r.Context(), *actor, msgID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "read"}, nil)
	case "delivered":
		if r.Method != http.MethodPost {
			WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
			return
		}
		if err := h.Scope.Svc.MarkMessageDelivered(r.Context(), *actor, msgID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "delivered"}, nil)
	case "reply":
		if r.Method != http.MethodPost {
			WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
			return
		}
		var body struct {
			Content string `json:"content"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		m, err := h.Scope.Svc.ReplyToMessage(r.Context(), *actor, msgID, body.Content)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, m, nil)
	case "forward":
		if r.Method != http.MethodPost {
			WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
			return
		}
		var body struct {
			TargetConversationIDs []uuid.UUID `json:"target_conversation_ids"`
			Comment               string      `json:"comment"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		msgs, err := h.Scope.Svc.ForwardMessage(r.Context(), *actor, msgID, chatapp.ForwardMessageInput{
			TargetConversationIDs: body.TargetConversationIDs, Comment: body.Comment,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, msgs, nil)
	case "report":
		if r.Method != http.MethodPost {
			WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
			return
		}
		var body struct {
			Reason  string `json:"reason"`
			Details string `json:"details"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		report, err := h.Scope.Svc.ReportMessage(r.Context(), *actor, msgID, body.Reason, body.Details)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusCreated, report, nil)
	case "thread":
		if r.Method != http.MethodGet {
			WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
			return
		}
		q := chat.MessageListQuery{
			Cursor: r.URL.Query().Get("cursor"),
			Limit:  chatLimitFromRequest(r),
		}
		page, err := h.Scope.Svc.ListThread(r.Context(), *actor, msgID, q)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, page, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *ChatHandler) handleReactions(w http.ResponseWriter, r *http.Request, actor *chatapp.Actor, msgID uuid.UUID) {
	switch r.Method {
	case http.MethodPost:
		var body struct {
			Emoji string `json:"emoji"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		reactions, err := h.Scope.Svc.AddReaction(r.Context(), *actor, msgID, body.Emoji)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, reactions, nil)
	case http.MethodDelete:
		emoji := r.URL.Query().Get("emoji")
		if emoji == "" {
			WriteErr(w, shared.New("INVALID_QUERY", "emoji query parameter required", 400))
			return
		}
		reactions, err := h.Scope.Svc.RemoveReaction(r.Context(), *actor, msgID, emoji)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, reactions, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *ChatHandler) handleBookmark(w http.ResponseWriter, r *http.Request, actor *chatapp.Actor, msgID uuid.UUID) {
	switch r.Method {
	case http.MethodPost:
		if err := h.Scope.Svc.AddBookmark(r.Context(), *actor, msgID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]bool{"bookmarked": true}, nil)
	case http.MethodDelete:
		if err := h.Scope.Svc.RemoveBookmark(r.Context(), *actor, msgID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]bool{"bookmarked": false}, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *ChatHandler) handleBlockUser(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.Scope.RequireActor(w, r)
	if !ok {
		return
	}
	var body struct {
		EmployeeID uuid.UUID `json:"employee_id"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
		return
	}
	if err := h.Scope.Svc.BlockUser(r.Context(), *actor, body.EmployeeID); err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, map[string]bool{"blocked": true}, nil)
}

func (h *ChatHandler) handleUnblockUser(w http.ResponseWriter, r *http.Request, rawID string) {
	actor, ok := h.Scope.RequireActor(w, r)
	if !ok {
		return
	}
	empID, err := ParseUUIDParam(rawID)
	if err != nil {
		WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
		return
	}
	if err := h.Scope.Svc.UnblockUser(r.Context(), *actor, empID); err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, map[string]bool{"blocked": false}, nil)
}

func (h *ChatHandler) handleGlobalSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	actor, ok := h.Scope.RequireActor(w, r)
	if !ok {
		return
	}
	q, err := searchQueryFromRequest(r)
	if err != nil {
		WriteErr(w, err)
		return
	}
	page, err := h.Scope.Svc.SearchGlobal(r.Context(), *actor, q)
	if err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, page, nil)
}

func (h *ChatHandler) handleConversationSearch(w http.ResponseWriter, r *http.Request, actor *chatapp.Actor, convID uuid.UUID) {
	if r.Method != http.MethodGet {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	q, err := searchQueryFromRequest(r)
	if err != nil {
		WriteErr(w, err)
		return
	}
	page, err := h.Scope.Svc.SearchConversation(r.Context(), *actor, convID, q)
	if err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, page, nil)
}

func searchQueryFromRequest(r *http.Request) (chat.SearchQuery, error) {
	q := chat.SearchQuery{
		Query:  r.URL.Query().Get("q"),
		Cursor: r.URL.Query().Get("cursor"),
		Limit:  chatLimitFromRequest(r),
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("conversation_id")); raw != "" {
		id, err := ParseUUIDParam(raw)
		if err != nil {
			return q, shared.New("INVALID_ID", "Invalid conversation_id", 400)
		}
		q.ConversationID = &id
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("sender_id")); raw != "" {
		id, err := ParseUUIDParam(raw)
		if err != nil {
			return q, shared.New("INVALID_ID", "Invalid sender_id", 400)
		}
		q.SenderID = &id
	}
	before, err := parseOptionalRFC3339(r.URL.Query().Get("before"))
	if err != nil {
		return q, err
	}
	after, err := parseOptionalRFC3339(r.URL.Query().Get("after"))
	if err != nil {
		return q, err
	}
	q.Before = before
	q.After = after
	return q, nil
}

func parseOptionalRFC3339(raw string) (*time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	ts, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		ts, err = time.Parse(time.RFC3339, raw)
		if err != nil {
			return nil, shared.New("INVALID_TIME", "Invalid time filter", 400)
		}
	}
	utc := ts.UTC()
	return &utc, nil
}

func (h *ChatHandler) handlePresence(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	actor, ok := h.Scope.RequireActor(w, r)
	if !ok {
		return
	}
	raw := strings.TrimSpace(r.URL.Query().Get("employee_ids"))
	ids := make([]uuid.UUID, 0)
	if raw != "" {
		for _, part := range strings.Split(raw, ",") {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			id, err := ParseUUIDParam(part)
			if err != nil {
				WriteErr(w, shared.New("INVALID_ID", "Invalid employee_ids", 400))
				return
			}
			ids = append(ids, id)
		}
	}
	var live chatapp.LivePresenceReader
	if h.Hub != nil {
		live = h.Hub
	}
	items, err := h.Scope.Svc.GetPresence(r.Context(), *actor, ids, live)
	if err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, map[string]any{"items": items}, nil)
}

func (h *ChatHandler) handleConversationDraft(w http.ResponseWriter, r *http.Request, actor *chatapp.Actor, convID uuid.UUID) {
	switch r.Method {
	case http.MethodGet:
		d, err := h.Scope.Svc.GetDraft(r.Context(), *actor, convID)
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, d, nil)
	case http.MethodPut:
		var body struct {
			Content         string     `json:"content"`
			ParentMessageID *uuid.UUID `json:"parent_message_id"`
			UpdatedAt       *time.Time `json:"updated_at"` // optimistic concurrency hint
		}
		if err := DecodeJSON(r, &body); err != nil {
			WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
			return
		}
		d, err := h.Scope.Svc.SaveDraft(r.Context(), *actor, convID, chatapp.SaveDraftInput{
			Content: body.Content, ParentMessageID: body.ParentMessageID, IfUpdatedAt: body.UpdatedAt,
		})
		if err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, d, nil)
	case http.MethodDelete:
		if err := h.Scope.Svc.DeleteDraft(r.Context(), *actor, convID); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]bool{"deleted": true}, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *ChatHandler) handleConversationSettings(w http.ResponseWriter, r *http.Request, actor *chatapp.Actor, convID uuid.UUID) {
	if r.Method != http.MethodPatch && r.Method != http.MethodPut {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	var body struct {
		IsMuted           *bool   `json:"is_muted"`
		IsArchived        *bool   `json:"is_archived"`
		NotificationLevel *string `json:"notification_level"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
		return
	}
	m, err := h.Scope.Svc.UpdateMemberSettings(r.Context(), *actor, convID, chatapp.MemberSettingsInput{
		IsMuted: body.IsMuted, IsArchived: body.IsArchived, NotificationLevel: body.NotificationLevel,
	})
	if err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, m, nil)
}

func (h *ChatHandler) handleTransferOwner(w http.ResponseWriter, r *http.Request, actor *chatapp.Actor, convID uuid.UUID) {
	if r.Method != http.MethodPost {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	var body struct {
		EmployeeID uuid.UUID `json:"employee_id"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
		return
	}
	if err := h.Scope.Svc.TransferOwnership(r.Context(), *actor, convID, body.EmployeeID); err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, map[string]string{"status": "transferred"}, nil)
}

func (h *ChatHandler) handleConversationInvitations(w http.ResponseWriter, r *http.Request, actor *chatapp.Actor, convID uuid.UUID) {
	if r.Method != http.MethodPost {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	var body struct {
		EmployeeID uuid.UUID `json:"employee_id"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
		return
	}
	inv, err := h.Scope.Svc.CreateInvitation(r.Context(), *actor, convID, body.EmployeeID, 0)
	if err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusCreated, inv, nil)
}

func (h *ChatHandler) handleInvitationsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	actor, ok := h.Scope.RequireActor(w, r)
	if !ok {
		return
	}
	page, err := h.Scope.Svc.ListMyInvitations(r.Context(), *actor, r.URL.Query().Get("status"), r.URL.Query().Get("cursor"), chatLimitFromRequest(r))
	if err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, page, nil)
}

func (h *ChatHandler) handleInvitationActions(w http.ResponseWriter, r *http.Request, parts []string) {
	if len(parts) < 2 {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	actor, ok := h.Scope.RequireActor(w, r)
	if !ok {
		return
	}
	id, err := ParseUUIDParam(parts[0])
	if err != nil {
		WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
		return
	}
	if r.Method != http.MethodPost {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	switch parts[1] {
	case "accept":
		if err := h.Scope.Svc.AcceptInvitation(r.Context(), *actor, id); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "accepted"}, nil)
	case "reject", "decline":
		if err := h.Scope.Svc.RejectInvitation(r.Context(), *actor, id); err != nil {
			WriteErr(w, err)
			return
		}
		WriteOK(w, http.StatusOK, map[string]string{"status": "rejected"}, nil)
	default:
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
	}
}

func (h *ChatHandler) handleBookmarks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	actor, ok := h.Scope.RequireActor(w, r)
	if !ok {
		return
	}
	page, err := h.Scope.Svc.ListBookmarks(r.Context(), *actor, r.URL.Query().Get("cursor"), chatLimitFromRequest(r))
	if err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, page, nil)
}

func (h *ChatHandler) handleListBlocks(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.Scope.RequireActor(w, r)
	if !ok {
		return
	}
	page, err := h.Scope.Svc.ListBlocks(r.Context(), *actor, r.URL.Query().Get("cursor"), chatLimitFromRequest(r))
	if err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, page, nil)
}

func (h *ChatHandler) handleReports(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	actor, ok := h.Scope.RequireActor(w, r)
	if !ok {
		return
	}
	page, err := h.Scope.Svc.ListReports(r.Context(), *actor, r.URL.Query().Get("status"), r.URL.Query().Get("cursor"), chatLimitFromRequest(r))
	if err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, page, nil)
}

func (h *ChatHandler) handleReportActions(w http.ResponseWriter, r *http.Request, parts []string) {
	if len(parts) != 1 || (r.Method != http.MethodPatch && r.Method != http.MethodPut) {
		WriteErr(w, shared.New("NOT_FOUND", "Not found", 404))
		return
	}
	actor, ok := h.Scope.RequireActor(w, r)
	if !ok {
		return
	}
	id, err := ParseUUIDParam(parts[0])
	if err != nil {
		WriteErr(w, shared.New("INVALID_ID", "Invalid UUID", 400))
		return
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		WriteErr(w, shared.New("INVALID_PAYLOAD", "Invalid request payload", 400))
		return
	}
	rep, err := h.Scope.Svc.UpdateReport(r.Context(), *actor, id, body.Status)
	if err != nil {
		WriteErr(w, err)
		return
	}
	WriteOK(w, http.StatusOK, rep, nil)
}

// RegisterChatRoutes mounts chat REST endpoints when enabled.
func RegisterChatRoutes(mux *http.ServeMux, authz *middleware.Authenticator, handler *ChatHandler) {
	mux.HandleFunc("/api/v1/chat/", authz.RequireAuth(handler.Handle))
	mux.HandleFunc("/api/v1/chat", authz.RequireAuth(handler.Handle))
}
