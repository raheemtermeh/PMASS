package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"PMAS/internal/domain/chat"
)

// --- Thread listing ---

func (r *MessageRepo) ListThreadMessages(ctx context.Context, companyID, conversationID, threadRootID uuid.UUID, q chat.MessageListQuery) ([]chat.Message, string, error) {
	q = q.Normalize()
	args := []any{companyID, conversationID, threadRootID}
	where := `company_id=$1 AND conversation_id=$2 AND deleted_at IS NULL
		AND (id=$3 OR thread_root_id=$3 OR parent_message_id=$3)`
	if q.Cursor != "" {
		cursorTime, cursorID, err := chat.DecodeCursor(q.Cursor)
		if err != nil {
			return nil, "", err
		}
		where += fmt.Sprintf(` AND (created_at, id) > ($%d, $%d)`, len(args)+1, len(args)+2)
		args = append(args, cursorTime, cursorID)
	}
	args = append(args, q.Limit+1)
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, conversation_id, sender_id, message_type, content, content_format,
			parent_message_id, thread_root_id, thread_reply_count, metadata,
			is_edited, edited_at, deleted_at, is_pinned, created_at, updated_at
		FROM messages WHERE `+where+`
		ORDER BY created_at ASC, id ASC
		LIMIT $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	out := make([]chat.Message, 0, q.Limit)
	for rows.Next() {
		var m chat.Message
		if err := rows.Scan(
			&m.ID, &m.CompanyID, &m.ConversationID, &m.SenderID, &m.MessageType, &m.Content, &m.ContentFormat,
			&m.ParentMessageID, &m.ThreadRootID, &m.ThreadReplyCount, &m.Metadata,
			&m.IsEdited, &m.EditedAt, &m.DeletedAt, &m.IsPinned, &m.CreatedAt, &m.UpdatedAt,
		); err != nil {
			return nil, "", err
		}
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}
	var next string
	if len(out) > q.Limit {
		out = out[:q.Limit]
		last := out[len(out)-1]
		next, err = chat.EncodeCursor(last.CreatedAt, last.ID)
		if err != nil {
			return nil, "", err
		}
	}
	return out, next, nil
}

// --- Bookmarks list ---

func (r *BookmarkRepo) ListBookmarks(ctx context.Context, companyID, employeeID uuid.UUID, cursor string, limit int) ([]chat.MessageBookmark, string, error) {
	if limit < 1 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	args := []any{companyID, employeeID}
	where := `b.employee_id=$2 AND m.company_id=$1 AND m.deleted_at IS NULL`
	if cursor != "" {
		cursorTime, cursorID, err := chat.DecodeCursor(cursor)
		if err != nil {
			return nil, "", err
		}
		where += fmt.Sprintf(` AND (b.created_at, b.message_id) < ($%d, $%d)`, len(args)+1, len(args)+2)
		args = append(args, cursorTime, cursorID)
	}
	args = append(args, limit+1)
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT b.message_id, b.employee_id, b.created_at
		FROM message_bookmarks b
		JOIN messages m ON m.id=b.message_id
		JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.employee_id=b.employee_id AND cm.left_at IS NULL
		WHERE `+where+`
		ORDER BY b.created_at DESC, b.message_id DESC
		LIMIT $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	out := make([]chat.MessageBookmark, 0, limit)
	for rows.Next() {
		var b chat.MessageBookmark
		if err := rows.Scan(&b.MessageID, &b.EmployeeID, &b.CreatedAt); err != nil {
			return nil, "", err
		}
		out = append(out, b)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}
	var next string
	if len(out) > limit {
		out = out[:limit]
		last := out[len(out)-1]
		next, err = chat.EncodeCursor(last.CreatedAt, last.MessageID)
		if err != nil {
			return nil, "", err
		}
	}
	return out, next, nil
}

// --- Moderation extensions ---

