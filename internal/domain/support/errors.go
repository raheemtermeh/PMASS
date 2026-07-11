package support

import "PMAS/internal/domain/shared"

var (
	ErrActivityImmutable = shared.New("ACTIVITY_IMMUTABLE", "Activity log cannot be updated or deleted", 403)
)
