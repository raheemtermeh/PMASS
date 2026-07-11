package postgres

import (
	"context"
	"database/sql"
)

// DB is the shared persistence handle.
type DB struct {
	SQL *sql.DB
}

func New(sqlDB *sql.DB) *DB {
	return &DB{SQL: sqlDB}
}

type txKey struct{}

// WithinTx runs fn inside a transaction. Nested calls reuse the same tx.
func (db *DB) WithinTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if TxFrom(ctx) != nil {
		return fn(ctx)
	}
	tx, err := db.SQL.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	ctx = context.WithValue(ctx, txKey{}, tx)
	if err := fn(ctx); err != nil {
		return err
	}
	return tx.Commit()
}

func TxFrom(ctx context.Context) *sql.Tx {
	tx, _ := ctx.Value(txKey{}).(*sql.Tx)
	return tx
}

type querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func (db *DB) Q(ctx context.Context) querier {
	if tx := TxFrom(ctx); tx != nil {
		return tx
	}
	return db.SQL
}
