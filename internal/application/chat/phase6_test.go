package chatapp_test

import (
	"context"
	"database/sql"
	"testing"

	"github.com/google/uuid"

	chatapp "PMAS/internal/application/chat"
	"PMAS/internal/domain/chat"
	"PMAS/internal/domain/shared"
	"PMAS/internal/infrastructure/postgres"
)

func phase6Service(t *testing.T) (*chatapp.Service, *sql.DB, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	svc, db, companyID, empA, empB := testService(t)
	pg := postgres.New(db)
	svc.WithMentions(postgres.NewMentionRepo(pg)).WithNotifications(postgres.NewNotificationRepo(pg))
	return svc, db, companyID, empA, empB
}

func TestSearch_ConversationAndGlobal(t *testing.T) {
	svc, _, companyID, empA, empB := phase6Service(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	unique := "phase6search-" + uuid.New().String()[:8]
	if _, err := svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{
		Content: "please review " + unique + " database notes",
	}); err != nil {
		t.Fatal(err)
	}

	page, err := svc.SearchConversation(ctx, actor(companyID, empA), conv.ID, chat.SearchQuery{Query: unique, Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) == 0 {
		t.Fatal("expected conversation search hit")
	}

	global, err := svc.SearchGlobal(ctx, actor(companyID, empB), chat.SearchQuery{Query: unique, Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	if len(global.Items) == 0 {
		t.Fatal("expected global search hit for member")
	}

	if _, err := svc.SearchGlobal(ctx, actor(companyID, empA), chat.SearchQuery{Query: "x", Limit: 20}); err != chat.ErrSearchQueryTooShort {
		t.Fatalf("expected short query error, got %v", err)
	}
}

func TestSearch_DeletedExcluded(t *testing.T) {
	svc, _, companyID, empA, empB := phase6Service(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	unique := "phase6del-" + uuid.New().String()[:8]
	m, err := svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{Content: unique + " will delete"})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteMessage(ctx, actor(companyID, empA), m.ID); err != nil {
		t.Fatal(err)
	}
	page, err := svc.SearchConversation(ctx, actor(companyID, empA), conv.ID, chat.SearchQuery{Query: unique})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 0 {
		t.Fatal("deleted messages must be excluded")
	}
}

func TestSearch_NonMemberDenied(t *testing.T) {
	svc, _, companyID, empA, empB := phase6Service(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	outsider := uuid.New()
	_, err = svc.SearchConversation(ctx, actor(companyID, outsider), conv.ID, chat.SearchQuery{Query: "ab"})
	if err == nil {
		t.Fatal("non-member search must fail")
	}
	if err != chat.ErrConversationNotFound && err != shared.ErrForbidden {
		// membership check returns conversation not found by design
		t.Log("non-member error:", err)
	}
}

func TestSearch_MalformedCursor(t *testing.T) {
	svc, _, companyID, empA, empB := phase6Service(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.SearchConversation(ctx, actor(companyID, empA), conv.ID, chat.SearchQuery{
		Query: "ab", Cursor: "!!!not-a-cursor!!!",
	})
	if err != chat.ErrInvalidCursor {
		t.Fatalf("expected invalid cursor, got %v", err)
	}
}

func TestNotifications_DMMuteAndOwnership(t *testing.T) {
	svc, db, companyID, empA, empB := phase6Service(t)
	ctx := context.Background()
	repo := postgres.NewNotificationRepo(postgres.New(db))

	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	m, err := svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{Content: "dm hello phase6"})
	if err != nil {
		t.Fatal(err)
	}

	itemsB, _, err := repo.ListByReceiverCursor(ctx, companyID, empB, "", 50, false)
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	var notifID uuid.UUID
	for _, n := range itemsB {
		if n.Type == chat.NotifTypeDM && n.SourceID != nil && *n.SourceID == m.ID {
			found = true
			notifID = n.ID
			want := "/chat/" + conv.ID.String() + "?message=" + m.ID.String()
			if n.ActionURL != want {
				t.Fatalf("deep link got %q want %q", n.ActionURL, want)
			}
			break
		}
	}
	if !found {
		t.Fatal("expected DM notification with deep link")
	}

	itemsA, _, err := repo.ListByReceiverCursor(ctx, companyID, empA, "", 50, false)
	if err != nil {
		t.Fatal(err)
	}
	for _, n := range itemsA {
		if n.Type == chat.NotifTypeDM && n.SourceID != nil && *n.SourceID == m.ID {
			t.Fatal("sender must not receive own DM notification")
		}
	}

	if err := repo.MarkRead(ctx, companyID, empA, notifID); err == nil {
		t.Fatal("other employee must not mark notification read")
	}
	if err := repo.MarkRead(ctx, companyID, empB, notifID); err != nil {
		t.Fatal(err)
	}

	// Mute empB and ensure no further DM notifications for a new message.
	if _, err := db.ExecContext(ctx, `
		UPDATE conversation_members SET is_muted=true, notification_level='none'
		WHERE company_id=$1 AND conversation_id=$2 AND employee_id=$3`,
		companyID, conv.ID, empB); err != nil {
		t.Fatal(err)
	}
	m2, err := svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{Content: "muted should not notify"})
	if err != nil {
		t.Fatal(err)
	}
	itemsB2, _, err := repo.ListByReceiverCursor(ctx, companyID, empB, "", 50, false)
	if err != nil {
		t.Fatal(err)
	}
	for _, n := range itemsB2 {
		if n.SourceID != nil && *n.SourceID == m2.ID {
			t.Fatal("muted member must not receive notification")
		}
	}

	n, err := repo.MarkAllRead(ctx, companyID, empB)
	if err != nil {
		t.Fatal(err)
	}
	_ = n
	unread, err := repo.CountUnread(ctx, companyID, empB)
	if err != nil {
		t.Fatal(err)
	}
	if unread != 0 {
		t.Fatalf("expected 0 unread after read-all, got %d", unread)
	}
}
