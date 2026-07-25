package handlers

import (
	"bytes"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
	"github.com/lib/pq"

	"PMAS/internal/middleware"
	"PMAS/internal/models"
)

const webauthnChallengeTTL = 5 * time.Minute

type passkeyUser struct {
	id          int
	name        string
	displayName string
	handle      []byte
	creds       []webauthn.Credential
}

func (u *passkeyUser) WebAuthnID() []byte                         { return u.handle }
func (u *passkeyUser) WebAuthnName() string                       { return u.name }
func (u *passkeyUser) WebAuthnDisplayName() string                { return u.displayName }
func (u *passkeyUser) WebAuthnCredentials() []webauthn.Credential { return u.creds }

type passkeyCredentialView struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
}

type passkeyOptionsResponse struct {
	PublicKey any    `json:"publicKey"`
	SessionID string `json:"session_id"`
}

// HandlePasskeys routes authenticated passkey management and public login begin/finish.
func (h *Handler) HandlePasskeys(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}
	if h.webAuthn == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "Passkeys are not configured")
		return
	}

	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/auth/passkeys"), "/")
	switch {
	case path == "register/begin" && r.Method == http.MethodPost:
		h.passkeyRegisterBegin(w, r)
	case path == "register/finish" && r.Method == http.MethodPost:
		h.passkeyRegisterFinish(w, r)
	case path == "login/begin" && r.Method == http.MethodPost:
		h.passkeyLoginBegin(w, r)
	case path == "login/finish" && r.Method == http.MethodPost:
		h.passkeyLoginFinish(w, r)
	case path == "" && r.Method == http.MethodGet:
		h.listPasskeys(w, r)
	case path != "" && r.Method == http.MethodDelete:
		h.deletePasskey(w, r, path)
	default:
		writeJSONError(w, http.StatusNotFound, "Not found")
	}
}

