#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo ENV_FILE=/opt/cinemacodex/shared/.env ./scripts/deploy/setup-postgres-ubuntu24.sh
#
# Reads DATABASE_URL from ENV_FILE and ensures matching role/database exist.
# Only applies when host is localhost/127.0.0.1.

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo)."
  exit 1
fi

ENV_FILE="${ENV_FILE:-/opt/cinemacodex/shared/.env}"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ENV_FILE not found: ${ENV_FILE}"
  exit 1
fi

DB_URL_RAW="$(grep -E '^DATABASE_URL=' "${ENV_FILE}" | tail -n1 | cut -d= -f2- || true)"
if [[ -z "${DB_URL_RAW}" ]]; then
  echo "DATABASE_URL not found in ${ENV_FILE}"
  exit 1
fi

# Strip optional wrapping quotes
DB_URL="${DB_URL_RAW%\"}"
DB_URL="${DB_URL#\"}"
DB_URL="${DB_URL%\'}"
DB_URL="${DB_URL#\'}"

PARSED="$(python3 - <<'PY' "${DB_URL}"
import sys
from urllib.parse import urlparse
u = urlparse(sys.argv[1])
print(u.scheme)
print(u.hostname or "")
print(u.port or "")
print((u.path or "/")[1:])
print(u.username or "")
print(u.password or "")
PY
)"

SCHEME="$(echo "${PARSED}" | sed -n '1p')"
HOST="$(echo "${PARSED}" | sed -n '2p')"
PORT="$(echo "${PARSED}" | sed -n '3p')"
DB_NAME="$(echo "${PARSED}" | sed -n '4p')"
DB_USER="$(echo "${PARSED}" | sed -n '5p')"
DB_PASS="$(echo "${PARSED}" | sed -n '6p')"

if [[ "${SCHEME}" != "postgresql" && "${SCHEME}" != "postgres" ]]; then
  echo "DATABASE_URL scheme is not postgres/postgresql. Found: ${SCHEME}"
  exit 1
fi

if [[ -z "${DB_NAME}" || -z "${DB_USER}" || -z "${DB_PASS}" ]]; then
  echo "DATABASE_URL must include database name, user, and password."
  exit 1
fi

if [[ -z "${HOST}" || "${HOST}" == "localhost" || "${HOST}" == "127.0.0.1" ]]; then
  echo "Configuring local PostgreSQL role/database for ${DB_USER}/${DB_NAME}"
else
  echo "DATABASE_URL host is remote (${HOST}); skipping local postgres setup."
  exit 0
fi

echo "==> Installing PostgreSQL"
apt-get update
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl restart postgresql

DB_PASS_ESCAPED="${DB_PASS//\'/\'\'}"

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE "${DB_USER}" LOGIN PASSWORD '${DB_PASS_ESCAPED}';
  ELSE
    ALTER ROLE "${DB_USER}" WITH LOGIN PASSWORD '${DB_PASS_ESCAPED}';
  END IF;
END
\$\$;
SQL

DB_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | tr -d '[:space:]')"
if [[ "${DB_EXISTS}" != "1" ]]; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
else
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER DATABASE \"${DB_NAME}\" OWNER TO \"${DB_USER}\";"
fi

echo "PostgreSQL setup complete for db=${DB_NAME} user=${DB_USER}."
