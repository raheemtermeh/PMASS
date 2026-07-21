#!/usr/bin/env bash
# PMAS server update: git pull → Docker image build/tag → restart stack
# Run on the server from the repo root, e.g.:
#   cd /root/termeh/PMASS && bash deploy/update.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_BIN=""
if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_BIN="docker-compose"
elif docker compose version >/dev/null 2>&1; then
  COMPOSE_BIN="docker compose"
else
  echo "[ERROR] docker-compose not found"
  exit 1
fi

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
  echo "[ERROR] .env missing. Create it before deploying."
  exit 1
fi

# Preserve local secrets across pull/reset
cp -f .env "/tmp/pmas.env.bak.$$"

echo
echo "[1/6] git fetch + pull (origin/master)"
git fetch --all --prune
git reset --hard origin/master
git clean -fd -e .env -e '*.local'

# Restore .env if git wiped or replaced it
if [[ -f "/tmp/pmas.env.bak.$$" ]]; then
  cp -f "/tmp/pmas.env.bak.$$" .env
  rm -f "/tmp/pmas.env.bak.$$"
fi

sha="$(git rev-parse --short HEAD)"
echo "      HEAD = $(git log -1 --oneline)"

echo
echo "[2/6] free dangling docker layers (safe prune)"
docker image prune -f >/dev/null || true

echo
echo "[3/6] build Docker images (deps install inside build)"
$COMPOSE_BIN build

echo
echo "[4/6] tag release images: $ts / $sha"
docker tag termeh-pmas-api:latest "termeh-pmas-api:${ts}"
docker tag termeh-pmas-api:latest "termeh-pmas-api:${sha}"
docker tag termeh-pmas-web:latest "termeh-pmas-web:${ts}"
docker tag termeh-pmas-web:latest "termeh-pmas-web:${sha}"

echo
echo "[5/6] restart stack"
$COMPOSE_BIN up -d --remove-orphans

echo
echo "[6/6] health check"
sleep 8
set +e
health="$(curl -sS -m 20 http://127.0.0.1:3185/health 2>/dev/null)"
home_code="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' http://127.0.0.1:3185/ 2>/dev/null)"
set -e

echo "      /health -> ${health:-FAILED}"
echo "      /       -> HTTP ${home_code:-000}"
$COMPOSE_BIN ps

echo
echo "Images tagged:"
docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}' \
  | grep -E 'REPOSITORY|termeh-pmas-' || true

echo
echo "Done. App URL: http://server.linooxel.com:3185"
echo "Git: $sha | Image tags: latest, $ts, $sha"
