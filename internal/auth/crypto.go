package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"unicode"
)

var (
	encMu sync.RWMutex
	gcm   cipher.AEAD
)

const encryptedPrefix = "enc:v1:"

// InitEncryption configures AES-GCM from CREDENTIALS_ENCRYPTION_KEY (any length; hashed to 32 bytes).
func InitEncryption(keyMaterial string) error {
	encMu.Lock()
	defer encMu.Unlock()
	sum := sha256.Sum256([]byte(keyMaterial))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	gcm = aead
	return nil
}

func EncryptSecret(plaintext string) (string, error) {
	encMu.RLock()
	aead := gcm
	encMu.RUnlock()
	if aead == nil {
		return "", errors.New("encryption not initialized")
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return encryptedPrefix + base64.RawURLEncoding.EncodeToString(ciphertext), nil
}

func DecryptSecret(stored string) (string, error) {
	if !strings.HasPrefix(stored, encryptedPrefix) {
		// Legacy plaintext rows — returned as-is until re-saved.
		return stored, nil
	}
	encMu.RLock()
	aead := gcm
	encMu.RUnlock()
	if aead == nil {
		return "", errors.New("encryption not initialized")
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(stored, encryptedPrefix))
	if err != nil {
		return "", err
	}
	if len(raw) < aead.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce, payload := raw[:aead.NonceSize()], raw[aead.NonceSize():]
	plain, err := aead.Open(nil, nonce, payload, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func IsEncryptedSecret(stored string) bool {
	return strings.HasPrefix(stored, encryptedPrefix)
}

// ValidatePasswordStrength enforces a baseline anti-bruteforce password policy.
func ValidatePasswordStrength(password string) error {
	if len(password) < 12 {
		return fmt.Errorf("password must be at least 12 characters")
	}
	if len(password) > 128 {
		return fmt.Errorf("password must be at most 128 characters")
	}

	var upper, lower, digit, special bool
	for _, r := range password {
		switch {
		case unicode.IsUpper(r):
			upper = true
		case unicode.IsLower(r):
			lower = true
		case unicode.IsDigit(r):
			digit = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			special = true
		}
	}
	if !upper || !lower || !digit || !special {
		return fmt.Errorf("password must include upper, lower, digit, and symbol characters")
	}
	return nil
}
