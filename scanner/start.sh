#!/bin/sh
set -eu

DB_DIR=/var/lib/clamav
CONF=/app/scanner/clamd.conf

mkdir -p "$DB_DIR"
chown -R clamav:clamav "$DB_DIR"

# A scanner without signatures is worse than unavailable. Refresh once at cold start
# and fail the container if no usable database can be obtained.
if ! freshclam --stdout; then
  if ! find "$DB_DIR" -maxdepth 1 -type f \( -name '*.cvd' -o -name '*.cld' \) | grep -q .; then
    echo 'ClamAV signatures unavailable; refusing to start.' >&2
    exit 1
  fi
fi

clamd --config-file="$CONF"

# Keep definitions reasonably fresh while an instance remains alive. This process
# never receives document bytes and is allowed to log signature-update metadata only.
freshclam --daemon --checks=12 --stdout >/tmp/freshclam.log 2>&1 &

exec node /app/scanner/clamav-service.mjs
