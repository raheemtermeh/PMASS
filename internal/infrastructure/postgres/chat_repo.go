package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"

	"PMAS/internal/domain/chat"
)

type ConversationRepo struct{ db *DB }

func NewConversationRepo(db *DB) *ConversationRepo { return &ConversationRepo{db: db} }

func (r *ConversationRepo) CreateConversation(ctx context.Context, c *chat.Conversation) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO conversations (
			id, company_id, type, name, slug, description, visibility, avatar_url,
			created_by, is_archived, last_message_id, last_message_at, last_message_preview, version,
			created_at, updated_at, deleted_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
		c.ID, c.CompanyID, c.Type, c.Name, nullIfEmpty(c.Slug), c.Description, nullIfEmpty(c.Visibility),
		c.AvatarURL, c.CreatedBy, c.IsArchived, c.LastMessageID, c.LastMessageAt, c.LastMessagePreview, c.Version,
		c.CreatedAt, c.UpdatedAt, c.DeletedAt,
	)
	return err
}

func (r *ConversationRepo) GetConversationByID(ctx context.Context, companyID, id uuid.UUID) (*chat.Conversation, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, type, name, COALESCE(slug,''), description, COALESCE(visibility,''),
			avatar_url, created_by, is_archived, last_message_id, last_message_at, last_message_preview,
			version, created_at, updated_at, deleted_at
		FROM conversations
		WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL`, companyID, id)
	return scanConversation(row)
}

func (r *ConversationRepo) AddConversationMember(ctx context.Context, m *chat.ConversationMember) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO conversation_members (
			id, company_id, conversation_id, employee_id, role, joined_at,
			last_read_at, last_read_message_id, is_muted, is_archived,
			notification_level, left_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		m.ID, m.CompanyID, m.ConversationID, m.EmployeeID, m.Role, m.JoinedAt,
		m.LastReadAt, m.LastReadMessageID, m.IsMuted, m.IsArchived,
		m.NotificationLevel, m.LeftAt,
	)
	return err
}

func (r *ConversationRepo) RemoveConversationMember(ctx context.Context, companyID, conversationID, employeeID uuid.UUID) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE conversation_members
		SET left_at=$1
		WHERE company_id=$2 AND conversation_id=$3 AND employee_id=$4 AND left_at IS NULL`,
		time.Now().UTC(), companyID, conversationID, employeeID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return chat.ErrMemberNotFound
	}
	return nil
}

func (r *ConversationRepo) GetConversationMember(ctx context.Context, companyID, conversationID, employeeID uuid.UUID) (*chat.ConversationMember, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, conversation_id, employee_id, role, joined_at,
			last_read_at, last_read_message_id, is_muted, is_archived, notification_level, left_at
		FROM conversation_members
		WHERE company_id=$1 AND conversation_id=$2 AND employee_id=$3 AND left_at IS NULL`,
		companyID, conversationID, employeeID)
	return scanConversationMember(row)
}

func (r *ConversationRepo) ListConversationMembers(ctx context.Context, companyID, conversationID uuid.UUID, limit int) ([]chat.ConversationMember, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, conversation_id, employee_id, role, joined_at,
			last_read_at, last_read_message_id, is_muted, is_archived, notification_level, left_at
		FROM conversation_members
		WHERE company_id=$1 AND conversation_id=$2 AND left_at IS NULL
		ORDER BY joined_at ASC
		LIMIT $3`, companyID, conversationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]chat.ConversationMember, 0)
	for rows.Next() {
		m, err := scanConversationMemberRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *m)
	}
	return out, rows.Err()
}

func (r *ConversationRepo) GetConversationBySlug(ctx context.Context, companyID uuid.UUID, slug string) (*chat.Conversation, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, type, name, COALESCE(slug,''), description, COALESCE(visibility,''),
			avatar_url, created_by, is_archived, last_message_id, last_message_at, last_message_preview,
			version, created_at, updated_at, deleted_at
		FROM conversations
		WHERE company_id=$1 AND slug=$2 AND deleted_at IS NULL`, companyID, slug)
	return scanConversation(row)
}

func (r *ConversationRepo) FindDMByMembers(ctx context.Context, companyID, employeeA, employeeB uuid.UUID) (*chat.Conversation, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT c.id, c.company_id, c.type, c.name, COALESCE(c.slug,''), c.description, COALESCE(c.visibility,''),
			c.avatar_url, c.created_by, c.is_archived, c.last_message_id, c.last_message_at, c.last_message_preview,
			c.version, c.created_at, c.updated_at, c.deleted_at
		FROM conversations c
		JOIN conversation_members m1 ON m1.conversation_id=c.id AND m1.employee_id=$2 AND m1.left_at IS NULL
		JOIN conversation_members m2 ON m2.conversation_id=c.id AND m2.employee_id=$3 AND m2.left_at IS NULL
		WHERE c.company_id=$1 AND c.type='DM' AND c.deleted_at IS NULL
		AND (SELECT COUNT(*) FROM conversation_members WHERE conversation_id=c.id AND left_at IS NULL)=2
		LIMIT 1`, companyID, employeeA, employeeB)
	return scanConversation(row)
}

