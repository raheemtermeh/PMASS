package database

import (
	"database/sql"
	"fmt"
)

// recreateIfIncompatible drops empty legacy tables or renames non-empty ones
// when CREATE TABLE IF NOT EXISTS left an incompatible pre-existing relation.
func recreateIfIncompatible(db *sql.DB, table string, requiredColumn string, createSQL string) error {
	var exists bool
	err := db.QueryRow(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = $1
		)`, table).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		_, err := db.Exec(createSQL)
		return err
	}

	var hasCol bool
	err = db.QueryRow(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
		)`, table, requiredColumn).Scan(&hasCol)
	if err != nil {
		return err
	}
	if hasCol {
		return nil
	}

	var count int64
	if err := db.QueryRow(fmt.Sprintf(`SELECT COUNT(*) FROM %s`, table)).Scan(&count); err != nil {
		return fmt.Errorf("count %s: %w", table, err)
	}

	if count == 0 {
		if _, err := db.Exec(fmt.Sprintf(`DROP TABLE IF EXISTS %s CASCADE`, table)); err != nil {
			return fmt.Errorf("drop incompatible %s: %w", table, err)
		}
	} else {
		legacy := table + "_pre_vsm"
		if _, err := db.Exec(fmt.Sprintf(`ALTER TABLE %s RENAME TO %s`, table, legacy)); err != nil {
			return fmt.Errorf("rename incompatible %s: %w", table, err)
		}
	}

	_, err = db.Exec(createSQL)
	return err
}
