#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
output=.preview/site/index.html
server_pid=

cleanup() {
  status=$?
  trap - EXIT
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    if kill -TERM "$server_pid"; then
      if wait "$server_pid"; then
        :
      else
        server_status=$?
        if [[ "$server_status" -ne 143 && "$status" -eq 0 ]]; then
          status=$server_status
        fi
      fi
    else
      printf 'Failed to stop preview server PID %s\n' "$server_pid" >&2
      status=1
    fi
  fi
  if [[ "$status" -ne 0 ]]; then
    rm -f "$output"
  fi
  rm -f .preview/server-port
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p .preview/site
rm -f "$output"
rm -f .preview/server-port

case "${PREVIEW_MARKED:-false}" in
  false) unset LANE_MARKER ;;
  true)
    marker="${LANE_MARKER:-}"
    if [[ -z "${marker//[[:space:]]/}" ]]; then
      printf 'Marked capture requires a nonempty LANE_MARKER secret.\n' >&2
      exit 1
    fi
    ;;
  *)
    printf 'PREVIEW_MARKED must be true or false.\n' >&2
    exit 1
    ;;
esac
export PREVIEW_MARKED="${PREVIEW_MARKED:-false}"
export LANE_ID=lane-07

# Test processes do not need the marker; never load the local .env.
env -u LANE_MARKER npx --yes pnpm@12.15.0 test
env -u LANE_MARKER npx --yes pnpm@12.15.0 typecheck

# Run the real app with the committed sample runs, on loopback only, without heartbeat writes.
node --import tsx --input-type=module -e '
  import { writeFileSync } from "node:fs";
  import { serve } from "@hono/node-server";
  import { createApp } from "./src/app.tsx";
  import { loadConfig } from "./src/config.ts";
  serve({
    fetch: createApp({ ...loadConfig(), runsDir: "runs" }).fetch,
    hostname: "127.0.0.1",
    port: 0,
  }, ({ port }) => writeFileSync(".preview/server-port", String(port)));
' &
server_pid=$!

ready=false
for ((attempt = 0; attempt < 30; attempt++)); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    printf 'Preview server exited before becoming ready.\n' >&2
    exit 1
  fi
  if [[ -f .preview/server-port ]]; then
    port=$(cat .preview/server-port)
    if curl --fail --silent --max-time 1 --output /dev/null "http://127.0.0.1:$port/health"; then
      ready=true
      break
    fi
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  printf 'Preview server readiness timed out after 30 attempts.\n' >&2
  exit 1
fi

curl --fail --silent --show-error --max-time 15 \
  "http://127.0.0.1:$port/digest/2026-10-28" --output "$output"
node scripts/verify-preview.mjs "$output"
printf 'Captured a validated single-file digest at %s (not uploaded).\n' "$output"
