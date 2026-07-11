package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"PMAS/internal/domain/shared"
)

type Envelope struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
	Meta    interface{} `json:"meta"`
	Errors  []APIError  `json:"errors"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func WriteOK(w http.ResponseWriter, status int, data interface{}, meta interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Envelope{
		Success: true,
		Data:    data,
		Meta:    metaOrEmpty(meta),
		Errors:  []APIError{},
	})
}

func WriteErr(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	code := "INTERNAL_ERROR"
	msg := "Internal server error"
	status := http.StatusInternalServerError

	var de *shared.DomainError
	if errors.As(err, &de) {
		code = de.Code
		msg = de.Message
		status = de.HTTPStatus
	}

	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Envelope{
		Success: false,
		Data:    nil,
		Meta:    map[string]any{},
		Errors:  []APIError{{Code: code, Message: msg}},
	})
}

func metaOrEmpty(meta interface{}) interface{} {
	if meta == nil {
		return map[string]any{}
	}
	return meta
}

func DecodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}
