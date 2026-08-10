#!/usr/bin/env bash
# PMAS server update: git pull → Docker build → restart api/web/gateway
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

COMPOSE_BIN=""
if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_BIN="docker-compose"
elif docker compose version >/dev/null 2>&1; then
  COMPOSE_BIN="docker compose"
else
  echo "[ERROR] docker-compose / 'docker compose' not found"
  exit 1
fi

compose() {
  # shellcheck disable=SC2086
  if [[ -f docker-compose.logs.yml ]]; then
    $COMPOSE_BIN -f docker-compose.yml -f docker-compose.logs.yml "$@"
  else
    $COMPOSE_BIN "$@"
  fi
}

ts="$(date -u +%Y%m%d-%H%M%S)"
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
for key in SUPABASE_DB_URL JWT_SECRET CREDENTIALS_ENCRYPTION_KEY; do
  val="$(grep -E "^${key}=" .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [[ -z "$val" ]]; then
    echo "[ERROR] .env missing required value: $key"
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  exit 1
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
echo "[2/6] free dangling docker layers (safe prune)"
docker image prune -f >/dev/null 2>&1 || true
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
echo "[4/6] tag release images: $ts / $sha"
docker tag termeh-pmas-api:latest "termeh-pmas-api:${ts}"
docker tag termeh-pmas-api:latest "termeh-pmas-api:${sha}"
docker tag termeh-pmas-web:latest "termeh-pmas-web:${ts}"
docker tag termeh-pmas-web:latest "termeh-pmas-web:${sha}"

echo
echo "[5/6] restart stack (api web gateway + loki promtail if configured)"
compose up -d --remove-orphans

echo
echo "[6/6] health check (retry up to ~2 min)"
health=""
home_code="000"
loki_ready=""
ok=0
for i in $(seq 1 24); do
  health="$(curl -sS -m 10 http://127.0.0.1:3185/health 2>/dev/null || true)"
  home_code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:3185/ 2>/dev/null || true)"
  loki_ready="$(curl -sS -m 5 http://127.0.0.1:3100/ready 2>/dev/null || true)"
  if [[ "$health" == *UP* && "$home_code" == "200" ]]; then
    ok=1
    break
  fi
  echo "      attempt $i/24  health=${health:-FAILED}  home=HTTP ${home_code:-000}"
  sleep 5
done

echo "      /health -> ${health:-FAILED}"
echo "      /       -> HTTP ${home_code:-000}"
if [[ -f docker-compose.logs.yml ]]; then
  echo "      loki    -> ${loki_ready:-not running} (127.0.0.1:3100 on server — use view-server-logs.bat from PC)"
fi
compose ps || true

echo
echo "Images tagged:"
docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}' \
  | grep -E 'REPOSITORY|termeh-pmas-' || true

echo
echo "Done. App URL: http://server.linooxel.com:3185"
echo "Git: $sha | Image tags: latest, $ts, $sha"

if [[ "$ok" -ne 1 ]]; then
  echo
  echo "[ERROR] health checks failed after retries."
  echo "        Recent api logs:"
  compose logs --tail=80 api || true
  echo "        Recent gateway logs:"
  compose logs --tail=40 gateway || true
  exit 1
fi
