package httpapi

import (
	"database/sql"
	"net/http"

	chatapp "PMAS/internal/application/chat"
	"PMAS/internal/infrastructure/postgres"
	"PMAS/internal/middleware"
	"PMAS/internal/realtime"
)

// ChatStack is the fully wired chat REST + realtime surface.
type ChatStack struct {
	Handler  *ChatHandler
	Realtime *ChatRealtime
	Service  *chatapp.Service
	Hub      *realtime.Hub
}

// NewChatHandler wires chat application services and HTTP handler (Phase 2 compatible).
func NewChatHandler(sqlDB *sql.DB, messageRateRPM int) *ChatHandler {
	return NewChatStack(sqlDB, messageRateRPM, nil, nil).Handler
}

// NewChatStack wires REST + optional realtime hub.
// When hub is non-nil, the service publishes events to the hub (or Redis publisher may replace later).
func NewChatStack(sqlDB *sql.DB, messageRateRPM int, hub *realtime.Hub, authz *middleware.Authenticator) *ChatStack {
	db := postgres.New(sqlDB)
	conv := postgres.NewConversationRepo(db)
	msg := postgres.NewMessageRepo(db)
	reaction := postgres.NewReactionRepo(db)
	bookmark := postgres.NewBookmarkRepo(db)
	pin := postgres.NewPinRepo(db)
	mod := postgres.NewModerationRepo(db)
	audit := postgres.NewAuditRepo(db)

	var publisher chatapp.EventPublisher = chatapp.NoopPublisher{}
	if hub != nil {
		publisher = chatapp.HubPublisher{Hub: hub}
	}
	svc := chatapp.NewService(db, conv, msg, reaction, bookmark, pin, mod, audit, messageRateRPM, publisher).
		WithMentions(postgres.NewMentionRepo(db)).
		WithNotifications(postgres.NewNotificationRepo(db)).
		WithPresence(postgres.NewPresenceRepo(db)).
		WithDrafts(postgres.NewDraftRepo(db)).
		WithInvitations(postgres.NewInvitationRepo(db))
	if hub != nil {
		svc = svc.WithMetrics(hub.Metrics())
		if backend := svc.PresenceBackend(); backend != nil {
			hub.SetPresenceBackend(backend)
		}
	}
	scope := &ChatScope{
		CompanyScope: &CompanyScope{DB: db},
		Svc:          svc,
	}
	stack := &ChatStack{
		Handler: &ChatHandler{Scope: scope, Hub: hub},
		Service: svc,
		Hub:     hub,
	}
	if hub != nil && authz != nil {
		stack.Realtime = &ChatRealtime{Hub: hub, Authz: authz, Scope: scope}
	}
	return stack
}

// RegisterChatRealtimeRoutes mounts the WebSocket endpoint.
func RegisterChatRealtimeRoutes(mux *http.ServeMux, rt *ChatRealtime) {
	if rt == nil {
		return
	}
	mux.HandleFunc("/api/v1/chat/ws", rt.HandleWS)
}
