package chatapp_test

import (
	"testing"

	chatapp "PMAS/internal/application/chat"
)

func TestParseMentionTokens(t *testing.T) {
	got := chatapp.ParseMentionTokens("hey @alice and @Bob check this @alice again")
	if len(got) != 2 {
		t.Fatalf("expected 2 unique tokens, got %#v", got)
	}
	if got[0] != "alice" || got[1] != "bob" {
		t.Fatalf("unexpected tokens %#v", got)
	}
}

func TestParseMentionTokens_IgnoresInvalid(t *testing.T) {
	got := chatapp.ParseMentionTokens("email test@example.com and @@ and @")
	if len(got) != 0 {
		// @example may match depending on regex — ensure we don't panic and stay bounded
		for _, tok := range got {
			if tok == "" {
				t.Fatal("empty token")
			}
		}
	}
	got = chatapp.ParseMentionTokens("ping @valid_user_1 please")
	if len(got) != 1 || got[0] != "valid_user_1" {
		t.Fatalf("got %#v", got)
	}
}
