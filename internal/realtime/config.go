package realtime

import "time"

// Config holds WebSocket hub limits and timeouts.
type Config struct {
	MaxConnectionsPerEmployee int
	MaxConnectionsGlobal      int
	MaxSubscriptions          int
	MaxMessageSize            int64
	WriteQueueSize            int
	PingInterval              time.Duration
	PongTimeout               time.Duration
	WriteWait                 time.Duration
	AllowedOrigins            []string
	AppEnv                    string
	TypingTTL                 time.Duration
}

func (c Config) withDefaults() Config {
	if c.MaxConnectionsPerEmployee <= 0 {
		c.MaxConnectionsPerEmployee = 5
	}
	if c.MaxConnectionsGlobal <= 0 {
		c.MaxConnectionsGlobal = 10000
	}
	if c.MaxSubscriptions <= 0 {
		c.MaxSubscriptions = 100
	}
	if c.MaxMessageSize <= 0 {
		c.MaxMessageSize = 8192
	}
	if c.WriteQueueSize <= 0 {
		c.WriteQueueSize = 64
	}
	if c.PingInterval <= 0 {
		c.PingInterval = 30 * time.Second
	}
	if c.PongTimeout <= 0 {
		c.PongTimeout = 10 * time.Second
	}
	if c.WriteWait <= 0 {
		c.WriteWait = 10 * time.Second
	}
	if c.TypingTTL <= 0 {
		c.TypingTTL = DefaultTypingTTL
	}
	return c
}
