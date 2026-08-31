#!/usr/bin/env bash
set -Eeuo pipefail

: "${VEILAP_ARENA_WORKER_SECRET:?VEILAP_ARENA_WORKER_SECRET is required}"
project_id="${VEILAP_ARENA_PROJECT_ID:-}"
season_id="${VEILAP_ARENA_SEASON_ID:-}"

if [[ -n "$project_id" && ! "$project_id" =~ ^[A-Za-z0-9._:-]+$ ]]; then
  echo "VEILAP_ARENA_PROJECT_ID is invalid" >&2
  exit 2
fi
if [[ -n "$season_id" && ! "$season_id" =~ ^[A-Za-z0-9._:-]+$ ]]; then
  echo "VEILAP_ARENA_SEASON_ID is invalid" >&2
  exit 2
fi
if [[ -n "$project_id" && -z "$season_id" ]] || [[ -z "$project_id" && -n "$season_id" ]]; then
  echo "VEILAP_ARENA_PROJECT_ID and VEILAP_ARENA_SEASON_ID must be set together" >&2
  exit 2
fi

api_origin="${VEILAP_ARENA_API_ORIGIN:-http://127.0.0.1}"
payload="{}"
if [[ -n "$project_id" ]]; then
  payload="$(printf '{"projectId":"%s","seasonId":"%s"}' "$project_id" "$season_id")"
fi

exec /usr/bin/curl \
  --fail-with-body \
  --silent \
  --show-error \
  --request POST \
  "$api_origin/api/internal/arena/worker/tick" \
  --header "x-veil-arena-worker-secret: $VEILAP_ARENA_WORKER_SECRET" \
  --header "content-type: application/json" \
  --data "$payload"
