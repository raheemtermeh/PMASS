# PMAS log observability

## Where things run

| Component | Local dev (`start.bat`) | Production server |
|-----------|-------------------------|-------------------|
| App | `:3000` / `:8080` | `http://server.linooxel.com:3185` |
| **Grafana UI** | `http://127.0.0.1:3186` on your PC | **not on server** |
| Loki | native on PC | Docker, `127.0.0.1:3100` on server only |
| Promtail | native on PC (reads `logs/`) | Docker (reads container logs) |

---

## Local dev logs

```bat
start.bat
```

Grafana: `http://127.0.0.1:3186` — shows logs from local API/Frontend.

---

## Server logs in local Grafana (recommended)

Yes — Grafana on your PC, logs from the server.

**One-time:** deploy log stack to server (included in `update-server.bat`):

- `docker-compose.logs.yml` adds **Loki + Promtail** on the server
- Loki is **not public** (`127.0.0.1:3100` on server)

**Each time you want to view server logs:**

```bat
view-server-logs.bat
```

This will:

1. Open an SSH tunnel: your PC `:3100` → server Loki `:3100` (keep that window open)
2. Start **Grafana locally** on `http://127.0.0.1:3186`
3. Grafana queries Loki through the tunnel

LogQL examples:

```logql
{compose_service="api"} |= "http_request"
{compose_service="gateway"} | json | status >= 400
```

Stop: `stop-server-logs.bat` + close the SSH tunnel window.

Manual tunnel (if needed):

```bash
ssh -p 185 -L 3100:127.0.0.1:3100 root@server.linooxel.com
```

---

## Files

| Path | Purpose |
|------|---------|
| `view-server-logs.bat` | Local Grafana + SSH tunnel to server Loki |
| `stop-server-logs.bat` | Stop local Grafana |
| `docker-compose.logs.yml` | Server Loki + Promtail |
| `deploy/observability/start-local.ps1` | Full local stack (dev) |
| `deploy/observability/start-grafana-only.ps1` | Grafana only (server logs mode) |
