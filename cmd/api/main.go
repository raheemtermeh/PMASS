package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"time"

	_ "github.com/lib/pq"

	"PMAS/internal/config"
	"PMAS/internal/handlers"
)

func main() {
	log.Println("[Bootstrap] Starting PMAS API backend service...")

	// 1. Load configuration
	cfg := config.Load()
	log.Printf("[Bootstrap] Configuration loaded. Binding to port: %s\n", cfg.ServerPort)

	// 2. Establish connection to Supabase PostgreSQL database
	db, err := sql.Open("postgres", cfg.SupabaseDBURL)
	if err != nil {
		log.Fatalf("[Bootstrap] Fatal error: failed to initialize SQL driver: %v\n", err)
	}

	// 3. Configure robust connection pool parameters
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Test connection ping before proceeding
	log.Println("[Bootstrap] Connecting to database cluster...")
	err = db.Ping()
	if err != nil {
		log.Printf("[Bootstrap] WARNING: Database ping failed. DB URL may need substitution: %v\n", err)
	} else {
		log.Println("[Bootstrap] Database connection established successfully.")
	}
	defer db.Close()

	// 4. Initialize handler dependencies
	h := handlers.NewHandler(db)

	// 5. Register REST routes
	mux := http.NewServeMux()

	// API base paths
	mux.HandleFunc("/api/v1/graph/topology", h.GetTopology)
	mux.HandleFunc("/api/v1/uiux/tokens", h.GetTokens)
	mux.HandleFunc("/api/v1/uiux/assets/push", h.PushAsset)
	mux.HandleFunc("/api/v1/engineering/subsystems", h.GetSubsystems)
	mux.HandleFunc("/api/v1/engineering/pipeline/trigger", h.TriggerPipeline)
	mux.HandleFunc("/api/v1/marketing/campaigns", h.GetMarketingCampaigns)
	mux.HandleFunc("/api/v1/operations/resolve", h.ResolveOperation)
	mux.HandleFunc("/api/v1/operations/items", h.GetOperationsItems)
	mux.HandleFunc("/api/v1/credentials", h.HandleCredentials)

	// Health telemetry path
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"UP","timestamp":"%s"}\n`, time.Now().Format(time.RFC3339))
	})

	// Serve static frontend assets (HTML, CSS, JS) from workspace
	mux.Handle("/", http.FileServer(http.Dir("/Users/me_t/Desktop/code/PMAS")))

	serverAddr := ":" + cfg.ServerPort
	server := &http.Server{
		Addr:         serverAddr,
		Handler:      mux,
		WriteTimeout: 15 * time.Second,
		ReadTimeout:  15 * time.Second,
	}

	log.Printf("[Bootstrap] Service online. Listening on http://localhost%s\n", serverAddr)
	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("[Bootstrap] Service halted: %v\n", err)
	}
}