func (r *ConversationRepo) ListConversationsForEmployee(ctx context.Context, companyID, employeeID uuid.UUID, cursor string, limit int) ([]chat.ConversationListItem, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	args := []any{companyID, employeeID, chat.UnreadCountCap}
	where := `c.company_id=$1 AND cm.employee_id=$2 AND cm.left_at IS NULL AND c.deleted_at IS NULL`
	order := `ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC`

	if cursor != "" {
		cursorTime, cursorID, err := chat.DecodeCursor(cursor)
		if err != nil {
			return nil, "", err
		}
		where += fmt.Sprintf(` AND (COALESCE(c.last_message_at, c.created_at), c.id) < ($%d, $%d)`, len(args)+1, len(args)+2)
		args = append(args, cursorTime, cursorID)
	}

	// Unread: bounded COUNT of non-self messages after the member's read cursor.
	// Uses idx_messages_conversation_cursor. Cap ($3) prevents full-history scans.
	query := fmt.Sprintf(`
		SELECT c.id, c.company_id, c.type, c.name, COALESCE(c.slug,''), c.description, COALESCE(c.visibility,''),
			c.avatar_url, c.created_by, c.is_archived, c.last_message_id, c.last_message_at, c.last_message_preview,
			c.version, c.created_at, c.updated_at, c.deleted_at,
			(SELECT COUNT(*) FROM conversation_members x WHERE x.conversation_id=c.id AND x.left_at IS NULL),
			cm.is_archived, cm.is_muted, cm.notification_level, cm.last_read_message_id, cm.last_read_at,
			(
				SELECT COUNT(*) FROM (
					SELECT 1 FROM messages m
					LEFT JOIN messages lr ON lr.id = cm.last_read_message_id
					WHERE m.company_id = c.company_id
						AND m.conversation_id = c.id
						AND m.deleted_at IS NULL
						AND (m.sender_id IS DISTINCT FROM $2)
						AND (
							cm.last_read_message_id IS NULL
							OR (m.created_at, m.id) > (lr.created_at, lr.id)
						)
					LIMIT $3
				) unread_cap
			)
		FROM conversations c
		JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.company_id=c.company_id
		WHERE %s
		%s
		LIMIT $%d`, where, order, len(args)+1)
	args = append(args, limit+1)

	rows, err := r.db.Q(ctx).QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	out := make([]chat.ConversationListItem, 0, limit)
	for rows.Next() {
		var item chat.ConversationListItem
		var slug, visibility sql.NullString
		if err := rows.Scan(
			&item.ID, &item.CompanyID, &item.Type, &item.Name, &slug, &item.Description, &visibility,
			&item.AvatarURL, &item.CreatedBy, &item.IsArchived, &item.LastMessageID, &item.LastMessageAt, &item.LastMessagePreview,
			&item.Version, &item.CreatedAt, &item.UpdatedAt, &item.DeletedAt,
			&item.MemberCount, &item.MemberIsArchived, &item.IsMuted, &item.NotificationLevel,
			&item.LastReadMessageID, &item.LastReadAt, &item.UnreadCount,
		); err != nil {
			return nil, "", err
		}
		if slug.Valid {
			item.Slug = slug.String
		}
		if visibility.Valid {
			item.Visibility = visibility.String
		}
		if item.UnreadCount >= int64(chat.UnreadCountCap) {
			item.UnreadIsCapped = true
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	var nextCursor string
	if len(out) > limit {
		out = out[:limit]
		last := out[len(out)-1]
		ts := last.CreatedAt
		if last.LastMessageAt != nil {
			ts = *last.LastMessageAt
		}
		nextCursor, err = chat.EncodeCursor(ts, last.ID)
		if err != nil {
			return nil, "", err
		}
	}
	return out, nextCursor, nil
}

func (r *ConversationRepo) UpdateConversation(ctx context.Context, companyID uuid.UUID, c *chat.Conversation) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE conversations
		SET name=$1, slug=$2, description=$3, visibility=$4, avatar_url=$5,
			version=version+1, updated_at=$6
		WHERE company_id=$7 AND id=$8 AND deleted_at IS NULL`,
		c.Name, nullIfEmpty(c.Slug), c.Description, nullIfEmpty(c.Visibility), c.AvatarURL,
		time.Now().UTC(), companyID, c.ID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return chat.ErrConversationNotFound
	}
	return nil
}

func (r *ConversationRepo) SetConversationArchived(ctx context.Context, companyID, id uuid.UUID, archived bool) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE conversations SET is_archived=$1, updated_at=$2
		WHERE company_id=$3 AND id=$4 AND deleted_at IS NULL`,
		archived, time.Now().UTC(), companyID, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return chat.ErrConversationNotFound
	}
	return nil
}

