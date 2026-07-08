package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"PMAS/internal/auth"
	"PMAS/internal/models"
)

// Handler coordinates data access layers and HTTP operations.
type Handler struct {
	db *sql.DB
}

// NewHandler initializes a controller instance.
func NewHandler(db *sql.DB) *Handler {
	return &Handler{db: db}
}

// setupResponse sets JSON content type. CORS/security headers are applied by middleware.
// Returns false if the request was a preflight OPTIONS check.
func (h *Handler) setupResponse(w http.ResponseWriter, r *http.Request) bool {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return false
	}
	return true
}

// Helper to construct slug format for team members matching JS expectations
func getMemberSlug(name string) string {
	switch name {
	case "Sarah Jenkins":
		return "sarah-j"
	case "Elena R.":
		return "elena-r"
	case "Marcus A.":
		return "marcus-a"
	case "DevOps Pod 3":
		return "devops-p3"
	case "Clara O.":
		return "clara-o"
	case "Finance Team":
		return "finance-team"
	case "Diana Prince":
		return "diana-p"
	default:
		// Fallback slugify logic
		slug := strings.ToLower(name)
		slug = strings.ReplaceAll(slug, " ", "-")
		slug = strings.ReplaceAll(slug, ".", "")
		return slug
	}
}

// GetTopology implements GET /api/v1/graph/topology
func (h *Handler) GetTopology(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Method not allowed"})
		return
	}

	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	nodes := make([]models.TopologyNode, 0)
	edges := make([]models.APIGraphEdge, 0)

	subRows, err := h.db.QueryContext(r.Context(), `
		SELECT id, name, slug, status, load_percentage FROM subsystems WHERE tenant_id = $1
	`, tenantID)
	if err != nil {
		log.Printf("Error querying subsystems: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Database query failed"})
		return
	}
	defer subRows.Close()

	for subRows.Next() {
		var sub models.Subsystem
		if err := subRows.Scan(&sub.ID, &sub.Name, &sub.Slug, &sub.Status, &sub.LoadPercentage); err != nil {
			log.Printf("Error scanning subsystem: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		nodes = append(nodes, models.TopologyNode{
			ID:      sub.Slug,
			Type:    "subsystem",
			Label:   sub.Name,
			Details: sub,
		})
	}

	memberRows, err := h.db.QueryContext(r.Context(), `
		SELECT id, name, avatar_url, role, subsystem_id, capacity_weight
		FROM team_members WHERE tenant_id = $1
	`, tenantID)
	if err != nil {
		log.Printf("Error querying team members: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Database query failed"})
		return
	}
	defer memberRows.Close()

	for memberRows.Next() {
		var m models.TeamMember
		if err := memberRows.Scan(&m.ID, &m.Name, &m.AvatarURL, &m.Role, &m.SubsystemID, &m.CapacityWeight); err != nil {
			log.Printf("Error scanning team member: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		slug := getMemberSlug(m.Name)
		nodes = append(nodes, models.TopologyNode{
			ID:      slug,
			Type:    "member",
			Label:   m.Name,
			Details: m,
		})
	}

	edgeRows, err := h.db.QueryContext(r.Context(), `
		SELECT e.id, e.edge_type, e.weight, s.slug, t.slug
		FROM graph_edges e
		JOIN subsystems s ON e.source_id = s.id
		JOIN subsystems t ON e.target_id = t.id
		WHERE e.tenant_id = $1
	`, tenantID)
	if err != nil {
		log.Printf("Error querying graph edges: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Database query failed"})
		return
	}
	defer edgeRows.Close()

	for edgeRows.Next() {
		var id int
		var edgeType, sourceSlug, targetSlug string
		var weight float64
		if err := edgeRows.Scan(&id, &edgeType, &weight, &sourceSlug, &targetSlug); err != nil {
			log.Printf("Error scanning edge: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		edges = append(edges, models.APIGraphEdge{
			ID:       id,
			From:     sourceSlug,
			To:       targetSlug,
			EdgeType: edgeType,
			Weight:   weight,
		})
	}

	json.NewEncoder(w).Encode(models.TopologyResponse{Nodes: nodes, Edges: edges})
}

// GetTokens implements GET /api/v1/uiux/tokens
func (h *Handler) GetTokens(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT category, token_data FROM design_tokens WHERE tenant_id = $1
	`, tenantID)
	if err != nil {
		log.Printf("Error querying design tokens: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	tokens := make(map[string]json.RawMessage)
	for rows.Next() {
		var category string
		var tokenData []byte
		if err := rows.Scan(&category, &tokenData); err != nil {
			log.Printf("Error scanning token: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		tokens[category] = json.RawMessage(tokenData)
	}

	json.NewEncoder(w).Encode(tokens)
}

// PushAsset implements POST /api/v1/uiux/assets/push
func (h *Handler) PushAsset(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req models.AssetPushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	if req.AssetName == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "asset_name is required"})
		return
	}

	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		UPDATE ui_assets SET cdn_status = 'Live' WHERE name = $1 AND tenant_id = $2
	`, req.AssetName, tenantID)
	if err != nil {
		log.Printf("Error updating asset CDN status: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Asset not found"})
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": "Asset status updated to 'Live on CDN'.",
	})
}

