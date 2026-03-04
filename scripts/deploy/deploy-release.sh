#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   deploy-release.sh /tmp/cinemacodex-<ts>.tar.gz
#
# Required env:
#   APP_NAME, APP_USER, APP_ROOT

APP_NAME="${APP_NAME:-cinemacodex}"
APP_USER="${APP_USER:-cinemacodex}"
APP_ROOT="${APP_ROOT:-/opt/${APP_NAME}}"
ARCHIVE_PATH="${1:-}"

if [[ -z "${ARCHIVE_PATH}" || ! -f "${ARCHIVE_PATH}" ]]; then
  echo "Usage: deploy-release.sh /tmp/cinemacodex-<ts>.tar.gz"
  exit 1
fi

TS="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="${APP_ROOT}/releases/${TS}"
mkdir -p "${RELEASE_DIR}"
tar -xzf "${ARCHIVE_PATH}" -C "${RELEASE_DIR}"

cd "${RELEASE_DIR}"
ln -sfn "${APP_ROOT}/shared/.env" .env

if [[ -f package-lock.json || -f npm-shrinkwrap.json ]]; then
  npm ci
else
  echo "No lockfile found in release archive; falling back to npm install"
  npm install --no-audit --no-fund
fi

npx prisma generate
npx prisma migrate deploy
if [[ "${SEED_SEASON1_SUBGENRES_ON_DEPLOY:-false}" == "true" ]]; then
  echo "Seeding Season 1 required subgenre curriculum..."
  npm run seed:season1:subgenres
fi
if [[ "${SEED_SEASON2_CULT_ON_DEPLOY:-false}" == "true" ]]; then
  echo "Seeding Season 2 Cult Classics curriculum..."
  npm run seed:season2:cult
fi
if [[ "${PUBLISH_SEASON2_ON_DEPLOY:-false}" == "true" ]]; then
  echo "Publishing Season 2 (apply)..."
  npm run publish:season2 -- --apply
fi
npm run build

ln -sfn "${RELEASE_DIR}" "${APP_ROOT}/current"
chown -h "${APP_USER}:${APP_USER}" "${APP_ROOT}/current"
chown -R "${APP_USER}:${APP_USER}" "${RELEASE_DIR}"

systemctl restart "${APP_NAME}.service"
systemctl --no-pager status "${APP_NAME}.service"

echo "Deployment complete: ${RELEASE_DIR}"
