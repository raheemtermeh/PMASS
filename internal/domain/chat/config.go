package chat

// DefaultMaxMessageLength is the fallback maximum message body size.
const DefaultMaxMessageLength = 10000

// maxMessageLength is used by entity validation and may be overridden at startup.
var maxMessageLength = DefaultMaxMessageLength

// MaxMessageLength returns the configured maximum message body length.
func MaxMessageLength() int {
	return maxMessageLength
}

// SetMaxMessageLength configures the maximum message body length for validation.
func SetMaxMessageLength(n int) {
	if n > 0 {
		maxMessageLength = n
	}
}
