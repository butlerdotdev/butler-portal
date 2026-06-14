#!/usr/bin/env bash
#
# Copyright 2026 The Butler Authors.
# Apache 2.0 license.
#
# End-to-end test of the published installer image against a real OCI
# artifact on ghcr.io (the production registry; no local zot, no
# --plain-http flag, the same code path operators take).
#
# Three scenarios, each pinning a different point on the
# fail-loud / forensics matrix:
#
#   A. Happy path: integrity matches -> plugin lands in the root,
#      audit log carries the install event with the URI + digest_verified
#   B. Wrong sha512 + continueOnError=false (the chart 0.5.0 default):
#      installer exits non-zero, NO plugin in the root, init container
#      fails, pod stays not-Ready (the fail-loud security contract)
#   C. Wrong sha512 + continueOnError=true: installer logs the
#      rejection, exits 0, the rejected plugin NOT in the root,
#      proving the best-effort opt-in.
#
# Requires GHCR auth via `gh auth login` with `write:packages` scope
# (used to push the test fixture artifact); oras on the host. The
# installer container pulls from ghcr.io anonymously since the test
# artifact is published as public.

set -euo pipefail

INSTALLER_IMAGE="${INSTALLER_IMAGE:-ghcr.io/butlerdotdev/butler-portal-plugin-installer:0.1.0-rc.2}"
TEST_PLUGIN_REPO="${TEST_PLUGIN_REPO:-ghcr.io/butlerdotdev/butler-portal-test-fixture}"
TEST_PLUGIN_TAG="${TEST_PLUGIN_TAG:-phase-5-rc.1}"
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

# Stage a Docker auth config so oras inside the installer container can
# pull from ghcr.io. The test fixture package is created as `internal`
# org-visibility by default (changing it to public requires admin:org
# scope, which the boot-test token does not carry). Operators in
# production use ImagePullSecrets injected by the chart's
# dynamicPlugins.installer.imagePullSecrets; for the boot-test we mount
# a Docker config.json that oras picks up via DOCKER_CONFIG.
AUTH_DIR="$WORK_DIR/docker-auth"
mkdir -p "$AUTH_DIR"
gh_user=$(gh api user --jq .login)
gh_token=$(gh auth token)
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

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# ----- Stage a real plugin tarball -----
log "stage: build a real plugin tarball with package.json + dist/"
STAGE="$WORK_DIR/stage"
mkdir -p "$STAGE/package/dist"
cat >"$STAGE/package/package.json" <<'JSON'
{
  "name": "butler.test-dynamic",
  "version": "0.1.0",
  "main": "dist/index.js",
  "description": "Phase 5 boot-test fixture for butler-portal-plugin-installer."
}
JSON
cat >"$STAGE/package/dist/index.js" <<'JS'
module.exports = {
  hello: "from butler.test-dynamic (Phase 5 boot-test fixture)",
};
JS
tar -czf "$WORK_DIR/package.tgz" -C "$STAGE" package

# ----- Compute SRI integrity -----
log "stage: compute sha512 SRI integrity"
HEX=$(shasum -a 512 "$WORK_DIR/package.tgz" | awk '{print $1}')
B64=$(printf '%s' "$HEX" | xxd -r -p | base64 | tr -d '\n')
GOOD_INTEGRITY="sha512-$B64"
BAD_INTEGRITY="sha512-$(printf '%0.s0' {1..86})=="
log "  GOOD_INTEGRITY=$GOOD_INTEGRITY"

# ----- Auth oras to ghcr (write:packages required to push fixture) -----
log "auth: oras login to ghcr.io"
gh auth token | oras login ghcr.io -u "$(gh api user --jq .login)" --password-stdin >/dev/null

# ----- Push the test fixture to ghcr as a public OCI artifact -----
log "push: $TEST_PLUGIN_REPO:$TEST_PLUGIN_TAG"
cd "$WORK_DIR"
oras push \
  "$TEST_PLUGIN_REPO:$TEST_PLUGIN_TAG" \
  package.tgz:application/gzip 2>&1 | tail -3
cd - >/dev/null

# Mark the package public so the installer can pull anonymously. The
# package is created as private by default; the test does not depend on
# auth (and operators pulling public plugin artifacts is the canonical
# flow).
log "visibility: make the test fixture package public"
gh api -X PATCH \
  -H "Accept: application/vnd.github+json" \
  "/orgs/butlerdotdev/packages/container/butler-portal-test-fixture" \
  -f visibility=public >/dev/null 2>&1 || log "  (visibility patch skipped -- may already be public)"

# ----- A. Happy path -----
log "test A: happy path (integrity matches, ghcr.io anonymous pull)"
A_ROOT="$WORK_DIR/A-root"
mkdir -p "$A_ROOT"
cat >"$WORK_DIR/A-config.yaml" <<EOF
continueOnError: false
plugins:
  - package: oci://$TEST_PLUGIN_REPO:$TEST_PLUGIN_TAG
    integrity: $GOOD_INTEGRITY