func (r *ConversationRepo) UpdateConversationPreview(ctx context.Context, companyID, conversationID uuid.UUID, lastMessageID uuid.UUID, preview string, at time.Time) error {
	if len(preview) > 255 {
		preview = preview[:252] + "..."
	}
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE conversations
		SET last_message_id=$1, last_message_at=$2, last_message_preview=$3, updated_at=$4
		WHERE company_id=$5 AND id=$6 AND deleted_at IS NULL`,
		lastMessageID, at, preview, time.Now().UTC(), companyID, conversationID)
	return err
}

func (r *ConversationRepo) ClearConversationPreview(ctx context.Context, companyID, conversationID uuid.UUID) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE conversations
		SET last_message_id=NULL, last_message_at=NULL, last_message_preview='', updated_at=$1
		WHERE company_id=$2 AND id=$3 AND deleted_at IS NULL`,
		time.Now().UTC(), companyID, conversationID)
	return err
}

func (r *ConversationRepo) UpdateMemberRole(ctx context.Context, companyID, conversationID, employeeID uuid.UUID, role string) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE conversation_members SET role=$1
		WHERE company_id=$2 AND conversation_id=$3 AND employee_id=$4 AND left_at IS NULL`,
		role, companyID, conversationID, employeeID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return chat.ErrMemberNotFound
	}
	return nil
}

func (r *ConversationRepo) UpdateMemberSettings(ctx context.Context, companyID, conversationID, employeeID uuid.UUID, isMuted *bool, isArchived *bool, notificationLevel *string) error {
	sets := make([]string, 0, 3)
	args := []any{}
	if isMuted != nil {
		args = append(args, *isMuted)
		sets = append(sets, fmt.Sprintf("is_muted=$%d", len(args)))
	}
	if isArchived != nil {
		args = append(args, *isArchived)
		sets = append(sets, fmt.Sprintf("is_archived=$%d", len(args)))
	}
	if notificationLevel != nil {
		args = append(args, *notificationLevel)
		sets = append(sets, fmt.Sprintf("notification_level=$%d", len(args)))
	}
	if len(sets) == 0 {
		return nil
	}
	args = append(args, companyID, conversationID, employeeID)
	q := fmt.Sprintf(`UPDATE conversation_members SET %s
		WHERE company_id=$%d AND conversation_id=$%d AND employee_id=$%d AND left_at IS NULL`,
		strings.Join(sets, ", "), len(args)-2, len(args)-1, len(args))
	res, err := r.db.Q(ctx).ExecContext(ctx, q, args...)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return chat.ErrMemberNotFound
	}
	return nil
}

func (r *ConversationRepo) TransferOwnership(ctx context.Context, companyID, conversationID, fromOwner, toMember uuid.UUID) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE conversation_members SET role='admin'
		WHERE company_id=$1 AND conversation_id=$2 AND employee_id=$3 AND left_at IS NULL AND role='owner'`,
		companyID, conversationID, fromOwner)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return chat.ErrMemberNotFound
	}
	res, err = r.db.Q(ctx).ExecContext(ctx, `
		UPDATE conversation_members SET role='owner'
		WHERE company_id=$1 AND conversation_id=$2 AND employee_id=$3 AND left_at IS NULL`,
		companyID, conversationID, toMember)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return chat.ErrMemberNotFound
	}
	return nil
}

func (r *ConversationRepo) CountActiveMembers(ctx context.Context, companyID, conversationID uuid.UUID) (int, error) {
	var n int
	err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT COUNT(*) FROM conversation_members
		WHERE company_id=$1 AND conversation_id=$2 AND left_at IS NULL`, companyID, conversationID).Scan(&n)
	return n, err
}

func (r *ConversationRepo) CountOwners(ctx context.Context, companyID, conversationID uuid.UUID) (int, error) {
	var n int
	err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT COUNT(*) FROM conversation_members
		WHERE company_id=$1 AND conversation_id=$2 AND left_at IS NULL AND role='owner'`,
		companyID, conversationID).Scan(&n)
	return n, err
}

func (r *ConversationRepo) EmployeeBelongsToCompany(ctx context.Context, companyID, employeeID uuid.UUID) (bool, error) {
	var n int
	err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT 1 FROM employees WHERE company_id=$1 AND id=$2 AND status='ACTIVE'`, companyID, employeeID).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

type MessageRepo struct{ db *DB }

func NewMessageRepo(db *DB) *MessageRepo { return &MessageRepo{db: db} }

func (r *MessageRepo) CreateMessage(ctx context.Context, m *chat.Message) error {
	meta := m.Metadata
	if len(meta) == 0 {
		meta = json.RawMessage(`{}`)
	}
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO messages (
			id, company_id, conversation_id, sender_id, message_type, content, content_format,
			parent_message_id, thread_root_id, thread_reply_count, metadata,
			is_edited, edited_at, is_pinned, created_at, updated_at, deleted_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
		m.ID, m.CompanyID, m.ConversationID, m.SenderID, m.MessageType, m.Content, m.ContentFormat,
		m.ParentMessageID, m.ThreadRootID, m.ThreadReplyCount, meta,
		m.IsEdited, m.EditedAt, m.IsPinned, m.CreatedAt, m.UpdatedAt, m.DeletedAt,
	)
	return err
}

func (r *MessageRepo) GetMessageByID(ctx context.Context, companyID, id uuid.UUID) (*chat.Message, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, conversation_id, sender_id, message_type, content, content_format,
			parent_message_id, thread_root_id, thread_reply_count, metadata,
			is_edited, edited_at, is_pinned, created_at, updated_at, deleted_at
		FROM messages
		WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL`, companyID, id)
	return scanMessage(row)
}

