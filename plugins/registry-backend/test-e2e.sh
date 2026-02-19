#!/usr/bin/env bash
# End-to-end test for the Butler Registry backend API.
# Runs against http://localhost:7007/api/registry
set -euo pipefail

BASE="http://localhost:7007/api/registry"
PASS=0
FAIL=0
TOTAL=0

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

assert_status() {
  local label="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" = "$expected" ]; then
    green "  PASS  $label (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    red "  FAIL  $label (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json() {
  local label="$1" jq_expr="$2" expected="$3" body="$4"
  TOTAL=$((TOTAL + 1))
  local actual
  actual=$(echo "$body" | python3 -c "import sys,json; data=json.load(sys.stdin); print(eval(\"$jq_expr\"))" 2>/dev/null || echo "PARSE_ERROR")
  if [ "$actual" = "$expected" ]; then
    green "  PASS  $label ($actual)"
    PASS=$((PASS + 1))
  else
    red "  FAIL  $label (expected '$expected', got '$actual')"
    FAIL=$((FAIL + 1))
  fi
}

# ─── Reset Test Data ───────────────────────────────────────────────────
bold "0. Reset Test Data"
status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/_test/reset")
assert_status "POST /_test/reset" "200" "$status"

# ─── Health Check ──────────────────────────────────────────────────────
bold ""
bold "1. Health Check"
status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health")
assert_status "GET /health" "200" "$status"
body=$(curl -s "$BASE/health")
assert_json "database connected" "data['status']" "ok" "$body"

# ─── Create Artifacts ──────────────────────────────────────────────────
bold ""
bold "2. Create Artifacts"

# Terraform module
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts" \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "networking",
    "name": "vpc",
    "provider": "aws",
    "type": "terraform-module",
    "description": "Production VPC module with public/private subnets",
    "team": "platform",
    "storage_config": {"backend": "git", "git": {"repositoryUrl": "https://github.com/butlerdotdev/terraform-aws-vpc", "branch": "main"}},
    "tags": ["networking", "aws", "vpc"],
    "category": "Networking"
  }')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST /v1/artifacts (terraform module)" "201" "$status"
TF_ARTIFACT_ID=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
assert_json "artifact type" "data['type']" "terraform-module" "$response"
assert_json "artifact namespace" "data['namespace']" "networking" "$response"

# Helm chart
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts" \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "platform",
    "name": "ingress-nginx",
    "type": "helm-chart",
    "description": "Ingress NGINX controller chart",
    "team": "platform",
    "storage_config": {"backend": "oci", "oci": {"registryUrl": "https://zot.example.com:5000", "repository": "charts/ingress-nginx"}},
    "tags": ["ingress", "nginx"],
    "category": "Networking"
  }')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST /v1/artifacts (helm chart)" "201" "$status"
HELM_ARTIFACT_ID=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

# OPA bundle
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts" \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "security",
    "name": "pod-security",
    "type": "opa-bundle",
    "description": "Pod security admission policies",
    "team": "security",
    "storage_config": {"backend": "oci", "oci": {"registryUrl": "https://zot.example.com:5000", "repository": "bundles/pod-security"}}
  }')
status=$(echo "$body" | tail -1)
assert_status "POST /v1/artifacts (opa bundle)" "201" "$status"

# ─── Duplicate artifact check ─────────────────────────────────────────
bold ""
bold "3. Duplicate Artifact Check"
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts" \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "networking",
    "name": "vpc",
    "provider": "aws",
    "type": "terraform-module",
    "storage_config": {"backend": "git", "git": {"repositoryUrl": "https://github.com/example/duplicate"}}
  }')
status=$(echo "$body" | tail -1)
assert_status "POST duplicate artifact → 409" "409" "$status"

# ─── List Artifacts ────────────────────────────────────────────────────
bold ""
bold "4. List Artifacts"
body=$(curl -s "$BASE/v1/artifacts?limit=10")
assert_json "totalCount = 3" "data['totalCount']" "3" "$body"

body=$(curl -s "$BASE/v1/artifacts?type=helm-chart")
assert_json "filter by type" "data['totalCount']" "1" "$body"

body=$(curl -s "$BASE/v1/artifacts?search=vpc")
assert_json "search by name" "data['totalCount']" "1" "$body"

body=$(curl -s "$BASE/v1/artifacts?team=security")
assert_json "filter by team" "data['totalCount']" "1" "$body"

# ─── Get Artifact Detail ──────────────────────────────────────────────
bold ""
bold "5. Get Artifact Detail"
status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/artifacts/networking/vpc")
assert_status "GET /v1/artifacts/networking/vpc" "200" "$status"

status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/artifacts/nonexistent/foo")
assert_status "GET nonexistent artifact → 404" "404" "$status"

# ─── Publish Versions ─────────────────────────────────────────────────
bold ""
bold "6. Publish Versions"

body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts/networking/vpc/versions" \
  -H 'Content-Type: application/json' \
  -d '{
    "version": "1.0.0",
    "changelog": "Initial release",
    "digest": "sha256:abc123",
    "terraform_metadata": {"providers": ["aws"], "inputs": [{"name": "cidr", "type": "string"}]},
    "storage_ref": {"tag": "v1.0.0"},
    "size_bytes": 15000
  }')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST version 1.0.0" "201" "$status"
assert_json "version approval_status = pending" "data['approval_status']" "pending" "$response"

body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts/networking/vpc/versions" \
  -H 'Content-Type: application/json' \
  -d '{"version": "1.1.0", "changelog": "Add NAT gateway support"}')
status=$(echo "$body" | tail -1)
assert_status "POST version 1.1.0" "201" "$status"

body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts/networking/vpc/versions" \
  -H 'Content-Type: application/json' \
  -d '{"version": "2.0.0-beta.1", "changelog": "Major refactor with breaking changes"}')
status=$(echo "$body" | tail -1)
assert_status "POST version 2.0.0-beta.1 (prerelease)" "201" "$status"

# Duplicate version
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts/networking/vpc/versions" \
  -H 'Content-Type: application/json' \
  -d '{"version": "1.0.0"}')
status=$(echo "$body" | tail -1)
assert_status "POST duplicate version → 409" "409" "$status"

# Helm chart version
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts/platform/ingress-nginx/versions" \
  -H 'Content-Type: application/json' \
  -d '{
    "version": "4.10.0",
    "helm_metadata": {"appVersion": "1.10.0", "dependencies": []},
    "digest": "sha256:helm123"
  }')
status=$(echo "$body" | tail -1)
assert_status "POST helm chart version" "201" "$status"

# ─── Version Lifecycle ─────────────────────────────────────────────────
bold ""
bold "7. Approve / Reject / Yank Versions"

body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts/networking/vpc/versions/1.0.0/approve" \
  -H 'Content-Type: application/json' \
  -d '{"comment": "Looks good, approved for production"}')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST approve 1.0.0" "200" "$status"
assert_json "approved status" "data['approval_status']" "approved" "$response"
assert_json "is_latest after approval" "data['is_latest']" "True" "$response"

# Approve 1.1.0 — should become new latest
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts/networking/vpc/versions/1.1.0/approve" \
  -H 'Content-Type: application/json')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST approve 1.1.0" "200" "$status"
assert_json "1.1.0 is now latest" "data['is_latest']" "True" "$response"

# Verify 1.0.0 is no longer latest
body=$(curl -s "$BASE/v1/artifacts/networking/vpc/versions/1.0.0")
assert_json "1.0.0 no longer latest" "data['is_latest']" "False" "$body"

# Reject prerelease
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts/networking/vpc/versions/2.0.0-beta.1/reject" \
  -H 'Content-Type: application/json' \
  -d '{"comment": "Not ready for production"}')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST reject 2.0.0-beta.1" "200" "$status"
assert_json "rejected status" "data['approval_status']" "rejected" "$response"

# Yank 1.0.0
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts/networking/vpc/versions/1.0.0/yank" \
  -H 'Content-Type: application/json')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST yank 1.0.0" "200" "$status"
assert_json "yanked is_bad" "data['is_bad']" "True" "$response"

# Approve helm chart version
curl -s -X POST "$BASE/v1/artifacts/platform/ingress-nginx/versions/4.10.0/approve" \
  -H 'Content-Type: application/json' > /dev/null

# ─── List Versions ─────────────────────────────────────────────────────
bold ""
bold "8. List Versions"
body=$(curl -s "$BASE/v1/artifacts/networking/vpc/versions")
count=$(echo "$body" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['versions']))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$count" = "3" ]; then
  green "  PASS  3 versions returned"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 3 versions, got $count"
  FAIL=$((FAIL + 1))