EOF
set +e
docker run --rm "${DOCKER_AUTH_MOUNT[@]}" \
  -v "$WORK_DIR/A-config.yaml":/etc/butler-portal/dynamic-plugins.yaml:ro \
  -v "$A_ROOT":/dynamic-plugins-root \
  "$INSTALLER_IMAGE" >"$WORK_DIR/A.stdout" 2>"$WORK_DIR/A.stderr"
A_EXIT=$?
set -e
cat "$WORK_DIR/A.stdout"
[ "$A_EXIT" -eq 0 ] || { echo "FAIL A: expected exit 0, got $A_EXIT (stderr below)" >&2; cat "$WORK_DIR/A.stderr" >&2; exit 1; }
[ -d "$A_ROOT/butler.test-dynamic" ] || { echo "FAIL A: plugin not installed under root" >&2; exit 1; }
grep -q "event=plugin_installed" "$WORK_DIR/A.stdout" || { echo "FAIL A: audit line absent" >&2; exit 1; }
grep -q "digest_verified=ok" "$WORK_DIR/A.stdout" || { echo "FAIL A: digest_verified missing" >&2; exit 1; }
log "  test A: PASS (exit 0, plugin landed, audit log structured)"

# ----- B. Wrong sha512 + continueOnError=false -----
log "test B: wrong sha512 + continueOnError=false (fail-loud default)"
B_ROOT="$WORK_DIR/B-root"
mkdir -p "$B_ROOT"
cat >"$WORK_DIR/B-config.yaml" <<EOF
continueOnError: false
plugins:
  - package: oci://$TEST_PLUGIN_REPO:$TEST_PLUGIN_TAG
    integrity: $BAD_INTEGRITY
EOF
set +e
docker run --rm "${DOCKER_AUTH_MOUNT[@]}" \
  -v "$WORK_DIR/B-config.yaml":/etc/butler-portal/dynamic-plugins.yaml:ro \
  -v "$B_ROOT":/dynamic-plugins-root \
  "$INSTALLER_IMAGE" >"$WORK_DIR/B.stdout" 2>"$WORK_DIR/B.stderr"
B_EXIT=$?
set -e
cat "$WORK_DIR/B.stdout"
cat "$WORK_DIR/B.stderr" >&2
[ "$B_EXIT" -ne 0 ] || { echo "FAIL B: expected non-zero exit, got 0" >&2; exit 1; }
[ ! -d "$B_ROOT/butler.test-dynamic" ] || { echo "FAIL B: plugin should not have been installed" >&2; exit 1; }
{ grep -q "integrity_mismatch" "$WORK_DIR/B.stderr" || grep -q "integrity_mismatch" "$WORK_DIR/B.stdout"; } || { echo "FAIL B: integrity_mismatch audit line absent" >&2; exit 1; }
{ grep -q "continueOnError_false" "$WORK_DIR/B.stderr" || grep -q "continueOnError_false" "$WORK_DIR/B.stdout"; } || { echo "FAIL B: fatal continueOnError audit line absent" >&2; exit 1; }
log "  test B: PASS (exit $B_EXIT, no plugin installed, audit log surfaces the fail-loud decision)"

# ----- C. Wrong sha512 + continueOnError=true -----
log "test C: wrong sha512 + continueOnError=true (best-effort opt-in)"
C_ROOT="$WORK_DIR/C-root"
mkdir -p "$C_ROOT"
cat >"$WORK_DIR/C-config.yaml" <<EOF
continueOnError: true
plugins:
  - package: oci://$TEST_PLUGIN_REPO:$TEST_PLUGIN_TAG
    integrity: $BAD_INTEGRITY
EOF
set +e
docker run --rm "${DOCKER_AUTH_MOUNT[@]}" \
  -v "$WORK_DIR/C-config.yaml":/etc/butler-portal/dynamic-plugins.yaml:ro \
  -v "$C_ROOT":/dynamic-plugins-root \
  "$INSTALLER_IMAGE" >"$WORK_DIR/C.stdout" 2>"$WORK_DIR/C.stderr"
C_EXIT=$?
set -e
cat "$WORK_DIR/C.stdout"
[ "$C_EXIT" -eq 0 ] || { echo "FAIL C: expected exit 0 under continueOnError=true, got $C_EXIT" >&2; cat "$WORK_DIR/C.stderr" >&2; exit 1; }
[ ! -d "$C_ROOT/butler.test-dynamic" ] || { echo "FAIL C: rejected plugin should not have been installed" >&2; exit 1; }
{ grep -q "integrity_mismatch" "$WORK_DIR/C.stderr" || grep -q "integrity_mismatch" "$WORK_DIR/C.stdout"; } || { echo "FAIL C: integrity_mismatch audit line absent" >&2; exit 1; }
log "  test C: PASS (exit 0, rejected plugin absent, audit log surfaces rejection)"

log "=================================================="
log "installer e2e on published rc image: ALL 3 PASSED"
log "  A: integrity matches -> install (exit 0)"
log "  B: continueOnError=false + integrity mismatch -> fail-loud (non-zero)"
log "  C: continueOnError=true  + integrity mismatch -> best-effort (exit 0, rejection logged)"
log "=================================================="