func (r *ModerationRepo) GetReport(ctx context.Context, companyID, id uuid.UUID) (*chat.MessageReport, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, message_id, reporter_id, reason, details, status, reviewed_by, created_at
		FROM message_reports WHERE company_id=$1 AND id=$2`, companyID, id)
	var rep chat.MessageReport
	err := row.Scan(&rep.ID, &rep.CompanyID, &rep.MessageID, &rep.ReporterID, &rep.Reason, &rep.Details, &rep.Status, &rep.ReviewedBy, &rep.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, chat.ErrReportNotFound
	}
	if err != nil {
		return nil, err
	}
	return &rep, nil
}

func (r *ModerationRepo) ListReports(ctx context.Context, companyID uuid.UUID, status string, cursor string, limit int) ([]chat.MessageReport, string, error) {
	if limit < 1 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	args := []any{companyID}
	where := `company_id=$1`
	if status != "" {
		args = append(args, status)
		where += fmt.Sprintf(` AND status=$%d`, len(args))
	}
	if cursor != "" {
		cursorTime, cursorID, err := chat.DecodeCursor(cursor)
		if err != nil {
			return nil, "", err
		}
		where += fmt.Sprintf(` AND (created_at, id) < ($%d, $%d)`, len(args)+1, len(args)+2)
		args = append(args, cursorTime, cursorID)
	}
	args = append(args, limit+1)
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, message_id, reporter_id, reason, details, status, reviewed_by, created_at
		FROM message_reports WHERE `+where+`
		ORDER BY created_at DESC, id DESC
		LIMIT $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	out := make([]chat.MessageReport, 0, limit)
	for rows.Next() {
		var rep chat.MessageReport
		if err := rows.Scan(&rep.ID, &rep.CompanyID, &rep.MessageID, &rep.ReporterID, &rep.Reason, &rep.Details, &rep.Status, &rep.ReviewedBy, &rep.CreatedAt); err != nil {
			return nil, "", err
		}
		out = append(out, rep)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}
	var next string
	if len(out) > limit {
		out = out[:limit]
		last := out[len(out)-1]
		next, err = chat.EncodeCursor(last.CreatedAt, last.ID)
		if err != nil {
			return nil, "", err
		}
	}
	return out, next, nil
}

func (r *ModerationRepo) UpdateReportStatus(ctx context.Context, companyID, id, reviewerID uuid.UUID, status string) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE message_reports SET status=$1, reviewed_by=$2
		WHERE company_id=$3 AND id=$4`, status, reviewerID, companyID, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return chat.ErrReportNotFound
	}
	return nil
}

func (r *ModerationRepo) ListBlocks(ctx context.Context, companyID, blockerID uuid.UUID, cursor string, limit int) ([]chat.BlockedUser, string, error) {
	if limit < 1 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	args := []any{companyID, blockerID}
	where := `company_id=$1 AND blocker_id=$2`
	if cursor != "" {
		cursorTime, cursorID, err := chat.DecodeCursor(cursor)
		if err != nil {
			return nil, "", err
		}
		where += fmt.Sprintf(` AND (created_at, blocked_id) < ($%d, $%d)`, len(args)+1, len(args)+2)
		args = append(args, cursorTime, cursorID)
	}
	args = append(args, limit+1)
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT blocker_id, blocked_id, company_id, created_at
		FROM blocked_users WHERE `+where+`
		ORDER BY created_at DESC, blocked_id DESC
		LIMIT $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	out := make([]chat.BlockedUser, 0, limit)
	for rows.Next() {
		var b chat.BlockedUser
		if err := rows.Scan(&b.BlockerID, &b.BlockedID, &b.CompanyID, &b.CreatedAt); err != nil {
			return nil, "", err
		}
		out = append(out, b)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}
	var next string
	if len(out) > limit {
		out = out[:limit]
		last := out[len(out)-1]
		next, err = chat.EncodeCursor(last.CreatedAt, last.BlockedID)
		if err != nil {
			return nil, "", err
		}
	}
	return out, next, nil
}

// --- Invitations ---

type InvitationRepo struct{ db *DB }