fi

# ─── Governance ────────────────────────────────────────────────────────
bold ""
bold "9. Governance Dashboard"

body=$(curl -s "$BASE/v1/governance/summary")
assert_json "totalArtifacts = 3 (pre-archive)" "data['totalArtifacts']" "3" "$body"

body=$(curl -s "$BASE/v1/governance/approvals")
# The OPA bundle has no versions so no pending approvals from it
# VPC has 0 pending (all approved/rejected), helm has 0 pending (approved)
count=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin)['totalCount'])" 2>/dev/null || echo "?")
TOTAL=$((TOTAL + 1))
if [ "$count" = "0" ]; then
  green "  PASS  0 pending approvals (all processed)"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 0 pending approvals, got $count"
  FAIL=$((FAIL + 1))
fi

# ─── Audit Log ─────────────────────────────────────────────────────────
bold ""
bold "10. Audit Log"

body=$(curl -s "$BASE/v1/audit?limit=50")
count=$(echo "$body" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$count" -ge "5" ]; then
  green "  PASS  audit log has $count entries (>= 5 expected)"
  PASS=$((PASS + 1))
else
  red "  FAIL  audit log has $count entries (expected >= 5)"
  FAIL=$((FAIL + 1))
fi

body=$(curl -s "$BASE/v1/artifacts/networking/vpc/audit?limit=50")
count=$(echo "$body" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$count" -ge "4" ]; then
  green "  PASS  VPC artifact audit has $count entries (>= 4 expected)"
  PASS=$((PASS + 1))
else
  red "  FAIL  VPC artifact audit has $count entries (expected >= 4)"
  FAIL=$((FAIL + 1))
fi

# ─── Update Artifact ──────────────────────────────────────────────────
bold ""
bold "11. Update & Deprecate Artifact"

body=$(curl -s -w '\n%{http_code}' -X PATCH "$BASE/v1/artifacts/networking/vpc" \
  -H 'Content-Type: application/json' \
  -d '{"description": "Production VPC module with public/private subnets and NAT gateways"}')
status=$(echo "$body" | tail -1)
assert_status "PATCH update description" "200" "$status"

body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts/security/pod-security/deprecate")
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST deprecate OPA bundle" "200" "$status"
assert_json "status = deprecated" "data['status']" "deprecated" "$response"

# ─── Terraform Registry Protocol ──────────────────────────────────────
bold ""
bold "12. Terraform Registry Protocol"

body=$(curl -s "$BASE/.well-known/terraform.json")
assert_json "service discovery" "data['modules.v1']" "/api/registry/v1/modules/" "$body"

body=$(curl -s "$BASE/v1/modules/networking/vpc/aws/versions")
count=$(echo "$body" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['modules'][0]['versions']))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$count" = "1" ]; then
  # Only 1.1.0 is approved and not yanked (1.0.0 is yanked)
  green "  PASS  Terraform versions: $count (only approved, non-yanked)"
  PASS=$((PASS + 1))
else
  red "  FAIL  Terraform versions: expected 1, got $count"
  FAIL=$((FAIL + 1))
fi

# Download (should return 204 with X-Terraform-Get)
status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/modules/networking/vpc/aws/1.1.0/download")
assert_status "GET terraform download → 204" "204" "$status"

tf_get=$(curl -s -D - -o /dev/null "$BASE/v1/modules/networking/vpc/aws/1.1.0/download" 2>/dev/null | grep -i 'x-terraform-get' | tr -d '\r')
TOTAL=$((TOTAL + 1))
if echo "$tf_get" | grep -q "github.com/butlerdotdev/terraform-aws-vpc"; then
  green "  PASS  X-Terraform-Get header present ($tf_get)"
  PASS=$((PASS + 1))
else
  red "  FAIL  X-Terraform-Get header missing or wrong: $tf_get"
  FAIL=$((FAIL + 1))
fi

# Nonexistent module
status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/modules/nonexistent/foo/bar/versions")
assert_status "GET nonexistent module → 404" "404" "$status"

# ─── Helm Repository Index ────────────────────────────────────────────
bold ""
bold "13. Helm Repository Index"

status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/helm/platform/index.yaml")
assert_status "GET helm index.yaml" "200" "$status"

body=$(curl -s "$BASE/helm/platform/index.yaml")
TOTAL=$((TOTAL + 1))
if echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'ingress-nginx' in d['entries']" 2>/dev/null; then
  green "  PASS  Helm index contains ingress-nginx entry"
  PASS=$((PASS + 1))
else
  red "  FAIL  Helm index missing ingress-nginx entry"
  FAIL=$((FAIL + 1))
fi

# ETag / If-None-Match
etag=$(curl -s -D - -o /dev/null "$BASE/helm/platform/index.yaml" 2>/dev/null | grep -i 'etag' | tr -d '\r' | awk '{print $2}')
if [ -n "$etag" ]; then
  status=$(curl -s -o /dev/null -w '%{http_code}' -H "If-None-Match: $etag" "$BASE/helm/platform/index.yaml")
  assert_status "GET helm index with ETag → 304" "304" "$status"
else
  TOTAL=$((TOTAL + 1))
  red "  FAIL  No ETag header on Helm index"
  FAIL=$((FAIL + 1))
fi

# ─── OCI Distribution ─────────────────────────────────────────────────
bold ""
bold "14. OCI Distribution"

status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/oci/v2/")
assert_status "GET /oci/v2/ → 200" "200" "$status"

docker_version=$(curl -s -D - -o /dev/null "$BASE/oci/v2/" 2>/dev/null | grep -i 'docker-distribution-api-version' | tr -d '\r')
TOTAL=$((TOTAL + 1))
if echo "$docker_version" | grep -qi "registry/2.0"; then
  green "  PASS  Docker-Distribution-API-Version header present"
  PASS=$((PASS + 1))
else
  red "  FAIL  Missing Docker-Distribution-API-Version header"
  FAIL=$((FAIL + 1))
fi

# ─── CI Results ────────────────────────────────────────────────────────
bold ""
bold "15. CI Results Ingestion"

body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/ci/results" \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "networking",
    "name": "vpc",
    "version": "1.1.0",
    "result_type": "security-scan",
    "scanner": "trivy",
    "grade": "A",
    "summary": {"critical": 0, "high": 0, "medium": 2, "low": 5}
  }')
status=$(echo "$body" | tail -1)
assert_status "POST security scan result" "201" "$status"

body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/ci/results" \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "networking",
    "name": "vpc",
    "version": "1.1.0",
    "result_type": "cost-estimate",
    "scanner": "infracost",
    "summary": {"monthlyCost": "142.50", "currency": "USD"}
  }')
status=$(echo "$body" | tail -1)
assert_status "POST cost estimate result" "201" "$status"

# Retrieve scan
body=$(curl -s "$BASE/v1/artifacts/networking/vpc/versions/1.1.0/scan")
count=$(echo "$body" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['results']))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$count" = "1" ]; then
  green "  PASS  scan results returned ($count)"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 1 scan result, got $count"
  FAIL=$((FAIL + 1))
fi

# Retrieve cost
body=$(curl -s "$BASE/v1/artifacts/networking/vpc/versions/1.1.0/cost")
count=$(echo "$body" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['results']))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$count" = "1" ]; then
  green "  PASS  cost results returned ($count)"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 1 cost result, got $count"
  FAIL=$((FAIL + 1))
fi

# Idempotent CI upsert (re-post same scan, should update not duplicate)
curl -s -X POST "$BASE/v1/ci/results" \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "networking",
    "name": "vpc",
    "version": "1.1.0",
    "result_type": "security-scan",
    "scanner": "trivy",
    "grade": "B",
    "summary": {"critical": 0, "high": 1, "medium": 3, "low": 7}
  }' > /dev/null
body=$(curl -s "$BASE/v1/artifacts/networking/vpc/versions/1.1.0/scan")
grade=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin)['results'][0]['grade'])" 2>/dev/null || echo "?")
TOTAL=$((TOTAL + 1))
if [ "$grade" = "B" ]; then
  green "  PASS  CI upsert updated grade to B (idempotent)"
  PASS=$((PASS + 1))
else
  red "  FAIL  CI upsert grade expected B, got $grade"
  FAIL=$((FAIL + 1))
fi

# ─── Download Stats ───────────────────────────────────────────────────
bold ""
bold "16. Download Stats"

body=$(curl -s "$BASE/v1/artifacts/networking/vpc/stats")
assert_json "stats endpoint works" "data['artifactName']" "vpc" "$body"

