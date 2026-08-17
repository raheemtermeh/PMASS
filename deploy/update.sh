#!/usr/bin/env bash
# PMAS server update: git pull → prune old images → Docker build → restart
# Old termeh-pmas tags and unused layers are deleted each run so the server disk does not fill.
# Usage:
#   bash deploy/update.sh              # pull + build + up
#   bash deploy/update.sh --skip-git   # build + up only (files already synced)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_GIT=0
if [[ "${1:-}" == "--skip-git" ]]; then
  SKIP_GIT=1
fi

COMPOSE_V2_VERSION="${COMPOSE_V2_VERSION:-2.29.7}"
COMPOSE_PLUGIN_DIR="/usr/local/lib/docker/cli-plugins"

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_BIN="docker compose"
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    local standalone_version
    standalone_version="$(docker-compose version --short 2>/dev/null | tr -d 'v' || true)"
    case "$standalone_version" in
      2.*) COMPOSE_BIN="docker-compose"; return 0 ;;
    esac
  fi
  return 1
}

install_compose_v2() {
  local arch url tmp
  case "$(uname -m)" in
    x86_64|amd64) arch="x86_64" ;;
    aarch64|arm64) arch="aarch64" ;;
    *) echo "[ERROR] unsupported arch for Compose v2: $(uname -m)"; return 1 ;;
  esac
  url="https://github.com/docker/compose/releases/download/v${COMPOSE_V2_VERSION}/docker-compose-linux-${arch}"
  tmp="$(mktemp)"
  mkdir -p "$COMPOSE_PLUGIN_DIR"
  if ! curl -fsSL --retry 3 --retry-delay 2 -m 300 "$url" -o "$tmp"; then
    rm -f "$tmp"
    echo "[ERROR] download failed: $url"
    return 1
  fi
  chmod 0755 "$tmp"
  mv -f "$tmp" "$COMPOSE_PLUGIN_DIR/docker-compose"
  docker compose version >/dev/null 2>&1
}

COMPOSE_BIN=""
if ! detect_compose; then
  echo "[INFO] Docker Compose v2 not found (legacy v1 cannot read this stack) — installing v${COMPOSE_V2_VERSION}"
  if ! install_compose_v2 || ! detect_compose; then
    echo "[ERROR] could not provide Docker Compose v2."
    echo "        Install manually: https://docs.docker.com/compose/install/linux/"
    exit 1
  fi
fi
echo "[INFO] compose: $($COMPOSE_BIN version --short 2>/dev/null || echo unknown) via '$COMPOSE_BIN'"

compose() {
  # shellcheck disable=SC2086
  if [[ -f docker-compose.logs.yml ]]; then
    $COMPOSE_BIN -f docker-compose.yml -f docker-compose.logs.yml "$@"
  else
    $COMPOSE_BIN "$@"
  fi
}

# Compose v1 named containers "<project>_<service>_<n>"; v2 uses "<project>-<service>-<n>".
# Leftover v1 containers keep holding port 3185, so drop them once after the switch.
remove_stale_compose_containers() {
  # Failed recreate leaves hash-prefixed orphans (e.g. 7a5779c96abf_pmass-db-1).
  local pattern='^[0-9a-f]+_pmass-(db|api|web|gateway|loki|promtail)-[0-9]+$'
  local names
  names="$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "$pattern" || true)"
  [[ -z "$names" ]] && return 0
  echo "      removing stale compose recreate containers:"
  while read -r name; do
    [[ -z "$name" ]] && continue
    echo "        - $name"
    docker rm -f "$name" >/dev/null 2>&1 || true
  done <<< "$names"
}

remove_legacy_v1_containers() {
  local project pattern names
  project="$(basename "$ROOT" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
  pattern="^${project}_(db|api|web|gateway|loki|promtail)_[0-9]+$"
  names="$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "$pattern" || true)"
  [[ -z "$names" ]] && return 0
  echo "      removing legacy Compose v1 containers:"
  while read -r name; do
    [[ -z "$name" ]] && continue
    echo "        - $name"
    docker rm -f "$name" >/dev/null 2>&1 || true
  done <<< "$names"
}

disk_free() {
  df -h / 2>/dev/null | awk 'NR==2{print $3" used, "$4" free ("$5" full)"}' || echo "unknown"
}

# Drop extra api/web tags (timestamp/sha) then delete every image not used by a container.
# Never prunes volumes — Postgres data stays.
reclaim_unused_images() {
  local extra
  extra="$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null \
    | grep -E '^termeh-pmas-(api|web):' \
    | grep -vE ':latest$' \
    || true)"
  if [[ -n "$extra" ]]; then
    echo "      removing old app image tags:"
    while read -r img; do
      [[ -z "$img" || "$img" == *"<none>"* ]] && continue
      echo "        - $img"
      docker rmi "$img" >/dev/null 2>&1 || true
    done <<< "$extra"
  fi
  docker image prune -af || true
}

# Cap BuildKit cache so Next.js/Go layers cannot grow without bound.
reclaim_build_cache() {
  docker builder prune -af --keep-storage=2GB >/dev/null 2>&1 \
    || docker builder prune -f >/dev/null 2>&1 \
    || true
}

echo "========================================"
echo " PMAS update  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo " dir: $ROOT"
echo "========================================"

if [[ ! -d .git ]]; then
  echo "[ERROR] not a git repo: $ROOT"
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "[ERROR] .env missing at $ROOT/.env — create it before deploying."
  exit 1
fi

# Windows editors often leave CRLF; Docker env_file breaks on trailing \r
if command -v sed >/dev/null 2>&1; then
  sed -i 's/\r$//' .env || true
fi