func NewInvitationRepo(db *DB) *InvitationRepo { return &InvitationRepo{db: db} }

func (r *InvitationRepo) CreateInvitation(ctx context.Context, inv *chat.ConversationInvitation) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO conversation_invitations (
			id, company_id, conversation_id, invited_by, invited_employee_id, status, expires_at, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		inv.ID, inv.CompanyID, inv.ConversationID, inv.InvitedBy, inv.InvitedEmployeeID, inv.Status, inv.ExpiresAt, inv.CreatedAt)
	return err
}

func (r *InvitationRepo) GetInvitation(ctx context.Context, companyID, id uuid.UUID) (*chat.ConversationInvitation, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, conversation_id, invited_by, invited_employee_id, status, expires_at, created_at
		FROM conversation_invitations WHERE company_id=$1 AND id=$2`, companyID, id)
	var inv chat.ConversationInvitation
	err := row.Scan(&inv.ID, &inv.CompanyID, &inv.ConversationID, &inv.InvitedBy, &inv.InvitedEmployeeID, &inv.Status, &inv.ExpiresAt, &inv.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, chat.ErrInvitationNotFound
	}
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

func (r *InvitationRepo) FindPendingInvitation(ctx context.Context, companyID, conversationID, inviteeID uuid.UUID) (*chat.ConversationInvitation, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, conversation_id, invited_by, invited_employee_id, status, expires_at, created_at
		FROM conversation_invitations
		WHERE company_id=$1 AND conversation_id=$2 AND invited_employee_id=$3 AND status='pending'
		ORDER BY created_at DESC LIMIT 1`, companyID, conversationID, inviteeID)
	var inv chat.ConversationInvitation
	err := row.Scan(&inv.ID, &inv.CompanyID, &inv.ConversationID, &inv.InvitedBy, &inv.InvitedEmployeeID, &inv.Status, &inv.ExpiresAt, &inv.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, chat.ErrInvitationNotFound
	}
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

func (r *InvitationRepo) UpdateInvitationStatus(ctx context.Context, companyID, id uuid.UUID, status string) error {
	res, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE conversation_invitations SET status=$1 WHERE company_id=$2 AND id=$3`, status, companyID, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return chat.ErrInvitationNotFound
	}
	return nil
}

func (r *InvitationRepo) ListInvitationsForEmployee(ctx context.Context, companyID, employeeID uuid.UUID, status string, cursor string, limit int) ([]chat.ConversationInvitation, string, error) {
	if limit < 1 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	args := []any{companyID, employeeID}
	where := `company_id=$1 AND invited_employee_id=$2`
	if status != "" {
		args = append(args, status)
		where += fmt.Sprintf(` AND status=$%d`, len(args))
	}
	if cursor != "" {
		cursorTime, cursorID, err := chat.DecodeCursor(cursor)
		if err != nil {
			return nil, "", err
		}
		where += fmt.Sprintf(` AND (created_at, id) < ($%d, $%d)`, len(args)+1, len(args)+2)
		args = append(args, cursorTime, cursorID)
	}
	args = append(args, limit+1)
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, conversation_id, invited_by, invited_employee_id, status, expires_at, created_at
		FROM conversation_invitations WHERE `+where+`
		ORDER BY created_at DESC, id DESC
		LIMIT $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	out := make([]chat.ConversationInvitation, 0, limit)
	for rows.Next() {
		var inv chat.ConversationInvitation
		if err := rows.Scan(&inv.ID, &inv.CompanyID, &inv.ConversationID, &inv.InvitedBy, &inv.InvitedEmployeeID, &inv.Status, &inv.ExpiresAt, &inv.CreatedAt); err != nil {
			return nil, "", err
		}
		out = append(out, inv)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}
	var next string
	if len(out) > limit {
		out = out[:limit]
		last := out[len(out)-1]
		next, err = chat.EncodeCursor(last.CreatedAt, last.ID)
		if err != nil {
			return nil, "", err
		}
	}
	return out, next, nil
}
