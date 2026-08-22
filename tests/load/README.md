# PMASS k6 load tests (Phase 5)

Scripts model a real authenticated user journey (login, dashboard, products, planning, work-items, search, notifications, graph/topology, attachments, one notification write).

## Prerequisites

1. **Running stack** — gateway reachable (default `http://localhost:3185` via Docker compose, or `http://localhost:8080` for local `start.bat` API-only).
2. **Valid credentials** — a user that can log in via `/api/v1/auth/login`.
3. **k6** — CLI or Docker image.

### Start stack (pick one)

```bat
REM Full local dev (Postgres + Go API + Next + Grafana logs on :3186)
start.bat

REM Or Docker compose (requires .env with POSTGRES_PASSWORD)
docker compose up -d --build
```

### Install k6

```powershell
winget install GrafanaLabs.k6
```

After install, open a **new terminal** (PATH refresh) and verify: `k6 version`.

If `k6` is not found in the current session, use the full path:

```powershell
& "C:\Program Files\k6\k6.exe" version
```

Or without installing:

```powershell
docker run --rm -i grafana/k6 run - <tests/load/smoke.js
```

## Required environment variables

| Variable | Description |
|---|---|
| `BASE_URL` | Gateway or API root (default `http://localhost:3185`) |
| `TEST_USERNAME` | Email or username |
| `TEST_PASSWORD` | Password |

## Optional environment variables

| Variable | Default | Description |
|---|---|---|
| `TENANT_SLUG` | `platform` | Tenant slug for employee portal login |
| `PORTAL` | `platform` or `employee` | Auth portal |
| `SEARCH_QUERY` | `dashboard` | Search term |
| `WORK_ITEMS_SECTION` | `engineering` | Work-items section |

## Run order (Phase 5G–5L)

```powershell
$env:BASE_URL = "http://localhost:3185"
$env:TEST_USERNAME = "your@email.com"
$env:TEST_PASSWORD = "your-password"

k6 run tests/load/smoke.js
k6 run tests/load/baseline.js
k6 run tests/load/load.js
k6 run tests/load/stress.js
k6 run tests/load/spike.js
k6 run tests/load/soak.js
```

During runs, observe **Grafana → PMASS Load Test** (Loki log-derived HTTP latency/errors) and poll Go JSON metrics:

```powershell
curl -H "Authorization: Bearer $env:METRICS_TOKEN" http://localhost:8080/metrics
```

Record results in `PHASE5_LOAD_TEST_REPORT.md` sections 5G–5P.

## Monitoring note

This repo provisions **Loki + Grafana (logs)** — not Prometheus exporters. Postgres/Nginx/Next.js exporter panels are unavailable until wired externally. Go pool/latency/goroutine data is available from authenticated `GET /metrics` JSON during tests.