func (r *MessageRepo) GetMessageByIDIncludingDeleted(ctx context.Context, companyID, id uuid.UUID) (*chat.Message, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, conversation_id, sender_id, message_type, content, content_format,
			parent_message_id, thread_root_id, thread_reply_count, metadata,
			is_edited, edited_at, is_pinned, created_at, updated_at, deleted_at
		FROM messages
		WHERE company_id=$1 AND id=$2`, companyID, id)
	return scanMessage(row)
}

func (r *MessageRepo) GetLatestMessage(ctx context.Context, companyID, conversationID uuid.UUID) (*chat.Message, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, conversation_id, sender_id, message_type, content, content_format,
			parent_message_id, thread_root_id, thread_reply_count, metadata,
			is_edited, edited_at, is_pinned, created_at, updated_at, deleted_at
		FROM messages
		WHERE company_id=$1 AND conversation_id=$2 AND deleted_at IS NULL
		ORDER BY created_at DESC, id DESC
		LIMIT 1`, companyID, conversationID)
	return scanMessage(row)
}

func (r *MessageRepo) ListMessages(ctx context.Context, companyID, conversationID uuid.UUID, q chat.MessageListQuery) ([]chat.Message, string, error) {
	q = q.Normalize()
	args := []any{companyID, conversationID}
	where := `company_id=$1 AND conversation_id=$2 AND deleted_at IS NULL`
	order := `ORDER BY created_at DESC, id DESC`

	if q.Cursor != "" {
		cursorTime, cursorID, err := chat.DecodeCursor(q.Cursor)
		if err != nil {
			return nil, "", err
		}
		if q.Direction == "after" {
			where += fmt.Sprintf(` AND (created_at, id) > ($%d, $%d)`, len(args)+1, len(args)+2)
			order = `ORDER BY created_at ASC, id ASC`
		} else {
			where += fmt.Sprintf(` AND (created_at, id) < ($%d, $%d)`, len(args)+1, len(args)+2)
		}
		args = append(args, cursorTime, cursorID)
	} else if q.Direction == "after" {
		order = `ORDER BY created_at ASC, id ASC`
	}

	query := fmt.Sprintf(`
		SELECT id, company_id, conversation_id, sender_id, message_type, content, content_format,
			parent_message_id, thread_root_id, thread_reply_count, metadata,
			is_edited, edited_at, is_pinned, created_at, updated_at, deleted_at
		FROM messages
		WHERE %s
		%s
		LIMIT $%d`, where, order, len(args)+1)
	args = append(args, q.Limit+1)

	rows, err := r.db.Q(ctx).QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	out := make([]chat.Message, 0, q.Limit)
	for rows.Next() {
		m, err := scanMessageRow(rows)
		if err != nil {
			return nil, "", err
		}
		out = append(out, *m)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	var nextCursor string
	if len(out) > q.Limit {
		out = out[:q.Limit]
		last := out[len(out)-1]
		nextCursor, err = chat.EncodeCursor(last.CreatedAt, last.ID)
		if err != nil {
			return nil, "", err
		}
	}

	if q.Direction == "after" {
		// Return chronological order for "after" queries.
		for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
			out[i], out[j] = out[j], out[i]
		}
	}

	return out, nextCursor, nil
}

func (r *MessageRepo) MarkRead(ctx context.Context, companyID, messageID, employeeID uuid.UUID, readAt time.Time) error {
	if readAt.IsZero() {
		readAt = time.Now().UTC()
	}
	var conversationID uuid.UUID
	var msgCreatedAt time.Time
	err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT conversation_id, created_at FROM messages
		WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL`, companyID, messageID).Scan(&conversationID, &msgCreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return chat.ErrMessageNotFound
	}
	if err != nil {
		return err
	}

	_, err = r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO message_reads (message_id, employee_id, read_at)
		VALUES ($1,$2,$3)
		ON CONFLICT (message_id, employee_id) DO UPDATE SET read_at=EXCLUDED.read_at`,
		messageID, employeeID, readAt)
	if err != nil {
		return err
	}

	// Advance conversation read cursor only forward (never rewind).
	_, err = r.db.Q(ctx).ExecContext(ctx, `
		UPDATE conversation_members cm
		SET last_read_at=$1, last_read_message_id=$2
		WHERE cm.company_id=$3 AND cm.conversation_id=$4 AND cm.employee_id=$5 AND cm.left_at IS NULL
			AND (
				cm.last_read_message_id IS NULL
				OR EXISTS (
					SELECT 1 FROM messages cur
					WHERE cur.id = cm.last_read_message_id
						AND ($6, $2) >= (cur.created_at, cur.id)
				)
			)`,
		readAt, messageID, companyID, conversationID, employeeID, msgCreatedAt)
	return err
}

