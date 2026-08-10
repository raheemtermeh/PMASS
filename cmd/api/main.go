package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"time"

	_ "github.com/lib/pq"

	"github.com/go-webauthn/webauthn/webauthn"

	"PMAS/internal/auth"
	"PMAS/internal/config"
	"PMAS/internal/database"
	httpapi "PMAS/internal/delivery/http"
	"PMAS/internal/handlers"
	"PMAS/internal/logging"
	"PMAS/internal/middleware"
)

func main() {
	config.LoadDotEnv(".env")
	cfg := config.Load()
	logging.Init(cfg.AppEnv)

	logging.Info("bootstrap_start", "env", cfg.AppEnv, "port", cfg.ServerPort)

	auth.ConfigureJWTSecret(cfg.JWTSecret)
	if err := auth.InitEncryption(cfg.EncryptionKey); err != nil {
		logging.Fatal("encryption_init_failed", "error", err.Error())
	}
	logging.Info("config_loaded", "env", cfg.AppEnv, "port", cfg.ServerPort)

	db, err := sql.Open("postgres", cfg.SupabaseDBURL)
	if err != nil {
		logging.Fatal("sql_driver_init_failed", "error", err.Error())
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	logging.Info("database_connecting")
	if err := db.Ping(); err != nil {
		logging.Fatal("database_unreachable", "error", err.Error())
	}
	logging.Info("database_connected")

	if err := database.EnsureSchema(db); err != nil {
		logging.Fatal("schema_migration_failed", "error", err.Error())
	}
	defer db.Close()

	wa, err := webauthn.New(&webauthn.Config{
		RPID:          cfg.WebAuthnRPID,
		RPDisplayName: cfg.WebAuthnRPDisplay,
		RPOrigins:     cfg.WebAuthnRPOrigins,
	})
	if err != nil {
		logging.Fatal("webauthn_init_failed", "error", err.Error())
	}
	logging.Info("webauthn_ready", "rp_id", cfg.WebAuthnRPID, "origins", cfg.WebAuthnRPOrigins)

	// Until SMTP exists, non-production forgot-password may return the reset token to the UI.
	h := handlers.NewHandler(db, wa, cfg.AppEnv != "production")
	authz := middleware.NewAuthenticator(db)
	mux := http.NewServeMux()

	mux.HandleFunc("/api/v1/auth/status", h.GetAuthStatus)
	mux.HandleFunc("/api/v1/auth/bootstrap", h.Bootstrap)
	mux.HandleFunc("/api/v1/auth/login", h.Login)
	mux.HandleFunc("/api/v1/auth/refresh", h.Refresh)
	mux.HandleFunc("/api/v1/auth/logout", h.Logout)
	mux.HandleFunc("/api/v1/auth/forgot-password", h.ForgotPassword)
	mux.HandleFunc("/api/v1/auth/reset-password", h.ResetPassword)
	mux.HandleFunc("/api/v1/auth/change-password", authz.RequireAuth(h.ChangePassword))
	mux.HandleFunc("/api/v1/auth/me", authz.RequireAuth(h.GetMe))
	mux.HandleFunc("/api/v1/auth/profile", authz.RequireAuth(h.GetMe))
	mux.HandleFunc("/api/v1/auth/permissions", authz.RequireAuth(h.GetPermissionsCatalog))

	// Passkeys: login begin/finish are public; register/list/delete require auth.
	mux.HandleFunc("/api/v1/auth/passkeys/login/begin", h.HandlePasskeys)
	mux.HandleFunc("/api/v1/auth/passkeys/login/finish", h.HandlePasskeys)
	mux.HandleFunc("/api/v1/auth/passkeys/register/begin", authz.RequireAuth(h.HandlePasskeys))
	mux.HandleFunc("/api/v1/auth/passkeys/register/finish", authz.RequireAuth(h.HandlePasskeys))
	mux.HandleFunc("/api/v1/auth/passkeys", authz.RequireAuth(h.HandlePasskeys))
	mux.HandleFunc("/api/v1/auth/passkeys/", authz.RequireAuth(h.HandlePasskeys))

	mux.HandleFunc("/api/v1/access-requests", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			h.HandleAccessRequests(w, r)
			return
		}
		authz.RequireAuth(h.HandleAccessRequests)(w, r)
	})
	mux.HandleFunc("/api/v1/access-requests/", authz.RequireAuth(h.HandleAccessRequests))
	// Public so the request form can tell an applicant their Company ID is free
	// before they submit; it reveals nothing beyond slug availability.
	mux.HandleFunc("/api/v1/company-id-available", h.CheckCompanyID)

	mux.HandleFunc("/api/v1/tenants", authz.RequireAuth(h.HandleTenants))
	mux.HandleFunc("/api/v1/tenants/", authz.RequireAuth(h.HandleTenants))

	mux.HandleFunc("/api/v1/users", authz.RequirePermission(auth.PermUsers, h.HandleUsers))
	mux.HandleFunc("/api/v1/users/", authz.RequirePermission(auth.PermUsers, h.HandleUsers))

	mux.HandleFunc("/api/v1/graph/topology", authz.RequirePermission(auth.PermGraphView, h.GetTopology))
	mux.HandleFunc("/api/v1/graph/members", authz.RequirePermission(auth.PermGraphView, h.HandleTeamMembers))
	mux.HandleFunc("/api/v1/graph/members/", authz.RequirePermission(auth.PermGraphView, h.HandleTeamMembers))
	mux.HandleFunc("/api/v1/graph/edges", authz.RequirePermission(auth.PermGraphView, h.HandleGraphEdges))
	mux.HandleFunc("/api/v1/graph/edges/", authz.RequirePermission(auth.PermGraphView, h.HandleGraphEdges))

	mux.HandleFunc("/api/v1/uiux/tokens", authz.RequirePermission(auth.PermUIUX, h.HandleUIUXTokens))
	mux.HandleFunc("/api/v1/uiux/tokens/", authz.RequirePermission(auth.PermUIUX, h.HandleUIUXTokens))
	mux.HandleFunc("/api/v1/uiux/assets", authz.RequirePermission(auth.PermUIUX, h.HandleUIAssets))
	mux.HandleFunc("/api/v1/uiux/assets/", authz.RequirePermission(auth.PermUIUX, h.HandleUIAssets))
	mux.HandleFunc("/api/v1/uiux/assets/push", authz.RequirePermission(auth.PermUIUX, h.PushAsset))

	mux.HandleFunc("/api/v1/engineering/subsystems", authz.RequirePermission(auth.PermEngineering, h.HandleEngineeringSubsystems))
	mux.HandleFunc("/api/v1/engineering/subsystems/", authz.RequirePermission(auth.PermEngineering, h.HandleEngineeringSubsystems))
	mux.HandleFunc("/api/v1/engineering/pipeline/trigger", authz.RequirePermission(auth.PermEngineering, h.TriggerPipeline))

	mux.HandleFunc("/api/v1/marketing/campaigns", authz.RequirePermission(auth.PermMarketing, h.HandleMarketingCampaigns))
	mux.HandleFunc("/api/v1/marketing/campaigns/", authz.RequirePermission(auth.PermMarketing, h.HandleMarketingCampaigns))

	mux.HandleFunc("/api/v1/operations/resolve", authz.RequirePermission(auth.PermExecutive, h.ResolveOperation))
	mux.HandleFunc("/api/v1/operations/items", authz.RequirePermission(auth.PermExecutive, h.HandleOperationsItems))
	mux.HandleFunc("/api/v1/operations/items/", authz.RequirePermission(auth.PermExecutive, h.HandleOperationsItems))

	mux.HandleFunc("/api/v1/finance/entries", authz.RequirePermission(auth.PermFinance, h.HandleFinanceEntries))
	mux.HandleFunc("/api/v1/finance/entries/", authz.RequirePermission(auth.PermFinance, h.HandleFinanceEntries))

	mux.HandleFunc("/api/v1/legalhr/controls", authz.RequirePermission(auth.PermLegalHR, h.HandleComplianceControls))
	mux.HandleFunc("/api/v1/legalhr/controls/", authz.RequirePermission(auth.PermLegalHR, h.HandleComplianceControls))

	mux.HandleFunc("/api/v1/infrastructure/nodes", authz.RequirePermission(auth.PermInfrastructure, h.HandleInfraNodes))
	mux.HandleFunc("/api/v1/infrastructure/nodes/", authz.RequirePermission(auth.PermInfrastructure, h.HandleInfraNodes))

	mux.HandleFunc("/api/v1/credentials", authz.RequirePermission(auth.PermSettings, h.HandleCredentials))

	mux.HandleFunc("/api/v1/work-items", authz.RequireAuth(h.HandleSectionWorkItems))
	mux.HandleFunc("/api/v1/work-items/", authz.RequireAuth(h.HandleSectionWorkItems))

	mux.HandleFunc("/api/v1/ui-layouts/", authz.RequireAuth(h.HandleUILayouts))

	// Value Stream Management (Product-domain) — Backend Analysis Document
	vsm := httpapi.NewDependencies(db)
	vsm.Register(mux, authz)

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if err := db.Ping(); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprintf(w, `{"status":"DOWN"}`)
			return
		}
		fmt.Fprintf(w, `{"status":"UP"}`)
	})

	// Outer request log wraps security so 403/429 from security are still recorded.
	handler := middleware.WithRequestLog(middleware.WithSecurity(middleware.SecurityOptions{
		AllowedOrigins: cfg.CORSOrigins,
	}, mux))

	serverAddr := ":" + cfg.ServerPort
	server := &http.Server{
		Addr:              serverAddr,
		Handler:           handler,
		WriteTimeout:      30 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       60 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	logging.Info("service_online", "addr", "http://localhost"+serverAddr)
	if err := server.ListenAndServe(); err != nil {
		logging.Fatal("service_halted", "error", err.Error())
	}
}
