package chatapp_test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"

	chatapp "PMAS/internal/application/chat"
	"PMAS/internal/auth"
	"PMAS/internal/database"
	"PMAS/internal/domain/chat"
	"PMAS/internal/domain/shared"
	"PMAS/internal/infrastructure/postgres"
)

func testService(t *testing.T) (*chatapp.Service, *sql.DB, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	dsn := os.Getenv("SUPABASE_DB_URL")
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}
	if dsn == "" {
		t.Skip("database URL not set")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.PingWithTimeout(db, 5*time.Second); err != nil {
		t.Skip(err)
	}
	if err := database.EnsureSchema(db); err != nil {
		t.Fatal(err)
	}
	pg := postgres.New(db)
	svc := chatapp.NewService(pg,
		postgres.NewConversationRepo(pg),
		postgres.NewMessageRepo(pg),
		postgres.NewReactionRepo(pg),
		postgres.NewBookmarkRepo(pg),
		postgres.NewPinRepo(pg),
		postgres.NewModerationRepo(pg),
		postgres.NewAuditRepo(pg),
		1000,
		chatapp.NoopPublisher{},
	)
	ctx := context.Background()
	var companyID uuid.UUID
	if err := db.QueryRowContext(ctx, `SELECT id FROM companies ORDER BY created_at LIMIT 1`).Scan(&companyID); err != nil {
		t.Skip("no company:", err)
	}
	empA, empB := uuid.New(), uuid.New()
	// Use existing employees when available.
	rows, err := db.QueryContext(ctx, `SELECT id FROM employees WHERE company_id=$1 AND status='ACTIVE' LIMIT 2`, companyID)
	if err == nil {
		var ids []uuid.UUID
		for rows.Next() {
			var id uuid.UUID
			if err := rows.Scan(&id); err == nil {
				ids = append(ids, id)
			}
		}
		rows.Close()
		if len(ids) >= 2 {
			empA, empB = ids[0], ids[1]
		} else if len(ids) == 1 {
			empA = ids[0]
		}
	}
	if empA == empB {
		t.Skip("need two employees")
	}
	return svc, db, companyID, empA, empB
}

func actor(companyID, employeeID uuid.UUID) chatapp.Actor {
	return chatapp.Actor{
		CompanyID:  companyID,
		EmployeeID: employeeID,
		Role:       auth.RoleUser,
		Perms:      []string{auth.PermChatView, auth.PermChatSend, auth.PermChatCreateChannel, auth.PermChatModerate},
	}
}

func TestCreateDM_Deduplicates(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	c1, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	c2, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	if c1.ID != c2.ID {
		t.Fatalf("expected same DM, got %s and %s", c1.ID, c2.ID)
	}
}

