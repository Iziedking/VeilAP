#!/usr/bin/env bash
set -Eeuo pipefail

: "${VEILAP_ARENA_WORKER_SECRET:?VEILAP_ARENA_WORKER_SECRET is required}"
: "${VEILAP_ARENA_PROJECT_ID:?VEILAP_ARENA_PROJECT_ID is required}"
: "${VEILAP_ARENA_SEASON_ID:?VEILAP_ARENA_SEASON_ID is required}"

if [[ ! "$VEILAP_ARENA_PROJECT_ID" =~ ^[A-Za-z0-9._:-]+$ ]]; then
  echo "VEILAP_ARENA_PROJECT_ID is invalid" >&2
  exit 2
fi
if [[ ! "$VEILAP_ARENA_SEASON_ID" =~ ^[A-Za-z0-9._:-]+$ ]]; then
  echo "VEILAP_ARENA_SEASON_ID is invalid" >&2
  exit 2
fi

api_origin="${VEILAP_ARENA_API_ORIGIN:-http://127.0.0.1}"
payload="$(printf '{"projectId":"%s","seasonId":"%s"}' "$VEILAP_ARENA_PROJECT_ID" "$VEILAP_ARENA_SEASON_ID")"

exec /usr/bin/curl +  --fail-with-body +  --silent +  --show-error +  --request POST +  "$api_origin/api/internal/arena/worker/tick" +  --header "x-veil-arena-worker-secret: $VEILAP_ARENA_WORKER_SECRET" +  --header "content-type: application/json" +  --data "$payload"
