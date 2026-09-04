package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/lib/pq"

	"PMAS/internal/domain/chat"
)

// --- Chat search ---

func (r *MessageRepo) SearchMessages(ctx context.Context, companyID, employeeID uuid.UUID, q chat.SearchQuery) ([]chat.SearchHit, string, error) {
	q = q.Normalize()
	if utf8.RuneCountInString(q.Query) < chat.SearchMinQueryLength {
		return nil, "", chat.ErrSearchQueryTooShort
	}

	args := []any{companyID, employeeID, q.Query, "%" + q.Query + "%"}
	where := `
		m.company_id = $1
		AND m.deleted_at IS NULL
		AND cm.employee_id = $2
		AND cm.left_at IS NULL
		AND cm.company_id = m.company_id
		AND m.content ILIKE $4`

	if q.ConversationID != nil && *q.ConversationID != uuid.Nil {
		where += fmt.Sprintf(` AND m.conversation_id = $%d`, len(args)+1)
		args = append(args, *q.ConversationID)
	}
	if q.SenderID != nil && *q.SenderID != uuid.Nil {
		where += fmt.Sprintf(` AND m.sender_id = $%d`, len(args)+1)
		args = append(args, *q.SenderID)
	}
	if q.Before != nil {
		where += fmt.Sprintf(` AND m.created_at < $%d`, len(args)+1)
		args = append(args, *q.Before)
	}
	if q.After != nil {
		where += fmt.Sprintf(` AND m.created_at > $%d`, len(args)+1)
		args = append(args, *q.After)
	}
	if q.Cursor != "" {
		cursorTime, cursorID, err := chat.DecodeCursor(q.Cursor)
		if err != nil {
			return nil, "", err
		}
		where += fmt.Sprintf(` AND (m.created_at, m.id) < ($%d, $%d)`, len(args)+1, len(args)+2)
		args = append(args, cursorTime, cursorID)
	}

	query := fmt.Sprintf(`
		SELECT m.id, m.conversation_id, m.sender_id,
			COALESCE(NULLIF(TRIM(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), ''), COALESCE(u.username, '')),
			m.content, m.message_type, m.created_at, m.edited_at, m.is_edited,
			m.parent_message_id, m.thread_root_id,
			COALESCE(similarity(m.content, $3), 0) AS score
		FROM messages m
		JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
		LEFT JOIN employees e ON e.id = m.sender_id AND e.company_id = m.company_id
		LEFT JOIN app_users u ON u.id = e.user_id
		WHERE %s
		ORDER BY m.created_at DESC, m.id DESC
		LIMIT $%d`, where, len(args)+1)
	args = append(args, q.Limit+1)

	rows, err := r.db.Q(ctx).QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	out := make([]chat.SearchHit, 0, q.Limit)
	for rows.Next() {
		var h chat.SearchHit
		var senderName sql.NullString
		if err := rows.Scan(
			&h.MessageID, &h.ConversationID, &h.SenderID, &senderName,
			&h.Content, &h.MessageType, &h.CreatedAt, &h.EditedAt, &h.IsEdited,
			&h.ParentMessageID, &h.ThreadRootID, &h.Score,
		); err != nil {
			return nil, "", err
		}
		if senderName.Valid {
			h.SenderName = senderName.String
		}
		h.Snippet = snippetAround(h.Content, q.Query, 120)
		out = append(out, h)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	var next string
	if len(out) > q.Limit {
		out = out[:q.Limit]
		last := out[len(out)-1]
		next, err = chat.EncodeCursor(last.CreatedAt, last.MessageID)
		if err != nil {
			return nil, "", err
		}
	}
	return out, next, nil
}

func snippetAround(content, query string, maxLen int) string {
	content = strings.TrimSpace(content)
	if content == "" {
		return ""
	}
	runes := []rune(content)
	if maxLen < 8 {
		maxLen = 8
	}
	lowerContent := strings.ToLower(content)
	lowerQuery := strings.ToLower(query)
	byteIdx := strings.Index(lowerContent, lowerQuery)
	if byteIdx < 0 {
		if len(runes) <= maxLen {
			return content
		}
		return string(runes[:maxLen-1]) + "…"
	}
	start := utf8.RuneCountInString(content[:byteIdx])
	pad := maxLen / 3
	from := start - pad
	if from < 0 {
		from = 0
	}
	to := from + maxLen
	if to > len(runes) {
		to = len(runes)
		from = to - maxLen
		if from < 0 {
			from = 0
		}
	}
	out := string(runes[from:to])
	if from > 0 {
		out = "…" + out
	}
	if to < len(runes) {
		out += "…"
	}
	return out
}

// --- Mentions ---

type MentionRepo struct{ db *DB }

func NewMentionRepo(db *DB) *MentionRepo { return &MentionRepo{db: db} }

func (r *MentionRepo) ReplaceMentions(ctx context.Context, companyID, messageID uuid.UUID, mentions []chat.MessageMention) error {
	if _, err := r.db.Q(ctx).ExecContext(ctx, `
		DELETE FROM message_mentions WHERE company_id=$1 AND message_id=$2`, companyID, messageID); err != nil {
		return err
	}
	for _, m := range mentions {
		if m.ID == uuid.Nil {
			m.ID = uuid.New()
		}
		if m.CreatedAt.IsZero() {
			m.CreatedAt = time.Now().UTC()
		}
		if _, err := r.db.Q(ctx).ExecContext(ctx, `
			INSERT INTO message_mentions (id, company_id, message_id, mentioned_employee_id, mention_type, created_at)
			VALUES ($1,$2,$3,$4,$5,$6)`,
			m.ID, companyID, messageID, m.MentionedEmployeeID, m.MentionType, m.CreatedAt); err != nil {
			return err
		}
	}
	return nil
}

func (r *MentionRepo) ListMentionsByMessage(ctx context.Context, companyID, messageID uuid.UUID) ([]chat.MessageMention, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, message_id, mentioned_employee_id, mention_type, created_at
		FROM message_mentions WHERE company_id=$1 AND message_id=$2`, companyID, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]chat.MessageMention, 0)
	for rows.Next() {
		var m chat.MessageMention
		if err := rows.Scan(&m.ID, &m.CompanyID, &m.MessageID, &m.MentionedEmployeeID, &m.MentionType, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ResolveMentionables maps lowercase username tokens to employee IDs that are
// active members of the conversation in the same company.
func (r *MentionRepo) ResolveMentionables(ctx context.Context, companyID, conversationID uuid.UUID, tokens []string) (map[string]uuid.UUID, error) {
	out := map[string]uuid.UUID{}
	if len(tokens) == 0 {
		return out, nil
	}
	normalized := make([]string, 0, len(tokens))
	seen := map[string]struct{}{}
	for _, t := range tokens {
		t = strings.ToLower(strings.TrimSpace(t))
		if t == "" {
			continue
		}
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		normalized = append(normalized, t)
	}
	if len(normalized) == 0 {
		return out, nil
	}

	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT LOWER(u.username), e.id
		FROM employees e
		JOIN app_users u ON u.id = e.user_id
		JOIN conversation_members cm ON cm.employee_id = e.id AND cm.conversation_id = $2 AND cm.left_at IS NULL
		WHERE e.company_id = $1 AND e.status = 'ACTIVE'
			AND u.username IS NOT NULL AND LOWER(u.username) = ANY($3)`,
		companyID, conversationID, pq.Array(normalized))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var uname string
		var empID uuid.UUID
		if err := rows.Scan(&uname, &empID); err != nil {
			return nil, err
		}
		out[uname] = empID
	}
	return out, rows.Err()
}
