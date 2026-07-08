package auth

import (
	"errors"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID         int      `json:"user_id"`
	TenantID       *int     `json:"tenant_id"`
	TenantSlug     string   `json:"tenant_slug,omitempty"`
	TenantName     string   `json:"tenant_name,omitempty"`
	Email          string   `json:"email"`
	FullName       string   `json:"full_name"`
	Role           string   `json:"role"`
	Permissions    []string `json:"permissions"`
	SessionVersion int      `json:"sv"`
	jwt.RegisteredClaims
}

var (
	secretMu     sync.RWMutex
	configuredSecret []byte
)

const defaultTokenTTL = 2 * time.Hour

// ConfigureJWTSecret sets the signing key (required at process start).
func ConfigureJWTSecret(secret string) {
	secretMu.Lock()
	defer secretMu.Unlock()
	configuredSecret = []byte(secret)
	_ = os.Setenv("JWT_SECRET", secret)
}

func jwtSecret() []byte {
	secretMu.RLock()
	defer secretMu.RUnlock()
	if len(configuredSecret) > 0 {
		return configuredSecret
	}
	// Fail closed — never fall back to a hardcoded secret.
	panic("JWT secret not configured")
}

func IssueToken(
	userID int,
	tenantID *int,
	tenantSlug, tenantName, email, fullName, role string,
	permissions []string,
	sessionVersion int,
) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:         userID,
		TenantID:       tenantID,
		TenantSlug:     tenantSlug,
		TenantName:     tenantName,
		Email:          email,
		FullName:       fullName,
		Role:           role,
		Permissions:    permissions,
		SessionVersion: sessionVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(defaultTokenTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now.Add(-30 * time.Second)),
			Subject:   fmt.Sprintf("%d", userID),
			Issuer:    "pmas-api",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret())
}

func ParseToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected signing method")
		}
		return jwtSecret(), nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	if claims.UserID <= 0 {
		return nil, errors.New("invalid token subject")
	}
	return claims, nil
}