# Check download count incremented from terraform download
body=$(curl -s "$BASE/v1/artifacts/networking/vpc")
downloads=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin)['download_count'])" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$downloads" -ge "1" ]; then
  green "  PASS  download_count = $downloads (>= 1 from terraform download)"
  PASS=$((PASS + 1))
else
  red "  FAIL  download_count = $downloads (expected >= 1)"
  FAIL=$((FAIL + 1))
fi

# ─── Tokens (unauthenticated — should fail) ───────────────────────────
bold ""
bold "17. Token Auth (unauthenticated)"

status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/tokens")
assert_status "GET /v1/tokens (no auth) → 401" "401" "$status"

status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/tokens" \
  -H 'Content-Type: application/json' \
  -d '{"name": "test", "scopes": ["read"]}')
assert_status "POST /v1/tokens (no auth) → 401" "401" "$status"

# ─── Archive (soft delete) ────────────────────────────────────────────
bold ""
bold "18. Archive Artifact"

status=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/v1/artifacts/security/pod-security")
assert_status "DELETE (archive) artifact → 204" "204" "$status"

body=$(curl -s "$BASE/v1/artifacts/security/pod-security")
assert_json "archived status" "data['status']" "archived" "$body"

# Still in list with default filters (active)
body=$(curl -s "$BASE/v1/artifacts?status=active")
assert_json "active only = 2" "data['totalCount']" "2" "$body"

body=$(curl -s "$BASE/v1/artifacts")
assert_json "default (non-archived) = 2" "data['totalCount']" "2" "$body"

# ─── Validation ───────────────────────────────────────────────────────
bold ""
bold "19. Input Validation"

body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts" \
  -H 'Content-Type: application/json' \
  -d '{"namespace": "INVALID!", "name": "test", "type": "helm-chart", "storage_config": {"backend": "git"}}')
status=$(echo "$body" | tail -1)
assert_status "invalid namespace → 400" "400" "$status"

body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts" \
  -H 'Content-Type: application/json' \
  -d '{"namespace": "test", "name": "valid", "type": "invalid-type", "storage_config": {"backend": "git"}}')
status=$(echo "$body" | tail -1)
assert_status "invalid type → 400" "400" "$status"

body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts/networking/vpc/versions" \
  -H 'Content-Type: application/json' \
  -d '{"version": "not-semver"}')
status=$(echo "$body" | tail -1)
assert_status "invalid semver → 400" "400" "$status"

# ─── Pagination ───────────────────────────────────────────────────────
bold ""
bold "20. Pagination"

body=$(curl -s "$BASE/v1/artifacts?limit=1")
count=$(echo "$body" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))" 2>/dev/null || echo "0")
cursor=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin)['nextCursor'] or '')" 2>/dev/null || echo "")
TOTAL=$((TOTAL + 1))
if [ "$count" = "1" ] && [ -n "$cursor" ]; then
  green "  PASS  page 1: 1 item, cursor present"
  PASS=$((PASS + 1))
else
  red "  FAIL  page 1: items=$count, cursor=$cursor"
  FAIL=$((FAIL + 1))
fi

body=$(curl -s "$BASE/v1/artifacts?limit=1&cursor=$cursor")
count2=$(echo "$body" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$count2" = "1" ]; then
  green "  PASS  page 2: 1 item (cursor pagination works)"
  PASS=$((PASS + 1))
else
  red "  FAIL  page 2: items=$count2"
  FAIL=$((FAIL + 1))
fi

# ─── OpenTofu Discovery ───────────────────────────────────────────────
bold ""
bold "21. OpenTofu Discovery"

body=$(curl -s -w '\n%{http_code}' "$BASE/.well-known/opentofu.json")
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "GET /.well-known/opentofu.json" "200" "$status"
assert_json "opentofu modules.v1 path" "data['modules.v1']" "/api/registry/v1/modules/" "$response"

# Verify Terraform discovery still works
body=$(curl -s "$BASE/.well-known/terraform.json")
assert_json "terraform modules.v1 path" "data['modules.v1']" "/api/registry/v1/modules/" "$body"

# ─── Yank with Reason ────────────────────────────────────────────────
bold ""
bold "22. Yank with Reason"

# First create and approve a version we can yank with reason
curl -s -X POST "$BASE/v1/artifacts/platform/ingress-nginx/versions" \
  -H 'Content-Type: application/json' \
  -d '{"version": "4.11.0", "changelog": "To be yanked with reason"}' > /dev/null

curl -s -X POST "$BASE/v1/artifacts/platform/ingress-nginx/versions/4.11.0/approve" \
  -H 'Content-Type: application/json' > /dev/null

body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts/platform/ingress-nginx/versions/4.11.0/yank" \
  -H 'Content-Type: application/json' \
  -d '{"reason": "Critical CVE-2026-1234 found in dependency"}')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST yank with reason" "200" "$status"
assert_json "yank is_bad = True" "data['is_bad']" "True" "$response"
assert_json "yank_reason stored" "data['yank_reason']" "Critical CVE-2026-1234 found in dependency" "$response"

# Verify reason persists on GET
body=$(curl -s "$BASE/v1/artifacts/platform/ingress-nginx/versions/4.11.0")
assert_json "yank_reason on GET" "data['yank_reason']" "Critical CVE-2026-1234 found in dependency" "$body"

# ─── Version with Examples & Dependencies ────────────────────────────
bold ""
bold "23. Version with Examples & Dependencies"

body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/artifacts/networking/vpc/versions" \
  -H 'Content-Type: application/json' \
  -d '{
    "version": "3.0.0",
    "changelog": "Version with examples and dependencies",
    "examples": [
      {"name": "basic-vpc", "description": "Basic VPC with 2 subnets", "source": "examples/basic"},
      {"name": "full-vpc", "description": "Complete VPC with NAT and VPN", "source": "examples/full", "path": "main.tf"}
    ],
    "dependencies": [
      {"source": "hashicorp/aws", "version": ">= 5.0", "name": "aws"},
      {"source": "terraform-aws-modules/subnet/aws", "version": "~> 2.0"}
    ],
    "terraform_metadata": {
      "providers": [{"name": "aws", "source": "hashicorp/aws", "versionConstraint": ">= 5.0"}],
      "inputs": [
        {"name": "cidr_block", "type": "string", "description": "VPC CIDR block", "required": true},
        {"name": "enable_nat", "type": "bool", "description": "Enable NAT gateway", "default": "false", "required": false}
      ],
      "outputs": [
        {"name": "vpc_id", "type": "string", "description": "The VPC ID"},
        {"name": "subnet_ids", "type": "list(string)", "description": "List of subnet IDs"}
      ],
      "resources": ["aws_vpc", "aws_subnet", "aws_nat_gateway"],
      "requiredVersion": ">= 1.5.0"
    }
  }')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST version with examples+deps" "201" "$status"

# Verify examples round-trip
example_count=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('examples') or []))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$example_count" = "2" ]; then
  green "  PASS  2 examples stored"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 2 examples, got $example_count"
  FAIL=$((FAIL + 1))
fi

assert_json "example name" "data['examples'][0]['name']" "basic-vpc" "$response"

# Verify dependencies round-trip
dep_count=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('dependencies') or []))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$dep_count" = "2" ]; then
  green "  PASS  2 dependencies stored"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 2 dependencies, got $dep_count"
  FAIL=$((FAIL + 1))
fi

assert_json "dependency source" "data['dependencies'][0]['source']" "hashicorp/aws" "$response"

# Verify terraform_metadata inputs round-trip
input_count=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); tm=d.get('terraform_metadata') or {}; print(len(tm.get('inputs') or []))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$input_count" = "2" ]; then
  green "  PASS  terraform_metadata: 2 inputs"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 2 terraform inputs, got $input_count"
  FAIL=$((FAIL + 1))
fi

output_count=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); tm=d.get('terraform_metadata') or {}; print(len(tm.get('outputs') or []))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$output_count" = "2" ]; then
  green "  PASS  terraform_metadata: 2 outputs"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 2 terraform outputs, got $output_count"
  FAIL=$((FAIL + 1))
fi

resource_count=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); tm=d.get('terraform_metadata') or {}; print(len(tm.get('resources') or []))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$resource_count" = "3" ]; then
  green "  PASS  terraform_metadata: 3 resources"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 3 terraform resources, got $resource_count"
  FAIL=$((FAIL + 1))
fi

# Verify via GET version detail
body=$(curl -s "$BASE/v1/artifacts/networking/vpc/versions/3.0.0")
assert_json "GET examples[0].name" "data['examples'][0]['name']" "basic-vpc" "$body"
assert_json "GET deps[0].source" "data['dependencies'][0]['source']" "hashicorp/aws" "$body"

