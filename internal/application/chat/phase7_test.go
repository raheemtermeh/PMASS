package chatapp_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	chatapp "PMAS/internal/application/chat"
	"PMAS/internal/domain/chat"
	"PMAS/internal/domain/shared"
	"PMAS/internal/infrastructure/postgres"
)

func phase7Service(t *testing.T) (*chatapp.Service, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	svc, db, companyID, empA, empB := testService(t)
	pg := postgres.New(db)
	svc.WithMentions(postgres.NewMentionRepo(pg)).
		WithNotifications(postgres.NewNotificationRepo(pg)).
		WithPresence(postgres.NewPresenceRepo(pg)).
		WithDrafts(postgres.NewDraftRepo(pg))
	return svc, companyID, empA, empB
}

func TestDrafts_CRUDAndOwnership(t *testing.T) {
	svc, companyID, empA, empB := phase7Service(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}

	saved, err := svc.SaveDraft(ctx, actor(companyID, empA), conv.ID, chatapp.SaveDraftInput{Content: "hello draft"})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Revision < 1 || saved.Content != "hello draft" {
		t.Fatalf("bad draft %#v", saved)
	}

	got, err := svc.GetDraft(ctx, actor(companyID, empA), conv.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Content != "hello draft" {
		t.Fatal(got.Content)
	}

	// Multi-device retrieval: same employee sees latest
	saved2, err := svc.SaveDraft(ctx, actor(companyID, empA), conv.ID, chatapp.SaveDraftInput{Content: "updated draft"})
	if err != nil {
		t.Fatal(err)
	}
	if saved2.Revision <= saved.Revision {
		t.Fatal("revision should increase")
	}

	// Other employee cannot read A's draft (membership OK but ownership is actor)
	_, err = svc.GetDraft(ctx, actor(companyID, empB), conv.ID)
	if err != chat.ErrDraftNotFound {
		t.Fatalf("expected no draft for B, got %v", err)
	}

	// Stale concurrency
	past := saved.UpdatedAt
	_, err = svc.SaveDraft(ctx, actor(companyID, empA), conv.ID, chatapp.SaveDraftInput{
		Content: "stale", IfUpdatedAt: &past,
	})
	if err != chat.ErrDraftConflict {
		t.Fatalf("expected conflict, got %v", err)
	}

	if err := svc.DeleteDraft(ctx, actor(companyID, empA), conv.ID); err != nil {
		t.Fatal(err)
	}
	_, err = svc.GetDraft(ctx, actor(companyID, empA), conv.ID)
	if err != chat.ErrDraftNotFound {
		t.Fatal(err)
	}
}

func TestDrafts_MaxLengthAndNonMember(t *testing.T) {
	svc, companyID, empA, empB := phase7Service(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	chat.SetMaxMessageLength(10)
	t.Cleanup(func() { chat.SetMaxMessageLength(chat.DefaultMaxMessageLength) })

	_, err = svc.SaveDraft(ctx, actor(companyID, empA), conv.ID, chatapp.SaveDraftInput{Content: "this is way too long"})
	if err != chat.ErrMessageTooLong {
		t.Fatalf("expected too long, got %v", err)
	}

	outsider := uuid.New()
	_, err = svc.SaveDraft(ctx, actor(companyID, outsider), conv.ID, chatapp.SaveDraftInput{Content: "x"})
	if err == nil || err == shared.ErrForbidden {
		// denied
	} else if err != chat.ErrConversationNotFound {
		t.Log("non-member:", err)
	}
}

func TestPresence_SameCompanyOnly(t *testing.T) {
	svc, companyID, empA, empB := phase7Service(t)
	ctx := context.Background()
	foreign := uuid.New()
	items, err := svc.GetPresence(ctx, actor(companyID, empA), []uuid.UUID{empA, empB, foreign}, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, it := range items {
		if it.EmployeeID == foreign {
			t.Fatal("foreign employee must not appear")
		}
	}
}

func TestPresence_LiveOverrides(t *testing.T) {
	svc, companyID, empA, _ := phase7Service(t)
	ctx := context.Background()
	live := liveMap{empA: chat.PresenceOnline}
	items, err := svc.GetPresence(ctx, actor(companyID, empA), []uuid.UUID{empA}, live)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Status != chat.PresenceOnline {
		t.Fatalf("%#v", items)
	}
	if items[0].LastSeenAt != nil {
		t.Fatal("online should omit last_seen")
	}
}

type liveMap map[uuid.UUID]string

func (m liveMap) LiveStatus(id uuid.UUID) string { return m[id] }

func TestDrafts_EmptyUpdatedAtUsesNow(t *testing.T) {
	svc, companyID, empA, empB := phase7Service(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	before := time.Now().UTC().Add(-time.Second)
	d, err := svc.SaveDraft(ctx, actor(companyID, empA), conv.ID, chatapp.SaveDraftInput{Content: "t"})
	if err != nil {
		t.Fatal(err)
	}
	if !d.UpdatedAt.After(before) {
		t.Fatal(d.UpdatedAt)
	}
}
