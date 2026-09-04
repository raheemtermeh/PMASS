package httpapi

import (
	"net/http"
	"strings"

	"github.com/google/uuid"

	"PMAS/internal/auth"
	"PMAS/internal/logging"
	"PMAS/internal/middleware"
	"PMAS/internal/realtime"
)

// ChatRealtime holds WebSocket hub wiring.
type ChatRealtime struct {
	Hub   *realtime.Hub
	Authz *middleware.Authenticator
	Scope *ChatScope
}

// HandleWS authenticates and upgrades a chat WebSocket connection.
//
// Authentication:
//  1. Preferred: Authorization: Bearer <access_token>
//  2. Fallback: ?access_token= (for browser WebSocket API which cannot set headers)
//
// Query tokens must be short-lived access JWTs, never refresh tokens or secrets.
func (rt *ChatRealtime) HandleWS(w http.ResponseWriter, r *http.Request) {
	if rt == nil || rt.Hub == nil || rt.Authz == nil || rt.Scope == nil {
		http.Error(w, "chat realtime unavailable", http.StatusServiceUnavailable)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token := bearerToken(r)
	if token == "" {
		token = strings.TrimSpace(r.URL.Query().Get("access_token"))
	}
	if token == "" {
		rt.Hub.Metrics().AuthFailures.Add(1)
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}

	claims, err := rt.Authz.AuthenticateToken(r.Context(), token)
	if err != nil {
		rt.Hub.Metrics().AuthFailures.Add(1)
		logging.Warn("chat_ws_auth_failed", "error", err.Error())
		http.Error(w, "authentication failed", http.StatusUnauthorized)
		return
	}
	if !auth.HasPermission(claims.Role, claims.Permissions, auth.PermChatView) {
		rt.Hub.Metrics().AuthFailures.Add(1)
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if claims.TenantID == nil {
		rt.Hub.Metrics().AuthFailures.Add(1)
		http.Error(w, "company workspace required", http.StatusForbidden)
		return
	}

	var companyID uuid.UUID
	if claims.CompanyID != "" {
		if id, parseErr := uuid.Parse(claims.CompanyID); parseErr == nil && id != uuid.Nil {
			companyID = id
		}
	}
	if companyID == uuid.Nil {
		var resolveErr error
		companyID, resolveErr = rt.Scope.CompanyScope.DB.ResolveCompanyID(r.Context(), *claims.TenantID)
		if resolveErr != nil {
			rt.Hub.Metrics().AuthFailures.Add(1)
			http.Error(w, "company workspace required", http.StatusForbidden)
			return
		}
	}

	employeeID, err := rt.Scope.Svc.ResolveEmployeeID(r.Context(), companyID, claims.UserID, claims.EmployeeID)
	if err != nil {
		rt.Hub.Metrics().AuthFailures.Add(1)
		http.Error(w, "employee profile required", http.StatusForbidden)
		return
	}

	identity := realtime.ConnIdentity{
		CompanyID:  companyID,
		EmployeeID: employeeID,
		UserID:     claims.UserID,
		Role:       claims.Role,
		Perms:      claims.Permissions,
	}
	rt.Hub.ServeWS(w, r, identity)
}

func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if header == "" {
		return ""
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}