# ─── Consumers Endpoint ──────────────────────────────────────────────
bold ""
bold "24. Consumers Endpoint"

body=$(curl -s -w '\n%{http_code}' "$BASE/v1/artifacts/networking/vpc/consumers")
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "GET consumers" "200" "$status"

# Should have consumers and anonymous arrays
has_consumers=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print('consumers' in d and 'anonymous' in d)" 2>/dev/null || echo "False")
TOTAL=$((TOTAL + 1))
if [ "$has_consumers" = "True" ]; then
  green "  PASS  consumers response has correct shape"
  PASS=$((PASS + 1))
else
  red "  FAIL  consumers response missing expected keys"
  FAIL=$((FAIL + 1))
fi

# 404 for nonexistent artifact
status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/artifacts/nonexistent/foo/consumers")
assert_status "GET consumers nonexistent → 404" "404" "$status"

# ─── CI Results (additional) ─────────────────────────────────────────
bold ""
bold "25. CI Results (additional tests)"

# Post a test-result type (not yet tested)
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/ci/results" \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "networking",
    "name": "vpc",
    "version": "3.0.0",
    "result_type": "security-scan",
    "scanner": "checkov",
    "grade": "A",
    "summary": {"critical": 0, "high": 0, "medium": 1, "low": 3}
  }')
status=$(echo "$body" | tail -1)
assert_status "POST CI scan for v3.0.0 (checkov)" "201" "$status"

body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/ci/results" \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "networking",
    "name": "vpc",
    "version": "3.0.0",
    "result_type": "cost-estimate",
    "scanner": "infracost",
    "summary": {"monthlyCost": "127.50", "currency": "USD"}
  }')
status=$(echo "$body" | tail -1)
assert_status "POST CI cost for v3.0.0" "201" "$status"

# Verify v3.0.0 scan results
body=$(curl -s "$BASE/v1/artifacts/networking/vpc/versions/3.0.0/scan")
scan_count=$(echo "$body" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['results']))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$scan_count" -ge "1" ]; then
  green "  PASS  v3.0.0 scan results returned ($scan_count)"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected scan results for v3.0.0, got $scan_count"
  FAIL=$((FAIL + 1))
fi

# Verify v3.0.0 cost results
body=$(curl -s "$BASE/v1/artifacts/networking/vpc/versions/3.0.0/cost")
cost_count=$(echo "$body" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['results']))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$cost_count" -ge "1" ]; then
  green "  PASS  v3.0.0 cost results returned ($cost_count)"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected cost results for v3.0.0, got $cost_count"
  FAIL=$((FAIL + 1))
fi

# ─── 26. Terraform Provider Registry ────────────────────────────────────
bold "26. Terraform Provider Registry"

# Create a terraform-provider artifact
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/artifacts" \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "butlerlabs",
    "name": "custom-infra",
    "type": "terraform-provider",
    "description": "Custom infrastructure provider",
    "storage_config": {
      "backend": "git",
      "git": { "repositoryUrl": "https://github.com/butlerlabs/terraform-provider-custom-infra" }
    }
  }')
assert_status "Create terraform-provider artifact" 201 "$STATUS"

# Publish a version with platform metadata
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/artifacts/butlerlabs/custom-infra/versions" \
  -H 'Content-Type: application/json' \
  -d '{
    "version": "1.0.0",
    "changelog": "Initial release",
    "terraform_metadata": {
      "platforms": [
        { "os": "linux", "arch": "amd64", "filename": "terraform-provider-custom-infra_1.0.0_linux_amd64.zip", "shasum": "abc123" },
        { "os": "darwin", "arch": "arm64", "filename": "terraform-provider-custom-infra_1.0.0_darwin_arm64.zip", "shasum": "def456" }
      ]
    }
  }')
assert_status "Publish provider version with platforms" 201 "$STATUS"

# Approve the version
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/artifacts/butlerlabs/custom-infra/versions/1.0.0/approve" \
  -H 'Content-Type: application/json')
assert_status "Approve provider version" 200 "$STATUS"

# .well-known/terraform.json includes providers.v1
BODY=$(curl -s "$BASE/.well-known/terraform.json")
assert_json ".well-known includes providers.v1" "data['providers.v1']" "/api/registry/v1/providers/" "$BODY"

# Provider version list
BODY=$(curl -s "$BASE/v1/providers/butlerlabs/custom-infra/versions")
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/providers/butlerlabs/custom-infra/versions")
assert_status "Provider version list" 200 "$STATUS"
provider_version_count=$(echo "$BODY" | jq '.versions | length')
TOTAL=$((TOTAL + 1))
if [ "$provider_version_count" -ge "1" ]; then
  green "  PASS  Provider has $provider_version_count version(s)"
  PASS=$((PASS + 1))
else
  red "  FAIL  Expected at least 1 provider version, got $provider_version_count"
  FAIL=$((FAIL + 1))
fi

# Provider version includes platforms
platforms_count=$(echo "$BODY" | jq '.versions[0].platforms | length')
TOTAL=$((TOTAL + 1))
if [ "$platforms_count" = "2" ]; then
  green "  PASS  Provider version has $platforms_count platforms"
  PASS=$((PASS + 1))
else
  red "  FAIL  Expected 2 platforms, got $platforms_count"
  FAIL=$((FAIL + 1))
fi

# Provider download for specific platform
BODY=$(curl -s "$BASE/v1/providers/butlerlabs/custom-infra/1.0.0/download/linux/amd64")
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/providers/butlerlabs/custom-infra/1.0.0/download/linux/amd64")
assert_status "Provider download linux/amd64" 200 "$STATUS"
assert_json "Download has filename" "data['filename']" "terraform-provider-custom-infra_1.0.0_linux_amd64.zip" "$BODY"
assert_json "Download has shasum" "data['shasum']" "abc123" "$BODY"

# Provider download for non-existent platform
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/providers/butlerlabs/custom-infra/1.0.0/download/windows/386")
assert_status "Provider download missing platform returns 404" 404 "$STATUS"

# Provider version list for non-existent provider
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/providers/butlerlabs/nonexistent/versions")
assert_status "Non-existent provider returns 404" 404 "$STATUS"

# ─── 27. Enhanced Search (Tags, Categories, Facets, Sort) ────────────
bold ""
bold "27. Enhanced Search"

# Create artifacts with tags and categories for search testing
BODY=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/artifacts" \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "search-test",
    "name": "tagged-vpc",
    "type": "terraform-module",
    "description": "VPC module with tags",
    "storage_config": {"backend":"git","git":{"repositoryUrl":"https://github.com/org/vpc"}},
    "tags": ["networking", "aws", "vpc"],
    "category": "infrastructure"
  }')
assert_status "Create artifact with tags" 201 "$BODY"

BODY=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/artifacts" \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "search-test",
    "name": "tagged-rds",
    "type": "terraform-module",
    "description": "RDS module with tags",
    "storage_config": {"backend":"git","git":{"repositoryUrl":"https://github.com/org/rds"}},
    "tags": ["database", "aws"],
    "category": "infrastructure"
  }')
assert_status "Create second artifact with tags" 201 "$BODY"

BODY=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/artifacts" \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "search-test",
    "name": "tagged-chart",
    "type": "helm-chart",
    "description": "Helm chart with tags",
    "storage_config": {"backend":"oci","oci":{"registryUrl":"zot:5000","repository":"search-test/chart"}},
    "tags": ["kubernetes", "monitoring"],
    "category": "observability"
  }')
assert_status "Create third artifact with tags" 201 "$BODY"

# Filter by single tag — aws: networking/vpc + search-test/tagged-vpc + search-test/tagged-rds = 3
BODY=$(curl -s "$BASE/v1/artifacts?tags=aws")
assert_json "Tag filter 'aws' returns 3 items" "len(data['items'])" "3" "$BODY"

# Filter by multiple tags (AND logic) — aws+networking: networking/vpc + search-test/tagged-vpc = 2
BODY=$(curl -s "$BASE/v1/artifacts?tags=aws,networking")
assert_json "Tag filter 'aws,networking' returns 2 items" "len(data['items'])" "2" "$BODY"

# Filter by unique tag — 'database' only on tagged-rds
BODY=$(curl -s "$BASE/v1/artifacts?tags=database")
assert_json "Tag filter 'database' returns 1 item" "len(data['items'])" "1" "$BODY"
assert_json "Matched artifact is tagged-rds" "data['items'][0]['name']" "tagged-rds" "$BODY"

# Filter by unique tag — 'monitoring' only on tagged-chart
BODY=$(curl -s "$BASE/v1/artifacts?tags=monitoring")
assert_json "Tag filter 'monitoring' returns 1 item" "len(data['items'])" "1" "$BODY"

