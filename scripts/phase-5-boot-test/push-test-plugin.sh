#!/usr/bin/env bash
#
# Copyright 2026 The Butler Authors.
# Apache 2.0 license.
#
# Push the dynamic-plugin-hello example's dist-dynamic output to ghcr.io
# as an OCI artifact suitable for butler-portal-plugin-installer to
# pull. Prints the computed sha512 SRI integrity so it can be pasted
# into the chart's dynamicPlugins.plugins[] config for the 0.5.1 boot-
# test.
#
# Usage:
#   bash scripts/phase-5-boot-test/push-test-plugin.sh <path-to-built-plugin>
#
# Where <path-to-built-plugin> is the directory containing dist-dynamic/
# (produced by running `rhdh-cli plugin export` on the example, with
# the plugin source OUTSIDE the butler-portal monorepo so
# @manypkg/get-packages does not throw "Package not found").

set -euo pipefail

PLUGIN_SRC_DIR="${1:?usage: push-test-plugin.sh <path-to-built-plugin>}"
TEST_PLUGIN_REPO="${TEST_PLUGIN_REPO:-ghcr.io/butlerdotdev/butler-portal-test-fixture}"
TEST_PLUGIN_TAG="${TEST_PLUGIN_TAG:-hello-dynamic-0.5.1}"

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

DIST_DYNAMIC="$PLUGIN_SRC_DIR/dist-dynamic"
if [ ! -d "$DIST_DYNAMIC" ]; then
  echo "ERROR: $DIST_DYNAMIC does not exist. Run 'yarn rhdh-cli plugin export --clean --no-install' in $PLUGIN_SRC_DIR first." >&2
  exit 1
fi
if [ ! -f "$DIST_DYNAMIC/dist/mf-manifest.json" ]; then
  echo "ERROR: $DIST_DYNAMIC/dist/mf-manifest.json missing. The MF export did not complete." >&2
  exit 1
fi

# Stage the dist-dynamic contents as a package/ subdir (the installer
# extracts with --strip-components=1 expecting package/ at the top).
log "stage: pack dist-dynamic as package/"
STAGE="$WORK_DIR/stage"
mkdir -p "$STAGE/package"
cp -R "$DIST_DYNAMIC/." "$STAGE/package/"
tar -czf "$WORK_DIR/package.tgz" -C "$STAGE" package

# Compute sha512 SRI integrity (npm subresource-integrity convention).
log "stage: compute sha512 SRI integrity"
HEX=$(shasum -a 512 "$WORK_DIR/package.tgz" | awk '{print $1}')
B64=$(printf '%s' "$HEX" | xxd -r -p | base64 | tr -d '\n')
INTEGRITY="sha512-$B64"

# Auth oras to ghcr (requires write:packages via gh auth login).
log "auth: oras login to ghcr.io"
gh auth token | oras login ghcr.io -u "$(gh api user --jq .login)" --password-stdin >/dev/null

# Push as OCI artifact.
log "push: $TEST_PLUGIN_REPO:$TEST_PLUGIN_TAG"
cd "$WORK_DIR"
oras push \
  "$TEST_PLUGIN_REPO:$TEST_PLUGIN_TAG" \
  package.tgz:application/gzip 2>&1 | tail -3
cd - >/dev/null

cat <<EOF

================================================================
test plugin published

  package:    oci://$TEST_PLUGIN_REPO:$TEST_PLUGIN_TAG
  integrity:  $INTEGRITY

paste into chart values dynamicPlugins.plugins[]:

  - package: oci://$TEST_PLUGIN_REPO:$TEST_PLUGIN_TAG
    integrity: $INTEGRITY

================================================================
EOF
