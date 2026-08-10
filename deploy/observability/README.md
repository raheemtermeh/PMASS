# Grafana + Loki — how to run

## What you get

| Piece | Where | Role |
|-------|--------|------|
| Loki | Server Docker (`127.0.0.1:3100`) | Stores logs |
| Promtail | Server Docker | Sends `api` / `web` / `gateway` logs to Loki |
| Grafana | **Your PC** `:3186` | UI to search/view logs |
| SSH tunnel | Your PC (auto) | Connects Grafana → server Loki |

Grafana is **not** on the public internet. You view server logs from your PC.

---

## One-time setup

### 1) `.deploy.env` (same as update-server)

```bat
copy .deploy.env.example .deploy.env
```

Edit `.deploy.env`:

```
PMAS_SSH_HOST=server.linooxel.com
PMAS_SSH_PORT=185
PMAS_SSH_USER=root
PMAS_SSH_PASS=your-ssh-password
PMAS_REMOTE_DIR=/root/termeh/PMASS
```

### 2) Deploy Loki + Promtail on the server

Push code if needed, then:

```bat
update-server.bat
```

In the output you should see something like:

```
loki    -> ready
```

and `compose ps` listing `loki` and `promtail`.

---

## Every time you want to see logs

```bat
view-server-logs.bat
```

What it does:

1. Stops any old tunnel/Grafana
2. Opens SSH tunnel with password from `.deploy.env` (no manual ssh window)
3. Checks Loki is ready
4. Hits `/health` so new log lines appear
5. Starts Grafana on your PC
6. Opens browser → `http://127.0.0.1:3186`

**Login:** `admin` / `admin`  
(or `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` in `.env`)

### In Grafana

1. **Dashboards → PMAS → PMAS Logs**
2. Or **Explore** → datasource **Loki** → query:

```logql
{compose_service="api"} |= "http_request"
```

```logql
{compose_service="gateway"}
```

```logql
{compose_service="web"}
```

```logql
{compose_service="api"} |~ "(?i)error"
```

---

## Stop

```bat
stop-server-logs.bat
```

Kills tunnel + Grafana + ports `3100` / `3186`.

---

## Local app logs (not server)

If you develop with `start.bat`, Grafana also starts locally and shows `logs/api.log` + `logs/web.log` (no SSH).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Loki not reachable | Run `update-server.bat` once; check `tools\observability\tunnel.log` |
| No labels / empty Explore | Wait 30s after deploy; open the app URL to generate traffic; re-run `view-server-logs.bat` |
| Wrong password | Fix `PMAS_SSH_PASS` in `.deploy.env` |
| Port busy | `stop-server-logs.bat` then retry |
| Dashboard missing | Grafana → Explore still works; restart `view-server-logs.bat` |

App URL: http://server.linooxel.com:3185  
Health: http://server.linooxel.com:3185/health