// GetSubsystems implements GET /api/v1/engineering/subsystems
func (h *Handler) GetSubsystems(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, name, slug, status, load_percentage
		FROM subsystems WHERE tenant_id = $1 ORDER BY id
	`, tenantID)
	if err != nil {
		log.Printf("Error querying subsystems: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	subsystems := make([]models.Subsystem, 0)
	for rows.Next() {
		var sub models.Subsystem
		if err := rows.Scan(&sub.ID, &sub.Name, &sub.Slug, &sub.Status, &sub.LoadPercentage); err != nil {
			log.Printf("Error scanning subsystem: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		subsystems = append(subsystems, sub)
	}

	json.NewEncoder(w).Encode(subsystems)
}

// TriggerPipeline implements POST /api/v1/engineering/pipeline/trigger
func (h *Handler) TriggerPipeline(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req models.PipelineTriggerRequest
	// Support parsing from JSON body or URL query parameter
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
			return
		}
	} else {
		subIDStr := r.URL.Query().Get("subsystem_id")
		if subIDStr != "" {
			if id, err := strconv.Atoi(subIDStr); err == nil {
				req.SubsystemID = id
			}
		}
	}

	if req.SubsystemID == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "subsystem_id is required"})
		return
	}

	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var owned int
	if err := h.db.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM subsystems WHERE id = $1 AND tenant_id = $2
	`, req.SubsystemID, tenantID).Scan(&owned); err != nil || owned == 0 {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Subsystem not found"})
		return
	}

	var ticketCode, title, description, severity string
	err := h.db.QueryRowContext(r.Context(), `
		SELECT ticket_code, title, description, severity 
		FROM operational_items 
		WHERE origin_subsystem_id = $1 
		  AND tenant_id = $2
		  AND type = 'blocker' 
		  AND status NOT IN ('Resolved', 'Completed') 
		LIMIT 1
	`, req.SubsystemID, tenantID).Scan(&ticketCode, &title, &description, &severity)

	if err == nil {
		// Blocker exists: compile halts, return 400 with AI Root Cause Analysis (RCA) log payload
		rcaDesc := "No description provided."
		if description != "" {
			rcaDesc = description
		}

		rca := &models.RCADetails{
			BlockerTicket: ticketCode,
			Summary:       title,
			RootCause:     "Compilation halted due to unresolved " + severity + " blocker: " + rcaDesc,
			Remediation:   "Resolve ticket " + ticketCode + " via Operations resolution workflow to unlock the CI pipeline.",
			AIConfidence:  0.96,
		}

		response := models.PipelineTriggerResponse{
			Status:  "Failed",
			Message: "Compilation halted: active blocker identified on subsystem ID " + strconv.Itoa(req.SubsystemID),
			RCA:     rca,
		}

		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	} else if err != sql.ErrNoRows {
		log.Printf("Error checking active blockers: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	// No active blockers: simulation successful
	response := models.PipelineTriggerResponse{
		Status:  "Success",
		Message: "CI/CD compiler pipeline execution successful. All assets, tests, and build packages resolved successfully.",
	}
	json.NewEncoder(w).Encode(response)
}

// GetMarketingCampaigns implements GET /api/v1/marketing/campaigns
func (h *Handler) GetMarketingCampaigns(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT c.id, c.name, c.leads, c.conversion, c.spend, c.status, c.dependent_subsystem_id, COALESCE(s.status, 'healthy')
		FROM marketing_campaigns c
		LEFT JOIN subsystems s ON c.dependent_subsystem_id = s.id AND s.tenant_id = c.tenant_id
		WHERE c.tenant_id = $1
		ORDER BY c.id
	`, tenantID)
	if err != nil {
		log.Printf("Error querying campaigns: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	campaigns := make([]models.MarketingCampaign, 0)
	for rows.Next() {
		var c models.MarketingCampaign
		if err := rows.Scan(&c.ID, &c.Name, &c.Leads, &c.Conversion, &c.Spend, &c.Status, &c.DependentSubsystemID, &c.DependentSubsysStatus); err != nil {
			log.Printf("Error scanning campaign: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		campaigns = append(campaigns, c)
	}

	json.NewEncoder(w).Encode(campaigns)
}

// ResolveOperation implements POST /api/v1/operations/resolve
func (h *Handler) ResolveOperation(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req models.OperationsResolveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	if req.TicketCode == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "ticket_code is required"})
		return
	}

	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		log.Printf("Error starting transaction: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var originSubsystemID int
	err = tx.QueryRowContext(r.Context(), `
		SELECT origin_subsystem_id 
		FROM operational_items 
		WHERE ticket_code = $1 AND tenant_id = $2 AND type = 'blocker' AND status NOT IN ('Resolved', 'Completed')
	`, req.TicketCode, tenantID).Scan(&originSubsystemID)

	if err == sql.ErrNoRows {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "No active blocker found with ticket code " + req.TicketCode})
		return
	} else if err != nil {
		log.Printf("Error querying blocker details: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	_, err = tx.ExecContext(r.Context(), `
		UPDATE operational_items 
		SET status = 'Resolved', completed_at = CURRENT_TIMESTAMP 
		WHERE ticket_code = $1 AND tenant_id = $2 AND type = 'blocker'
	`, req.TicketCode, tenantID)
	if err != nil {
		log.Printf("Error resolving blocker: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	var remainingBlockers int
	err = tx.QueryRowContext(r.Context(), `
		SELECT COUNT(*) 
		FROM operational_items 
		WHERE origin_subsystem_id = $1 
		  AND tenant_id = $2
		  AND type = 'blocker' 
		  AND status NOT IN ('Resolved', 'Completed')
	`, originSubsystemID, tenantID).Scan(&remainingBlockers)
	if err != nil {
		log.Printf("Error checking remaining blockers: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	newStatus := "blocked"
	loadDecrement := 10
	if remainingBlockers == 0 {
		newStatus = "healthy"
		loadDecrement = 30
	}

	_, err = tx.ExecContext(r.Context(), `
		UPDATE subsystems 
		SET status = $1, load_percentage = GREATEST(0, load_percentage - $2) 
		WHERE id = $3 AND tenant_id = $4
	`, newStatus, loadDecrement, originSubsystemID, tenantID)
	if err != nil {
		log.Printf("Error updating origin subsystem: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	rows, err := tx.QueryContext(r.Context(), `
		SELECT target_id 
		FROM graph_edges 
		WHERE source_id = $1 AND tenant_id = $2 AND edge_type = 'subsystem_dependency'
	`, originSubsystemID, tenantID)
	if err != nil {
		log.Printf("Error querying downstream subsystems: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var downstreamIDs []int
	for rows.Next() {
		var tid int
		if err := rows.Scan(&tid); err != nil {
			log.Printf("Error scanning target subsystem: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		downstreamIDs = append(downstreamIDs, tid)
	}

	for _, targetID := range downstreamIDs {
		var targetBlockers int
		err = tx.QueryRowContext(r.Context(), `
			SELECT COUNT(*) 
			FROM operational_items 
			WHERE origin_subsystem_id = $1 
			  AND tenant_id = $2
			  AND type = 'blocker' 
			  AND status NOT IN ('Resolved', 'Completed')
		`, targetID, tenantID).Scan(&targetBlockers)
		if err != nil {
			log.Printf("Error checking target blockers: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		targetStatus := "blocked"
		targetDecrement := 10
		if targetBlockers == 0 {
			targetStatus = "healthy"
			targetDecrement = 20
		}

		_, err = tx.ExecContext(r.Context(), `
			UPDATE subsystems 
			SET status = $1, load_percentage = GREATEST(0, load_percentage - $2) 
			WHERE id = $3 AND tenant_id = $4
		`, targetStatus, targetDecrement, targetID, tenantID)
		if err != nil {
			log.Printf("Error updating downstream subsystem: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("Error committing transaction: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	subsystems := make([]models.Subsystem, 0)
	updatedRows, err := h.db.QueryContext(r.Context(), `
		SELECT id, name, slug, status, load_percentage
		FROM subsystems
		WHERE tenant_id = $1 AND (
			id = $2 OR id IN (SELECT target_id FROM graph_edges WHERE source_id = $2 AND tenant_id = $1)
		)
	`, tenantID, originSubsystemID)
	if err == nil {
		defer updatedRows.Close()
		for updatedRows.Next() {
			var sub models.Subsystem
			if err := updatedRows.Scan(&sub.ID, &sub.Name, &sub.Slug, &sub.Status, &sub.LoadPercentage); err == nil {
				subsystems = append(subsystems, sub)
			}
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":              "success",
		"message":             "Blocker " + req.TicketCode + " resolved. Recalculated topology load levels cascading safely.",
		"affected_subsystems": subsystems,
	})
}

// GetOperationsItems implements GET /api/v1/operations/items
func (h *Handler) GetOperationsItems(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, ticket_code, title, description, type, severity, status, origin_subsystem_id, assigned_to, linked_pr, created_at, completed_at 
		FROM operational_items 
		WHERE tenant_id = $1
		ORDER BY id
	`, tenantID)
	if err != nil {
		log.Printf("Error querying operational items: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]models.OperationalItem, 0)
	for rows.Next() {
		var item models.OperationalItem
		if err := rows.Scan(
			&item.ID, &item.TicketCode, &item.Title, &item.Description, &item.Type, &item.Severity,
			&item.Status, &item.OriginSubsystemID, &item.AssignedTo, &item.LinkedPR, &item.CreatedAt, &item.CompletedAt,
		); err != nil {
			log.Printf("Error scanning operational item: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		items = append(items, item)
	}

	json.NewEncoder(w).Encode(items)
}

// HandleCredentials routes requests for /api/v1/credentials based on HTTP method.
func (h *Handler) HandleCredentials(w http.ResponseWriter, r *http.Request) {
	if !h.setupResponse(w, r) {
		return
	}

	switch r.Method {
	case http.MethodGet:
		h.GetCredentials(w, r)
	case http.MethodPost, http.MethodPut:
		h.SaveCredential(w, r)
	case http.MethodDelete:
		h.DeleteCredential(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Method not allowed"})
	}
}

// GetCredentials retrieves all credentials with masked secret values.
func (h *Handler) GetCredentials(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, name, value, description, updated_at
		FROM credentials WHERE tenant_id = $1 ORDER BY name
	`, tenantID)
	if err != nil {
		log.Printf("Error querying credentials: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Database query failed"})
		return
	}
	defer rows.Close()

	credentials := make([]models.Credential, 0)
	for rows.Next() {
		var cred models.Credential
		if err := rows.Scan(&cred.ID, &cred.Name, &cred.Value, &cred.Description, &cred.UpdatedAt); err != nil {
			log.Printf("Error scanning credential: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		cred.Value = "••••••••"
		credentials = append(credentials, cred)
	}

	json.NewEncoder(w).Encode(credentials)
}

// SaveCredential creates or updates a credential.
func (h *Handler) SaveCredential(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	var req models.CredentialSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Credential name is required"})
		return
	}

	var id int
	var existingValue string
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, value FROM credentials WHERE name = $1 AND tenant_id = $2
	`, req.Name, tenantID).Scan(&id, &existingValue)

	if err == sql.ErrNoRows {
		if req.Value == "" || req.Value == "••••••••" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Credential value is required for new credentials"})
			return
		}

		encrypted, encErr := auth.EncryptSecret(req.Value)
		if encErr != nil {
			log.Printf("Error encrypting credential: %v", encErr)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to protect credential"})
			return
		}

		_, err = h.db.ExecContext(r.Context(), `
			INSERT INTO credentials (tenant_id, name, value, description, updated_at) 
			VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
		`, tenantID, req.Name, encrypted, req.Description)
		if err != nil {
			log.Printf("Error inserting credential: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to save credential"})
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Credential added successfully"})
		return
	} else if err != nil {
		log.Printf("Error querying existing credential: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if req.Value == "" || req.Value == "••••••••" {
		_, err = h.db.ExecContext(r.Context(), `
			UPDATE credentials 
			SET description = $1, updated_at = CURRENT_TIMESTAMP 
			WHERE id = $2 AND tenant_id = $3
		`, req.Description, id, tenantID)
	} else {
		encrypted, encErr := auth.EncryptSecret(req.Value)
		if encErr != nil {
			log.Printf("Error encrypting credential: %v", encErr)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Failed to protect credential"})
			return
		}
		_, err = h.db.ExecContext(r.Context(), `
			UPDATE credentials 
			SET value = $1, description = $2, updated_at = CURRENT_TIMESTAMP 
			WHERE id = $3 AND tenant_id = $4
		`, encrypted, req.Description, id, tenantID)
	}

	if err != nil {
		log.Printf("Error updating credential: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to update credential"})
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Credential updated successfully"})
}

// DeleteCredential removes a credential.
func (h *Handler) DeleteCredential(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := h.requireTenantID(w, r)
	if !ok {
		return
	}

	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "id parameter is required"})
		return
	}

	id, err := strconv.Atoi(idStr)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid id parameter"})
		return
	}

	result, err := h.db.ExecContext(r.Context(), `
		DELETE FROM credentials WHERE id = $1 AND tenant_id = $2
	`, id, tenantID)
	if err != nil {
		log.Printf("Error deleting credential: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to delete credential"})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Credential not found"})
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Credential deleted successfully"})
}

