#!/bin/sh
# Start DeepSeek Harness web UI.
# dsh rejects wildcard bind addresses (0.0.0.0), so bind the container's
# concrete interface IP. Behind Railway's proxy, advertise the public URL.
set -e
cd "$(dirname "$0")/.."
HOST_IP=${HOST:-$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -v '^127\.' | head -1)}
HOST_IP=${HOST_IP:-$(hostname -i 2>/dev/null | awk '{print $1}')}
HOST_IP=${HOST_IP:-127.0.0.1}
PORT=${PORT:-3080}
export DSH_HOME="${DSH_HOME:-$(pwd)/dsh-home}"
ARGS="--host $HOST_IP --port $PORT --no-open"
if [ -n "$RAILWAY_PUBLIC_DOMAIN" ]; then
  ARGS="$ARGS --public-url https://$RAILWAY_PUBLIC_DOMAIN --trusted-host $RAILWAY_PUBLIC_DOMAIN"
fi
if [ -n "$DSH_PUBLIC_URL" ]; then
  ARGS="$ARGS --public-url $DSH_PUBLIC_URL --trusted-host $(echo "$DSH_PUBLIC_URL" | sed -e 's#https\?://##' -e 's#/.*##')"
fi
echo "Starting dsh web on $HOST_IP:$PORT (DSH_HOME=$DSH_HOME)"
# shellcheck disable=SC2086
exec dsh web $ARGS
