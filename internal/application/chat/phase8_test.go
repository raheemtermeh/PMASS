package chatapp_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	chatapp "PMAS/internal/application/chat"
	"PMAS/internal/auth"
	"PMAS/internal/domain/chat"
	"PMAS/internal/domain/shared"
	"PMAS/internal/infrastructure/postgres"
)

func phase8Service(t *testing.T) (*chatapp.Service, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	svc, db, companyID, empA, empB := testService(t)
	pg := postgres.New(db)
	svc.WithMentions(postgres.NewMentionRepo(pg)).
		WithNotifications(postgres.NewNotificationRepo(pg)).
		WithPresence(postgres.NewPresenceRepo(pg)).
		WithDrafts(postgres.NewDraftRepo(pg)).
		WithInvitations(postgres.NewInvitationRepo(pg))
	return svc, companyID, empA, empB
}

func TestOwnershipTransferAndRoles(t *testing.T) {
	svc, companyID, empA, empB := phase8Service(t)
	ctx := context.Background()
	g, err := svc.CreateGroup(ctx, actor(companyID, empA), chatapp.CreateGroupInput{
		Name: "phase8-own-" + uuid.New().String()[:6], MemberIDs: []uuid.UUID{empB},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.TransferOwnership(ctx, actor(companyID, empA), g.ID, empB); err != nil {
		t.Fatal(err)
	}
	members, err := svc.ListMembers(ctx, actor(companyID, empB), g.ID, 20)
	if err != nil {
		t.Fatal(err)
	}
	var aRole, bRole string
	for _, m := range members {
		if m.EmployeeID == empA {
			aRole = m.Role
		}
		if m.EmployeeID == empB {
			bRole = m.Role
		}
	}
	if bRole != chat.MemberRoleOwner || aRole != chat.MemberRoleAdmin {
		t.Fatalf("roles after transfer a=%s b=%s", aRole, bRole)
	}
	if err := svc.UpdateMemberRole(ctx, actor(companyID, empB), g.ID, empA, chat.MemberRoleModerator); err != nil {
		t.Fatal(err)
	}
	// Cannot set owner via role patch
	if err := svc.UpdateMemberRole(ctx, actor(companyID, empB), g.ID, empA, chat.MemberRoleOwner); err != chat.ErrInvalidRoleChange {
		t.Fatalf("expected invalid role change, got %v", err)
	}
}

func TestInvitations_AcceptReject(t *testing.T) {
	svc, companyID, empA, empB := phase8Service(t)
	ctx := context.Background()
	// Need a third employee for invitee who is not already a member.
	g, err := svc.CreateGroup(ctx, actor(companyID, empA), chatapp.CreateGroupInput{
		Name: "phase8-inv-" + uuid.New().String()[:6],
	})
	if err != nil {
		t.Fatal(err)
	}
	inv, err := svc.CreateInvitation(ctx, actor(companyID, empA), g.ID, empB, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreateInvitation(ctx, actor(companyID, empA), g.ID, empB, 0); err == nil {
		t.Fatal("duplicate pending invitation should fail")
	}
	page, err := svc.ListMyInvitations(ctx, actor(companyID, empB), chat.InvitationStatusPending, "", 20)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, i := range page.Items {
		if i.ID == inv.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("invitee should see invitation")
	}
	if err := svc.AcceptInvitation(ctx, actor(companyID, empB), inv.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.GetConversation(ctx, actor(companyID, empB), g.ID); err != nil {
		t.Fatal("accepted invite should grant membership")
	}
}

func TestRemoveMember_CannotSelfOrOwner(t *testing.T) {
	svc, companyID, empA, empB := phase8Service(t)
	ctx := context.Background()
	g, err := svc.CreateGroup(ctx, actor(companyID, empA), chatapp.CreateGroupInput{
		Name: "phase8-rm-" + uuid.New().String()[:6], MemberIDs: []uuid.UUID{empB},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.RemoveMember(ctx, actor(companyID, empA), g.ID, empA); err == nil {
		t.Fatal("self-remove via admin endpoint denied")
	}
	if err := svc.RemoveMember(ctx, actor(companyID, empB), g.ID, empA); err == nil {
		t.Fatal("member cannot remove owner")
	}
	ownerActor := actor(companyID, empA)
	ownerActor.Perms = append(ownerActor.Perms, auth.PermChatModerate)
	if err := svc.RemoveMember(ctx, ownerActor, g.ID, empA); err == nil {
		t.Fatal("cannot remove owner without transfer")
	}
}

func TestMemberSettingsAndBlocksList(t *testing.T) {
	svc, companyID, empA, empB := phase8Service(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	muted := true
	level := chat.NotificationLevelMentions
	m, err := svc.UpdateMemberSettings(ctx, actor(companyID, empA), conv.ID, chatapp.MemberSettingsInput{
		IsMuted: &muted, NotificationLevel: &level,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !m.IsMuted || m.NotificationLevel != chat.NotificationLevelMentions {
		t.Fatalf("%#v", m)
	}
	if err := svc.ArchiveConversation(ctx, actor(companyID, empA), conv.ID); err != nil {
		t.Fatal(err)
	}
	if err := svc.BlockUser(ctx, actor(companyID, empA), empB); err != nil {
		t.Fatal(err)
	}
	blocks, err := svc.ListBlocks(ctx, actor(companyID, empA), "", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(blocks.Items) == 0 {
		t.Fatal("expected blocks")
	}
	_, err = svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{Content: "blocked?"})
	if err != chat.ErrBlocked && err != shared.ErrForbidden {
		// ErrBlocked expected
		if err == nil {
			t.Fatal("send should be blocked")
		}
	}
}

func TestForwardAtomicAuthorization(t *testing.T) {
	svc, companyID, empA, empB := phase8Service(t)
	ctx := context.Background()
	dm, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	msg, err := svc.SendMessage(ctx, actor(companyID, empA), dm.ID, chatapp.SendMessageInput{Content: "fwd source"})
	if err != nil {
		t.Fatal(err)
	}
	foreign := uuid.New()
	_, err = svc.ForwardMessage(ctx, actor(companyID, empA), msg.ID, chatapp.ForwardMessageInput{
		TargetConversationIDs: []uuid.UUID{dm.ID, foreign},
	})
	if err == nil {
		t.Fatal("forward with unauthorized target must fail entirely")
	}
}

func TestThreadAndBookmarksList(t *testing.T) {
	svc, companyID, empA, empB := phase8Service(t)
	ctx := context.Background()
	conv, err := svc.CreateDM(ctx, actor(companyID, empA), chatapp.CreateDMInput{OtherEmployeeID: empB})
	if err != nil {
		t.Fatal(err)
	}
	parent, err := svc.SendMessage(ctx, actor(companyID, empA), conv.ID, chatapp.SendMessageInput{Content: "thread root"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ReplyToMessage(ctx, actor(companyID, empB), parent.ID, "reply 1"); err != nil {
		t.Fatal(err)
	}
	page, err := svc.ListThread(ctx, actor(companyID, empA), parent.ID, chat.MessageListQuery{Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) < 2 {
		t.Fatalf("expected thread items, got %d", len(page.Items))
	}
	if err := svc.AddBookmark(ctx, actor(companyID, empA), parent.ID); err != nil {
		t.Fatal(err)
	}
	bm, err := svc.ListBookmarks(ctx, actor(companyID, empA), "", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(bm.Items) == 0 {
		t.Fatal("expected bookmarks")
	}
}
