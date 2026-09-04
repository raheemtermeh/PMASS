package realtime

import "errors"

var (
	ErrUnauthorizedOrigin   = errors.New("websocket origin not allowed")
	ErrAuthRequired         = errors.New("websocket authentication required")
	ErrAuthFailed           = errors.New("websocket authentication failed")
	ErrEmployeeRequired     = errors.New("employee profile required for chat websocket")
	ErrConnectionLimit      = errors.New("websocket connection limit exceeded")
	ErrSubscriptionLimit    = errors.New("websocket subscription limit exceeded")
	ErrHubClosed            = errors.New("websocket hub is closed")
	ErrWriteQueueFull       = errors.New("websocket write queue full")
	ErrInvalidClientMessage = errors.New("invalid websocket client message")
	ErrUnknownClientCommand = errors.New("unknown websocket client command")
)