func (r *MessageRepo) MarkReadUpTo(ctx context.Context, companyID, conversationID, messageID, employeeID uuid.UUID, readAt time.Time) error {
	if readAt.IsZero() {
		readAt = time.Now().UTC()
	}
	var msgConversationID uuid.UUID
	err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT conversation_id FROM messages
		WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL`, companyID, messageID).Scan(&msgConversationID)
	if errors.Is(err, sql.ErrNoRows) {
		return chat.ErrMessageNotFound
	}
	if err != nil {
		return err
	}
	if msgConversationID != conversationID {
		return chat.ErrMessageNotFound
	}
	return r.MarkRead(ctx, companyID, messageID, employeeID, readAt)
}

func (r *MessageRepo) MarkDelivered(ctx context.Context, companyID, messageID, employeeID uuid.UUID, deliveredAt time.Time) error {
	if deliveredAt.IsZero() {
		deliveredAt = time.Now().UTC()
	}
	var exists int
	err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT 1 FROM messages WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL`,
		companyID, messageID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return chat.ErrMessageNotFound
	}
	if err != nil {
		return err
	}
	_, err = r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO message_deliveries (message_id, employee_id, delivered_at)
		VALUES ($1,$2,$3)
		ON CONFLICT (message_id, employee_id) DO UPDATE SET delivered_at=EXCLUDED.delivered_at`,
		messageID, employeeID, deliveredAt)
	return err
}

func (r *MessageRepo) UpdateMessageContent(ctx context.Context, companyID, id uuid.UUID, content string, editedAt time.Time) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE messages SET content=$1, is_edited=true, edited_at=$2, updated_at=$3
		WHERE company_id=$4 AND id=$5 AND deleted_at IS NULL`,
		content, editedAt, editedAt, companyID, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return chat.ErrMessageNotFound
	}
	return nil
}

func (r *MessageRepo) SoftDeleteMessage(ctx context.Context, companyID, id uuid.UUID, deletedAt time.Time) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE messages SET deleted_at=$1, updated_at=$1
		WHERE company_id=$2 AND id=$3 AND deleted_at IS NULL`,
		deletedAt, companyID, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return chat.ErrMessageNotFound
	}
	return nil
}

func (r *MessageRepo) IncrementThreadReplyCount(ctx context.Context, companyID, threadRootID uuid.UUID) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE messages SET thread_reply_count=thread_reply_count+1, updated_at=$1
		WHERE company_id=$2 AND id=$3 AND deleted_at IS NULL`,
		time.Now().UTC(), companyID, threadRootID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return chat.ErrMessageNotFound
	}
	return nil
}

func (r *MessageRepo) CreateForward(ctx context.Context, f *chat.MessageForward) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO message_forwards (id, company_id, message_id, original_message_id, original_conversation_id, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		f.ID, f.CompanyID, f.MessageID, f.OriginalMessageID, f.OriginalConversationID, f.CreatedAt)
	return err
}

type ReactionRepo struct{ db *DB }

func NewReactionRepo(db *DB) *ReactionRepo { return &ReactionRepo{db: db} }

func (r *ReactionRepo) AddReaction(ctx context.Context, companyID uuid.UUID, reaction *chat.MessageReaction) error {
	var exists int
	err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT 1 FROM messages WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL`,
		companyID, reaction.MessageID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return chat.ErrMessageNotFound
	}
	if err != nil {
		return err
	}
	_, err = r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO message_reactions (message_id, employee_id, emoji, created_at)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (message_id, employee_id, emoji) DO NOTHING`,
		reaction.MessageID, reaction.EmployeeID, reaction.Emoji, reaction.CreatedAt)
	return err
}

func (r *ReactionRepo) RemoveReaction(ctx context.Context, companyID, messageID, employeeID uuid.UUID, emoji string) error {
	emoji = strings.TrimSpace(emoji)
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		DELETE FROM message_reactions
		WHERE message_id=$1 AND employee_id=$2 AND emoji=$3
		  AND message_id IN (
			SELECT id FROM messages WHERE company_id=$4 AND id=$1
		  )`, messageID, employeeID, emoji, companyID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return chat.ErrMessageNotFound
	}
	return nil
}

func (r *ReactionRepo) ListReactions(ctx context.Context, companyID, messageID uuid.UUID) ([]chat.MessageReaction, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT r.message_id, r.employee_id, r.emoji, r.created_at
		FROM message_reactions r
		JOIN messages m ON m.id=r.message_id
		WHERE m.company_id=$1 AND r.message_id=$2 AND m.deleted_at IS NULL
		ORDER BY r.created_at ASC`, companyID, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]chat.MessageReaction, 0)
	for rows.Next() {
		var reaction chat.MessageReaction
		if err := rows.Scan(&reaction.MessageID, &reaction.EmployeeID, &reaction.Emoji, &reaction.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, reaction)
	}
	return out, rows.Err()
}

type BookmarkRepo struct{ db *DB }

func NewBookmarkRepo(db *DB) *BookmarkRepo { return &BookmarkRepo{db: db} }

