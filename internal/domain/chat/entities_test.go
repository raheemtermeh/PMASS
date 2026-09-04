package chat_test

import (
	"strings"
	"testing"

	"github.com/google/uuid"

	"PMAS/internal/domain/chat"
)

func TestNewConversation_ValidChannel(t *testing.T) {
	companyID := uuid.New()
	createdBy := uuid.New()
	c, err := chat.NewConversation(companyID, chat.ConversationTypeChannel, "General", "general", chat.VisibilityPublic, &createdBy)
	if err != nil {
		t.Fatal(err)
	}
	if c.Type != chat.ConversationTypeChannel {
		t.Fatalf("type=%s", c.Type)
	}
	if c.Slug != "general" {
		t.Fatalf("slug=%s", c.Slug)
	}
}

func TestNewConversation_InvalidType(t *testing.T) {
	_, err := chat.NewConversation(uuid.New(), "INVALID", "x", "", "", nil)
	if err != chat.ErrInvalidConversationType {
		t.Fatalf("got %v", err)
	}
}

func TestNewConversation_GroupRequiresName(t *testing.T) {
	_, err := chat.NewConversation(uuid.New(), chat.ConversationTypeGroup, "", "", "", nil)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestNewConversation_ChannelRequiresSlug(t *testing.T) {
	_, err := chat.NewConversation(uuid.New(), chat.ConversationTypeChannel, "General", "", chat.VisibilityPublic, nil)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestNewConversation_InvalidVisibility(t *testing.T) {
	_, err := chat.NewConversation(uuid.New(), chat.ConversationTypeChannel, "General", "general", "SECRET", nil)
	if err != chat.ErrInvalidVisibility {
		t.Fatalf("got %v", err)
	}
}

func TestNewConversationMember_InvalidRole(t *testing.T) {
	_, err := chat.NewConversationMember(uuid.New(), uuid.New(), uuid.New(), "superuser")
	if err != chat.ErrInvalidMemberRole {
		t.Fatalf("got %v", err)
	}
}

func TestNewMessage_TextRequiresContent(t *testing.T) {
	sender := uuid.New()
	_, err := chat.NewMessage(uuid.New(), uuid.New(), &sender, chat.MessageTypeText, "  ", chat.ContentFormatPlain)
	if err != chat.ErrMessageBodyRequired {
		t.Fatalf("got %v", err)
	}
}

func TestNewMessage_SystemRequiresNoSender(t *testing.T) {
	sender := uuid.New()
	_, err := chat.NewMessage(uuid.New(), uuid.New(), &sender, chat.MessageTypeSystem, "joined", chat.ContentFormatPlain)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestNewMessage_TooLong(t *testing.T) {
	chat.SetMaxMessageLength(10)
	t.Cleanup(func() { chat.SetMaxMessageLength(chat.DefaultMaxMessageLength) })

	sender := uuid.New()
	_, err := chat.NewMessage(uuid.New(), uuid.New(), &sender, chat.MessageTypeText, strings.Repeat("a", 11), chat.ContentFormatPlain)
	if err != chat.ErrMessageTooLong {
		t.Fatalf("got %v", err)
	}
}

func TestNewMessageReaction_InvalidEmoji(t *testing.T) {
	_, err := chat.NewMessageReaction(uuid.New(), uuid.New(), "")
	if err != chat.ErrInvalidReactionEmoji {
		t.Fatalf("got %v", err)
	}
}

func TestValidateNotificationLevel(t *testing.T) {
	if err := chat.ValidateNotificationLevel(chat.NotificationLevelMentions); err != nil {
		t.Fatal(err)
	}
	if err := chat.ValidateNotificationLevel("loud"); err != chat.ErrInvalidNotificationLevel {
		t.Fatalf("got %v", err)
	}
}

func TestNewUserPresence_InvalidStatus(t *testing.T) {
	_, err := chat.NewUserPresence(uuid.New(), uuid.New(), "busy")
	if err != chat.ErrInvalidPresenceStatus {
		t.Fatalf("got %v", err)
	}
}

func TestNewMessageReport_InvalidReason(t *testing.T) {
	_, err := chat.NewMessageReport(uuid.New(), uuid.New(), uuid.New(), "noise", "")
	if err != chat.ErrInvalidReportReason {
		t.Fatalf("got %v", err)
	}
}

func TestValidateReportStatus(t *testing.T) {
	if err := chat.ValidateReportStatus(chat.ReportStatusPending); err != nil {
		t.Fatal(err)
	}
	if err := chat.ValidateReportStatus("open"); err != chat.ErrInvalidReportStatus {
		t.Fatalf("got %v", err)
	}
}

func TestMessageListQuery_Normalize(t *testing.T) {
	q := chat.MessageListQuery{Limit: 0}.Normalize()
	if q.Limit != 50 {
		t.Fatalf("limit=%d", q.Limit)
	}
	q = chat.MessageListQuery{Limit: 500}.Normalize()
	if q.Limit != 100 {
		t.Fatalf("limit=%d", q.Limit)
	}
}