func (h *Handler) listPasskeys(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id::text, name, created_at, last_used_at
		FROM webauthn_credentials WHERE user_id = $1
		ORDER BY created_at DESC
	`, claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to list passkeys")
		return
	}
	defer rows.Close()

	out := make([]passkeyCredentialView, 0)
	for rows.Next() {
		var item passkeyCredentialView
		var last sql.NullTime
		if err := rows.Scan(&item.ID, &item.Name, &item.CreatedAt, &last); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Failed to list passkeys")
			return
		}
		if last.Valid {
			t := last.Time
			item.LastUsedAt = &t
		}
		out = append(out, item)
	}
	_ = json.NewEncoder(w).Encode(out)
}

func (h *Handler) deletePasskey(w http.ResponseWriter, r *http.Request, id string) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	id = strings.TrimSpace(id)
	if _, err := uuid.Parse(id); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid passkey id")
		return
	}
	res, err := h.db.ExecContext(r.Context(), `
		DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2
	`, id, claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete passkey")
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeJSONError(w, http.StatusNotFound, "Passkey not found")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (h *Handler) passkeyRegisterBegin(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	user, err := h.loadPasskeyUser(r, claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to load user")
		return
	}

	rk := false
	options, session, err := h.webAuthn.BeginRegistration(user,
		webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
			ResidentKey:        protocol.ResidentKeyRequirementPreferred,
			UserVerification:   protocol.VerificationPreferred,
			RequireResidentKey: &rk,
		}),
	)
	if err != nil {
		log.Printf("passkey register begin: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to start passkey registration")
		return
	}
	sessionID, err := h.saveWebAuthnSession(r, session, &user.id, "register")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to store challenge")
		return
	}
	_ = json.NewEncoder(w).Encode(passkeyOptionsResponse{
		PublicKey: options.Response,
		SessionID: sessionID,
	})
}

func (h *Handler) passkeyRegisterFinish(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		Name       string          `json:"name"`
		SessionID  string          `json:"session_id"`
		Credential json.RawMessage `json:"credential"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Credential) == 0 || strings.TrimSpace(body.SessionID) == "" {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Passkey"
	}
	if len(name) > 128 {
		name = name[:128]
	}

	user, err := h.loadPasskeyUser(r, claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to load user")
		return
	}
	session, err := h.takeWebAuthnSession(r, body.SessionID, "register", &user.id)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "Registration challenge expired — try again")
		return
	}

	parsed, err := protocol.ParseCredentialCreationResponseBody(bytes.NewReader(body.Credential))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid passkey response")
		return
	}
	cred, err := h.webAuthn.CreateCredential(user, *session, parsed)
	if err != nil {
		log.Printf("passkey register finish: %v", err)
		writeJSONError(w, http.StatusBadRequest, "Passkey verification failed")
		return
	}

	transports := make([]string, 0, len(cred.Transport))
	for _, t := range cred.Transport {
		transports = append(transports, string(t))
	}
	_, err = h.db.ExecContext(r.Context(), `
		INSERT INTO webauthn_credentials (
			user_id, credential_id, public_key, attestation_type, transport,
			sign_count, backup_eligible, backup_state, name
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, user.id, cred.ID, cred.PublicKey, cred.AttestationType, strings.Join(transports, ","),
		cred.Authenticator.SignCount, cred.Flags.BackupEligible, cred.Flags.BackupState, name)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
			writeJSONError(w, http.StatusConflict, "This passkey is already registered")
			return
		}
		log.Printf("passkey persist: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Failed to save passkey")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "name": name})
}

func (h *Handler) passkeyLoginBegin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantSlug string `json:"tenant_slug"`
		Email      string `json:"email"`
		Username   string `json:"username"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Username = strings.TrimSpace(req.Username)
	req.TenantSlug = strings.TrimSpace(strings.ToLower(req.TenantSlug))

	emitDiscoverable := func() {
		options, session, err := h.webAuthn.BeginDiscoverableLogin(
			webauthn.WithUserVerification(protocol.VerificationPreferred),
		)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Failed to start passkey login")
			return
		}
		sessionID, err := h.saveWebAuthnSession(r, session, nil, "login")
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Failed to store challenge")
			return
		}
		_ = json.NewEncoder(w).Encode(passkeyOptionsResponse{
			PublicKey: options.Response,
			SessionID: sessionID,
		})
	}

	if req.Email == "" && req.Username == "" {
		emitDiscoverable()
		return
	}

	userID, err := h.resolveLoginUserID(r, req.TenantSlug, req.Email, req.Username)
	if err != nil {
		emitDiscoverable()
		return
	}

	user, err := h.loadPasskeyUser(r, userID)
	if err != nil || len(user.creds) == 0 {
		emitDiscoverable()
		return
	}

	options, session, err := h.webAuthn.BeginLogin(user,
		webauthn.WithUserVerification(protocol.VerificationPreferred),
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to start passkey login")
		return
	}
	sessionID, err := h.saveWebAuthnSession(r, session, &user.id, "login")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to store challenge")
		return
	}
	_ = json.NewEncoder(w).Encode(passkeyOptionsResponse{
		PublicKey: options.Response,
		SessionID: sessionID,
	})
}

