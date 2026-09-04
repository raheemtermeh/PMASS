package chatapp

import (
	"regexp"
	"strings"
	"unicode"

	"github.com/google/uuid"

	"PMAS/internal/domain/chat"
)

var mentionTokenRE = regexp.MustCompile(`(?:^|[\s([{])@([A-Za-z0-9_]{2,64})\b`)

// ParseMentionTokens extracts @username candidates from message content.
// Invalid / punctuation-only tokens are ignored. Display names are never trusted as IDs.
func ParseMentionTokens(content string) []string {
	if strings.TrimSpace(content) == "" {
		return nil
	}
	matches := mentionTokenRE.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		tok := strings.ToLower(strings.TrimSpace(m[1]))
		if tok == "" || !isUsefulMentionToken(tok) {
			continue
		}
		if _, ok := seen[tok]; ok {
			continue
		}
		seen[tok] = struct{}{}
		out = append(out, tok)
	}
	return out
}

func isUsefulMentionToken(tok string) bool {
	hasAlphaNum := false
	for _, r := range tok {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			hasAlphaNum = true
			break
		}
	}
	return hasAlphaNum
}

func mentionEmployees(mentions []chat.MessageMention) []uuid.UUID {
	seen := map[uuid.UUID]struct{}{}
	out := make([]uuid.UUID, 0, len(mentions))
	for _, m := range mentions {
		if m.MentionedEmployeeID == nil || *m.MentionedEmployeeID == uuid.Nil {
			continue
		}
		id := *m.MentionedEmployeeID
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}
