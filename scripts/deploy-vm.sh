#!/usr/bin/env bash
set -Eeuo pipefail

cd /opt/veil-arena/current

test -f /opt/veil-arena/config/veil-arena.env

compose=(docker compose --env-file /opt/veil-arena/config/veil-arena.env -f docker-compose.prod.yml)

"${compose[@]}" build --pull app
"${compose[@]}" up -d db
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d app caddy
"${compose[@]}" ps

"${compose[@]}" exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(async (response) => { if (!response.ok) process.exit(1); console.log(await response.text()); }).catch(() => process.exit(1))"
