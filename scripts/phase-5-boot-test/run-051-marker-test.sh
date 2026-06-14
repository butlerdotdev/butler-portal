#!/usr/bin/env bash
#
# Copyright 2026 The Butler Authors.
# Apache 2.0 license.
#
# 0.5.1 GATE Part 2: the marker assertion. Boots the locally built
# portal with the populated dynamic-plugins volume, then runs the
# Playwright marker spec against it. THE GATE is green when the marker
# text emitted by HelloPage is visible at /hello-dynamic-plugin. If it
# is not, the frontend bridge (ScalprumRoot -> Module Federation ->
# DynamicPluginsLoader -> DynamicRootContext -> Route mount) is broken
# and the deferral lesson applies: do NOT stub-and-defer.
#
# Pre-reqs:
#   * butler-portal:0.5.1-local built locally
#   * ghcr.io/butlerdotdev/butler-portal-test-fixture:hello-dynamic-0.5.1 pushed
#   * scripts/phase-5-boot-test/playwright/ has node_modules + playwright installed

set -euo pipefail

PORTAL_IMAGE="${PORTAL_IMAGE:-butler-portal:0.5.1-local}"
INSTALLER_IMAGE="${INSTALLER_IMAGE:-ghcr.io/butlerdotdev/butler-portal-plugin-installer:0.1.0}"
TEST_PLUGIN_URI="${TEST_PLUGIN_URI:-oci://ghcr.io/butlerdotdev/butler-portal-test-fixture:hello-dynamic-0.5.1}"
TEST_PLUGIN_INTEGRITY="${TEST_PLUGIN_INTEGRITY:-sha512-Tjx+pSxnZIDL3kIL7DtPSvggpnJTsuDIoYM0B5PWasM63RFL/LAekZrvn5Cvv24EghckhsqbF2OKD3odgFo3qQ==}"
NET=butler-marker-051
# RUNNER_TEMP (GitHub Actions) and GITHUB_WORKSPACE are both inside the
# runner's working-set that is reliably bind-mountable into Docker on
# self-hosted Docker setups. Falling back to mktemp -d (/tmp/...) makes
# the script work locally but breaks under runner-managed Docker where
# /tmp on the host is NOT inside the daemon's view of the filesystem
# (the symptom is bind-mounted single-file paths resolving as empty
# directories inside the container).
WORK=$(mktemp -d -p "${RUNNER_TEMP:-${GITHUB_WORKSPACE:-/tmp}}")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

cleanup() {
  log "cleanup"
  docker rm -f portal-marker-051 postgres-marker-051 2>/dev/null || true
  docker volume rm dynamic-plugins-marker-vol 2>/dev/null || true
  docker network rm "$NET" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

docker network rm "$NET" 2>/dev/null || true
docker network create "$NET" >/dev/null

AUTH_DIR="$WORK/docker-auth"
mkdir -p "$AUTH_DIR"
# In CI the workflow's GITHUB_TOKEN cannot hit /user (403), so fall back
# to env-provided GH_USER / GH_TOKEN when present. Local runs continue
# to use gh's resolved login + token.
gh_user="${GH_USER:-$(gh api user --jq .login)}"
gh_token="${GH_TOKEN:-$(gh auth token)}"
gh_auth_b64=$(printf '%s:%s' "$gh_user" "$gh_token" | base64)
cat >"$AUTH_DIR/config.json" <<JSON
{
  "auths": {
    "ghcr.io": {
      "auth": "$gh_auth_b64"
    }
  }
}
JSON

log "postgres sidecar"
docker run -d --network "$NET" --name postgres-marker-051 \
  -e POSTGRES_DB=backstage -e POSTGRES_USER=backstage -e POSTGRES_PASSWORD=backstage \
  postgres:15 >/dev/null
for i in $(seq 1 30); do
  docker exec postgres-marker-051 pg_isready -U backstage 2>/dev/null && break
  sleep 1
done

log "create dynamic-plugins volume and pre-chown for non-root installer"
docker volume rm dynamic-plugins-marker-vol 2>/dev/null || true
docker volume create dynamic-plugins-marker-vol >/dev/null
docker run --rm -v "dynamic-plugins-marker-vol:/v" alpine chown -R 65532:65532 /v >/dev/null

log "install test plugin into shared volume"
cat >"$WORK/installer-config.yaml" <<EOF
continueOnError: false
plugins:
  - package: $TEST_PLUGIN_URI
    integrity: $TEST_PLUGIN_INTEGRITY
EOF
docker run --rm \
  -e DOCKER_CONFIG=/auth \
  -v "$AUTH_DIR:/auth:ro" \
  -v "$WORK/installer-config.yaml":/etc/butler-portal/dynamic-plugins.yaml:ro \
  -v "dynamic-plugins-marker-vol:/dynamic-plugins-root" \
  "$INSTALLER_IMAGE" 2>&1 | tee "$WORK/installer.log" | grep -E "event=plugin_installed|event=plugin_rejected" | head -3 || true

log "boot portal with populated volume + NODE_PATH + Butler plugins disabled"
docker rm -f portal-marker-051 2>/dev/null || true
docker run -d --network "$NET" --name portal-marker-051 -p 7007:7007 \
  -e APP_CONFIG_app_baseUrl=http://localhost:7007 \
  -e APP_CONFIG_backend_baseUrl=http://localhost:7007 \
  -e APP_CONFIG_backend_cors_origin=http://localhost:7007 \
  -e APP_CONFIG_auth_providers_guest_dangerouslyAllowOutsideDevelopment=true \
  -e APP_CONFIG_plugins_butler_enabled=false \
  -e APP_CONFIG_plugins_workspaces_enabled=false \
  -e APP_CONFIG_plugins_registry_enabled=false \
  -e APP_CONFIG_plugins_pipeline_enabled=false \
  -e APP_CONFIG_dynamicPlugins_rootDirectory=/dynamic-plugins-root \
  -e POSTGRES_HOST=postgres-marker-051 -e POSTGRES_PORT=5432 \
  -e POSTGRES_USER=backstage -e POSTGRES_PASSWORD=backstage \
  -e GITHUB_TOKEN=unused \
  -e AUTH_GOOGLE_CLIENT_ID=unused -e AUTH_GOOGLE_CLIENT_SECRET=unused \
  -e NODE_PATH=/app/node_modules \
  -v "dynamic-plugins-marker-vol:/dynamic-plugins-root:ro" \
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

log "confirm /remotes returns the test plugin Remote entry"
remotes_body=$(curl -s http://localhost:7007/.backstage/dynamic-features/remotes)
log "  remotes: $remotes_body"
echo "$remotes_body" | grep -q "butler-hello-dynamic-plugin" || {
  echo "FAIL: /remotes did not contain the test plugin; aborting marker test" >&2
  docker logs portal-marker-051 2>&1 | tail -40
  exit 1
}

log "run Playwright marker spec"
cd "$SCRIPT_DIR/playwright"
PORTAL_URL=http://localhost:7007 \
DYNAMIC_PLUGIN_MARKER='Hello from the Butler Portal dynamic-plugins runtime' \
DYNAMIC_PLUGIN_ROUTE='/hello-dynamic-plugin' \
  npx playwright test dynamic-plugin-marker.spec.ts --reporter=list

log ""
log "================================================================"
log "0.5.1 GATE GREEN: marker visible at /hello-dynamic-plugin"
log "  -> the frontend bridge loads federation remotes through the"
log "     real manifest path, mounts via dynamicPluginsExports, and"
log "     renders the component."
log "================================================================"