# Filter by tag that matches nothing
BODY=$(curl -s "$BASE/v1/artifacts?tags=nonexistent-tag")
assert_json "Tag filter with no match returns 0 items" "len(data['items'])" "0" "$BODY"

# Filter by category
BODY=$(curl -s "$BASE/v1/artifacts?category=infrastructure")
assert_json "Category filter 'infrastructure' returns 2 items" "len(data['items'])" "2" "$BODY"

BODY=$(curl -s "$BASE/v1/artifacts?category=observability")
assert_json "Category filter 'observability' returns 1 item" "len(data['items'])" "1" "$BODY"

# Combined tag + category filter
BODY=$(curl -s "$BASE/v1/artifacts?tags=aws&category=infrastructure")
assert_json "Combined tag+category filter returns 2 items" "len(data['items'])" "2" "$BODY"

# Sort by name ascending
BODY=$(curl -s "$BASE/v1/artifacts?sortBy=name&sortOrder=asc&search=tagged")
FIRST_NAME=$(echo "$BODY" | python3 -c "import sys,json; data=json.load(sys.stdin); print(data['items'][0]['name'])" 2>/dev/null || echo "PARSE_ERROR")
assert_json "Sort by name asc, first item" "data['items'][0]['name']" "tagged-chart" "$BODY"

# Facets endpoint
BODY=$(curl -s "$BASE/v1/artifacts/facets")
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/artifacts/facets")
assert_status "GET /v1/artifacts/facets" 200 "$STATUS"

# Facets has tags array
assert_json "Facets has tags" "type(data['tags']).__name__" "list" "$BODY"
assert_json "Facets has categories" "type(data['categories']).__name__" "list" "$BODY"
assert_json "Facets has types" "type(data['types']).__name__" "list" "$BODY"

# Facets tag count — 'aws' tag should appear with count >= 2
# (3 total: networking/vpc from section 2 + search-test/tagged-vpc + search-test/tagged-rds)
AWS_TAG_COUNT=$(echo "$BODY" | python3 -c "
import sys,json
data=json.load(sys.stdin)
tags = {t['name']: t['count'] for t in data['tags']}
print(tags.get('aws', 0))
" 2>/dev/null || echo "PARSE_ERROR")
TOTAL=$((TOTAL + 1))
if [ "$AWS_TAG_COUNT" = "3" ]; then
  green "  PASS  Facets: aws tag count is 3 ($AWS_TAG_COUNT)"
  PASS=$((PASS + 1))
else
  red "  FAIL  Facets: aws tag count (expected '3', got '$AWS_TAG_COUNT')"
  FAIL=$((FAIL + 1))
fi

# Facets category count — 'infrastructure' should have count 2
INFRA_CAT_COUNT=$(echo "$BODY" | python3 -c "
import sys,json
data=json.load(sys.stdin)
cats = {c['name']: c['count'] for c in data['categories']}
print(cats.get('infrastructure', 0))
" 2>/dev/null || echo "PARSE_ERROR")
TOTAL=$((TOTAL + 1))
if [ "$INFRA_CAT_COUNT" = "2" ]; then
  green "  PASS  Facets: infrastructure category count is 2 ($INFRA_CAT_COUNT)"
  PASS=$((PASS + 1))
else
  red "  FAIL  Facets: infrastructure category count (expected '2', got '$INFRA_CAT_COUNT')"
  FAIL=$((FAIL + 1))
fi

# ─── 28. IaC Runs (BYOC) ──────────────────────────────────────────────
bold "28. IaC Runs (BYOC)"

# Create a BYOC run
HTTP=$(curl -s -o /tmp/reg-run-create.json -w "%{http_code}" \
  -X POST "$BASE/v1/artifacts/networking/vpc/runs" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "plan",
    "mode": "byoc",
    "ci_provider": "github-actions",
    "version": "1.0.0",
    "tf_version": "1.9.0",
    "env_vars": {
      "AWS_REGION": { "source": "literal", "value": "us-east-1" },
      "AWS_ACCESS_KEY_ID": { "source": "secret", "ref": "aws-creds", "key": "access-key-id" }
    }
  }')
BODY=$(cat /tmp/reg-run-create.json)
assert_status "Create BYOC run" "201" "$HTTP"
assert_json "Run has operation=plan" "data['run']['operation']" "plan" "$BODY"
assert_json "Run has mode=byoc" "data['run']['mode']" "byoc" "$BODY"
assert_json "Run has status=queued" "data['run']['status']" "queued" "$BODY"
assert_json "Run has ci_provider" "data['run']['ci_provider']" "github-actions" "$BODY"

# Callback token is returned
TOTAL=$((TOTAL + 1))
HAS_TOKEN=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('callbackToken') else 'no')" 2>/dev/null || echo "no")
if [ "$HAS_TOKEN" = "yes" ]; then
  green "  PASS  BYOC run returns callbackToken"
  PASS=$((PASS + 1))
else
  red "  FAIL  BYOC run returns callbackToken"
  FAIL=$((FAIL + 1))
fi

# Extract run ID and callback token
RUN_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['run']['id'])" 2>/dev/null)
CALLBACK_TOKEN=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['callbackToken'])" 2>/dev/null)

# Get run detail
HTTP=$(curl -s -o /tmp/reg-run-get.json -w "%{http_code}" \
  "$BASE/v1/runs/$RUN_ID")
BODY=$(cat /tmp/reg-run-get.json)
assert_status "Get run detail" "200" "$HTTP"
assert_json "Run detail id matches" "data['id']" "$RUN_ID" "$BODY"
assert_json "Run detail does not leak callback_token_hash" "str(data.get('callback_token_hash', 'ABSENT'))" "ABSENT" "$BODY"

# List runs for artifact
HTTP=$(curl -s -o /tmp/reg-run-list.json -w "%{http_code}" \
  "$BASE/v1/artifacts/networking/vpc/runs")
BODY=$(cat /tmp/reg-run-list.json)
assert_status "List runs for artifact" "200" "$HTTP"
TOTAL=$((TOTAL + 1))
RUN_COUNT=$(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))" 2>/dev/null || echo "0")
if [ "$RUN_COUNT" -ge 1 ]; then
  green "  PASS  Runs list has items ($RUN_COUNT)"
  PASS=$((PASS + 1))
else
  red "  FAIL  Runs list has items (expected >=1, got $RUN_COUNT)"
  FAIL=$((FAIL + 1))
fi

# Get run logs (should be empty initially)
HTTP=$(curl -s -o /tmp/reg-run-logs.json -w "%{http_code}" \
  "$BASE/v1/runs/$RUN_ID/logs")
BODY=$(cat /tmp/reg-run-logs.json)
assert_status "Get run logs (empty)" "200" "$HTTP"
assert_json "Logs empty initially" "len(data['logs'])" "0" "$BODY"

# BYOC callback: post logs
HTTP=$(curl -s -o /tmp/reg-cb-logs.json -w "%{http_code}" \
  -X POST "$BASE/v1/ci/runs/$RUN_ID/logs" \
  -H "Authorization: Bearer $CALLBACK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "logs": [
      { "sequence": 1, "stream": "stdout", "content": "Initializing..." },
      { "sequence": 2, "stream": "stdout", "content": "Plan: 3 to add" }
    ]
  }')
BODY=$(cat /tmp/reg-cb-logs.json)
assert_status "BYOC callback: post logs" "200" "$HTTP"
assert_json "Logs callback ok" "data['count']" "2" "$BODY"

# Verify logs are stored
HTTP=$(curl -s -o /tmp/reg-run-logs2.json -w "%{http_code}" \
  "$BASE/v1/runs/$RUN_ID/logs")
BODY=$(cat /tmp/reg-run-logs2.json)
assert_status "Get run logs (after callback)" "200" "$HTTP"
assert_json "Logs count is 2" "len(data['logs'])" "2" "$BODY"

# Verify logs polling with ?after=
HTTP=$(curl -s -o /tmp/reg-run-logs3.json -w "%{http_code}" \
  "$BASE/v1/runs/$RUN_ID/logs?after=1")
BODY=$(cat /tmp/reg-run-logs3.json)
assert_status "Get logs after sequence 1" "200" "$HTTP"
assert_json "Only 1 log after sequence 1" "len(data['logs'])" "1" "$BODY"

# BYOC callback: update status to succeeded with plan output
HTTP=$(curl -s -o /tmp/reg-cb-status.json -w "%{http_code}" \
  -X POST "$BASE/v1/ci/runs/$RUN_ID/status" \
  -H "Authorization: Bearer $CALLBACK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "succeeded",
    "exit_code": 0,
    "resources_to_add": 3,
    "resources_to_change": 1,
    "resources_to_destroy": 0,
    "plan_json": "{\"resource_changes\": []}",
    "plan_text": "Plan: 3 to add, 1 to change, 0 to destroy."
  }')
