package support

import (
	"strings"
	"time"

	"github.com/google/uuid"

	"PMAS/internal/domain/shared"
)

type Comment struct {
	shared.BaseModel
	CompanyID  uuid.UUID  `json:"company_id"`
	EntityType string     `json:"entity_type"`
	EntityID   uuid.UUID  `json:"entity_id"`
	AuthorID   uuid.UUID  `json:"author_id"`
	ParentID   *uuid.UUID `json:"parent_id,omitempty"`
	Body       string     `json:"body"`
	IsArchived bool       `json:"is_archived"`
}

func NewComment(companyID uuid.UUID, entityType string, entityID, authorID uuid.UUID, body string, parentID *uuid.UUID) (*Comment, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, shared.New("COMMENT_BODY_REQUIRED", "Comment body is required", 400)
	}
	if companyID == uuid.Nil || entityID == uuid.Nil || authorID == uuid.Nil {
		return nil, shared.New("COMMENT_INVALID", "Invalid comment references", 400)
	}
	return &Comment{
		BaseModel:  shared.NewBase(),
		CompanyID:  companyID,
		EntityType: strings.TrimSpace(entityType),
		EntityID:   entityID,
		AuthorID:   authorID,
		ParentID:   parentID,
		Body:       body,
	}, nil
}

type Attachment struct {
	shared.BaseModel
	CompanyID  uuid.UUID `json:"company_id"`
	EntityType string    `json:"entity_type"`
	EntityID   uuid.UUID `json:"entity_id"`
	FileName   string    `json:"file_name"`
	Path       string    `json:"path"`
	Size       int64     `json:"size"`
	MimeType   string    `json:"mime_type"`
	Category   string    `json:"category"`
}

func NewAttachment(companyID uuid.UUID, entityType string, entityID uuid.UUID, fileName, path, mimeType, category string, size int64) (*Attachment, error) {
	fileName = strings.TrimSpace(fileName)
	path = strings.TrimSpace(path)
	if fileName == "" || path == "" {
		return nil, shared.New("ATTACHMENT_INVALID", "file_name and path are required", 400)
	}
	if category == "" {
		category = "general"
	}
	return &Attachment{
		BaseModel:  shared.NewBase(),
		CompanyID:  companyID,
		EntityType: strings.TrimSpace(entityType),
		EntityID:   entityID,
		FileName:   fileName,
		Path:       path,
		Size:       size,
		MimeType:   mimeType,
		Category:   category,
	}, nil
}

// Ensure Notification archive field exists on struct for API.
func (n *Notification) MarkRead() {
	n.IsRead = true
	n.UpdatedAt = time.Now().UTC()
}
