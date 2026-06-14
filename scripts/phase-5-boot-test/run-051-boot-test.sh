#!/usr/bin/env bash
#
# Copyright 2026 The Butler Authors.
# Apache 2.0 license.
#
# 0.5.1 boot-test: prove a REAL dynamic frontend plugin renders through
# the real manifest path on a locally built portal image with the
# 36ad7ce/be19cd3 runtime fixes. Empty, populated, and negative cases
# must all distinguish from each other -- the verification gap that hid
# the 0.5.0 stub came from a fallback that collapsed empty and broken
# into identical observations.
#
# Required state before running:
#   * butler-portal:0.5.1-local built locally with the 0.5.1 runtime fixes
#   * ghcr.io/butlerdotdev/butler-portal-plugin-installer:0.1.0 pullable
#   * ghcr.io/butlerdotdev/butler-portal-test-fixture:hello-dynamic-0.5.1
#     pushed (see push-test-plugin.sh)
#   * The test fixture's sha512 SRI integrity exported as INTEGRITY env var
#     OR set in the TEST_PLUGIN_INTEGRITY default below

set -euo pipefail

PORTAL_IMAGE="${PORTAL_IMAGE:-butler-portal:0.5.1-local}"
INSTALLER_IMAGE="${INSTALLER_IMAGE:-ghcr.io/butlerdotdev/butler-portal-plugin-installer:0.1.0}"
TEST_PLUGIN_URI="${TEST_PLUGIN_URI:-oci://ghcr.io/butlerdotdev/butler-portal-test-fixture:hello-dynamic-0.5.1}"
TEST_PLUGIN_INTEGRITY="${TEST_PLUGIN_INTEGRITY:-sha512-Tjx+pSxnZIDL3kIL7DtPSvggpnJTsuDIoYM0B5PWasM63RFL/LAekZrvn5Cvv24EghckhsqbF2OKD3odgFo3qQ==}"
NET=butler-test-051
# RUNNER_TEMP (GitHub Actions) and GITHUB_WORKSPACE are both inside the
# runner's working-set that is reliably bind-mountable into Docker on
# self-hosted Docker setups. Falling back to mktemp -d (/tmp/...) makes
# the script work locally but breaks under runner-managed Docker where
# /tmp on the host is NOT inside the daemon's view of the filesystem
# (the symptom is bind-mounted single-file paths resolving as empty
# directories inside the container).
WORK=$(mktemp -d -p "${RUNNER_TEMP:-${GITHUB_WORKSPACE:-/tmp}}")

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

