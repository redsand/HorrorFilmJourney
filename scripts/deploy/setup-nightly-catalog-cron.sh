#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo APP_NAME=cinemacodex APP_USER=cinemacodex APP_ROOT=/opt/cinemacodex ./scripts/deploy/setup-nightly-catalog-cron.sh

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo)."
  exit 1
fi

APP_NAME="${APP_NAME:-cinemacodex}"
APP_USER="${APP_USER:-cinemacodex}"
APP_ROOT="${APP_ROOT:-/opt/${APP_NAME}}"
CRON_FILE="/etc/cron.d/${APP_NAME}-catalog-sync"
LOG_FILE="/var/log/${APP_NAME}-catalog-sync.log"

echo "==> Installing cron package"
apt-get update
apt-get install -y cron
systemctl enable cron
systemctl restart cron

touch "${LOG_FILE}"
chown "${APP_USER}:${APP_USER}" "${LOG_FILE}"

cat > "${CRON_FILE}" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# ${APP_NAME}: nightly TMDB incremental sync for current-year releases (00:00 server time)
0 0 * * * ${APP_USER} /bin/bash -lc 'set -a; . ${APP_ROOT}/shared/.env; set +a; export TMDB_UPDATE_RELEASE_DATE_GTE="\$(date +\%Y)-01-01"; cd ${APP_ROOT}/current; /usr/bin/npm run sync:tmdb:update >> ${LOG_FILE} 2>&1'
EOF

chmod 644 "${CRON_FILE}"

echo "Cron installed at ${CRON_FILE}"
echo "To verify: grep -n '${APP_NAME}' ${CRON_FILE}"
echo "To tail logs: tail -f ${LOG_FILE}"