func (r *BookmarkRepo) AddBookmark(ctx context.Context, companyID uuid.UUID, b *chat.MessageBookmark) error {
	var exists int
	err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT 1 FROM messages WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL`,
		companyID, b.MessageID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return chat.ErrMessageNotFound
	}
	if err != nil {
		return err
	}
	_, err = r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO message_bookmarks (message_id, employee_id, created_at)
		VALUES ($1,$2,$3)
		ON CONFLICT (message_id, employee_id) DO NOTHING`,
		b.MessageID, b.EmployeeID, b.CreatedAt)
	return err
}

func (r *BookmarkRepo) RemoveBookmark(ctx context.Context, companyID, messageID, employeeID uuid.UUID) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		DELETE FROM message_bookmarks
		WHERE message_id=$1 AND employee_id=$2
		  AND message_id IN (
			SELECT id FROM messages WHERE company_id=$3 AND id=$1
		  )`, messageID, employeeID, companyID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return chat.ErrMessageNotFound
	}
	return nil
}

type ChatAttachmentRepo struct{ db *DB }

func NewChatAttachmentRepo(db *DB) *ChatAttachmentRepo { return &ChatAttachmentRepo{db: db} }

func (r *ChatAttachmentRepo) CreateAttachment(ctx context.Context, a *chat.MessageAttachment) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO message_attachments (
			id, company_id, message_id, file_name, storage_key, mime_type, size_bytes,
			width, height, duration_ms, thumbnail_key, checksum_sha256, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		a.ID, a.CompanyID, a.MessageID, a.FileName, a.StorageKey, a.MimeType, a.SizeBytes,
		a.Width, a.Height, a.DurationMs, a.ThumbnailKey, a.ChecksumSHA256, a.CreatedAt,
	)
	return err
}

func (r *ChatAttachmentRepo) GetAttachmentByID(ctx context.Context, companyID, id uuid.UUID) (*chat.MessageAttachment, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, message_id, file_name, storage_key, mime_type, size_bytes,
			width, height, duration_ms, thumbnail_key, checksum_sha256, created_at
		FROM message_attachments
		WHERE company_id=$1 AND id=$2`, companyID, id)
	var a chat.MessageAttachment
	err := row.Scan(
		&a.ID, &a.CompanyID, &a.MessageID, &a.FileName, &a.StorageKey, &a.MimeType, &a.SizeBytes,
		&a.Width, &a.Height, &a.DurationMs, &a.ThumbnailKey, &a.ChecksumSHA256, &a.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, chat.ErrMessageNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

type PresenceRepo struct{ db *DB }

func NewPresenceRepo(db *DB) *PresenceRepo { return &PresenceRepo{db: db} }

func (r *PresenceRepo) UpsertPresence(ctx context.Context, p *chat.UserPresence) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO user_presence (employee_id, company_id, status, last_seen_at, status_message, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (employee_id) DO UPDATE SET
			company_id=EXCLUDED.company_id,
			status=EXCLUDED.status,
			last_seen_at=EXCLUDED.last_seen_at,
			status_message=EXCLUDED.status_message,
			updated_at=EXCLUDED.updated_at`,
		p.EmployeeID, p.CompanyID, p.Status, p.LastSeenAt, p.StatusMessage, p.UpdatedAt)
	return err
}

func (r *PresenceRepo) GetPresence(ctx context.Context, companyID, employeeID uuid.UUID) (*chat.UserPresence, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT employee_id, company_id, status, last_seen_at, status_message, updated_at
		FROM user_presence
		WHERE company_id=$1 AND employee_id=$2`, companyID, employeeID)
	var p chat.UserPresence
	err := row.Scan(&p.EmployeeID, &p.CompanyID, &p.Status, &p.LastSeenAt, &p.StatusMessage, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, chat.ErrPresenceNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PresenceRepo) ListPresence(ctx context.Context, companyID uuid.UUID, employeeIDs []uuid.UUID) ([]chat.UserPresence, error) {
	if len(employeeIDs) == 0 {
		return []chat.UserPresence{}, nil
	}
	if len(employeeIDs) > chat.MaxPresenceQueryIDs {
		employeeIDs = employeeIDs[:chat.MaxPresenceQueryIDs]
	}
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT p.employee_id, p.company_id, p.status, p.last_seen_at, p.status_message, p.updated_at
		FROM user_presence p
		JOIN employees e ON e.id = p.employee_id AND e.company_id = p.company_id
		WHERE p.company_id=$1 AND p.employee_id = ANY($2) AND e.status='ACTIVE'`,
		companyID, pq.Array(employeeIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]chat.UserPresence, 0, len(employeeIDs))
	for rows.Next() {
		var p chat.UserPresence
		if err := rows.Scan(&p.EmployeeID, &p.CompanyID, &p.Status, &p.LastSeenAt, &p.StatusMessage, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// FilterCompanyEmployees returns the subset of IDs that belong to the company (active).
func (r *PresenceRepo) FilterCompanyEmployees(ctx context.Context, companyID uuid.UUID, employeeIDs []uuid.UUID) ([]uuid.UUID, error) {
	if len(employeeIDs) == 0 {
		return nil, nil
	}
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id FROM employees
		WHERE company_id=$1 AND status='ACTIVE' AND id = ANY($2)`,
		companyID, pq.Array(employeeIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]uuid.UUID, 0, len(employeeIDs))
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

type PinRepo struct{ db *DB }

func NewPinRepo(db *DB) *PinRepo { return &PinRepo{db: db} }

func (r *PinRepo) AddPin(ctx context.Context, companyID uuid.UUID, p *chat.MessagePin) error {
	var exists int
	err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT 1 FROM messages m
		JOIN conversations c ON c.id=m.conversation_id
		WHERE m.company_id=$1 AND m.id=$2 AND c.company_id=$1 AND m.conversation_id=$3 AND m.deleted_at IS NULL`,
		companyID, p.MessageID, p.ConversationID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return chat.ErrMessageNotFound
	}
	if err != nil {
		return err
	}
	_, err = r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO message_pins (conversation_id, message_id, pinned_by, pinned_at)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (conversation_id, message_id) DO UPDATE SET pinned_by=EXCLUDED.pinned_by, pinned_at=EXCLUDED.pinned_at`,
		p.ConversationID, p.MessageID, p.PinnedBy, p.PinnedAt)
	return err
}

