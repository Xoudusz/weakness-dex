#!/bin/sh
# Runs at container start (nginx:alpine executes /docker-entrypoint.d/*.sh).
# IMPRESSUM_ENABLED=false removes the Impressum link and page; anything else keeps them (default on).
set -eu
ROOT=/usr/share/nginx/html
flag=$(printf '%s' "${IMPRESSUM_ENABLED:-true}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | tr '[:upper:]' '[:lower:]')
if [ "$flag" = "false" ]; then
  sed -i 's#<!--impressum:start-->.*<!--impressum:end-->##' "$ROOT/index.html"
  if grep -q 'impressum:start' "$ROOT/index.html"; then
    echo "40-impressum.sh: marker block not removed, keeping impressum.html" >&2
    exit 1
  fi
  rm -f "$ROOT/impressum.html"
  echo "40-impressum.sh: Impressum disabled"
fi