BODY=$(cat /tmp/reg-cb-status.json)
assert_status "BYOC callback: update status" "200" "$HTTP"

# Verify run is now succeeded
HTTP=$(curl -s -o /tmp/reg-run-get2.json -w "%{http_code}" \
  "$BASE/v1/runs/$RUN_ID")
BODY=$(cat /tmp/reg-run-get2.json)
assert_status "Run is succeeded" "200" "$HTTP"
assert_json "Run status is succeeded" "data['status']" "succeeded" "$BODY"
assert_json "Run exit_code is 0" "data.get('exit_code', -1)" "0" "$BODY"
assert_json "Run resources_to_add is 3" "data.get('resources_to_add', -1)" "3" "$BODY"

# Get plan output
HTTP=$(curl -s -o /tmp/reg-run-plan.json -w "%{http_code}" \
  "$BASE/v1/runs/$RUN_ID/plan")
BODY=$(cat /tmp/reg-run-plan.json)
assert_status "Get plan output" "200" "$HTTP"
TOTAL=$((TOTAL + 1))
HAS_PLAN_TEXT=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('plan_text') else 'no')" 2>/dev/null || echo "no")
if [ "$HAS_PLAN_TEXT" = "yes" ]; then
  green "  PASS  Plan output has plan_text"
  PASS=$((PASS + 1))
else
  red "  FAIL  Plan output has plan_text"
  FAIL=$((FAIL + 1))
fi

# Confirm plan → creates apply run
HTTP=$(curl -s -o /tmp/reg-run-confirm.json -w "%{http_code}" \
  -X POST "$BASE/v1/runs/$RUN_ID/confirm")
BODY=$(cat /tmp/reg-run-confirm.json)
assert_status "Confirm plan → apply run created" "201" "$HTTP"
assert_json "Apply run operation is apply" "data['operation']" "apply" "$BODY"

# BYOC callback rejected with wrong token
HTTP=$(curl -s -o /tmp/reg-cb-bad.json -w "%{http_code}" \
  -X POST "$BASE/v1/ci/runs/$RUN_ID/status" \
  -H "Authorization: Bearer bad-token-value" \
  -H "Content-Type: application/json" \
  -d '{"status": "failed"}')
assert_status "Callback with wrong token rejected" "401" "$HTTP"

# Cancel flow: create another run, then cancel it
HTTP=$(curl -s -o /tmp/reg-run-cancel1.json -w "%{http_code}" \
  -X POST "$BASE/v1/artifacts/networking/vpc/runs" \
  -H "Content-Type: application/json" \
  -d '{"operation": "validate", "mode": "byoc", "ci_provider": "gitlab-ci"}')
BODY=$(cat /tmp/reg-run-cancel1.json)
assert_status "Create run for cancel test" "201" "$HTTP"
CANCEL_RUN_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['run']['id'])" 2>/dev/null)
CANCEL_TOKEN=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['callbackToken'])" 2>/dev/null)

HTTP=$(curl -s -o /tmp/reg-run-cancel2.json -w "%{http_code}" \
  -X POST "$BASE/v1/runs/$CANCEL_RUN_ID/cancel")
BODY=$(cat /tmp/reg-run-cancel2.json)
assert_status "Cancel run" "200" "$HTTP"
assert_json "Cancelled run status" "data['status']" "cancelled" "$BODY"

# BYOC callback rejected for cancelled run (409)
HTTP=$(curl -s -o /tmp/reg-cb-cancel.json -w "%{http_code}" \
  -X POST "$BASE/v1/ci/runs/$CANCEL_RUN_ID/status" \
  -H "Authorization: Bearer $CANCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "succeeded"}')
assert_status "Callback rejected for cancelled run (409)" "409" "$HTTP"

# Generate pipeline preview (GitHub Actions)
HTTP=$(curl -s -o /tmp/reg-pipeline-gh.json -w "%{http_code}" \
  "$BASE/v1/runs/generate-pipeline?ci_provider=github-actions&operation=plan&namespace=networking&name=vpc")
BODY=$(cat /tmp/reg-pipeline-gh.json)
assert_status "Generate GitHub Actions pipeline" "200" "$HTTP"
assert_json "Pipeline ci_provider" "data['ci_provider']" "github-actions" "$BODY"
TOTAL=$((TOTAL + 1))
HAS_YAML=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'hashicorp/setup-terraform' in d.get('pipeline_config','') else 'no')" 2>/dev/null || echo "no")
if [ "$HAS_YAML" = "yes" ]; then
  green "  PASS  GitHub Actions YAML contains setup-terraform"
  PASS=$((PASS + 1))
else
  red "  FAIL  GitHub Actions YAML contains setup-terraform"
  FAIL=$((FAIL + 1))
fi

# Generate pipeline preview (GitLab CI)
HTTP=$(curl -s -o /tmp/reg-pipeline-gl.json -w "%{http_code}" \
  "$BASE/v1/runs/generate-pipeline?ci_provider=gitlab-ci&operation=plan&namespace=networking&name=vpc")
BODY=$(cat /tmp/reg-pipeline-gl.json)
assert_status "Generate GitLab CI pipeline" "200" "$HTTP"
TOTAL=$((TOTAL + 1))
HAS_GL_YAML=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'hashicorp/terraform' in d.get('pipeline_config','') else 'no')" 2>/dev/null || echo "no")
if [ "$HAS_GL_YAML" = "yes" ]; then
  green "  PASS  GitLab CI YAML contains terraform image"
  PASS=$((PASS + 1))
else
  red "  FAIL  GitLab CI YAML contains terraform image"
  FAIL=$((FAIL + 1))
fi

# Validation: create run missing required fields
HTTP=$(curl -s -o /tmp/reg-run-bad.json -w "%{http_code}" \
  -X POST "$BASE/v1/artifacts/networking/vpc/runs" \
  -H "Content-Type: application/json" \
  -d '{"operation": "plan"}')
assert_status "Create run missing mode → 400" "400" "$HTTP"

# Validation: BYOC without ci_provider
HTTP=$(curl -s -o /tmp/reg-run-bad2.json -w "%{http_code}" \
  -X POST "$BASE/v1/artifacts/networking/vpc/runs" \
  -H "Content-Type: application/json" \
  -d '{"operation": "plan", "mode": "byoc"}')
assert_status "BYOC without ci_provider → 400" "400" "$HTTP"

# ─── 29. Approval Integration with IaC Runs ──────────────────────────
bold "29. Approval Integration with IaC Runs"

# Create an artifact with requirePassingTests policy
HTTP=$(curl -s -o /tmp/reg-policy-art.json -w "%{http_code}" \
  -X POST "$BASE/v1/artifacts" \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "policy",
    "name": "guarded-module",
    "type": "terraform-module",
    "description": "Module with test-gated approval",
    "team": "platform",
    "storage_config": { "backend": "git", "git": { "repositoryUrl": "https://github.com/butlerdotdev/guarded-module" } },
    "approval_policy": {
      "requirePassingTests": true,
      "autoApprovePatches": true
    }
  }')
assert_status "Create artifact with requirePassingTests" "201" "$HTTP"

# Publish a version
HTTP=$(curl -s -o /tmp/reg-policy-ver.json -w "%{http_code}" \
  -X POST "$BASE/v1/artifacts/policy/guarded-module/versions" \
  -H "Content-Type: application/json" \
  -d '{"version": "1.0.0"}')
assert_status "Publish version for policy test" "201" "$HTTP"

# Try to approve WITHOUT a passing test run — should fail 400
HTTP=$(curl -s -o /tmp/reg-policy-deny.json -w "%{http_code}" \
  -X POST "$BASE/v1/artifacts/policy/guarded-module/versions/1.0.0/approve")
BODY=$(cat /tmp/reg-policy-deny.json)
assert_status "Approve blocked without passing test" "400" "$HTTP"

# Create and complete a test run for this version
HTTP=$(curl -s -o /tmp/reg-policy-run.json -w "%{http_code}" \
  -X POST "$BASE/v1/artifacts/policy/guarded-module/runs" \
  -H "Content-Type: application/json" \
  -d '{"operation": "test", "mode": "byoc", "ci_provider": "github-actions", "version": "1.0.0"}')
BODY=$(cat /tmp/reg-policy-run.json)
assert_status "Create test run" "201" "$HTTP"
POLICY_RUN_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['run']['id'])" 2>/dev/null)
POLICY_TOKEN=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['callbackToken'])" 2>/dev/null)

