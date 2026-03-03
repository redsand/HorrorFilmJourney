#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo DOMAIN=cinemacodex.com LETSENCRYPT_EMAIL=ops@cinemacodex.com ./scripts/deploy/bootstrap-ubuntu24.sh
# Optional:
#   APP_NAME=cinemacodex APP_USER=cinemacodex APP_ROOT=/opt/cinemacodex APP_PORT=3000 DOMAIN_ALIASES=www.cinemacodex.com

APP_NAME="${APP_NAME:-cinemacodex}"
APP_USER="${APP_USER:-cinemacodex}"
APP_ROOT="${APP_ROOT:-/opt/${APP_NAME}}"
APP_PORT="${APP_PORT:-3000}"
DOMAIN="${DOMAIN:-}"
DOMAIN_ALIASES="${DOMAIN_ALIASES:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"

if [[ -z "${DOMAIN}" ]]; then
  echo "DOMAIN is required. Example: DOMAIN=cinemacodex.com"
  exit 1
fi

if [[ -z "${LETSENCRYPT_EMAIL}" ]]; then
  echo "LETSENCRYPT_EMAIL is required. Example: LETSENCRYPT_EMAIL=ops@cinemacodex.com"
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo)."
  exit 1
fi

echo "==> Installing system packages"
apt-get update
apt-get install -y curl ca-certificates gnupg lsb-release build-essential nginx certbot python3-certbot-nginx

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js 20.x"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Creating app user and directories"
id -u "${APP_USER}" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "${APP_USER}"
mkdir -p "${APP_ROOT}/releases" "${APP_ROOT}/shared" "${APP_ROOT}/bin"
chown -R "${APP_USER}:${APP_USER}" "${APP_ROOT}"

if [[ ! -f "${APP_ROOT}/shared/.env" ]]; then
  cat > "${APP_ROOT}/shared/.env" <<'ENVEOF'
NODE_ENV=production
PORT=3000
DATABASE_URL=
SESSION_SECRET=
ADMIN_TOKEN=
ADMIN_EMAIL=
ADMIN_PASSWORD=
ADMIN_DISPLAY_NAME=CinemaCodex Admin
TMDB_API_KEY=
GEMINI_API_KEY=
LLM_PROVIDER=disabled
SEASONS_PACKS_ENABLED=true
ENVEOF
  chown "${APP_USER}:${APP_USER}" "${APP_ROOT}/shared/.env"
  chmod 600 "${APP_ROOT}/shared/.env"
  echo "Created ${APP_ROOT}/shared/.env. Populate it before first deploy."
fi

echo "==> Installing remote deploy script"
install -m 0755 /dev/stdin "${APP_ROOT}/bin/deploy-release.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME}"
APP_USER="${APP_USER}"
APP_ROOT="${APP_ROOT}"
ARCHIVE_PATH="\${1:-}"

if [[ -z "\${ARCHIVE_PATH}" || ! -f "\${ARCHIVE_PATH}" ]]; then
  echo "Usage: deploy-release.sh /tmp/cinemacodex-<ts>.tar.gz"
  exit 1
fi

TS="\$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="\${APP_ROOT}/releases/\${TS}"
mkdir -p "\${RELEASE_DIR}"
tar -xzf "\${ARCHIVE_PATH}" -C "\${RELEASE_DIR}"

cd "\${RELEASE_DIR}"
ln -sfn "\${APP_ROOT}/shared/.env" .env

if [[ -f package-lock.json || -f npm-shrinkwrap.json ]]; then
  npm ci
else
  echo "No lockfile found in release archive; falling back to npm install"
  npm install --no-audit --no-fund
fi
npm run prisma:generate
npx prisma migrate deploy
npm run build

ln -sfn "\${RELEASE_DIR}" "\${APP_ROOT}/current"
chown -h "\${APP_USER}:${APP_USER}" "\${APP_ROOT}/current"
chown -R "\${APP_USER}:${APP_USER}" "\${RELEASE_DIR}"

systemctl restart "\${APP_NAME}.service"
systemctl --no-pager status "\${APP_NAME}.service"

echo "Deployment complete: \${RELEASE_DIR}"
EOF

echo "==> Installing systemd service"
cat > "/etc/systemd/system/${APP_NAME}.service" <<EOF
[Unit]
Description=${APP_NAME} Next.js app
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_ROOT}/current
EnvironmentFile=${APP_ROOT}/shared/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${APP_NAME}.service"

echo "==> Installing nightly catalog sync cron"
install -m 0755 /dev/stdin "${APP_ROOT}/bin/setup-nightly-catalog-cron.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail

if [[ "\$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo)."
  exit 1
fi

APP_NAME="${APP_NAME}"
APP_USER="${APP_USER}"
APP_ROOT="${APP_ROOT}"
CRON_FILE="/etc/cron.d/\${APP_NAME}-catalog-sync"
LOG_FILE="/var/log/\${APP_NAME}-catalog-sync.log"

apt-get update
apt-get install -y cron
systemctl enable cron
systemctl restart cron

touch "\${LOG_FILE}"
chown "\${APP_USER}:\${APP_USER}" "\${LOG_FILE}"

cat > "\${CRON_FILE}" <<CRON
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

0 0 * * * \${APP_USER} /bin/bash -lc 'set -a; . \${APP_ROOT}/shared/.env; set +a; export TMDB_UPDATE_RELEASE_DATE_GTE="\$(date +\%Y)-01-01"; cd \${APP_ROOT}/current; /usr/bin/npm run sync:tmdb:update >> \${LOG_FILE} 2>&1'
CRON

chmod 644 "\${CRON_FILE}"
EOF

bash "${APP_ROOT}/bin/setup-nightly-catalog-cron.sh"

echo "==> Configuring nginx"
PRIMARY_SERVER_NAMES="${DOMAIN}"
if [[ -n "${DOMAIN_ALIASES}" ]]; then
  PRIMARY_SERVER_NAMES="${PRIMARY_SERVER_NAMES} ${DOMAIN_ALIASES}"
fi

cat > "/etc/nginx/sites-available/${APP_NAME}" <<EOF
server {
    listen 80;
    server_name ${PRIMARY_SERVER_NAMES};

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

ln -sfn "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/${APP_NAME}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Requesting Let's Encrypt certificate"
CERTBOT_ARGS=(-d "${DOMAIN}")
if [[ -n "${DOMAIN_ALIASES}" ]]; then
  IFS=',' read -ra ALIASES <<< "${DOMAIN_ALIASES}"
  for alias in "${ALIASES[@]}"; do
    alias_trimmed="$(echo "${alias}" | xargs)"
    if [[ -n "${alias_trimmed}" ]]; then
      CERTBOT_ARGS+=(-d "${alias_trimmed}")
    fi
  done
fi

certbot --nginx --non-interactive --agree-tos --email "${LETSENCRYPT_EMAIL}" "${CERTBOT_ARGS[@]}" --redirect
systemctl reload nginx

echo "Bootstrap complete."
echo "Next step: run deploy.ps1 from your workstation to upload and deploy first release."
