#!/usr/bin/env bash
set -Eeuo pipefail

deployment_root=/opt/veil-arena
environment_file="$deployment_root/config/veil-arena.env"
release_dir="${VEIL_ARENA_RELEASE_DIR:-$deployment_root/current}"

test -f "$environment_file"
test -d "$release_dir"

release_dir="$(readlink -f "$release_dir")"
release_name="$(basename "$release_dir")"
previous_release=""
if [[ -L "$deployment_root/current" ]]; then
  previous_release="$(readlink -f "$deployment_root/current")"
fi

export VEIL_ARENA_IMAGE="veil-arena:$release_name"
compose=(
  docker compose
  --project-directory "$release_dir"
  --env-file "$environment_file"
  -f "$release_dir/docker-compose.prod.yml"
)

switched=0
rollback() {
  local exit_code=$?
  if [[ "$switched" == "1" && -n "$previous_release" && -d "$previous_release" && "$previous_release" != "$release_dir" ]]; then
    local previous_name
    previous_name="$(basename "$previous_release")"
    ln -sfn "$previous_release" "$deployment_root/current"
    VEIL_ARENA_IMAGE="veil-arena:$previous_name" docker compose \
      --project-directory "$previous_release" \
      --env-file "$environment_file" \
      -f "$previous_release/docker-compose.prod.yml" \
      up -d --wait --wait-timeout 120 app caddy || true
  fi
  exit "$exit_code"
}
trap rollback ERR

"${compose[@]}" build --pull app
"${compose[@]}" up -d --wait --wait-timeout 120 db
"${compose[@]}" run --rm migrate

ln -sfn "$release_dir" "$deployment_root/current"
switched=1
"${compose[@]}" up -d --wait --wait-timeout 120 app caddy
"${compose[@]}" exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(async (response) => { if (!response.ok) process.exit(1); console.log(await response.text()); }).catch(() => process.exit(1))"
"${compose[@]}" ps

switched=0
trap - ERR
