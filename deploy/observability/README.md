# PMAS log observability (native Loki + Grafana)

Local log monitoring runs as **native Windows processes** (no Docker).

`start.bat` starts:

1. Loki + Promtail + Grafana (binaries under `tools/observability/`)
2. API (`go run`) → tee to `logs/api.log`
3. Frontend (`npm run dev`) → tee to `logs/web.log`

## Start

```bat
start.bat
```

- App: `http://localhost:3000`
- API: `http://localhost:8080`
- Grafana: `http://127.0.0.1:3186` (default `admin` / `admin`, or `GRAFANA_ADMIN_*` in `.env`)

First run downloads Loki / Promtail / Grafana into `tools/observability/` (~150MB, cached afterward).

## Stop

```bat
stop-observability.bat
```

Close the API / Frontend terminal windows separately.

## Sample LogQL

```logql
{compose_service="api"} |= "http_request"
```

```logql
{compose_service="api"} |= "ERROR"
```

```logql
{compose_service="web"}
```

## Layout

| Path | Purpose |
|------|---------|
| `deploy/observability/start-local.ps1` | download + start native stack |
| `deploy/observability/stop-local.ps1` | stop native stack |
| `deploy/observability/loki-local-config.yml` | Loki config for Windows |
| `tools/observability/` | binaries, data, pid file (gitignored) |
| `logs/` | API / web log files (gitignored) |

Server Docker Compose (`api` / `web` / `gateway`) is unrelated to this log UI.
