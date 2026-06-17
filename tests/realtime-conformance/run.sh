#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HARNESS_DIR="${SCRIPT_DIR}"

cd "${HARNESS_DIR}"

if ! curl -sSf http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
  echo '[drawer=connectivity] code=SFU_NOT_READY step=bootstrap' >&2
  exit 1
fi

if [[ -z "${GITHUB_ACTIONS:-}" ]] && [[ ! -d "${HARNESS_DIR}/node_modules" ]]; then
  npm ci --prefix "${HARNESS_DIR}" >/dev/null 2>&1
fi

run_step() {
  local step="$1"
  local script="$2"
  if ! npx --prefix "${HARNESS_DIR}" tsx "${script}"; then
    exit 1
  fi
}

run_vitest() {
  local step="$1"
  shift
  if ! npx --prefix "${HARNESS_DIR}" vitest run "$@"; then
    exit 1
  fi
}

rm -f "${REPO_ROOT}/harness-summary.json"

run_step "1-join" "${HARNESS_DIR}/scenarios/01-join.mts"
run_step "2-publish" "${HARNESS_DIR}/scenarios/02-publish.mts"
run_step "3-consume" "${HARNESS_DIR}/scenarios/03-consume.mts"
run_step "4-partial-unpublish" "${HARNESS_DIR}/scenarios/04-partial-unpublish.mts"
run_vitest "5-8-ws-drawer" \
  "${HARNESS_DIR}/scenarios/05-chat-reconnect.test.ts" \
  "${HARNESS_DIR}/scenarios/06-sfu-reconnect.test.ts" \
  "${HARNESS_DIR}/scenarios/07-typing.test.ts" \
  "${HARNESS_DIR}/scenarios/08-presence-active.test.ts"
run_step "9-host-screen-survival" "${HARNESS_DIR}/scenarios/09-host-screen-survival.mts"

echo "realtime-conformance: all nine steps passed"
