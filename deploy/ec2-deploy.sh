#!/usr/bin/env bash
set -Eeuo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.ec2.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-trace}"
STATE_FILE="${STATE_FILE:-.active-color}"
CADDYFILE_PATH="${CADDYFILE_PATH:-Caddyfile}"
CADDY_TEMPLATE_PATH="${CADDY_TEMPLATE_PATH:-Caddyfile.template}"
BACKEND_DRAIN_SECONDS="${BACKEND_DRAIN_SECONDS:-30}"
BACKEND_HEALTH_TIMEOUT_SECONDS="${BACKEND_HEALTH_TIMEOUT_SECONDS:-240}"
WEB_HEALTH_TIMEOUT_SECONDS="${WEB_HEALTH_TIMEOUT_SECONDS:-120}"
WORKER_START_TIMEOUT_SECONDS="${WORKER_START_TIMEOUT_SECONDS:-90}"
HEALTH_POLL_INTERVAL_SECONDS="${HEALTH_POLL_INTERVAL_SECONDS:-2}"

export COMPOSE_PROJECT_NAME

log() {
  printf '[deploy] %s\n' "$*"
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

service_container_id() {
  compose ps -q "$1"
}

service_status() {
  local container_id="$1"

  docker inspect --format '{{.State.Status}}' "$container_id"
}

service_health() {
  local container_id="$1"

  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id"
}

wait_for_service_health() {
  local service="$1"
  local timeout_seconds="$2"
  local start_epoch
  local container_id
  local health
  local status

  start_epoch="$(date +%s)"

  while true; do
    container_id="$(service_container_id "$service")"
    if [[ -n "$container_id" ]]; then
      health="$(service_health "$container_id")"
      status="$(service_status "$container_id")"

      if [[ "$health" == "healthy" ]]; then
        log "$service is healthy."
        return 0
      fi

      if [[ "$health" == "unhealthy" || "$status" == "exited" || "$status" == "dead" ]]; then
        log "$service failed to become healthy (status=$status health=$health)."
        compose logs --tail=200 "$service" || true
        return 1
      fi
    fi

    if (( $(date +%s) - start_epoch >= timeout_seconds )); then
      log "Timed out waiting for $service to become healthy."
      compose logs --tail=200 "$service" || true
      return 1
    fi

    sleep "$HEALTH_POLL_INTERVAL_SECONDS"
  done
}

wait_for_service_running() {
  local service="$1"
  local timeout_seconds="$2"
  local start_epoch
  local container_id
  local status

  start_epoch="$(date +%s)"

  while true; do
    container_id="$(service_container_id "$service")"
    if [[ -n "$container_id" ]]; then
      status="$(service_status "$container_id")"
      if [[ "$status" == "running" ]]; then
        log "$service is running."
        return 0
      fi

      if [[ "$status" == "exited" || "$status" == "dead" ]]; then
        log "$service exited before it was ready."
        compose logs --tail=200 "$service" || true
        return 1
      fi
    fi

    if (( $(date +%s) - start_epoch >= timeout_seconds )); then
      log "Timed out waiting for $service to start."
      compose logs --tail=200 "$service" || true
      return 1
    fi

    sleep "$HEALTH_POLL_INTERVAL_SECONDS"
  done
}

render_caddyfile() {
  local color="$1"
  local backend_upstream="backend-${color}:4000"
  local web_upstream="web-${color}:3000"

  if [[ -f "$CADDY_TEMPLATE_PATH" ]]; then
    sed \
      -e "s|__BACKEND_UPSTREAM__|${backend_upstream}|g" \
      -e "s|__WEB_UPSTREAM__|${web_upstream}|g" \
      "$CADDY_TEMPLATE_PATH" > "$CADDYFILE_PATH"
    return 0
  fi

  cat > "$CADDYFILE_PATH" <<EOF
# Managed on the EC2 host by deploy/ec2-deploy.sh.
gettrace.org, www.gettrace.org {
	encode zstd gzip

	@backend path /auth* /graphql* /uploads* /webhooks/github* /ws* /bridge* /terminal* /health

	handle @backend {
		reverse_proxy ${backend_upstream} {
			stream_close_delay 30s
		}
	}
	handle {
		reverse_proxy ${web_upstream}
	}
}
EOF
}

apply_caddy_config() {
  local caddy_container_id
  local caddy_status

  caddy_container_id="$(service_container_id caddy)"
  if [[ -n "$caddy_container_id" ]]; then
    caddy_status="$(service_status "$caddy_container_id")"
  else
    caddy_status=""
  fi

  if [[ "$caddy_status" == "running" ]]; then
    log "Validating Caddy config."
    compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    log "Reloading Caddy."
    compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
    return 0
  fi

  log "Starting Caddy."
  compose up -d caddy
  wait_for_service_running caddy 60
}

remove_compose_service() {
  local service="$1"

  if [[ -n "$(service_container_id "$service")" ]]; then
    compose rm -f -s "$service" >/dev/null
  fi
}

remove_legacy_service() {
  local service="$1"
  local container_ids=()

  mapfile -t container_ids < <(
    docker ps -aq \
      --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
      --filter "label=com.docker.compose.service=${service}"
  )

  if (( ${#container_ids[@]} > 0 )); then
    docker rm -f "${container_ids[@]}" >/dev/null
  fi
}

current_color() {
  if [[ ! -f "$STATE_FILE" ]]; then
    printf 'legacy'
    return 0
  fi

  case "$(tr -d '[:space:]' < "$STATE_FILE")" in
    blue | green)
      tr -d '[:space:]' < "$STATE_FILE"
      ;;
    *)
      printf 'legacy'
      ;;
  esac
}

next_color() {
  local active_color="$1"

  if [[ "$active_color" == "blue" ]]; then
    printf 'green'
  else
    printf 'blue'
  fi
}

main() {
  local active_color
  local target_color
  local backend_service
  local web_service
  local worker_service

  active_color="$(current_color)"
  target_color="$(next_color "$active_color")"
  backend_service="backend-${target_color}"
  web_service="web-${target_color}"
  worker_service="worker-${target_color}"

  if [[ "$active_color" == "legacy" ]]; then
    log "Legacy single-stack deployment detected. Deploying ${target_color}."
  else
    log "Active color is ${active_color}. Deploying ${target_color}."
  fi

  compose up -d "$backend_service" "$web_service"
  wait_for_service_health "$backend_service" "$BACKEND_HEALTH_TIMEOUT_SECONDS"
  wait_for_service_health "$web_service" "$WEB_HEALTH_TIMEOUT_SECONDS"

  render_caddyfile "$target_color"
  apply_caddy_config
  printf '%s\n' "$target_color" > "$STATE_FILE"

  compose up -d "$worker_service"
  wait_for_service_running "$worker_service" "$WORKER_START_TIMEOUT_SECONDS"

  if [[ "$active_color" == "blue" || "$active_color" == "green" ]]; then
    remove_compose_service "worker-${active_color}"
  else
    remove_legacy_service worker
  fi

  if (( BACKEND_DRAIN_SECONDS > 0 )); then
    log "Draining the previous app stack for ${BACKEND_DRAIN_SECONDS}s."
    sleep "$BACKEND_DRAIN_SECONDS"
  fi

  if [[ "$active_color" == "blue" || "$active_color" == "green" ]]; then
    remove_compose_service "web-${active_color}"
    remove_compose_service "backend-${active_color}"
  else
    remove_legacy_service web
    remove_legacy_service backend
  fi

  docker image prune -af >/dev/null 2>&1 || true
  log "Deploy complete. Active color: ${target_color}."
}

main "$@"