# Simulate test run completing successfully
HTTP=$(curl -s -o /tmp/reg-policy-cb.json -w "%{http_code}" \
  -X POST "$BASE/v1/ci/runs/$POLICY_RUN_ID/status" \
  -H "Authorization: Bearer $POLICY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "succeeded", "exit_code": 0}')
assert_status "Test run succeeded callback" "200" "$HTTP"

# Now approve should succeed
HTTP=$(curl -s -o /tmp/reg-policy-ok.json -w "%{http_code}" \
  -X POST "$BASE/v1/artifacts/policy/guarded-module/versions/1.0.0/approve")
BODY=$(cat /tmp/reg-policy-ok.json)
assert_status "Approve succeeds after passing test" "200" "$HTTP"
assert_json "Version approved" "data['approval_status']" "approved" "$BODY"

# ─── 30. Cloud Integration CRUD ──────────────────────────────────────
bold ""
bold "30. Cloud Integration CRUD"

# Create AWS OIDC integration
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/cloud-integrations" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "aws-prod",
    "description": "AWS production account",
    "provider": "aws",
    "auth_method": "oidc",
    "credential_config": {
      "roleArn": "arn:aws:iam::123456789:role/butler-terraform",
      "region": "us-east-1"
    }
  }')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST /v1/cloud-integrations (AWS OIDC)" "201" "$status"
CI_INTEGRATION_ID=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
assert_json "AWS provider" "data['provider']" "aws" "$response"
assert_json "AWS auth_method" "data['auth_method']" "oidc" "$response"

# Create GCP static integration
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/cloud-integrations" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "gcp-staging",
    "description": "GCP staging project",
    "provider": "gcp",
    "auth_method": "static",
    "credential_config": {
      "ciSecrets": { "credentialsJson": "GCP_CREDENTIALS_JSON" },
      "projectId": "my-project"
    }
  }')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST /v1/cloud-integrations (GCP static)" "201" "$status"
GCP_INTEGRATION_ID=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

# Create Azure OIDC integration
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/cloud-integrations" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "azure-dev",
    "description": "Azure dev subscription",
    "provider": "azure",
    "auth_method": "oidc",
    "credential_config": {
      "clientId": "client-123",
      "tenantId": "tenant-456",
      "subscriptionId": "sub-789"
    }
  }')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST /v1/cloud-integrations (Azure OIDC)" "201" "$status"
AZURE_INTEGRATION_ID=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

# List all cloud integrations
body=$(curl -s "$BASE/v1/cloud-integrations")
ci_count=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('totalCount', len(d.get('items', []))))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$ci_count" -ge "3" ]; then
  green "  PASS  cloud integrations list has $ci_count items (>= 3)"
  PASS=$((PASS + 1))
else
  red "  FAIL  cloud integrations list expected >= 3, got $ci_count"
  FAIL=$((FAIL + 1))
fi

# Get detail
body=$(curl -s -w '\n%{http_code}' "$BASE/v1/cloud-integrations/$CI_INTEGRATION_ID")
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "GET /v1/cloud-integrations/$CI_INTEGRATION_ID" "200" "$status"
assert_json "detail name matches" "data['name']" "aws-prod" "$response"

# Update description
body=$(curl -s -w '\n%{http_code}' -X PATCH "$BASE/v1/cloud-integrations/$CI_INTEGRATION_ID" \
  -H 'Content-Type: application/json' \
  -d '{"description": "AWS production account (updated)"}')
status=$(echo "$body" | tail -1)
assert_status "PATCH /v1/cloud-integrations/$CI_INTEGRATION_ID" "200" "$status"

# Delete nonexistent → 404
status=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/v1/cloud-integrations/00000000-0000-0000-0000-000000000000")
assert_status "DELETE nonexistent cloud integration → 404" "404" "$status"

# Validate integration
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/cloud-integrations/$CI_INTEGRATION_ID/validate")
status=$(echo "$body" | tail -1)
assert_status "POST /v1/cloud-integrations/$CI_INTEGRATION_ID/validate" "200" "$status"

# ─── 31. Variable Set CRUD ───────────────────────────────────────────
bold ""
bold "31. Variable Set CRUD"

# Create variable set
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/variable-sets" \
  -H 'Content-Type: application/json' \
  -d '{"name": "common-tags", "description": "Shared tags for all modules"}')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST /v1/variable-sets (common-tags)" "201" "$status"
VS_ID=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

# Create second variable set with auto_attach
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/variable-sets" \
  -H 'Content-Type: application/json' \
  -d '{"name": "aws-defaults", "description": "Default AWS vars", "auto_attach": true}')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST /v1/variable-sets (aws-defaults, auto_attach)" "201" "$status"
VS2_ID=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

# List variable sets
body=$(curl -s "$BASE/v1/variable-sets")
vs_count=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('totalCount', len(d.get('items', []))))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$vs_count" -ge "2" ]; then
  green "  PASS  variable sets list has $vs_count items (>= 2)"
  PASS=$((PASS + 1))
else
  red "  FAIL  variable sets list expected >= 2, got $vs_count"
  FAIL=$((FAIL + 1))
fi

# Get detail
body=$(curl -s -w '\n%{http_code}' "$BASE/v1/variable-sets/$VS_ID")
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "GET /v1/variable-sets/$VS_ID" "200" "$status"
assert_json "variable set name" "data['name']" "common-tags" "$response"

# Update description
body=$(curl -s -w '\n%{http_code}' -X PATCH "$BASE/v1/variable-sets/$VS_ID" \
  -H 'Content-Type: application/json' \
  -d '{"description": "Shared tags for all modules (updated)"}')
status=$(echo "$body" | tail -1)
assert_status "PATCH /v1/variable-sets/$VS_ID" "200" "$status"

# ─── 32. Variable Set Entries ────────────────────────────────────────
bold ""
bold "32. Variable Set Entries"

# Bulk upsert entries
body=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/v1/variable-sets/$VS_ID/entries" \
  -H 'Content-Type: application/json' \
  -d '[
    { "key": "project", "value": "butler-labs", "category": "terraform", "sensitive": false, "hcl": false },
    { "key": "env", "value": "dev", "category": "terraform", "sensitive": false, "hcl": false },
    { "key": "AWS_SECRET_KEY", "value": null, "category": "env", "sensitive": true, "hcl": false, "ci_secret_name": "AWS_SECRET_ACCESS_KEY" }
  ]')
status=$(echo "$body" | tail -1)
assert_status "PUT /v1/variable-sets/$VS_ID/entries (bulk upsert)" "200" "$status"

# List entries
body=$(curl -s "$BASE/v1/variable-sets/$VS_ID/entries")
entry_count=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('entries', d.get('items', []))))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$entry_count" = "3" ]; then
  green "  PASS  variable set has 3 entries"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 3 entries, got $entry_count"
  FAIL=$((FAIL + 1))
fi

# Assert sensitive entry value is null (masked)
sensitive_val=$(echo "$body" | python3 -c "
import sys,json
d=json.load(sys.stdin)
entries = d.get('entries', d.get('items', []))
for e in entries:
    if e['key'] == 'AWS_SECRET_KEY':
        print(e['value'])
        break
" 2>/dev/null || echo "PARSE_ERROR")
TOTAL=$((TOTAL + 1))
if [ "$sensitive_val" = "None" ] || [ "$sensitive_val" = "null" ] || [ "$sensitive_val" = "" ]; then
  green "  PASS  sensitive entry value is masked (got '$sensitive_val')"
  PASS=$((PASS + 1))
else
  red "  FAIL  sensitive entry value should be masked, got '$sensitive_val'"
  FAIL=$((FAIL + 1))
fi

# Delete an entry
body=$(curl -s -w '\n%{http_code}' -X DELETE "$BASE/v1/variable-sets/$VS_ID/entries/env")
status=$(echo "$body" | tail -1)
assert_status "DELETE /v1/variable-sets/$VS_ID/entries/env" "200" "$status"

# Verify 2 entries remaining
body=$(curl -s "$BASE/v1/variable-sets/$VS_ID/entries")
entry_count=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('entries', d.get('items', []))))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$entry_count" = "2" ]; then
  green "  PASS  2 entries remaining after delete"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 2 entries remaining, got $entry_count"
  FAIL=$((FAIL + 1))
fi

# ─── 33. Environment Cloud Integration Bindings ─────────────────────
bold ""
bold "33. Environment Cloud Integration Bindings"

# Create an environment for binding tests (or reuse if ENV_ID already set)
if [ -z "${ENV_ID:-}" ]; then
  body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/environments" \
    -H 'Content-Type: application/json' \
    -d '{"name": "binding-test-env", "description": "Test environment for bindings"}')
  status=$(echo "$body" | tail -1)
  response=$(echo "$body" | sed '$d')
  assert_status "POST /v1/environments (binding-test-env)" "201" "$status"
  ENV_ID=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
