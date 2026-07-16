package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"time"

	_ "github.com/lib/pq"

	"PMAS/internal/auth"
	"PMAS/internal/config"
	"PMAS/internal/database"
	httpapi "PMAS/internal/delivery/http"
	"PMAS/internal/handlers"
	"PMAS/internal/middleware"
)

func main() {
	log.Println("[Bootstrap] Starting PMAS API backend service...")
	config.LoadDotEnv(".env")

	cfg := config.Load()
	auth.ConfigureJWTSecret(cfg.JWTSecret)
	if err := auth.InitEncryption(cfg.EncryptionKey); err != nil {
		log.Fatalf("[Bootstrap] Encryption init failed: %v\n", err)
	}
	log.Printf("[Bootstrap] Configuration loaded (env=%s). Binding to port: %s\n", cfg.AppEnv, cfg.ServerPort)

	db, err := sql.Open("postgres", cfg.SupabaseDBURL)
	if err != nil {
		log.Fatalf("[Bootstrap] Fatal error: failed to initialize SQL driver: %v\n", err)
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	log.Println("[Bootstrap] Connecting to database...")
	if err := db.Ping(); err != nil {
		log.Fatalf("[Bootstrap] Database unreachable: %v\nSet SUPABASE_DB_URL to your Supabase pooler session string (port 5432).\n", err)
	}
	log.Println("[Bootstrap] Database connection established.")

	if err := database.EnsureSchema(db); err != nil {
		log.Fatalf("[Bootstrap] Schema migration failed: %v\n", err)
	}
	defer db.Close()

	h := handlers.NewHandler(db)
	authz := middleware.NewAuthenticator(db)
	mux := http.NewServeMux()

	mux.HandleFunc("/api/v1/auth/status", h.GetAuthStatus)
	mux.HandleFunc("/api/v1/auth/bootstrap", h.Bootstrap)
	mux.HandleFunc("/api/v1/auth/login", h.Login)
	mux.HandleFunc("/api/v1/auth/me", authz.RequireAuth(h.GetMe))
	mux.HandleFunc("/api/v1/auth/profile", authz.RequireAuth(h.GetMe))
	mux.HandleFunc("/api/v1/auth/permissions", authz.RequireAuth(h.GetPermissionsCatalog))

	mux.HandleFunc("/api/v1/access-requests", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			h.HandleAccessRequests(w, r)
			return
		}
		authz.RequireAuth(h.HandleAccessRequests)(w, r)
	})
	mux.HandleFunc("/api/v1/access-requests/", authz.RequireAuth(h.HandleAccessRequests))

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

	handler := middleware.WithSecurity(middleware.SecurityOptions{
		AllowedOrigins: cfg.CORSOrigins,
	}, mux)

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

	log.Printf("[Bootstrap] Service online. Listening on http://localhost%s\n", serverAddr)
	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("[Bootstrap] Service halted: %v\n", err)
	}
}
