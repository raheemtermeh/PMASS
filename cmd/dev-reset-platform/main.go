package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"

	"PMAS/internal/auth"
	"PMAS/internal/config"
)

func main() {
	config.LoadDotEnv(".env")
	cfg := config.Load()
	db, err := sql.Open("postgres", cfg.SupabaseDBURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		log.Fatal(err)
	}

	rows, err := db.Query(`SELECT id, email, role, full_name FROM app_users WHERE tenant_id IS NULL ORDER BY id`)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	fmt.Println("Platform admins:")
	found := false
	for rows.Next() {
		var id int
		var email, role, name string
		if err := rows.Scan(&id, &email, &role, &name); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("  id=%d email=%s role=%s name=%s\n", id, email, role, name)
		found = true
	}
	if !found {
		fmt.Println("  (none)")
	}

	const newPass = "Platform@2026"
	hash, err := auth.HashPassword(newPass)
	if err != nil {
		log.Fatal(err)
	}

	res, err := db.Exec(`
		UPDATE app_users
		SET password_hash = $1, role = 'platform_admin', tenant_id = NULL, is_active = true
		WHERE id = (SELECT id FROM app_users WHERE tenant_id IS NULL ORDER BY id LIMIT 1)
	`, hash)
	if err != nil {
		log.Fatal(err)
	}

	n, _ := res.RowsAffected()
	if n == 0 {
		var email string
		err = db.QueryRow(`
			INSERT INTO app_users (tenant_id, email, password_hash, full_name, role)
			VALUES (NULL, 'platform@pmas.local', $1, 'Platform Admin', 'platform_admin')
			RETURNING email
		`, hash).Scan(&email)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Created platform admin: %s\n", email)
	} else {
		var email string
		_ = db.QueryRow(`SELECT email FROM app_users WHERE tenant_id IS NULL ORDER BY id LIMIT 1`).Scan(&email)
		fmt.Printf("Reset password for: %s\n", email)
	}
	fmt.Printf("Login password: %s\n", newPass)
}
