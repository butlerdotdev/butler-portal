#!/usr/bin/env bash
#
# Copyright 2026 The Butler Authors.
# Apache 2.0 license.
#
# 0.5.1 backend dynamic plugin verification. Boots the portal with the
# backend test plugin installed and asserts the plugin's /ping route
# responds with the marker. Symmetric to run-051-marker-test.sh which
# does the same for the frontend plugin.
#
# The portal's @backstage/backend-dynamic-feature-service loader scans
# the same dynamicPlugins.rootDirectory the frontend uses; the backend
# plugin manifest's backstage.role == "backend-plugin" tells the
# scanner to register the plugin's HTTP routes against Backstage's
# httpRouter rather than expose it as a Module Federation remote.

set -euo pipefail

PORTAL_IMAGE="${PORTAL_IMAGE:-butler-portal:0.5.1-local}"
INSTALLER_IMAGE="${INSTALLER_IMAGE:-ghcr.io/butlerdotdev/butler-portal-plugin-installer:0.1.0}"
TEST_PLUGIN_URI="${TEST_PLUGIN_URI:-oci://ghcr.io/butlerdotdev/butler-portal-test-fixture:hello-dynamic-backend-0.5.1}"
TEST_PLUGIN_INTEGRITY="${TEST_PLUGIN_INTEGRITY:-sha512-RG3OkIOZUG/sR3VgDODQYV29Bh3A1gg+BuzJ7WDDBXhEjae4R1NPIWMcxMsPpSBU88jfcrbQa4Bs9SoaokYAKw==}"
NET=butler-backend-051
WORK=$(mktemp -d -p "${RUNNER_TEMP:-${GITHUB_WORKSPACE:-/tmp}}")
EXPECTED_MARKER='Hello from the Butler Portal dynamic-plugins runtime (backend)'

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

cleanup() {
  log "cleanup"
  docker rm -f portal-backend-051 postgres-backend-051 2>/dev/null || true
  docker volume rm dynamic-plugins-backend-vol 2>/dev/null || true
  docker network rm "$NET" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

docker network rm "$NET" 2>/dev/null || true
docker network create "$NET" >/dev/null

AUTH_DIR="$WORK/docker-auth"
mkdir -p "$AUTH_DIR"
gh_user="${GH_USER:-$(gh api user --jq .login)}"
gh_token="${GH_TOKEN:-$(gh auth token)}"
gh_auth_b64=$(printf '%s:%s' "$gh_user" "$gh_token" | base64 -w0 2>/dev/null || printf '%s:%s' "$gh_user" "$gh_token" | base64)
cat >"$AUTH_DIR/config.json" <<JSON
{ "auths": { "ghcr.io": { "auth": "$gh_auth_b64" } } }
JSON
chmod 755 "$AUTH_DIR"
chmod 644 "$AUTH_DIR/config.json"

log "postgres sidecar"
docker run -d --network "$NET" --name postgres-backend-051 \
  -e POSTGRES_DB=backstage -e POSTGRES_USER=backstage -e POSTGRES_PASSWORD=backstage \
  postgres:15 >/dev/null
for i in $(seq 1 30); do
  docker exec postgres-backend-051 pg_isready -U backstage 2>/dev/null && break
  sleep 1
done

log "create dynamic-plugins volume and pre-chown for non-root installer"
docker volume rm dynamic-plugins-backend-vol 2>/dev/null || true
docker volume create dynamic-plugins-backend-vol >/dev/null
docker run --rm -v "dynamic-plugins-backend-vol:/v" alpine chown -R 65532:65532 /v >/dev/null

log "install backend test plugin into shared volume"
cat >"$WORK/installer-config.yaml" <<EOF
continueOnError: false
plugins:
  - package: $TEST_PLUGIN_URI
    integrity: $TEST_PLUGIN_INTEGRITY
EOF
docker run --rm \
  -e DOCKER_CONFIG=/auth \
  -v "$AUTH_DIR":/auth:ro \
  -v "$WORK/installer-config.yaml":/etc/butler-portal/dynamic-plugins.yaml:ro \
  -v "dynamic-plugins-backend-vol:/dynamic-plugins-root" \
  "$INSTALLER_IMAGE" > "$WORK/installer.log" 2>&1 || true
echo "--- installer output ---"
cat "$WORK/installer.log"

log "boot portal with populated volume + NODE_PATH + Butler plugins disabled"
docker rm -f portal-backend-051 2>/dev/null || true
docker run -d --network "$NET" --name portal-backend-051 -p 7007:7007 \
  -e APP_CONFIG_app_baseUrl=http://localhost:7007 \
  -e APP_CONFIG_backend_baseUrl=http://localhost:7007 \
  -e APP_CONFIG_backend_cors_origin=http://localhost:7007 \
  -e APP_CONFIG_auth_providers_guest_dangerouslyAllowOutsideDevelopment=true \
  -e APP_CONFIG_plugins_butler_enabled=false \
  -e APP_CONFIG_plugins_workspaces_enabled=false \
  -e APP_CONFIG_plugins_registry_enabled=false \
  -e APP_CONFIG_plugins_pipeline_enabled=false \
  -e APP_CONFIG_dynamicPlugins_rootDirectory=/dynamic-plugins-root \
  -e POSTGRES_HOST=postgres-backend-051 -e POSTGRES_PORT=5432 \
  -e POSTGRES_USER=backstage -e POSTGRES_PASSWORD=backstage \
  -e GITHUB_TOKEN=unused \
  -e AUTH_GOOGLE_CLIENT_ID=unused -e AUTH_GOOGLE_CLIENT_SECRET=unused \
  -e NODE_PATH=/app/node_modules \
  -v "dynamic-plugins-backend-vol:/dynamic-plugins-root:ro" \
  "$PORTAL_IMAGE" >/dev/null

log "wait for SPA shell"
for i in $(seq 1 360); do
  body=$(curl -s --max-time 2 http://localhost:7007/ 2>/dev/null || true)
  if [ -n "$body" ] && printf '%s' "$body" | head -c 15 | grep -q "<!DOCTYPE html>"; then
    log "  SPA shell serving after ${i}s"
    break
  fi
  sleep 1
done

log "poll /api/hello-dynamic-backend/ping for the marker"
for i in $(seq 1 180); do
  PING_BODY=$(curl -s --max-time 2 http://localhost:7007/api/hello-dynamic-backend/ping 2>/dev/null || true)
  if echo "$PING_BODY" | grep -qF "$EXPECTED_MARKER"; then
    log "  /api/hello-dynamic-backend/ping returned the marker after ${i}s"
    log "  body: $PING_BODY"
    break
  fi
  sleep 1
done

if ! echo "$PING_BODY" | grep -qF "$EXPECTED_MARKER"; then
  echo "FAIL: /api/hello-dynamic-backend/ping did not return the marker" >&2
  echo "  expected substring: $EXPECTED_MARKER" >&2
  echo "  got: $PING_BODY" >&2
  echo "--- portal-backend-051 logs (tail 80) ---" >&2
  docker logs portal-backend-051 2>&1 | tail -80 >&2
  exit 1
fi

log ""
log "================================================================"
log "0.5.1 BACKEND GATE GREEN: /api/hello-dynamic-backend/ping returns"
log "  the marker."
log "  -> The dynamic-plugins backend loader scanned the rootDirectory,"
log "     loaded the plugin, registered its httpRouter, and served the"
log "     route on the portal's standard backend HTTP listener."
log "================================================================"
