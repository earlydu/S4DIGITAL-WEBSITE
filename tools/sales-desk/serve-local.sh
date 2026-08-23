#!/usr/bin/env bash
# Starts the site locally with the existing production env loaded, so /api/crm works.
# Reads .env.production.local. Never prints the values.
cd "$(dirname "$0")/../.." || exit 1
set -a
# shellcheck disable=SC1091
[ -f .env.production.local ] && . ./.env.production.local
set +a
echo "loaded: $(grep -cE '^[A-Z0-9_]+=' .env.production.local) env vars"
exec node serve.mjs
