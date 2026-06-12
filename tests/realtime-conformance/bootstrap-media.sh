#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/infra/local-media/compose.yml"
LOCAL_MEDIA_DIR="${REPO_ROOT}/infra/local-media"
ENV_EXAMPLE="${LOCAL_MEDIA_DIR}/.env.example"
ENV_FILE="${LOCAL_MEDIA_DIR}/.env"
TURN_EXAMPLE="${LOCAL_MEDIA_DIR}/coturn/turnserver.conf.example"
TURN_CONF="${LOCAL_MEDIA_DIR}/coturn/turnserver.conf"
HEALTH_URL="http://127.0.0.1:3000/healthz"
SFU_COMPOSE_LOG="${REPO_ROOT}/sfu-compose.log"
WAIT_SECONDS=60
POLL_INTERVAL=2

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

ensure_fixtures() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  fi
  if [[ ! -f "${TURN_CONF}" ]]; then
    mkdir -p "$(dirname "${TURN_CONF}")"
    cp "${TURN_EXAMPLE}" "${TURN_CONF}"
  fi
}

cmd_up() {
  ensure_fixtures
  (
    cd "${REPO_ROOT}"
    compose up -d --build
  )
}

cmd_wait() {
  local elapsed=0
  while (( elapsed < WAIT_SECONDS )); do
    if curl -sSf "${HEALTH_URL}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${POLL_INTERVAL}"
    elapsed=$((elapsed + POLL_INTERVAL))
  done

  echo '[drawer=connectivity] code=SFU_HEALTH_TIMEOUT step=bootstrap' >&2
  (
    cd "${REPO_ROOT}"
    compose ps >&2
  ) || true
  exit 1
}

should_capture_compose_log() {
  local arg="${1:-}"
  [[ "${arg}" == "capture" || "${arg}" == "--capture-log" || "${BOOTSTRAP_CAPTURE_COMPOSE_LOG:-}" == "1" ]]
}

cmd_down() {
  local capture_arg="${1:-}"

  if should_capture_compose_log "${capture_arg}"; then
    (
      cd "${REPO_ROOT}"
      {
        echo "=== docker compose ps ==="
        compose ps 2>&1 || true
        echo "=== docker compose logs ==="
        compose logs --no-color 2>&1 || true
      } >"${SFU_COMPOSE_LOG}" 2>&1
    )
  fi

  (
    cd "${REPO_ROOT}"
    compose down
  )
}

usage() {
  echo "Usage: $(basename "$0") {up|wait|down [capture]}" >&2
  exit 1
}

case "${1:-}" in
  up) cmd_up ;;
  wait) cmd_wait ;;
  down) cmd_down "${2:-}" ;;
  *) usage ;;
esac