missing=0
for key in SUPABASE_DB_URL JWT_SECRET CREDENTIALS_ENCRYPTION_KEY POSTGRES_PASSWORD; do
  val="$(grep -E "^${key}=" .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [[ -z "$val" ]]; then
    echo "[ERROR] .env missing required value: $key"
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

# Self-hosted Postgres: api container must use host "db" (compose service), not Supabase pooler.
db_url="$(grep -E '^SUPABASE_DB_URL=' .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '\r')"
if [[ "$db_url" == *"supabase.co"* ]] || [[ "$db_url" == *"pooler.supabase"* ]]; then
  echo "[ERROR] SUPABASE_DB_URL still points at Supabase."
  echo "        Use self-hosted Postgres, e.g.:"
  echo "        SUPABASE_DB_URL=postgresql://pmas:PASSWORD@db:5432/pmas?sslmode=disable"
  exit 1
fi
if [[ "$db_url" != *"sslmode="* ]]; then
  echo "[WARN] SUPABASE_DB_URL has no sslmode= — API will default to sslmode=require (may fail vs local Postgres)."
  echo "       Prefer: .../pmas?sslmode=disable"
fi
if [[ "$db_url" != *"@db:"* ]] && [[ "$db_url" != *"@db/"* ]]; then
  echo "[WARN] SUPABASE_DB_URL host is not 'db'. Inside Docker Compose the Postgres service hostname is 'db'."
fi

if [[ ! -f docker-compose.yml ]]; then
  echo "[ERROR] docker-compose.yml missing"
  exit 1
fi
if [[ ! -f deploy/nginx.conf ]]; then
  echo "[ERROR] deploy/nginx.conf missing"
  exit 1
fi

if [[ "$SKIP_GIT" -eq 0 ]]; then
  cp -f .env "/tmp/pmas.env.bak.$$"

  echo
  echo "[1/6] git fetch + reset to origin default branch"
  git fetch --all --prune

  branch="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || true)"
  if [[ -z "$branch" ]]; then
    if git show-ref --verify --quiet refs/remotes/origin/master; then
      branch="master"
    elif git show-ref --verify --quiet refs/remotes/origin/main; then
      branch="main"
    else
      echo "[ERROR] cannot detect origin default branch (tried master/main)"
      exit 1
    fi
  fi
  echo "      using origin/$branch"
  git reset --hard "origin/$branch"
  git clean -fd -e .env -e '*.local' -e '.deploy.env'

  if [[ -f "/tmp/pmas.env.bak.$$" ]]; then
    cp -f "/tmp/pmas.env.bak.$$" .env
    rm -f "/tmp/pmas.env.bak.$$"
  fi
  sed -i 's/\r$//' .env || true
else
  echo
  echo "[1/6] skip git (files synced by remote updater)"
fi

sha="$(git rev-parse --short HEAD)"
echo "      HEAD = $(git log -1 --oneline)"

echo
echo "[2/6] reclaim unused Docker images (running stack kept)"
echo "      disk $(disk_free)"
reclaim_unused_images
remove_legacy_v1_containers
remove_stale_compose_containers
# Drop legacy standalone grafana container if it exists (Grafana is local-only now)
docker ps -a --format '{{.Names}}' 2>/dev/null | grep -i grafana | while read -r name; do
  case "$name" in
    *pmas*|*pmass*|*termeh*) docker rm -f "$name" >/dev/null 2>&1 || true ;;
  esac
done || true

echo
echo "[3/6] pull log stack images + build app images"
if [[ -f docker-compose.logs.yml ]]; then
  compose pull loki promtail || true
fi
compose build

echo
echo "[4/6] restart stack (db api web gateway + loki promtail if configured)"
compose down --remove-orphans >/dev/null 2>&1 || true
remove_stale_compose_containers
compose up -d --remove-orphans

echo
echo "[5/6] health check (retry up to ~2 min)"
health=""
home_code="000"
loki_ready=""
db_health=""
db_cid=""
ok=0
for i in $(seq 1 24); do
  db_cid="$(compose ps -q db 2>/dev/null | head -n1 || true)"
  if [[ -n "$db_cid" ]]; then
    db_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$db_cid" 2>/dev/null || true)"
  else
    db_health=""
  fi
  health="$(curl -sS -m 10 http://127.0.0.1:3185/health 2>/dev/null || true)"
  home_code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:3185/ 2>/dev/null || true)"
  loki_ready="$(curl -sS -m 5 http://127.0.0.1:3100/ready 2>/dev/null || true)"
  if [[ "$health" == *UP* && "$home_code" == "200" ]]; then
    ok=1
    break
  fi
  echo "      attempt $i/24  db=${db_health:-?}  health=${health:-FAILED}  home=HTTP ${home_code:-000}"
  sleep 5
done

echo "      db      -> ${db_health:-unknown}"
echo "      /health -> ${health:-FAILED}"
echo "      /       -> HTTP ${home_code:-000}"
if [[ -f docker-compose.logs.yml ]]; then
  echo "      loki    -> ${loki_ready:-not running} (127.0.0.1:3100 on server — use view-server-logs.bat from PC)"
fi
compose ps || true

echo
echo "[6/6] drop previous app images + cap Docker build cache at 2GB"
reclaim_unused_images
reclaim_build_cache
echo "      disk $(disk_free)"

echo
echo "App images kept:"
docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedSince}}' \
  | grep -E 'REPOSITORY|termeh-pmas-' || true

echo
echo "Done. App URL: http://server.linooxel.com:3185"
echo "Git: $sha | Image tag: latest (old tags pruned)"

if [[ "$ok" -ne 1 ]]; then
  echo
  echo "[ERROR] health checks failed after retries."
  echo "        Recent api logs:"
  compose logs --tail=80 api || true
  echo "        Recent gateway logs:"
  compose logs --tail=40 gateway || true
  exit 1
fi
