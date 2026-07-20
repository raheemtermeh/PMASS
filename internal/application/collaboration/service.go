package collabapp

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
	"PMAS/internal/domain/support"
	"PMAS/internal/infrastructure/postgres"
)

type Service struct {
	db   *postgres.DB
	cmt  support.CommentRepository
	att  support.AttachmentRepository
	act  support.ActivityRepository
	ntf  support.NotificationRepository
}

func NewService(
	db *postgres.DB,
	cmt support.CommentRepository,
	att support.AttachmentRepository,
	act support.ActivityRepository,
	ntf support.NotificationRepository,
) *Service {
	return &Service{db: db, cmt: cmt, att: att, act: act, ntf: ntf}
}

type CreateCommentInput struct {
	EntityType          string
	EntityID            uuid.UUID
	AuthorID            uuid.UUID
	Body                string
	ParentID            *uuid.UUID
	MentionEmployeeIDs  []uuid.UUID
	MentionTeamIDs      []uuid.UUID
}

func (s *Service) CreateComment(ctx context.Context, companyID uuid.UUID, in CreateCommentInput) (*support.Comment, error) {
	c, err := support.NewComment(companyID, in.EntityType, in.EntityID, in.AuthorID, in.Body, in.ParentID)
	if err != nil {
		return nil, err
	}
	if err := s.cmt.Create(ctx, c); err != nil {
		return nil, err
	}
	act, _ := support.NewActivity(companyID, in.EntityType, in.EntityID, "CommentAdded", &in.AuthorID, map[string]any{
		"comment_id": c.ID,
	})
	_ = s.act.Append(ctx, act)

	seen := map[uuid.UUID]bool{}
	for _, empID := range in.MentionEmployeeIDs {
		if empID == uuid.Nil || empID == in.AuthorID || seen[empID] {
			continue
		}
		seen[empID] = true
		_, _ = s.db.Q(ctx).ExecContext(ctx, `
			INSERT INTO comment_mentions (id, company_id, comment_id, mentioned_employee_id, created_at)
			VALUES ($1,$2,$3,$4,NOW())`, uuid.New(), companyID, c.ID, empID)
		n := support.NewNotification(companyID, empID, "MENTION", "You were mentioned", in.Body)
		_ = s.ntf.Create(ctx, n)
	}
	for _, teamID := range in.MentionTeamIDs {
		if teamID == uuid.Nil {
			continue
		}
		_, _ = s.db.Q(ctx).ExecContext(ctx, `
			INSERT INTO comment_mentions (id, company_id, comment_id, mentioned_team_id, created_at)
			VALUES ($1,$2,$3,$4,NOW())`, uuid.New(), companyID, c.ID, teamID)
		rows, err := s.db.Q(ctx).QueryContext(ctx, `
			SELECT employee_id FROM team_members_vsm WHERE company_id=$1 AND team_id=$2`, companyID, teamID)
		if err != nil {
			continue
		}
		for rows.Next() {
			var empID uuid.UUID
			if err := rows.Scan(&empID); err != nil || empID == in.AuthorID || seen[empID] {
				continue
			}
			seen[empID] = true
			n := support.NewNotification(companyID, empID, "MENTION", "Your team was mentioned", in.Body)
			_ = s.ntf.Create(ctx, n)
		}
		rows.Close()
	}
	return c, nil
}

func (s *Service) ListComments(ctx context.Context, companyID uuid.UUID, entityType string, entityID uuid.UUID) ([]support.Comment, error) {
	return s.cmt.ListByEntity(ctx, companyID, entityType, entityID)
}

func (s *Service) EditComment(ctx context.Context, companyID, id uuid.UUID, body string) error {
	body = strings.TrimSpace(body)
	if body == "" {
		return shared.New("COMMENT_BODY_REQUIRED", "Comment body is required", 400)
	}
	return s.cmt.UpdateBody(ctx, companyID, id, body)
}

func (s *Service) ArchiveComment(ctx context.Context, companyID, id uuid.UUID) error {
	return s.cmt.Archive(ctx, companyID, id)
}

type CreateAttachmentInput struct {
	EntityType string
	EntityID   uuid.UUID
	FileName   string
	Path       string
	MimeType   string
	Category   string
	Size       int64
	ActorID    *uuid.UUID
}

func (s *Service) CreateAttachment(ctx context.Context, companyID uuid.UUID, in CreateAttachmentInput) (*support.Attachment, error) {
	a, err := support.NewAttachment(companyID, in.EntityType, in.EntityID, in.FileName, in.Path, in.MimeType, in.Category, in.Size)
	if err != nil {
		return nil, err
	}
	if err := s.att.Create(ctx, a); err != nil {
		return nil, err
	}
	act, _ := support.NewActivity(companyID, in.EntityType, in.EntityID, "AttachmentAdded", in.ActorID, map[string]any{
		"attachment_id": a.ID, "file_name": a.FileName,
	})
	_ = s.act.Append(ctx, act)
	return a, nil
}

func (s *Service) ListAttachments(ctx context.Context, companyID uuid.UUID, entityType string, entityID uuid.UUID) ([]support.Attachment, error) {
	return s.att.ListByEntity(ctx, companyID, entityType, entityID)
}

func (s *Service) ListActivity(ctx context.Context, companyID uuid.UUID, entityType string, entityID uuid.UUID, q shared.PageQuery) ([]support.ActivityLog, shared.PageMeta, error) {
	items, total, err := s.act.ListByEntity(ctx, companyID, entityType, entityID, q)
	if err != nil {
		return nil, shared.PageMeta{}, err
	}
	return items, shared.NewPageMeta(q, total), nil
}

func (s *Service) ListNotifications(ctx context.Context, companyID uuid.UUID, q shared.PageQuery) ([]support.Notification, shared.PageMeta, error) {
	items, total, err := s.ntf.ListByCompany(ctx, companyID, q)
	if err != nil {
		return nil, shared.PageMeta{}, err
	}
	return items, shared.NewPageMeta(q, total), nil
}

// ListNotificationsForReceiver returns the personal inbox for an employee.
func (s *Service) ListNotificationsForReceiver(ctx context.Context, companyID, receiverID uuid.UUID, q shared.PageQuery) ([]support.Notification, shared.PageMeta, error) {
	items, total, err := s.ntf.ListByReceiver(ctx, companyID, receiverID, q)
	if err != nil {
		return nil, shared.PageMeta{}, err
	}
	return items, shared.NewPageMeta(q, total), nil
}

func (s *Service) MarkNotificationRead(ctx context.Context, companyID, id uuid.UUID) error {
	return s.ntf.MarkRead(ctx, companyID, id)
}