func (h *Handler) passkeyLoginFinish(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RememberMe bool            `json:"remember_me"`
		SessionID  string          `json:"session_id"`
		Credential json.RawMessage `json:"credential"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Credential) == 0 || strings.TrimSpace(body.SessionID) == "" {
		writeJSONError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	session, err := h.takeWebAuthnSession(r, body.SessionID, "login", nil)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "Login challenge expired — try again")
		return
	}

	parsed, err := protocol.ParseCredentialRequestResponseBody(bytes.NewReader(body.Credential))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid passkey response")
		return
	}

	handler := func(rawID, userHandle []byte) (webauthn.User, error) {
		userID, err := h.lookupUserByWebAuthn(r, rawID, userHandle)
		if err != nil {
			return nil, err
		}
		return h.loadPasskeyUser(r, userID)
	}

	var (
		cred *webauthn.Credential
		user webauthn.User
	)
	if len(session.UserID) > 0 {
		uid, err := h.lookupUserByHandle(r, session.UserID)
		if err != nil {
			writeJSONError(w, http.StatusUnauthorized, "Passkey login failed")
			return
		}
		pu, err := h.loadPasskeyUser(r, uid)
		if err != nil {
			writeJSONError(w, http.StatusUnauthorized, "Passkey login failed")
			return
		}
		cred, err = h.webAuthn.ValidateLogin(pu, *session, parsed)
		if err != nil {
			log.Printf("passkey login validate: %v", err)
			writeJSONError(w, http.StatusUnauthorized, "Passkey login failed")
			return
		}
		user = pu
	} else {
		user, cred, err = h.webAuthn.ValidatePasskeyLogin(handler, *session, parsed)
		if err != nil {
			log.Printf("passkey discoverable login: %v", err)
			writeJSONError(w, http.StatusUnauthorized, "Passkey login failed")
			return
		}
	}

	pu, ok := user.(*passkeyUser)
	if !ok || pu == nil {
		writeJSONError(w, http.StatusUnauthorized, "Passkey login failed")
		return
	}

	_, _ = h.db.ExecContext(r.Context(), `
		UPDATE webauthn_credentials
		SET sign_count = $1, last_used_at = CURRENT_TIMESTAMP,
		    backup_eligible = $2, backup_state = $3
		WHERE credential_id = $4 AND user_id = $5
	`, cred.Authenticator.SignCount, cred.Flags.BackupEligible, cred.Flags.BackupState, cred.ID, pu.id)

	appUser, err := h.loadUserWithPermissions(r, pu.id)
	if err != nil || !appUser.IsActive {
		writeJSONError(w, http.StatusUnauthorized, "Account is deactivated")
		return
	}

	accessToken, refreshToken, err := h.issueSession(r, appUser, body.RememberMe)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to create session")
		return
	}
	_ = json.NewEncoder(w).Encode(models.LoginResponse{
		Token:        accessToken,
		RefreshToken: refreshToken,
		User:         *appUser,
	})
}

func (h *Handler) saveWebAuthnSession(r *http.Request, session *webauthn.SessionData, userID *int, purpose string) (string, error) {
	raw, err := json.Marshal(session)
	if err != nil {
		return "", err
	}
	var id string
	err = h.db.QueryRowContext(r.Context(), `
		INSERT INTO webauthn_challenges (challenge, user_id, session_data, purpose, expires_at)
		VALUES ($1, $2, $3::jsonb, $4, $5)
		RETURNING id::text
	`, session.Challenge, userID, raw, purpose, time.Now().Add(webauthnChallengeTTL)).Scan(&id)
	return id, err
}

func (h *Handler) takeWebAuthnSession(r *http.Request, sessionID, purpose string, userID *int) (*webauthn.SessionData, error) {
	_, _ = h.db.ExecContext(r.Context(), `DELETE FROM webauthn_challenges WHERE expires_at < CURRENT_TIMESTAMP`)

	if _, err := uuid.Parse(strings.TrimSpace(sessionID)); err != nil {
		return nil, err
	}

	var raw []byte
	var err error
	if userID != nil {
		err = h.db.QueryRowContext(r.Context(), `
			SELECT session_data FROM webauthn_challenges
			WHERE id = $1 AND purpose = $2 AND user_id = $3 AND expires_at > CURRENT_TIMESTAMP
		`, sessionID, purpose, *userID).Scan(&raw)
	} else {
		err = h.db.QueryRowContext(r.Context(), `
			SELECT session_data FROM webauthn_challenges
			WHERE id = $1 AND purpose = $2 AND expires_at > CURRENT_TIMESTAMP
		`, sessionID, purpose).Scan(&raw)
	}
	if err != nil {
		return nil, err
	}
	_, _ = h.db.ExecContext(r.Context(), `DELETE FROM webauthn_challenges WHERE id = $1`, sessionID)

	var session webauthn.SessionData
	if err := json.Unmarshal(raw, &session); err != nil {
		return nil, err
	}
	return &session, nil
}

func (h *Handler) loadPasskeyUser(r *http.Request, userID int) (*passkeyUser, error) {
	var email, fullName string
	var handle []byte
	err := h.db.QueryRowContext(r.Context(), `
		SELECT email, full_name, webauthn_handle FROM app_users WHERE id = $1 AND is_active = true
	`, userID).Scan(&email, &fullName, &handle)
	if err != nil {
		return nil, err
	}
	if len(handle) == 0 {
		handle = make([]byte, 32)
		if _, err := rand.Read(handle); err != nil {
			return nil, err
		}
		if _, err := h.db.ExecContext(r.Context(), `
			UPDATE app_users SET webauthn_handle = $1 WHERE id = $2 AND webauthn_handle IS NULL
		`, handle, userID); err != nil {
			return nil, err
		}
		_ = h.db.QueryRowContext(r.Context(), `
			SELECT webauthn_handle FROM app_users WHERE id = $1
		`, userID).Scan(&handle)
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT credential_id, public_key, attestation_type, transport, sign_count,
		       backup_eligible, backup_state
		FROM webauthn_credentials WHERE user_id = $1
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	creds := make([]webauthn.Credential, 0)
	for rows.Next() {
		var (
			credID, pubKey         []byte
			attType, transport     string
			signCount              uint32
			backupElig, backupState bool
		)
		if err := rows.Scan(&credID, &pubKey, &attType, &transport, &signCount, &backupElig, &backupState); err != nil {
			return nil, err
		}
		var transports []protocol.AuthenticatorTransport
		if transport != "" {
			for _, t := range strings.Split(transport, ",") {
				t = strings.TrimSpace(t)
				if t != "" {
					transports = append(transports, protocol.AuthenticatorTransport(t))
				}
			}
		}
		creds = append(creds, webauthn.Credential{
			ID:              credID,
			PublicKey:       pubKey,
			AttestationType: attType,
			Transport:       transports,
			Flags: webauthn.CredentialFlags{
				UserPresent:    true,
				UserVerified:   true,
				BackupEligible: backupElig,
				BackupState:    backupState,
			},
			Authenticator: webauthn.Authenticator{SignCount: signCount},
		})
	}

	display := fullName
	if display == "" {
		display = email
	}
	return &passkeyUser{
		id:          userID,
		name:        email,
		displayName: display,
		handle:      handle,
		creds:       creds,
	}, nil
}

func (h *Handler) resolveLoginUserID(r *http.Request, tenantSlug, email, username string) (int, error) {
	var userID int
	var err error
	if tenantSlug == "" || tenantSlug == "platform" {
		err = h.db.QueryRowContext(r.Context(), `
			SELECT id FROM app_users
			WHERE tenant_id IS NULL AND is_active = true
			  AND ((CAST($1 AS TEXT) <> '' AND email = $1) OR (CAST($2 AS TEXT) <> '' AND username = $2))
		`, email, username).Scan(&userID)
	} else {
		err = h.db.QueryRowContext(r.Context(), `
			SELECT u.id FROM app_users u
			JOIN tenants t ON t.id = u.tenant_id
			WHERE t.slug = $3 AND t.is_active = true AND u.is_active = true
			  AND ((CAST($1 AS TEXT) <> '' AND u.email = $1) OR (CAST($2 AS TEXT) <> '' AND u.username = $2))
		`, email, username, tenantSlug).Scan(&userID)
	}
	if err != nil {
		return 0, err
	}
	return userID, nil
}

func (h *Handler) lookupUserByHandle(r *http.Request, handle []byte) (int, error) {
	var userID int
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id FROM app_users WHERE webauthn_handle = $1 AND is_active = true
	`, handle).Scan(&userID)
	return userID, err
}

func (h *Handler) lookupUserByWebAuthn(r *http.Request, credentialID, userHandle []byte) (int, error) {
	var userID int
	if len(userHandle) > 0 {
		if err := h.db.QueryRowContext(r.Context(), `
			SELECT id FROM app_users WHERE webauthn_handle = $1 AND is_active = true
		`, userHandle).Scan(&userID); err == nil {
			return userID, nil
		}
	}
	err := h.db.QueryRowContext(r.Context(), `
		SELECT user_id FROM webauthn_credentials WHERE credential_id = $1
	`, credentialID).Scan(&userID)
	if err != nil {
		return 0, errors.New("unknown passkey")
	}
	return userID, nil
}
