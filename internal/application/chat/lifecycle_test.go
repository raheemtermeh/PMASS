package chatapp_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	chatapp "PMAS/internal/application/chat"
	"PMAS/internal/domain/chat"
	"PMAS/internal/realtime"
)

func TestLifecycle_EventsPublishedAfterMutations(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	pub := &chatapp.MemoryPublisher{}
	svc.SetPublisher(pub)
	ctx := context.Background()
	a := actor(companyID, empA)

	conv, err := svc.CreateDM(ctx, a, chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	m, err := svc.SendMessage(ctx, a, conv.ID, chatapp.SendMessageInput{Content: "hello lifecycle"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.EditMessage(ctx, a, m.ID, "hello edited"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.AddReaction(ctx, a, m.ID, "✅"); err != nil {
		t.Fatal(err)
	}
	if err := svc.MarkMessageDelivered(ctx, actor(companyID, empB), m.ID); err != nil {
		t.Fatal(err)
	}
	if err := svc.MarkMessageRead(ctx, actor(companyID, empB), m.ID); err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteMessage(ctx, a, m.ID); err != nil {
		t.Fatal(err)
	}

	types := map[string]int{}
	for _, e := range pub.Events {
		types[e.Type]++
	}
	for _, want := range []string{
		realtime.TypeConversationCreated,
		realtime.TypeMessageCreated,
		realtime.TypeMessageUpdated,
		realtime.TypeMessageReactionAdded,
		realtime.TypeMessageDelivered,
		realtime.TypeMessageRead,
		realtime.TypeMessageDeleted,
	} {
		if types[want] < 1 {
			t.Fatalf("missing event %s in %#v", want, types)
		}
	}
}

func TestUnread_ReadReducesCount(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	a := actor(companyID, empA)
	b := actor(companyID, empB)
	conv, err := svc.CreateDM(ctx, a, chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SendMessage(ctx, a, conv.ID, chatapp.SendMessageInput{Content: "one"}); err != nil {
		t.Fatal(err)
	}
	time.Sleep(time.Millisecond)
	m2, err := svc.SendMessage(ctx, a, conv.ID, chatapp.SendMessageInput{Content: "two"})
	if err != nil {
		t.Fatal(err)
	}

	page, err := svc.ListConversations(ctx, b, "", 50)
	if err != nil {
		t.Fatal(err)
	}
	var unread int64
	for _, item := range page.Items {
		if item.ID == conv.ID {
			unread = item.UnreadCount
		}
	}
	if unread < 1 {
		t.Fatalf("expected unread >= 1, got %d", unread)
	}

	if err := svc.MarkConversationReadUpTo(ctx, b, conv.ID, m2.ID); err != nil {
		t.Fatal(err)
	}
	page, err = svc.ListConversations(ctx, b, "", 50)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range page.Items {
		if item.ID == conv.ID && item.UnreadCount != 0 {
			t.Fatalf("expected unread 0 after read-up-to, got %d", item.UnreadCount)
		}
	}
}

func TestPreview_DeleteLatestRecalculates(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	a := actor(companyID, empA)
	conv, err := svc.CreateDM(ctx, a, chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	m1, err := svc.SendMessage(ctx, a, conv.ID, chatapp.SendMessageInput{Content: "first-preview"})
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(time.Millisecond)
	m2, err := svc.SendMessage(ctx, a, conv.ID, chatapp.SendMessageInput{Content: "second-preview"})
	if err != nil {
		t.Fatal(err)
	}
	got, err := svc.GetConversation(ctx, a, conv.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.LastMessageID == nil || *got.LastMessageID != m2.ID {
		t.Fatalf("expected last_message_id=%s got %v", m2.ID, got.LastMessageID)
	}
	if err := svc.DeleteMessage(ctx, a, m2.ID); err != nil {
		t.Fatal(err)
	}
	got, err = svc.GetConversation(ctx, a, conv.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.LastMessageID == nil || *got.LastMessageID != m1.ID {
		t.Fatalf("expected preview fallback to %s got %v", m1.ID, got.LastMessageID)
	}
}

func TestPreview_EditLatestUpdates(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	a := actor(companyID, empA)
	conv, err := svc.CreateDM(ctx, a, chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	m, err := svc.SendMessage(ctx, a, conv.ID, chatapp.SendMessageInput{Content: "original"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.EditMessage(ctx, a, m.ID, "edited-latest"); err != nil {
		t.Fatal(err)
	}
	got, err := svc.GetConversation(ctx, a, conv.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.LastMessagePreview != "edited-latest" {
		t.Fatalf("preview=%q", got.LastMessagePreview)
	}
}

func TestPreview_EditOldDoesNotChange(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	a := actor(companyID, empA)
	conv, err := svc.CreateDM(ctx, a, chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	m1, err := svc.SendMessage(ctx, a, conv.ID, chatapp.SendMessageInput{Content: "old"})
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(time.Millisecond)
	if _, err := svc.SendMessage(ctx, a, conv.ID, chatapp.SendMessageInput{Content: "new"}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.EditMessage(ctx, a, m1.ID, "old-edited"); err != nil {
		t.Fatal(err)
	}
	got, err := svc.GetConversation(ctx, a, conv.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.LastMessagePreview != "new" {
		t.Fatalf("preview should stay new, got %q", got.LastMessagePreview)
	}
}

func TestSync_AfterMessageID(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	a := actor(companyID, empA)
	conv, err := svc.CreateDM(ctx, a, chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	m1, err := svc.SendMessage(ctx, a, conv.ID, chatapp.SendMessageInput{Content: "sync-1"})
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(time.Millisecond)
	m2, err := svc.SendMessage(ctx, a, conv.ID, chatapp.SendMessageInput{Content: "sync-2"})
	if err != nil {
		t.Fatal(err)
	}
	page, err := svc.SyncMessages(ctx, a, conv.ID, &m1.ID, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != m2.ID {
		t.Fatalf("sync items=%v", page.Items)
	}
}

func TestDelivered_Idempotent(t *testing.T) {
	svc, _, companyID, empA, empB := testService(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	m, err := svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{Content: "d"})
	if err != nil {
		t.Fatal(err)
	}
	b := actor(companyID, empB)
	if err := svc.MarkMessageDelivered(ctx, b, m.ID); err != nil {
		t.Fatal(err)
	}
	if err := svc.MarkMessageDelivered(ctx, b, m.ID); err != nil {
		t.Fatal(err)
	}
}

func TestSync_CrossCompanyDenied(t *testing.T) {
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
	_, err = svc.SyncMessages(ctx, actor(otherCompany, otherEmp), conv.ID, nil, 10)
	if err == nil {
		t.Fatal("expected cross-company sync denial")
	}
	if err != chat.ErrConversationNotFound && err != chat.ErrMessageNotFound {
		// membership miss maps to conversation not found
		t.Logf("got error %v (acceptable denial)", err)
	}
}
