package logging

import (
	"log/slog"
	"os"
	"strings"
)

const serviceName = "pmas-api"

// Init configures the process-wide default slog logger.
// Production (and APP_ENV=production) emits JSON for Loki; otherwise text.
func Init(appEnv string) *slog.Logger {
	env := strings.ToLower(strings.TrimSpace(appEnv))
	var handler slog.Handler
	opts := &slog.HandlerOptions{Level: slog.LevelInfo}
	if env == "production" {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		handler = slog.NewTextHandler(os.Stdout, opts)
	}
	logger := slog.New(handler).With("service", serviceName)
	slog.SetDefault(logger)
	return logger
}

func Info(msg string, args ...any)  { slog.Info(msg, args...) }
func Warn(msg string, args ...any)  { slog.Warn(msg, args...) }
func Error(msg string, args ...any) { slog.Error(msg, args...) }

// Fatal logs at error level and exits the process.
func Fatal(msg string, args ...any) {
	slog.Error(msg, args...)
	os.Exit(1)
}