func (r *PinRepo) RemovePin(ctx context.Context, companyID, conversationID, messageID uuid.UUID) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		DELETE FROM message_pins
		WHERE conversation_id=$1 AND message_id=$2
		  AND conversation_id IN (SELECT id FROM conversations WHERE company_id=$3 AND id=$1)`,
		conversationID, messageID, companyID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return chat.ErrMessageNotFound
	}
	return nil
}

func (r *PinRepo) ListPins(ctx context.Context, companyID, conversationID uuid.UUID) ([]chat.MessagePin, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT p.conversation_id, p.message_id, p.pinned_by, p.pinned_at
		FROM message_pins p
		JOIN conversations c ON c.id=p.conversation_id
		WHERE c.company_id=$1 AND p.conversation_id=$2
		ORDER BY p.pinned_at DESC`, companyID, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]chat.MessagePin, 0)
	for rows.Next() {
		var p chat.MessagePin
		if err := rows.Scan(&p.ConversationID, &p.MessageID, &p.PinnedBy, &p.PinnedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

type ModerationRepo struct{ db *DB }

func NewModerationRepo(db *DB) *ModerationRepo { return &ModerationRepo{db: db} }

func (r *ModerationRepo) CreateReport(ctx context.Context, report *chat.MessageReport) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO message_reports (id, company_id, message_id, reporter_id, reason, details, status, reviewed_by, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		report.ID, report.CompanyID, report.MessageID, report.ReporterID, report.Reason, report.Details,
		report.Status, report.ReviewedBy, report.CreatedAt)
	return err
}

func (r *ModerationRepo) CreateBlock(ctx context.Context, b *chat.BlockedUser) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO blocked_users (blocker_id, blocked_id, company_id, created_at)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
		b.BlockerID, b.BlockedID, b.CompanyID, b.CreatedAt)
	return err
}

func (r *ModerationRepo) RemoveBlock(ctx context.Context, companyID, blockerID, blockedID uuid.UUID) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		DELETE FROM blocked_users
		WHERE company_id=$1 AND blocker_id=$2 AND blocked_id=$3`,
		companyID, blockerID, blockedID)
	return err
}

func (r *ModerationRepo) IsBlocked(ctx context.Context, companyID, blockerID, blockedID uuid.UUID) (bool, error) {
	var exists int
	err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT 1 FROM blocked_users
		WHERE company_id=$1 AND blocker_id=$2 AND blocked_id=$3`,
		companyID, blockerID, blockedID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

type DraftRepo struct{ db *DB }

func NewDraftRepo(db *DB) *DraftRepo { return &DraftRepo{db: db} }

