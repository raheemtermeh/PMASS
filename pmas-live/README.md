# PMAS Live

Production-facing frontend for PMAS with real authentication, user management, and database-backed views (no mock data).

## Prerequisites

- Node.js 20+
- Go 1.22+
- PostgreSQL (Supabase or local)

## Database setup

Run the **live schema** (empty tables, no seed data):

```bash
psql "$SUPABASE_DB_URL" -f ../supabase/migrations/schema_live.sql
```

## Backend

```bash
cd ..
go run ./cmd/api
```

Set environment variables:

- `SUPABASE_DB_URL` — PostgreSQL connection string
- `JWT_SECRET` — secret for signing tokens (required in production)
- `PORT` — default `8080`

## Frontend

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

Optional: `NEXT_PUBLIC_API_URL=http://localhost:8080` (only if not using the built-in dev proxy)

In development, API calls go through Next.js rewrites (`/api/*` → backend) so CORS is avoided.

## First run

1. Start API and apply `schema_live.sql`
2. Open the app → **Initial Setup** creates the super admin
3. Sign in → create users and assign workspace permissions
4. Add business data to the database; views show empty states until then

## vs `front/`

| | `front/` | `pmas-live/` |
|---|----------|--------------|
| Data | Mock + partial API | API only |
| Auth | None | JWT + RBAC |
| Port | 3000 | 3001 |
