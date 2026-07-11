package shared

import "fmt"

// DomainError carries stable error codes for the frontend (PDF §3.5 / §5.10 / §6.11).
type DomainError struct {
	Code       string
	Message    string
	HTTPStatus int
}

func (e *DomainError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func New(code, message string, httpStatus int) *DomainError {
	return &DomainError{Code: code, Message: message, HTTPStatus: httpStatus}
}

var (
	ErrNotFound            = New("NOT_FOUND", "Resource not found", 404)
	ErrForbidden           = New("FORBIDDEN", "Access denied", 403)
	ErrConflict            = New("CONFLICT", "Business conflict", 409)
	ErrValidation          = New("VALIDATION_FAILED", "Validation failed", 400)
	ErrUnauthorized        = New("UNAUTHORIZED", "Authentication required", 401)
	ErrInternal            = New("INTERNAL_ERROR", "Internal server error", 500)
	ErrOptimisticLock      = New("OPTIMISTIC_LOCK", "Resource was modified concurrently", 409)
)
