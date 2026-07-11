package postgres

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
	"PMAS/internal/domain/support"
)

func (r *ActivityRepo) ListRecent(ctx context.Context, companyID uuid.UUID, limit int) ([]support.ActivityLog, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, entity_type, entity_id, action, actor_id, payload, created_at
		FROM activity_logs WHERE company_id=$1
		ORDER BY created_at DESC LIMIT $2`, companyID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]support.ActivityLog, 0)
	for rows.Next() {
		var a support.ActivityLog
		if err := rows.Scan(&a.ID, &a.CompanyID, &a.EntityType, &a.EntityID, &a.Action, &a.ActorID, &a.Payload, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

func (r *NotificationRepo) ListByCompany(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]support.Notification, int64, error) {
	q = q.Normalize()
	var total int64
	if err := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT COUNT(*) FROM notifications WHERE company_id=$1 AND COALESCE(is_archived,false)=false`, companyID).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, receiver_id, type, title, body, is_read, version, created_at, updated_at
		FROM notifications WHERE company_id=$1 AND COALESCE(is_archived,false)=false
		ORDER BY created_at DESC LIMIT $2 OFFSET $3`, companyID, q.PageSize, q.Offset())
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]support.Notification, 0)
	for rows.Next() {
		var n support.Notification
		if err := rows.Scan(&n.ID, &n.CompanyID, &n.ReceiverID, &n.Type, &n.Title, &n.Body, &n.IsRead, &n.Version, &n.CreatedAt, &n.UpdatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, n)
	}
	return out, total, nil
}

type CommentRepo struct{ db *DB }

func NewCommentRepo(db *DB) *CommentRepo { return &CommentRepo{db: db} }

func (r *CommentRepo) Create(ctx context.Context, c *support.Comment) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO comments (id, company_id, entity_type, entity_id, author_id, parent_id, body, is_archived, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		c.ID, c.CompanyID, c.EntityType, c.EntityID, c.AuthorID, c.ParentID, c.Body, c.IsArchived, c.CreatedAt, c.UpdatedAt,
	)
	return err
}

func (r *CommentRepo) ListByEntity(ctx context.Context, companyID uuid.UUID, entityType string, entityID uuid.UUID) ([]support.Comment, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, entity_type, entity_id, author_id, parent_id, body, COALESCE(is_archived,false), created_at, updated_at
		FROM comments
		WHERE company_id=$1 AND entity_type=$2 AND entity_id=$3 AND COALESCE(is_archived,false)=false
		ORDER BY created_at ASC`, companyID, entityType, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]support.Comment, 0)
	for rows.Next() {
		var c support.Comment
		if err := rows.Scan(&c.ID, &c.CompanyID, &c.EntityType, &c.EntityID, &c.AuthorID, &c.ParentID, &c.Body, &c.IsArchived, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}

func (r *CommentRepo) UpdateBody(ctx context.Context, companyID, id uuid.UUID, body string) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE comments SET body=$1, updated_at=$2 WHERE company_id=$3 AND id=$4 AND COALESCE(is_archived,false)=false`,
		body, time.Now().UTC(), companyID, id)
	return err
}

func (r *CommentRepo) Archive(ctx context.Context, companyID, id uuid.UUID) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		UPDATE comments SET is_archived=true, updated_at=$1 WHERE company_id=$2 AND id=$3`,
		time.Now().UTC(), companyID, id)
	return err
}

type AttachmentRepo struct{ db *DB }

func NewAttachmentRepo(db *DB) *AttachmentRepo { return &AttachmentRepo{db: db} }

func (r *AttachmentRepo) Create(ctx context.Context, a *support.Attachment) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `
		INSERT INTO attachments (id, company_id, entity_type, entity_id, file_name, path, size, mime_type, category, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		a.ID, a.CompanyID, a.EntityType, a.EntityID, a.FileName, a.Path, a.Size, a.MimeType, a.Category, a.CreatedAt, a.UpdatedAt,
	)
	return err
}

func (r *AttachmentRepo) ListByEntity(ctx context.Context, companyID uuid.UUID, entityType string, entityID uuid.UUID) ([]support.Attachment, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT id, company_id, entity_type, entity_id, file_name, path, size, mime_type, COALESCE(category,'general'), created_at, updated_at
		FROM attachments WHERE company_id=$1 AND entity_type=$2 AND entity_id=$3
		ORDER BY created_at DESC`, companyID, entityType, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]support.Attachment, 0)
	for rows.Next() {
		var a support.Attachment
		if err := rows.Scan(&a.ID, &a.CompanyID, &a.EntityType, &a.EntityID, &a.FileName, &a.Path, &a.Size, &a.MimeType, &a.Category, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

func (r *AttachmentRepo) FindByID(ctx context.Context, companyID, id uuid.UUID) (*support.Attachment, error) {
	row := r.db.Q(ctx).QueryRowContext(ctx, `
		SELECT id, company_id, entity_type, entity_id, file_name, path, size, mime_type, COALESCE(category,'general'), created_at, updated_at
		FROM attachments WHERE company_id=$1 AND id=$2`, companyID, id)
	var a support.Attachment
	err := row.Scan(&a.ID, &a.CompanyID, &a.EntityType, &a.EntityID, &a.FileName, &a.Path, &a.Size, &a.MimeType, &a.Category, &a.CreatedAt, &a.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, shared.New("ATTACHMENT_NOT_FOUND", "Attachment not found", 404)
	}
	return &a, err
}

func (r *AttachmentRepo) Delete(ctx context.Context, companyID, id uuid.UUID) error {
	_, err := r.db.Q(ctx).ExecContext(ctx, `DELETE FROM attachments WHERE company_id=$1 AND id=$2`, companyID, id)
	return err
}

func (r *TaskRepo) SetDependencies(ctx context.Context, companyID, taskID uuid.UUID, dependsOn []uuid.UUID) error {
	if _, err := r.db.Q(ctx).ExecContext(ctx, `DELETE FROM task_dependencies WHERE company_id=$1 AND task_id=$2`, companyID, taskID); err != nil {
		return err
	}
	for _, dep := range dependsOn {
		if dep == taskID {
			continue
		}
		if _, err := r.db.Q(ctx).ExecContext(ctx, `
			INSERT INTO task_dependencies (company_id, task_id, depends_on_task_id)
			VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, companyID, taskID, dep); err != nil {
			return err
		}
	}
	return nil
}

func (r *TaskRepo) ListDependencies(ctx context.Context, companyID, taskID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.db.Q(ctx).QueryContext(ctx, `
		SELECT depends_on_task_id FROM task_dependencies WHERE company_id=$1 AND task_id=$2`, companyID, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, nil
}
