package postgres_test

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"

	"PMAS/internal/database"
	"PMAS/internal/domain/chat"
	"PMAS/internal/infrastructure/postgres"
)

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("SUPABASE_DB_URL")
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}
	if dsn == "" {
		t.Skip("SUPABASE_DB_URL or DATABASE_URL not set — skipping chat repository integration test")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.PingWithTimeout(db, 5*time.Second); err != nil {
		t.Skip("database unreachable:", err)
	}
	if err := database.EnsureSchema(db); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestChatRepo_TenantIsolation(t *testing.T) {
	sqlDB := testDB(t)
	defer sqlDB.Close()

	ctx := context.Background()
	db := postgres.New(sqlDB)
	convRepo := postgres.NewConversationRepo(db)
	msgRepo := postgres.NewMessageRepo(db)

	var companyA, companyB uuid.UUID
	if err := sqlDB.QueryRowContext(ctx, `SELECT id FROM companies ORDER BY created_at LIMIT 1`).Scan(&companyA); err != nil {
		t.Skip("no companies in database:", err)
	}
	if err := sqlDB.QueryRowContext(ctx, `SELECT id FROM companies WHERE id <> $1 ORDER BY created_at LIMIT 1`, companyA).Scan(&companyB); err != nil {
		t.Skip("need at least two companies for isolation test:", err)
	}

	conv, err := chat.NewConversation(companyA, chat.ConversationTypeGroup, "Isolation Test", "", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := convRepo.CreateConversation(ctx, conv); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = sqlDB.Exec(`UPDATE conversations SET deleted_at=NOW() WHERE id=$1`, conv.ID)
	})

	sender := uuid.New()
	msg, err := chat.NewMessage(companyA, conv.ID, &sender, chat.MessageTypeText, "tenant boundary", chat.ContentFormatPlain)
	if err != nil {
		t.Fatal(err)
	}
	if err := msgRepo.CreateMessage(ctx, msg); err != nil {
		t.Fatal(err)
	}

	_, err = convRepo.GetConversationByID(ctx, companyB, conv.ID)
	if err != chat.ErrConversationNotFound {
		t.Fatalf("cross-company conversation access: got %v want %v", err, chat.ErrConversationNotFound)
	}

	_, err = msgRepo.GetMessageByID(ctx, companyB, msg.ID)
	if err != chat.ErrMessageNotFound {
		t.Fatalf("cross-company message access: got %v want %v", err, chat.ErrMessageNotFound)
	}
}

func TestChatRepo_ListMessagesCursorPagination(t *testing.T) {
	sqlDB := testDB(t)
	defer sqlDB.Close()

	ctx := context.Background()
	db := postgres.New(sqlDB)
	convRepo := postgres.NewConversationRepo(db)
	msgRepo := postgres.NewMessageRepo(db)

	var companyID uuid.UUID
	if err := sqlDB.QueryRowContext(ctx, `SELECT id FROM companies ORDER BY created_at LIMIT 1`).Scan(&companyID); err != nil {
		t.Skip("no companies in database:", err)
	}

	conv, err := chat.NewConversation(companyID, chat.ConversationTypeGroup, "Pagination Test", "", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := convRepo.CreateConversation(ctx, conv); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = sqlDB.Exec(`UPDATE conversations SET deleted_at=NOW() WHERE id=$1`, conv.ID)
	})

	sender := uuid.New()
	for i := 0; i < 3; i++ {
		m, err := chat.NewMessage(companyID, conv.ID, &sender, chat.MessageTypeText, "msg", chat.ContentFormatPlain)
		if err != nil {
			t.Fatal(err)
		}
		m.CreatedAt = time.Now().UTC().Add(time.Duration(i) * time.Millisecond)
		m.UpdatedAt = m.CreatedAt
		if err := msgRepo.CreateMessage(ctx, m); err != nil {
			t.Fatal(err)
		}
		time.Sleep(2 * time.Millisecond)
	}

	page1, cursor, err := msgRepo.ListMessages(ctx, companyID, conv.ID, chat.MessageListQuery{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1 len=%d", len(page1))
	}
	if cursor == "" {
		t.Fatal("expected next cursor")
	}

	page2, _, err := msgRepo.ListMessages(ctx, companyID, conv.ID, chat.MessageListQuery{Limit: 2, Cursor: cursor})
	if err != nil {
		t.Fatal(err)
	}
	if len(page2) < 1 {
		t.Fatalf("page2 len=%d", len(page2))
	}

	seen := map[uuid.UUID]struct{}{}
	for _, m := range append(page1, page2...) {
		if _, dup := seen[m.ID]; dup {
			t.Fatalf("duplicate message id %s across pages", m.ID)
		}
		seen[m.ID] = struct{}{}
	}
}
