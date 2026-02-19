# ADR-001: CI/CD Adapter Architecture

**Status:** Accepted
**Date:** 2026-02-16

## The Problem

The current BYOC implementation generates CI-specific YAML templates (GitHub Actions, GitLab CI). This approach doesn't scale:
- Every new CI platform = new template generator duplicating Terraform execution logic in a different YAML dialect
- Template generators can't handle complex logic (cancellation checks, error recovery, output extraction) because they're string-templated YAML
- No way to actually trigger runs — user must commit YAML and manually trigger
- No generic escape hatch for unsupported CI systems

## The Solution: Butler Runner + Thin CI Adapters

### Layer 1: Butler Runner (`butler-runner`)

A standalone Go CLI binary that handles ALL Terraform execution logic. One codebase, runs anywhere. Follows the same patterns as `butler-cli` and `butler-bootstrap` — Cobra commands, structured logging, GoReleaser for multi-platform publishing.

```bash
butler-runner execute \
  --endpoint https://portal.company.com/api/registry \
  --run-id 550e8400-e29b-41d4-a716-446655440000 \
  --token brce_xxxxxxxx
```

Or via environment variables (preferred in CI — no secrets in process args):
```bash
export BUTLER_ENDPOINT=https://portal.company.com/api/registry
export BUTLER_RUN_ID=550e8400-e29b-41d4-a716-446655440000
export BUTLER_TOKEN=brce_xxxxxxxx
butler-runner execute
```

The runner does everything:
1. Fetches run configuration from Butler API: `GET /v1/ci/module-runs/:runId/config`
   - Returns: operation, terraform version, git repo + ref, working directory, upstream output mappings, env var references, state backend config