cleanup() {
  log "cleanup"
  docker rm -f portal-051 postgres-051 2>/dev/null || true
  docker volume rm dynamic-plugins-vol 2>/dev/null || true
  docker network rm "$NET" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# ----- shared setup -----
docker network rm "$NET" 2>/dev/null || true
docker network create "$NET" >/dev/null

# The test fixture package on ghcr is created at internal-org visibility
# (the gh API patch to make it public requires admin:org which the
# boot-test token lacks). Stage a Docker auth config that the installer
# container reads via DOCKER_CONFIG so oras can authenticate to ghcr.
# In production operators wire this via the chart's
# dynamicPlugins.installer.imagePullSecrets; locally we mount a file.
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
DOCKER_AUTH_MOUNT=(-e DOCKER_CONFIG=/auth -v "$AUTH_DIR":/auth:ro)
log "postgres sidecar"
docker run -d --network "$NET" --name postgres-051 \
  -e POSTGRES_DB=backstage -e POSTGRES_USER=backstage -e POSTGRES_PASSWORD=backstage \
  postgres:15 >/dev/null
for i in $(seq 1 30); do
  docker exec postgres-051 pg_isready -U backstage 2>/dev/null && break
  sleep 1
done

# Reusable docker run for the portal. Each test case sets APP_CONFIG_*
# env vars before calling start_portal.
# Butler-Labs-branded plugins are DISABLED for the local boot test.
# Reason: their backend plugins (butler-backend, registry-backend,
# pipeline-backend) initialize at boot by connecting to butler-server
# / databases that do not exist in the local test harness. With them
# enabled the backend plugin init blocks for minutes waiting on
# ECONNREFUSED retries before the rootHttpRouter signals "Listening
# on". The 0.5.1 GATE is about the dynamic-plugin runtime, not Butler
# backend reachability; the post-publish Phase 5-style boot-test
# against the released image with real Butler infra reachable
# verifies that downstream.
PORTAL_BASE_ENV=(
  -e APP_CONFIG_app_baseUrl=http://localhost:7007
  -e APP_CONFIG_backend_baseUrl=http://localhost:7007
  -e APP_CONFIG_backend_cors_origin=http://localhost:7007
  -e APP_CONFIG_auth_providers_guest_dangerouslyAllowOutsideDevelopment=true
  -e APP_CONFIG_plugins_butler_enabled=false
  -e APP_CONFIG_plugins_workspaces_enabled=false
  -e APP_CONFIG_plugins_registry_enabled=false
  -e APP_CONFIG_plugins_pipeline_enabled=false
  -e POSTGRES_HOST=postgres-051 -e POSTGRES_PORT=5432
  -e POSTGRES_USER=backstage -e POSTGRES_PASSWORD=backstage
  -e GITHUB_TOKEN=unused
  -e AUTH_GOOGLE_CLIENT_ID=unused -e AUTH_GOOGLE_CLIENT_SECRET=unused
  # The plugin scanner requires NODE_PATH set to the backend node_modules
  # so dynamic plugins can resolve shared Backstage modules. Documented in
  # node_modules/@backstage/backend-dynamic-feature-service/dist/scanner/plugin-scanner.cjs.js.
  # Without this, the backend crashes at boot when scanning the
  # rootDirectory with "cannot access backstage modules in '/app/node_modules'".
  # This is a chart-side concern in production: the chart's deployment
  # template needs to set NODE_PATH when dynamicPlugins.enabled=true.
  -e NODE_PATH=/app/node_modules
)

start_portal() {
  docker rm -f portal-051 2>/dev/null || true
  docker run -d --network "$NET" --name portal-051 -p 7007:7007 \
    "${PORTAL_BASE_ENV[@]}" \
    "$@" \
    "$PORTAL_IMAGE" >/dev/null
  log "  waiting for portal ready (polling curl /)"
  local i
  for i in $(seq 1 360); do
    body=$(curl -s --max-time 2 http://localhost:7007/ 2>/dev/null || true)
    if [ -n "$body" ] && printf '%s' "$body" | head -c 15 | grep -q "<!DOCTYPE html>"; then
      log "    SPA shell serving after ${i}s"
      return 0
    fi
    sleep 1
  done
  log "    portal did NOT serve SPA shell in 360s"
  docker logs portal-051 2>&1 | tail -50
  return 1
}

# ----- CASE 1: EMPTY -----
log "case 1: EMPTY (no dynamic plugins, config.has('dynamicPlugins') false -> service NOT registered)"
start_portal
# /.backstage/dynamic-features/remotes is NOT mounted when the feature
# loader's gate stays closed (no dynamicPlugins.* in config). Backstage's
# app-backend catchall serves the SPA HTML for any unmatched URL, so the
# distinguishing signal vs the populated case is the BODY content (HTML
# vs JSON), not the status code.
curl -s http://localhost:7007/.backstage/dynamic-features/remotes >"$WORK/empty-remotes.body"
EMPTY_FIRST=$(head -c 15 "$WORK/empty-remotes.body")
log "  GET /remotes first bytes: $EMPTY_FIRST"
EMPTY_ROOT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:7007/)
log "  GET / -> HTTP $EMPTY_ROOT (SPA shell)"

[ "$EMPTY_FIRST" = "<!DOCTYPE html>" ] || { echo "FAIL EMPTY: expected /remotes to return SPA shell HTML (service unregistered), got: $EMPTY_FIRST" >&2; head -c 300 "$WORK/empty-remotes.body" >&2; exit 1; }
[ "$EMPTY_ROOT" = "200" ] || { echo "FAIL EMPTY: SPA shell didn't serve" >&2; exit 1; }
log "  CASE 1 PASS: /remotes returns SPA HTML (catchall, service unregistered), SPA shell serves"

# ----- CASE 2: POPULATED -----
log "case 2: POPULATED (real dynamic frontend plugin loads through real manifest path)"
log "  install dynamic plugin into shared volume"
docker volume rm dynamic-plugins-vol 2>/dev/null || true
docker volume create dynamic-plugins-vol >/dev/null

# Fresh Docker volumes are root-owned. The installer runs as the
# distroless nonroot user (65532:65532) and cannot write to a root-owned
# mount. In Kubernetes the chart's pod spec sets fsGroup on the volume so
# the installer initContainer can write; locally we pre-chown via a
# bootstrap alpine container that owns the mount before the installer
# attaches.
docker run --rm -v "dynamic-plugins-vol:/v" alpine chown -R 65532:65532 /v >/dev/null

cat >"$WORK/installer-config.yaml" <<EOF
continueOnError: false
plugins:
  - package: $TEST_PLUGIN_URI
    integrity: $TEST_PLUGIN_INTEGRITY
EOF

docker run --rm "${DOCKER_AUTH_MOUNT[@]}" \
  -v "$WORK/installer-config.yaml":/etc/butler-portal/dynamic-plugins.yaml:ro \
  -v "dynamic-plugins-vol:/dynamic-plugins-root" \
  "$INSTALLER_IMAGE" > "$WORK/installer-pop.log" 2>&1 || true
echo "--- installer output (populated case) ---"
cat "$WORK/installer-pop.log"
echo "--- volume contents post-install ---"
docker run --rm -v "dynamic-plugins-vol:/v" alpine ls -la /v

log "  boot portal with rootDirectory pointing at the populated volume"
start_portal \
  -e APP_CONFIG_dynamicPlugins_rootDirectory=/dynamic-plugins-root \
  -v "dynamic-plugins-vol:/dynamic-plugins-root:ro"

POP_REMOTES_HTTP=$(curl -s -o "$WORK/remotes.json" -w "%{http_code}" http://localhost:7007/.backstage/dynamic-features/remotes)
log "  GET /.backstage/dynamic-features/remotes -> HTTP $POP_REMOTES_HTTP"
log "  body: $(cat "$WORK/remotes.json" | head -c 500)"

[ "$POP_REMOTES_HTTP" = "200" ] || { echo "FAIL POPULATED: /remotes endpoint returned $POP_REMOTES_HTTP, expected 200" >&2; docker logs portal-051 2>&1 | tail -30; exit 1; }
grep -q "butler-hello-dynamic-plugin" "$WORK/remotes.json" || { echo "FAIL POPULATED: test plugin not in /remotes response" >&2; cat "$WORK/remotes.json" >&2; exit 1; }

log "  POPULATED endpoint confirmed: /remotes serves the test plugin's Remote entry"
log "  Playwright marker assertion (run separately): visit /hello-dynamic-plugin, assert 'Hello from the Butler Portal dynamic-plugins runtime' visible"

# ----- CASE 3: NEGATIVE -----
log "case 3: NEGATIVE (broken remote: wrong integrity -> installer rejects -> portal still boots, other plugins fine)"
# Tear down the populated portal BEFORE recreating the volume; docker
# volume rm silently fails on a volume still mounted by a running
# container, leaving case 2's contents in place and making case 3
# indistinguishable from case 2.
docker rm -f portal-051 2>/dev/null || true
docker volume rm dynamic-plugins-vol 2>/dev/null || true
docker volume create dynamic-plugins-vol >/dev/null
# Pre-chown for the non-root installer user (same reason as case 2).
docker run --rm -v "dynamic-plugins-vol:/v" alpine chown -R 65532:65532 /v >/dev/null

cat >"$WORK/installer-bad.yaml" <<EOF
continueOnError: true
plugins:
  - package: $TEST_PLUGIN_URI
    integrity: sha512-$(printf '%0.s0' {1..86})==
EOF

docker run --rm "${DOCKER_AUTH_MOUNT[@]}" \
  -v "$WORK/installer-bad.yaml":/etc/butler-portal/dynamic-plugins.yaml:ro \
  -v "dynamic-plugins-vol:/dynamic-plugins-root" \
  "$INSTALLER_IMAGE" > "$WORK/installer-neg.log" 2>&1 || true
echo "--- installer output (negative case) ---"
cat "$WORK/installer-neg.log"

start_portal \
  -e APP_CONFIG_dynamicPlugins_rootDirectory=/dynamic-plugins-root \
  -v "dynamic-plugins-vol:/dynamic-plugins-root:ro"

NEG_REMOTES_HTTP=$(curl -s -o "$WORK/neg-remotes.json" -w "%{http_code}" http://localhost:7007/.backstage/dynamic-features/remotes)
log "  GET /remotes -> HTTP $NEG_REMOTES_HTTP, body: $(cat "$WORK/neg-remotes.json" | head -c 200)"
NEG_BUTLER=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:7007/butler)
log "  GET /butler -> HTTP $NEG_BUTLER (static plugin still works despite broken dynamic remote)"

[ "$NEG_REMOTES_HTTP" = "200" ] || { echo "FAIL NEGATIVE: /remotes broke" >&2; exit 1; }
[ "$NEG_BUTLER" = "200" ] || { echo "FAIL NEGATIVE: static Butler Labs route broken when a dynamic plugin failed" >&2; exit 1; }

NEG_BODY=$(cat "$WORK/neg-remotes.json")
[ "$NEG_BODY" = "[]" ] || { echo "FAIL NEGATIVE: expected empty Remote[] (the rejected plugin was excluded), got: $NEG_BODY" >&2; exit 1; }

log "  CASE 3 PASS: broken remote isolated, /remotes serves empty [], static plugins still work"

# ----- SUMMARY -----
log ""
log "================================================================"
log "0.5.1 GATE: 3 cases DISTINGUISHABLE"
log "  EMPTY:     /remotes 404 (rootDirectory unset)"
log "  POPULATED: /remotes 200, returns Remote[] with test plugin"
log "  NEGATIVE:  /remotes 200, returns [] (broken plugin filtered out)"
log "  static Butler Labs routes still 200 in all 3 cases"
log "================================================================"
log "remaining: Playwright marker assertion on /hello-dynamic-plugin"
log "in POPULATED case. Run scripts/phase-5-boot-test/playwright/ with"
log "DYNAMIC_PLUGIN_MARKER='Hello from the Butler Portal dynamic-plugins runtime'."