func (r *DraftRepo) SaveDraft(ctx context.Context, companyID uuid.UUID, d *chat.MessageDraft, ifUpdatedAt *time.Time) (*chat.MessageDraft, error) {
	var convCompany uuid.UUID
	err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT company_id FROM conversations WHERE id=$1 AND deleted_at IS NULL`, d.ConversationID).Scan(&convCompany)
	if errors.Is(err, sql.ErrNoRows) || convCompany != companyID {
		return nil, chat.ErrConversationNotFound
	}
	if err != nil {
		return nil, err
	}

	if ifUpdatedAt != nil {
		var existing time.Time
		err := r.db.Q(ctx).QueryRowContext(ctx, `
			SELECT updated_at FROM message_drafts WHERE conversation_id=$1 AND employee_id=$2`,
			d.ConversationID, d.EmployeeID).Scan(&existing)
		if err == nil && existing.After(*ifUpdatedAt) {
			return nil, chat.ErrDraftConflict
		}
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
	}

	now := d.UpdatedAt
	if now.IsZero() {
		now = time.Now().UTC()
	}
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		INSERT INTO message_drafts (conversation_id, employee_id, content, parent_message_id, revision, updated_at)
		VALUES ($1,$2,$3,$4,1,$5)
		ON CONFLICT (conversation_id, employee_id) DO UPDATE SET
			content=EXCLUDED.content,
			parent_message_id=EXCLUDED.parent_message_id,
			revision=message_drafts.revision+1,
			updated_at=EXCLUDED.updated_at
		RETURNING conversation_id, employee_id, content, parent_message_id, revision, updated_at`,
		d.ConversationID, d.EmployeeID, d.Content, d.ParentMessageID, now)
	var out chat.MessageDraft
	if err := row.Scan(&out.ConversationID, &out.EmployeeID, &out.Content, &out.ParentMessageID, &out.Revision, &out.UpdatedAt); err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *DraftRepo) GetDraft(ctx context.Context, companyID, conversationID, employeeID uuid.UUID) (*chat.MessageDraft, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT d.conversation_id, d.employee_id, d.content, d.parent_message_id, COALESCE(d.revision,1), d.updated_at
		FROM message_drafts d
		JOIN conversations c ON c.id=d.conversation_id
		WHERE c.company_id=$1 AND d.conversation_id=$2 AND d.employee_id=$3 AND c.deleted_at IS NULL`,
		companyID, conversationID, employeeID)
	var d chat.MessageDraft
	err := row.Scan(&d.ConversationID, &d.EmployeeID, &d.Content, &d.ParentMessageID, &d.Revision, &d.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, chat.ErrDraftNotFound
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *DraftRepo) DeleteDraft(ctx context.Context, companyID, conversationID, employeeID uuid.UUID) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		DELETE FROM message_drafts d
		USING conversations c
		WHERE d.conversation_id=c.id AND c.company_id=$1 AND d.conversation_id=$2 AND d.employee_id=$3`,
		companyID, conversationID, employeeID)
	return err
}

type AuditRepo struct{ db *DB }

func NewAuditRepo(db *DB) *AuditRepo { return &AuditRepo{db: db} }

func (r *AuditRepo) Append(ctx context.Context, logEntry *chat.ChatAuditLog) error {
	payload := logEntry.Payload
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO chat_audit_logs (id, company_id, conversation_id, actor_id, action, target_id, payload, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		logEntry.ID, logEntry.CompanyID, logEntry.ConversationID, logEntry.ActorID,
		logEntry.Action, logEntry.TargetID, payload, logEntry.CreatedAt)
	return err
}

func nullIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func scanConversation(row *sql.Row) (*chat.Conversation, error) {
	var c chat.Conversation
	var slug, visibility sql.NullString
	err := row.Scan(
		&c.ID, &c.CompanyID, &c.Type, &c.Name, &slug, &c.Description, &visibility,
		&c.AvatarURL, &c.CreatedBy, &c.IsArchived, &c.LastMessageID, &c.LastMessageAt, &c.LastMessagePreview,
		&c.Version, &c.CreatedAt, &c.UpdatedAt, &c.DeletedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, chat.ErrConversationNotFound
	}
	if err != nil {
		return nil, err
	}
	if slug.Valid {
		c.Slug = slug.String
	}
	if visibility.Valid {
		c.Visibility = visibility.String
	}
	return &c, nil
}

func scanConversationMember(row *sql.Row) (*chat.ConversationMember, error) {
	var m chat.ConversationMember
	err := row.Scan(
		&m.ID, &m.CompanyID, &m.ConversationID, &m.EmployeeID, &m.Role, &m.JoinedAt,
		&m.LastReadAt, &m.LastReadMessageID, &m.IsMuted, &m.IsArchived, &m.NotificationLevel, &m.LeftAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, chat.ErrMemberNotFound
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

type memberScanner interface {
	Scan(dest ...any) error
}

func scanConversationMemberRow(s memberScanner) (*chat.ConversationMember, error) {
	var m chat.ConversationMember
	err := s.Scan(
		&m.ID, &m.CompanyID, &m.ConversationID, &m.EmployeeID, &m.Role, &m.JoinedAt,
		&m.LastReadAt, &m.LastReadMessageID, &m.IsMuted, &m.IsArchived, &m.NotificationLevel, &m.LeftAt,
	)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func scanMessage(row *sql.Row) (*chat.Message, error) {
	var m chat.Message
	err := row.Scan(
		&m.ID, &m.CompanyID, &m.ConversationID, &m.SenderID, &m.MessageType, &m.Content, &m.ContentFormat,
		&m.ParentMessageID, &m.ThreadRootID, &m.ThreadReplyCount, &m.Metadata,
		&m.IsEdited, &m.EditedAt, &m.IsPinned, &m.CreatedAt, &m.UpdatedAt, &m.DeletedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, chat.ErrMessageNotFound
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func scanMessageRow(s memberScanner) (*chat.Message, error) {
	var m chat.Message
	err := s.Scan(
		&m.ID, &m.CompanyID, &m.ConversationID, &m.SenderID, &m.MessageType, &m.Content, &m.ContentFormat,
		&m.ParentMessageID, &m.ThreadRootID, &m.ThreadReplyCount, &m.Metadata,
		&m.IsEdited, &m.EditedAt, &m.IsPinned, &m.CreatedAt, &m.UpdatedAt, &m.DeletedAt,
	)
	if err != nil {
		return nil, err
	}
	return &m, nil
}