fi

# Bind AWS integration with priority 10
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/environments/$ENV_ID/cloud-integrations" \
  -H 'Content-Type: application/json' \
  -d "{\"cloud_integration_id\": \"$CI_INTEGRATION_ID\", \"priority\": 10}")
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST bind AWS integration to env (priority 10)" "201" "$status"
AWS_BINDING_ID=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

# Bind GCP integration with priority 5
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/environments/$ENV_ID/cloud-integrations" \
  -H 'Content-Type: application/json' \
  -d "{\"cloud_integration_id\": \"$GCP_INTEGRATION_ID\", \"priority\": 5}")
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST bind GCP integration to env (priority 5)" "201" "$status"
GCP_BINDING_ID=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

# List bindings
body=$(curl -s "$BASE/v1/environments/$ENV_ID/cloud-integrations")
binding_count=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('bindings', d.get('items', []))))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$binding_count" = "2" ]; then
  green "  PASS  env has 2 cloud integration bindings"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 2 bindings, got $binding_count"
  FAIL=$((FAIL + 1))
fi

# Assert first binding has correct integration name
first_binding_name=$(echo "$body" | python3 -c "
import sys,json
d=json.load(sys.stdin)
bindings = d.get('bindings', d.get('items', []))
print(bindings[0].get('integration_name', bindings[0].get('name', '')))" 2>/dev/null || echo "PARSE_ERROR")
TOTAL=$((TOTAL + 1))
if [ -n "$first_binding_name" ] && [ "$first_binding_name" != "PARSE_ERROR" ]; then
  green "  PASS  first binding has integration_name ($first_binding_name)"
  PASS=$((PASS + 1))
else
  red "  FAIL  first binding integration_name missing or parse error"
  FAIL=$((FAIL + 1))
fi

# Unbind one integration
body=$(curl -s -w '\n%{http_code}' -X DELETE "$BASE/v1/environments/$ENV_ID/cloud-integrations/$AWS_BINDING_ID")
status=$(echo "$body" | tail -1)
assert_status "DELETE unbind AWS integration from env" "200" "$status"

# Verify 1 binding remaining
body=$(curl -s "$BASE/v1/environments/$ENV_ID/cloud-integrations")
binding_count=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('bindings', d.get('items', []))))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$binding_count" = "1" ]; then
  green "  PASS  1 binding remaining after unbind"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 1 binding remaining, got $binding_count"
  FAIL=$((FAIL + 1))
fi

# ─── 34. Environment Variable Set Bindings ───────────────────────────
bold ""
bold "34. Environment Variable Set Bindings"

# Bind common-tags variable set with priority 5
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/environments/$ENV_ID/variable-sets" \
  -H 'Content-Type: application/json' \
  -d "{\"variable_set_id\": \"$VS_ID\", \"priority\": 5}")
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST bind common-tags variable set to env" "201" "$status"
VS_BINDING_ID=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

# List variable set bindings
body=$(curl -s "$BASE/v1/environments/$ENV_ID/variable-sets")
vs_binding_count=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('bindings', d.get('items', []))))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$vs_binding_count" = "1" ]; then
  green "  PASS  env has 1 variable set binding"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 1 variable set binding, got $vs_binding_count"
  FAIL=$((FAIL + 1))
fi

# Unbind
body=$(curl -s -w '\n%{http_code}' -X DELETE "$BASE/v1/environments/$ENV_ID/variable-sets/$VS_BINDING_ID")
status=$(echo "$body" | tail -1)
assert_status "DELETE unbind variable set from env" "200" "$status"

# ─── 35. Module-Level Bindings (override env-level) ──────────────────
bold ""
bold "35. Module-Level Bindings (override env-level)"

# Create a module in the environment
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/environments/$ENV_ID/modules" \
  -H 'Content-Type: application/json' \
  -d '{"name": "vpc", "artifact_namespace": "networking", "artifact_name": "vpc", "execution_mode": "byoc"}')
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST /v1/environments/$ENV_ID/modules (vpc)" "201" "$status"
MODULE_ID=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

# Bind Azure integration to module with priority 0
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/environments/$ENV_ID/modules/$MODULE_ID/cloud-integrations" \
  -H 'Content-Type: application/json' \
  -d "{\"cloud_integration_id\": \"$AZURE_INTEGRATION_ID\", \"priority\": 0}")
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST bind Azure integration to module (priority 0)" "201" "$status"
MODULE_CI_BINDING_ID=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

# List module cloud integration bindings
body=$(curl -s "$BASE/v1/environments/$ENV_ID/modules/$MODULE_ID/cloud-integrations")
mod_ci_count=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('bindings', d.get('items', []))))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$mod_ci_count" = "1" ]; then
  green "  PASS  module has 1 cloud integration binding"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 1 module cloud integration binding, got $mod_ci_count"
  FAIL=$((FAIL + 1))
fi

# Bind aws-defaults variable set to module with priority 0
body=$(curl -s -w '\n%{http_code}' -X POST "$BASE/v1/environments/$ENV_ID/modules/$MODULE_ID/variable-sets" \
  -H 'Content-Type: application/json' \
  -d "{\"variable_set_id\": \"$VS2_ID\", \"priority\": 0}")
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "POST bind aws-defaults variable set to module (priority 0)" "201" "$status"
MODULE_VS_BINDING_ID=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

# List module variable set bindings
body=$(curl -s "$BASE/v1/environments/$ENV_ID/modules/$MODULE_ID/variable-sets")
mod_vs_count=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('bindings', d.get('items', []))))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$mod_vs_count" = "1" ]; then
  green "  PASS  module has 1 variable set binding"
  PASS=$((PASS + 1))
else
  red "  FAIL  expected 1 module variable set binding, got $mod_vs_count"
  FAIL=$((FAIL + 1))
fi

# ─── 36. Resolved Variables Preview ─────────────────────────────────
bold ""
bold "36. Resolved Variables Preview"

body=$(curl -s -w '\n%{http_code}' "$BASE/v1/environments/$ENV_ID/modules/$MODULE_ID/resolved-vars")
status=$(echo "$body" | tail -1)
response=$(echo "$body" | sed '$d')
assert_status "GET resolved-vars" "200" "$status"

# Assert response has a variables array
has_vars=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print('True' if 'variables' in d else 'False')" 2>/dev/null || echo "False")
TOTAL=$((TOTAL + 1))
if [ "$has_vars" = "True" ]; then
  green "  PASS  resolved-vars response has variables array"
  PASS=$((PASS + 1))
else
  red "  FAIL  resolved-vars response missing variables array"
  FAIL=$((FAIL + 1))
fi

# Check that variables from bound sets appear
var_count=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('variables', [])))" 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$var_count" -ge "1" ]; then
  green "  PASS  resolved-vars has $var_count variable(s) from bound sets"
  PASS=$((PASS + 1))
else
  red "  FAIL  resolved-vars expected >= 1 variables, got $var_count"
  FAIL=$((FAIL + 1))
fi

# ─── 37. Delete Constraints ─────────────────────────────────────────
bold ""
bold "37. Delete Constraints"

# Try to delete Azure integration which is bound to a module — should return 409
body=$(curl -s -w '\n%{http_code}' -X DELETE "$BASE/v1/cloud-integrations/$AZURE_INTEGRATION_ID")
status=$(echo "$body" | tail -1)
assert_status "DELETE bound Azure integration → 409" "409" "$status"

# Unbind Azure integration from module first
body=$(curl -s -w '\n%{http_code}' -X DELETE "$BASE/v1/environments/$ENV_ID/modules/$MODULE_ID/cloud-integrations/$MODULE_CI_BINDING_ID")
status=$(echo "$body" | tail -1)
assert_status "DELETE unbind Azure from module" "200" "$status"

# Now delete should succeed
body=$(curl -s -w '\n%{http_code}' -X DELETE "$BASE/v1/cloud-integrations/$AZURE_INTEGRATION_ID")
status=$(echo "$body" | tail -1)
assert_status "DELETE Azure integration (after unbind) → 200" "200" "$status"

# ─── Summary ──────────────────────────────────────────────────────────
echo ""
bold "═══════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  green "  ALL $TOTAL TESTS PASSED"
else
  red "  $FAIL/$TOTAL TESTS FAILED"
fi
bold "═══════════════════════════════════════════════════════════"
echo "  Passed: $PASS  Failed: $FAIL  Total: $TOTAL"
echo ""

exit "$FAIL"
