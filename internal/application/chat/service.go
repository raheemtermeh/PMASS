package chatapp

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/auth"
	"PMAS/internal/domain/chat"
	"PMAS/internal/domain/shared"
	"PMAS/internal/domain/support"
	"PMAS/internal/infrastructure/postgres"
	"PMAS/internal/realtime"
)

// Service orchestrates chat use cases.
type Service struct {
	db        *postgres.DB
	conv      chat.ConversationRepository
	msg       chat.MessageRepository
	reaction  chat.ReactionRepository
	bookmark  chat.BookmarkRepository
	pin       chat.PinRepository
	mod       chat.ModerationRepository
	audit     chat.AuditRepository
	mentions  chat.MentionRepository
	notifs    support.NotificationRepository
	presence  chat.PresenceRepository
	drafts    chat.DraftRepository
	invites   chat.InvitationRepository
	metrics   *realtime.Metrics
	publisher EventPublisher

	messageRateRPM int
	rateMu         sync.Mutex
	rateBuckets    map[string][]time.Time
}

func NewService(
	db *postgres.DB,
	conv chat.ConversationRepository,
	msg chat.MessageRepository,
	reaction chat.ReactionRepository,
	bookmark chat.BookmarkRepository,
	pin chat.PinRepository,
	mod chat.ModerationRepository,
	audit chat.AuditRepository,
	messageRateRPM int,
	publisher EventPublisher,
) *Service {
	if messageRateRPM <= 0 {
		messageRateRPM = 30
	}
	if publisher == nil {
		publisher = NoopPublisher{}
	}
	return &Service{
		db:             db,
		conv:           conv,
		msg:            msg,
		reaction:       reaction,
		bookmark:       bookmark,
		pin:            pin,
		mod:            mod,
		audit:          audit,
		publisher:      publisher,
		messageRateRPM: messageRateRPM,
		rateBuckets:    map[string][]time.Time{},
	}
}

// WithMentions wires mention persistence (Phase 6).
func (s *Service) WithMentions(m chat.MentionRepository) *Service {
	s.mentions = m
	return s
}

// WithNotifications wires the shared notifications repository (Phase 6).
func (s *Service) WithNotifications(n support.NotificationRepository) *Service {
	s.notifs = n
	return s
}

// WithMetrics wires low-cardinality chat metrics.
func (s *Service) WithMetrics(m *realtime.Metrics) *Service {
	s.metrics = m
	return s
}

// WithPresence wires durable presence persistence (Phase 7).
func (s *Service) WithPresence(p chat.PresenceRepository) *Service {
	s.presence = p
	return s
}

// WithDrafts wires message draft persistence (Phase 7).
func (s *Service) WithDrafts(d chat.DraftRepository) *Service {
	s.drafts = d
	return s
}

// WithInvitations wires conversation invitations (Phase 8).
func (s *Service) WithInvitations(i chat.InvitationRepository) *Service {
	s.invites = i
	return s
}

// SetPublisher replaces the event publisher (used during wiring).
func (s *Service) SetPublisher(p EventPublisher) {
	if p == nil {
		p = NoopPublisher{}
	}
	s.publisher = p
}

// Actor is the authenticated chat participant.
type Actor struct {
	CompanyID  uuid.UUID
	EmployeeID uuid.UUID
	Role       string
	Perms      []string
}

func (a Actor) hasPerm(p string) bool {
	return auth.HasPermission(a.Role, a.Perms, p)
}

func (s *Service) ResolveEmployeeID(ctx context.Context, companyID uuid.UUID, userID int, hint string) (uuid.UUID, error) {
	if hint != "" {
		id, err := uuid.Parse(hint)
		if err == nil && id != uuid.Nil {
			ok, err := s.conv.EmployeeBelongsToCompany(ctx, companyID, id)
			if err != nil {
				return uuid.Nil, err
			}
			if ok {
				return id, nil
			}
		}
	}
	var employeeID uuid.UUID
	err := s.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id FROM employees WHERE company_id=$1 AND user_id=$2 AND status='ACTIVE' LIMIT 1`,
		companyID, userID).Scan(&employeeID)
	if err == nil {
		return employeeID, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return uuid.Nil, err
	}
	// Company admins (and other users) often exist without an employee row.
	// Chat identity is employee-scoped — provision/link one from app_users.
	id, err := s.ensureEmployeeForUser(ctx, companyID, userID)
	if err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

// ensureEmployeeForUser links an existing ACTIVE employee by email or creates one.
func (s *Service) ensureEmployeeForUser(ctx context.Context, companyID uuid.UUID, userID int) (uuid.UUID, error) {
	var email, fullName, firstName, lastName, jobTitle, phone sql.NullString
	err := s.db.Q(ctx).QueryRowContext(ctx, `
		SELECT email, full_name, first_name, last_name, job_title, phone
		FROM app_users WHERE id=$1 AND is_active=true`, userID).Scan(
		&email, &fullName, &firstName, &lastName, &jobTitle, &phone,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return uuid.Nil, shared.New("CHAT_EMPLOYEE_REQUIRED", "Employee profile required for chat", 403)
	}
	if err != nil {
		return uuid.Nil, err
	}
	if !email.Valid || strings.TrimSpace(email.String) == "" {
		return uuid.Nil, shared.New("CHAT_EMPLOYEE_REQUIRED", "Employee profile required for chat", 403)
	}
	mail := strings.TrimSpace(strings.ToLower(email.String))

	// Link unmatched employee with the same company email.
	var existing uuid.UUID
	err = s.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id FROM employees
		WHERE company_id=$1 AND LOWER(email)=$2 AND status='ACTIVE'
		LIMIT 1`, companyID, mail).Scan(&existing)
	if err == nil {
		if _, linkErr := s.db.Q(ctx).ExecContext(ctx, `
			UPDATE employees SET user_id=$1, updated_at=NOW()
			WHERE id=$2 AND company_id=$3 AND (user_id IS NULL OR user_id=$1)`,
			userID, existing, companyID); linkErr != nil {
			return uuid.Nil, linkErr
		}
		return existing, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return uuid.Nil, err
	}

	fn := strings.TrimSpace(firstName.String)
	ln := strings.TrimSpace(lastName.String)
	if fn == "" && ln == "" {
		parts := strings.Fields(strings.TrimSpace(fullName.String))
		if len(parts) == 0 {
			fn = mail
			ln = "User"
		} else if len(parts) == 1 {
			fn = parts[0]
			ln = "User"
		} else {
			fn = parts[0]
			ln = strings.Join(parts[1:], " ")
		}
	}
	if fn == "" {
		fn = "User"
	}
	if ln == "" {
		ln = "Account"
	}
	id := uuid.New()
	if _, err = s.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO employees (
			id, company_id, first_name, last_name, email, phone, job_title, status, user_id, version, created_at, updated_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,1,NOW(),NOW())
		ON CONFLICT (company_id, email) DO UPDATE
		SET user_id = EXCLUDED.user_id,
		    status = 'ACTIVE',
		    updated_at = NOW()`,
		id, companyID, fn, ln, mail, nullStr(phone), nullStr(jobTitle), userID,
	); err != nil {
		return uuid.Nil, err
	}
	var resolved uuid.UUID
	if err := s.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id FROM employees WHERE company_id=$1 AND user_id=$2 AND status='ACTIVE' LIMIT 1`,
		companyID, userID).Scan(&resolved); err != nil {
		return uuid.Nil, shared.New("CHAT_EMPLOYEE_REQUIRED", "Employee profile required for chat", 403)
	}
	return resolved, nil
}