func TestMessagePagination_51Messages(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	a := actor(companyID, empA)
	conv, err := svc.CreateDM(ctx, a, chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}

	for i := 0; i < 51; i++ {
		_, err := svc.SendMessage(ctx, a, conv.ID, chatapp.SendMessageInput{
			Content: fmt.Sprintf("msg-%d", i),
		})
		if err != nil {
			t.Fatal(err)
		}
		time.Sleep(time.Millisecond)
	}

	page1, err := svc.ListMessages(ctx, a, conv.ID, chat.MessageListQuery{Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if len(page1.Items) != 50 {
		t.Fatalf("page1 len=%d", len(page1.Items))
	}
	if !page1.HasMore || page1.NextCursor == "" {
		t.Fatal("expected more pages")
	}

	page2, err := svc.ListMessages(ctx, a, conv.ID, chat.MessageListQuery{Limit: 50, Cursor: page1.NextCursor})
	if err != nil {
		t.Fatal(err)
	}
	if len(page2.Items) != 1 {
		t.Fatalf("page2 len=%d", len(page2.Items))
	}

	seen := map[uuid.UUID]struct{}{}
	for _, m := range append(page1.Items, page2.Items...) {
		if _, dup := seen[m.ID]; dup {
			t.Fatalf("duplicate %s", m.ID)
		}
		seen[m.ID] = struct{}{}
	}
}

func TestTenantIsolation_Conversation(t *testing.T) {
	svc, db, companyID, empA, empB := testService(t)
	ctx := context.Background()
	var otherCompany uuid.UUID
	if err := db.QueryRowContext(ctx, `SELECT id FROM companies WHERE id <> $1 LIMIT 1`, companyID).Scan(&otherCompany); err != nil {
		t.Skip("need second company")
	}
	var otherEmp uuid.UUID
	if err := db.QueryRowContext(ctx, `SELECT id FROM employees WHERE company_id=$1 AND status='ACTIVE' LIMIT 1`, otherCompany).Scan(&otherEmp); err != nil {
		t.Skip("need employee in other company")
	}

	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.GetConversation(ctx, actor(otherCompany, otherEmp), conv.ID)
	if err != chat.ErrConversationNotFound {
		t.Fatalf("got %v", err)
	}
}

func TestEditMessage_ForbiddenForOtherUser(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	m, err := svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{Content: "hello"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.EditMessage(ctx, actor(companyID, empB), m.ID, "hacked")
	if err != shared.ErrForbidden {
		t.Fatalf("got %v", err)
	}
}

func TestDeleteMessage_NotInFeed(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	m, err := svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{Content: "delete me"})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteMessage(ctx, actor(companyID, empA), m.ID); err != nil {
		t.Fatal(err)
	}
	page, err := svc.ListMessages(ctx, actor(companyID, empA), conv.ID, chat.MessageListQuery{Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range page.Items {
		if item.ID == m.ID {
			t.Fatal("deleted message still in feed")
		}
	}
}

func TestMalformedCursor(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.ListMessages(ctx, actor(companyID, empA), conv.ID, chat.MessageListQuery{Limit: 10, Cursor: "not-valid"})
	if err != chat.ErrInvalidCursor {
		t.Fatalf("got %v", err)
	}
}

func TestReactions_AddAndDuplicate(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	m, err := svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{Content: "react me"})
	if err != nil {
		t.Fatal(err)
	}
	reactions, err := svc.AddReaction(ctx, actor(companyID, empA), m.ID, "👍")
	if err != nil {
		t.Fatal(err)
	}
	if len(reactions) != 1 {
		t.Fatalf("expected 1 reaction, got %d", len(reactions))
	}
	reactions, err = svc.AddReaction(ctx, actor(companyID, empA), m.ID, "👍")
	if err != nil {
		t.Fatal(err)
	}
	if len(reactions) != 1 {
		t.Fatalf("duplicate reaction should not create second entry, got %d", len(reactions))
	}
	reactions, err = svc.RemoveReaction(ctx, actor(companyID, empA), m.ID, "👍")
	if err != nil {
		t.Fatal(err)
	}
	if len(reactions) != 0 {
		t.Fatalf("expected 0 reactions after remove, got %d", len(reactions))
	}
}

func TestBookmark_AddRemove(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	m, err := svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{Content: "bookmark me"})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.AddBookmark(ctx, actor(companyID, empA), m.ID); err != nil {
		t.Fatal(err)
	}
	if err := svc.RemoveBookmark(ctx, actor(companyID, empA), m.ID); err != nil {
		t.Fatal(err)
	}
}

func TestPin_Unauthorized(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	m, err := svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{Content: "pin me"})
	if err != nil {
		t.Fatal(err)
	}
	memberActor := chatapp.Actor{
		CompanyID:  companyID,
		EmployeeID: empB,
		Role:       auth.RoleUser,
		Perms:      []string{auth.PermChatView, auth.PermChatSend},
	}
	_, err = svc.PinMessage(ctx, memberActor, conv.ID, m.ID)
	if err != shared.ErrForbidden {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestModeratorDelete(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	m, err := svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{Content: "moderate delete"})
	if err != nil {
		t.Fatal(err)
	}
	modActor := chatapp.Actor{
		CompanyID:  companyID,
		EmployeeID: empB,
		Role:       auth.RoleUser,
		Perms:      []string{auth.PermChatView, auth.PermChatSend, auth.PermChatModerate},
	}
	if err := svc.DeleteMessage(ctx, modActor, m.ID); err != nil {
		t.Fatal(err)
	}
	page, err := svc.ListMessages(ctx, actor(companyID, empA), conv.ID, chat.MessageListQuery{Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range page.Items {
		if item.ID == m.ID {
			t.Fatal("moderator-deleted message still in feed")
		}
	}
}

func TestSendMessage_EmptyRejected(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{Content: "   "})
	if err != chat.ErrMessageBodyRequired {
		t.Fatalf("got %v", err)
	}
}

func TestSendMessage_InvalidType(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{
		Content:     "system hack",
		MessageType: "SYSTEM",
	})
	if err != chat.ErrInvalidMessageType {
		t.Fatalf("got %v", err)
	}
}

func TestReplyToMessage(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	parent, err := svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{Content: "parent"})
	if err != nil {
		t.Fatal(err)
	}
	reply, err := svc.ReplyToMessage(ctx, actor(companyID, empB), parent.ID, "reply text")
	if err != nil {
		t.Fatal(err)
	}
	if reply.ParentMessageID == nil || *reply.ParentMessageID != parent.ID {
		t.Fatal("reply missing parent_message_id")
	}
	if reply.ThreadRootID == nil || *reply.ThreadRootID != parent.ID {
		t.Fatal("reply missing thread_root_id")
	}
}

func TestBlock_PreventsNewDM(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	if err := svc.BlockUser(ctx, actor(companyID, empA), empB); err != nil {
		t.Fatal(err)
	}
	_, err := svc.CreateDM(ctx, actor(companyID, empB), chatapp.CreateDMInput{OtherEmployeeID: empA})
	if err == nil {
		t.Fatal("expected block to prevent DM creation")
	}
}