2. Clones the module's git repo at the specified ref (uses `go-git` or shells out to `git`)
3. Writes `terraform.tfvars.json` with resolved upstream outputs (fetched from Butler API)
4. Configures state backend (PaaS: pg backend config injected. BYOC: user's backend config)
5. Downloads and verifies the specified Terraform version (hashicorp GPG signature verification) if not already present
6. Runs `terraform init`
7. Runs the operation (`plan`, `apply`, `destroy`, `validate`, `test`)
8. Streams logs to Butler: `POST /v1/ci/module-runs/:runId/logs` (chunked, periodic flush via goroutine)
9. On plan: captures plan JSON (`terraform show -json <planfile>`), POSTs to `POST /v1/ci/module-runs/:runId/plan`
10. On apply: runs `terraform output -json`, POSTs to `POST /v1/ci/module-runs/:runId/outputs`
11. Reports final status: `POST /v1/ci/module-runs/:runId/status`

**Pre-flight check:** Before starting, runner calls `GET /v1/ci/module-runs/:runId/status`. If the run is `cancelled`, exits immediately. During long operations, a background goroutine re-checks every 30s and sends SIGTERM to the terraform process if cancelled.

**Error handling:** All failures are caught and reported via the status callback with error details. The runner never silently fails — Butler always knows what happened. Deferred cleanup ensures status is always reported even on panic.

**Repo:** `github.com/butlerdotdev/butler-runner` — separate repo, independently versioned. Same GoReleaser + GitHub Actions release pipeline as `butler-cli`.

**Repo structure:**
```
butler-runner/
  cmd/
    butler-runner/
      main.go              # Cobra root command
  internal/
    execute/
      execute.go           # Core execution orchestrator
      config.go            # Fetch + parse run config from API
      terraform.go         # Terraform binary management + execution
      git.go               # Repo cloning at ref
      callbacks.go         # Status/logs/plan/outputs reporting
      cancellation.go      # Background cancellation checker goroutine
    client/
      client.go            # HTTP client for Butler API (shared with butler-cli patterns)
  .goreleaser.yaml
  Dockerfile
  Makefile
  go.mod
```

**Distribution:**
- Standalone binaries: GoReleaser publishes to GitHub Releases (linux-amd64, linux-arm64, darwin-amd64, darwin-arm64, windows-amd64)
- Homebrew: `brew install butlerdotdev/tap/butler-runner` (same tap as butler-cli)
- Container image: `ghcr.io/butlerdotdev/butler-runner:latest` (for K8s Jobs in PaaS mode). Multi-arch (amd64 + arm64). Based on distroless or alpine with terraform pre-installed.
- No npm dependency. Single static binary. Zero runtime requirements beyond terraform itself.

The PaaS executor already runs Terraform in K8s Jobs. Refactor: the PaaS Job container image becomes `butler-runner`. Same binary, just running inside a pod instead of inside a CI pipeline. **One execution engine for both PaaS and BYOC.**

### Layer 2: CI Adapters (Thin Wrappers)

Each CI adapter has two responsibilities:
1. **Template generation** — a minimal CI config that installs and runs butler-runner
2. **Run triggering** (optional) — calls the CI platform's API to start the pipeline

Since butler-runner handles all the hard logic, the CI-specific templates become trivially small:

**GitHub Actions adapter:**
```yaml
# .github/workflows/butler-run.yml
name: Butler Module Run
on:
  workflow_dispatch:
    inputs:
      run_id:
        required: true
      callback_token:
        required: true

jobs:
  execute:
    runs-on: ubuntu-latest
    permissions:
      id-token: write  # For OIDC cloud auth
    steps:
      - name: Install Butler Runner
        run: |
          curl -sSL https://github.com/butlerdotdev/butler-runner/releases/latest/download/butler-runner_linux_amd64.tar.gz | tar xz
          sudo mv butler-runner /usr/local/bin/

      - name: Execute Butler Run
        env:
          BUTLER_ENDPOINT: ${{ secrets.BUTLER_REGISTRY_URL }}
          BUTLER_RUN_ID: ${{ inputs.run_id }}
          BUTLER_TOKEN: ${{ inputs.callback_token }}
          AWS_ROLE_ARN: ${{ secrets.AWS_ROLE_ARN }}
        run: butler-runner execute
```

**GitLab CI adapter:**
```yaml
# .gitlab-ci.yml
butler-run:
  image: ghcr.io/butlerdotdev/butler-runner:latest
  script:
    - butler-runner execute
  variables:
    BUTLER_ENDPOINT: ${BUTLER_REGISTRY_URL}
    BUTLER_RUN_ID: ${RUN_ID}
    BUTLER_TOKEN: ${CALLBACK_TOKEN}
```

**Jenkins adapter:**
```groovy
pipeline {
    agent any
    stages {
        stage('Execute') {
            steps {
                sh '''
                    curl -sSL https://github.com/butlerdotdev/butler-runner/releases/latest/download/butler-runner_linux_amd64.tar.gz | tar xz
                    ./butler-runner execute
                '''
            }
        }
    }
    environment {
        BUTLER_ENDPOINT = credentials('butler-registry-url')
        BUTLER_RUN_ID   = "${params.RUN_ID}"
        BUTLER_TOKEN    = "${params.CALLBACK_TOKEN}"
    }
}
```

**Generic adapter (any CI system):**
For CI systems without a specific adapter, Butler returns the raw configuration:
```json
{
  "runner": {
    "install": "curl -sSL https://github.com/butlerdotdev/butler-runner/releases/latest/download/butler-runner_linux_amd64.tar.gz | tar xz",
    "command": "./butler-runner execute",
    "envVars": {
      "BUTLER_ENDPOINT": "https://portal.company.com/api/registry",
      "BUTLER_RUN_ID": "550e8400-...",
      "BUTLER_TOKEN": "brce_xxxxxxxx"
    }
  },
  "manual": {
    "callbackUrl": "https://portal.company.com/api/registry/v1/ci/module-runs/550e8400-.../status",
    "token": "brce_xxxxxxxx",
    "operation": "plan",
    "terraformVersion": "1.9.0",
    "gitRepo": "https://github.com/org/infra.git",
    "gitRef": "v1.2.0",
    "workingDirectory": "modules/vpc"
  }
}
```

The `manual` section is the escape hatch — for users who want to write their own script without butler-runner. As long as they POST to the callback endpoints, Butler doesn't care how Terraform ran.

### Layer 3: Run Triggering (CI API Integration)

Optional per-adapter. When a user clicks "Run" in the UI with BYOC mode, Butler can trigger the CI pipeline automatically instead of requiring manual execution.

**Adapter interface:**
```typescript
interface CIAdapter {
  readonly provider: string;  // 'github-actions' | 'gitlab-ci' | 'jenkins' | 'generic'

  // Generate minimal CI config that runs butler-runner
  generatePipelineConfig(run: ModuleRun): string;

  // Trigger a pipeline run via CI platform API (optional)
  triggerRun?(run: ModuleRun, credentials: CICredentials): Promise<CITriggerResult>;

  // Check pipeline status via CI API (fallback if callbacks fail) (optional)
  checkStatus?(externalRunId: string, credentials: CICredentials): Promise<CIStatusResult>;
}

interface CITriggerResult {
  externalRunId: string;       // GitHub run ID, GitLab pipeline ID, Jenkins build number
  externalUrl: string;         // URL to the CI run for linking in the UI
}

interface CICredentials {
  // Resolved from environment_modules.ci_config or app-config.yaml
  type: 'github-app' | 'github-pat' | 'gitlab-token' | 'jenkins-token';
  token: string;
}
```

**GitHub Actions triggering:**
```typescript
// POST https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches
// Body: { ref: "main", inputs: { run_id: "...", callback_token: "..." } }
```

**GitLab CI triggering:**
```typescript
// POST https://gitlab.com/api/v4/projects/{id}/trigger/pipeline
// Body: { ref: "main", variables: { RUN_ID: "...", CALLBACK_TOKEN: "..." } }
```

**Jenkins triggering:**
```typescript
// POST https://jenkins.company.com/job/{name}/buildWithParameters
// Params: RUN_ID=...&CALLBACK_TOKEN=...
```

**Generic — no trigger.** The UI shows "Copy run configuration" and the user triggers manually. Or they set up their own webhook/polling.

Triggering is opt-in per environment module. The `environment_modules` table needs a `ci_config JSONB` column:
```json
{
  "provider": "github-actions",
  "repository": "org/infra",
  "workflowFile": "butler-run.yml",
  "credentials": { "source": "secret", "ref": "butler-system/github-app-key", "key": "private-key" }
}
```

If `ci_config` is null, the module uses PaaS mode or manual BYOC (no auto-trigger).

### New API Endpoint for Runner

The runner needs to fetch its full configuration in one call:

```
GET /v1/ci/module-runs/:runId/config
Authorization: Bearer <callback_token>
```

Response:
```json
{
  "runId": "550e8400-...",
  "operation": "plan",
  "terraformVersion": "1.9.0",
  "source": {
    "gitRepo": "https://github.com/org/infra.git",
    "gitRef": "v1.2.0",
    "workingDirectory": "modules/vpc",
    "credentials": { "type": "github-app", "installationId": "12345" }
  },
  "variables": {
    "region": { "value": "us-east-1" },
    "vpc_cidr": { "value": "10.0.0.0/16" },
    "db_password": { "sensitive": true, "source": "secret", "ref": "butler-system/db-creds", "key": "password" }
  },
  "upstreamOutputs": {
    "network_vpc_id": "vpc-abc123",
    "network_subnet_ids": ["subnet-1", "subnet-2"]
  },
  "stateBackend": {
    "type": "pg",
    "config": { "conn_str": "postgres://...", "schema_name": "terraform_remote_state" }
  },
  "callbacks": {
    "statusUrl": "/v1/ci/module-runs/550e8400-.../status",
    "logsUrl": "/v1/ci/module-runs/550e8400-.../logs",
    "planUrl": "/v1/ci/module-runs/550e8400-.../plan",
    "outputsUrl": "/v1/ci/module-runs/550e8400-.../outputs"
  }
}
```

The runner reads this, has everything it needs, and executes. No hardcoded CI-specific logic. One execution path for PaaS (runner in a K8s Job) and BYOC (runner in a CI pipeline).

### PaaS Executor Refactor

The current PaaS executor builds a K8s Job with a raw Terraform container image and an inline entry script. Refactor:

- Job container image: `ghcr.io/butlerdotdev/butler-runner:<version>`
- Job command: `butler-runner execute`
- Job env vars: `BUTLER_ENDPOINT`, `BUTLER_RUN_ID`, `BUTLER_TOKEN`
- All Terraform logic moves OUT of `jobSpec.ts` and INTO the runner

This means `jobSpec.ts` becomes simple — it only builds the K8s Job manifest with the right env vars, security context, resource limits, and network policy. It doesn't know anything about Terraform.

## Additional Requirements

### Token Prefix Enforcement

- Registry API tokens: `breg_` prefix (Butler REGistry)
- Callback tokens: `brce_` prefix (Butler Callback Ephemeral)
- `tokenAuth.ts` MUST reject `brce_` tokens on protocol/management endpoints
- Callback middleware MUST reject `breg_` tokens on callback endpoints
- Simple prefix check on token validation — prevents accidental cross-use

### CI Credential Resolution

- `ci_config.credentials` on `environment_modules` stores references (K8s Secret name + key), never raw credentials
- The registry backend resolves these server-side before calling the GitHub/GitLab/Jenkins API to trigger runs
- Same resolution pattern as env var secret references in the `/config` endpoint response
- The runner itself never resolves CI credentials — it only receives its own callback token

### Sensitive Config Response Handling

The `GET /v1/ci/module-runs/:runId/config` response carries resolved secrets (cloud credentials, state backend connection strings, sensitive variables). This is the most sensitive payload in the system. Required safeguards:

**Server-side (registry backend):**
- Response headers: `Cache-Control: no-store, no-cache`, `Pragma: no-cache`
- The endpoint MUST NOT log the response body. Structured logging for this endpoint logs only the run ID, module ID, and operation — never variable values or credentials.
- The callback token is single-use for config fetch. After the runner pulls config, subsequent `GET /config` calls with the same token return the config again (idempotent for retry) but the token cannot be used for any other endpoint class.

**Runner-side (`config.go`):**
- After parsing the config response into the execution struct, zero out the raw HTTP response body (`copy(body, zeros)` or equivalent)
- After Terraform execution completes (success or failure), zero out the resolved variables and credentials from the config struct before reporting final status
- Never write the config response to disk. Variables are written to `terraform.tfvars.json` in a temp directory that is wiped (not just deleted — overwritten then deleted) after execution
- Never log resolved secret values. The runner logs variable names but masks values: `Resolved 3 variables: region, vpc_cidr, db_password [sensitive]`

### Terraform Version Management

- The `butler-runner` container image ships with ONE default Terraform version (the latest stable at image build time)
- `terraform.go` in the runner checks if the requested version matches the pre-baked binary. If yes, use it directly.
- If the requested version differs: download from `releases.hashicorp.com`, verify HashiCorp GPG signature, cache in `~/.butler-runner/terraform/<version>/`. Reuse on subsequent runs.
- This keeps the container image small while supporting per-module version pinning without image rebuilds
- For BYOC (runner installed via curl): always downloads the requested version on first use, caches for subsequent runs

## Implementation Sequencing

**butler-runner ships as part of Phase 2, not after it.** Phase 2 introduces IaC runs. Rather than building a raw Terraform-in-K8s-Job executor and refactoring later, build the runner from day one. The PaaS executor creates K8s Jobs with the `butler-runner` container image. BYOC generates thin CI wrappers that invoke the same binary.

**Phase 1** (Registry — no runs, no runner):
- Artifact CRUD, versioning, approval, protocol endpoints, webhooks, CI results, tokens, frontend

**Phase 2** (Runs — runner is the execution engine):
1. `butler-runner` repo scaffolding — Cobra CLI, GoReleaser, Dockerfile, CI pipeline
2. Runner core: `execute.go` orchestrator, `config.go` (fetch from API), `git.go` (clone), `terraform.go` (version management + execution), `callbacks.go` (status/logs/plan/outputs reporting), `cancellation.go` (background goroutine)
3. Run config endpoint: `GET /v1/ci/module-runs/:runId/config` — server resolves env vars, upstream outputs, state backend config. Runner just consumes the response.
4. Callback endpoints: `POST .../status`, `.../logs`, `.../plan`, `.../outputs` (these may already exist from the current plan — verify they match the runner's expectations)
5. PaaS executor: `jobSpec.ts` builds K8s Jobs with `butler-runner` image + env vars. No Terraform logic in the Job spec.
6. BYOC: `pipelineGenerator.ts` refactored to generate thin wrappers (install runner binary + execute). GitHub Actions adapter first, GitLab second.
7. Generic adapter: returns raw config JSON for unsupported CI systems
8. Frontend: run creation, log viewer, plan viewer (same as current plan)

**Phase 3** (Environments — builds on the runner):
- DAG orchestration, output passing, environment runs, cascade — all use butler-runner as the execution engine
- No new execution infrastructure needed, just orchestration logic on top

**Later (customer-driven):**
- Jenkins adapter
- Bitbucket Pipelines adapter
- CircleCI adapter
- Run triggering via CI APIs (workflow_dispatch, pipeline trigger, etc.)

## Where butler-runner Lives

New repo: `github.com/butlerdotdev/butler-runner` — independently versioned, same as `butler-cli` and `butler-bootstrap`. Uses the same GoReleaser pipeline, same GitHub Actions release workflow, same multi-arch Docker build. Shares the `go.mod` patterns and internal libraries (HTTP client, logging) from the existing Butler Go repos.

## Configuration Additions

```yaml
# app-config.yaml
registry:
  iac:
    runner:
      image: ghcr.io/butlerdotdev/butler-runner:latest  # for PaaS Jobs
      defaultTerraformVersion: '1.9.0'  # pre-baked in container, fallback for modules without version pin
      logStreamIntervalMs: 2000  # how often runner streams logs
      cancellationCheckIntervalMs: 30000  # how often runner checks for cancellation
    tokens:
      registryPrefix: 'breg_'   # registry API tokens
      callbackPrefix: 'brce_'   # ephemeral run callback tokens
    adapters:
      github:
        appId: ${REGISTRY_GITHUB_APP_ID}
        privateKey: ${REGISTRY_GITHUB_PRIVATE_KEY}  # or K8s Secret ref
      gitlab:
        token: ${REGISTRY_GITLAB_TOKEN}
      # jenkins, bitbucket, etc. — add as needed
```