func nullStr(v sql.NullString) string {
	if v.Valid {
		return strings.TrimSpace(v.String)
	}
	return ""
}

func (s *Service) requireMember(ctx context.Context, actor Actor, conversationID uuid.UUID) (*chat.ConversationMember, error) {
	m, err := s.conv.GetConversationMember(ctx, actor.CompanyID, conversationID, actor.EmployeeID)
	if err != nil {
		if errors.Is(err, chat.ErrMemberNotFound) {
			return nil, chat.ErrConversationNotFound
		}
		return nil, err
	}
	return m, nil
}

func (s *Service) canManageMembers(member *chat.ConversationMember, actor Actor) bool {
	if actor.hasPerm(auth.PermChatModerate) {
		return true
	}
	switch member.Role {
	case chat.MemberRoleOwner, chat.MemberRoleAdmin:
		return true
	default:
		return false
	}
}

func (s *Service) canModerate(actor Actor, member *chat.ConversationMember) bool {
	if actor.hasPerm(auth.PermChatModerate) {
		return true
	}
	if member != nil && (member.Role == chat.MemberRoleOwner || member.Role == chat.MemberRoleAdmin || member.Role == chat.MemberRoleModerator) {
		return true
	}
	return false
}

func (s *Service) canManageChannel(actor Actor, member *chat.ConversationMember) bool {
	if actor.hasPerm(auth.PermChatManageChannel) || actor.hasPerm(auth.PermChatModerate) {
		return true
	}
	if member != nil && (member.Role == chat.MemberRoleOwner || member.Role == chat.MemberRoleAdmin) {
		return true
	}
	return false
}

func (s *Service) appendAudit(ctx context.Context, companyID uuid.UUID, conversationID, actorID *uuid.UUID, action string, targetID *uuid.UUID, payload any) {
	var raw json.RawMessage
	if payload != nil {
		b, err := json.Marshal(payload)
		if err == nil {
			raw = b
		}
	}
	logEntry, err := chat.NewChatAuditLog(companyID, conversationID, actorID, action, targetID, raw)
	if err != nil {
		return
	}
	_ = s.audit.Append(ctx, logEntry)
}

func (s *Service) checkMessageRate(actor Actor) error {
	key := actor.CompanyID.String() + ":" + actor.EmployeeID.String()
	now := time.Now()
	window := time.Minute

	s.rateMu.Lock()
	defer s.rateMu.Unlock()
	times := s.rateBuckets[key]
	cutoff := now.Add(-window)
	filtered := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			filtered = append(filtered, t)
		}
	}
	if len(filtered) >= s.messageRateRPM {
		return shared.New("CHAT_RATE_LIMITED", "Message rate limit exceeded", 429)
	}
	filtered = append(filtered, now)
	s.rateBuckets[key] = filtered
	return nil
}

func previewText(content string) string {
	content = strings.TrimSpace(content)
	if len(content) > 255 {
		return content[:252] + "..."
	}
	return content
}

// MessagePage is a cursor-paginated message list response.
type MessagePage struct {
	Items      []chat.Message `json:"items"`
	NextCursor string         `json:"next_cursor,omitempty"`
	HasMore    bool           `json:"has_more"`
}

// ConversationPage is a cursor-paginated conversation list response.
type ConversationPage struct {
	Items      []chat.ConversationListItem `json:"items"`
	NextCursor string                      `json:"next_cursor,omitempty"`
	HasMore    bool                        `json:"has_more"`
}
