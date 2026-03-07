---
sidebar_position: 3
sidebar_label: Usage Guide
---

# Chambers Usage Guide

This guide walks you through creating, connecting to, and managing workspaces in Butler Portal.

## Prerequisites

Before you create a workspace, ensure the following:

- You have access to Butler Portal and are signed in.
- You belong to a team with at least one TenantCluster that has workspaces enabled (`spec.workspaces.enabled: true`).
- You have at least one SSH public key added to your user profile (recommended) or plan to specify one during workspace creation.

### Adding SSH Keys to Your Profile

If you have not added an SSH key yet, you can do so from the Portal or CLI.

**From the Portal UI:**

1. Open your user profile by clicking your avatar in the top-right corner.
2. Navigate to the **SSH Keys** section.
3. Click **Add SSH Key**.
4. Paste your public key (e.g., the contents of `~/.ssh/id_ed25519.pub`) and give it a name.
5. Click **Save**.

**From the CLI:**

```bash
butlerctl user ssh-key add --name "my-laptop" --key "$(cat ~/.ssh/id_ed25519.pub)"
```

Verify your keys:

```bash
butlerctl user ssh-key list
```

## Creating a Workspace

### Step 1: Open the Chambers Plugin

Navigate to **Chambers** in the Portal sidebar. You see a list of your existing workspaces (if any) and a **Create Workspace** button.

### Step 2: Select a Template

Click **Create Workspace**. The template picker displays available templates organized by category (backend, frontend, data, devops, custom). You see both cluster-wide templates and templates scoped to your team.

Select a template that matches your development environment. Each template card shows the container image, default resource allocation, and a description.

### Step 3: Configure the Workspace

After selecting a template, the creation form appears with the template's defaults pre-filled. You can adjust the following settings:

**Name**: A unique name for your workspace within the team namespace.

**Cluster**: Select the TenantCluster where the workspace pod runs. Only clusters with workspaces enabled appear in the list.

**Repositories**: Add one or more Git repositories to clone into the workspace.

```yaml
repositories:
  - url: "https://github.com/butlerdotdev/butler-controller.git"
    branch: "main"
  - url: "https://github.com/butlerdotdev/butler-api.git"
    branch: "main"
```

Each repository is cloned to `/workspace/{repo-name}/` inside the workspace. For private repositories, select a Git credentials secret from your team namespace.

**Resources**: Adjust CPU and memory allocation.

| Setting | Default | Description |
|---------|---------|-------------|
| CPU | 2 cores | CPU request and limit |
| Memory | 4Gi | Memory request and limit |
| Storage | 10Gi | Persistent volume size |

**Dotfiles**: Optionally configure a dotfiles repository.

**Environment Variables**: Optionally copy environment variables from an existing workload in the tenant cluster.

### Step 4: Create

Click **Create**. The workspace transitions through `Pending` and `Creating` phases. You can monitor progress on the workspace detail page, which shows the status of each condition (PVC, pod, repository cloning, dotfiles, SSH).

Creation typically takes 1-2 minutes depending on image pull time and repository sizes.

## Connecting via SSH

Once the workspace reaches the `Running` phase, you can connect to it.

### Step 1: Get the SSH Endpoint

On the workspace detail page, click **Connect**. This activates the SSH service on the tenant cluster and displays the SSH endpoint (IP and port).

You can also retrieve the endpoint from the CLI:

```bash
butlerctl workspace connect my-workspace
```

### Step 2: Connect

Use the displayed SSH endpoint to connect:

```bash
ssh -p <port> coder@<ip-address>
```

The username is `coder` for all workspaces. Your SSH key authenticates the connection automatically.

:::tip
Add the workspace to your SSH config for easier access:

```
Host my-workspace
    HostName <ip-address>
    Port <port>
    User coder
```

Then connect with `ssh my-workspace`.
:::

## Opening in VS Code

The workspace detail page includes an **Open in VS Code** button. Clicking it opens a `vscode://` deep link that:

1. Launches VS Code on your local machine.
2. Connects to the workspace via the Remote SSH extension.
3. Opens the `/workspace` directory (or the `.code-workspace` file for multi-repo workspaces).

### Prerequisites for VS Code

- [VS Code](https://code.visualstudio.com/) installed locally
- [Remote - SSH](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh) extension installed

If the deep link does not open automatically, copy the SSH endpoint from the workspace detail page and configure VS Code Remote SSH manually:

1. Open the VS Code command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
2. Select **Remote-SSH: Connect to Host**.
3. Enter `coder@<ip-address> -p <port>`.

## Opening in JetBrains

The workspace detail page includes an **Open in JetBrains** button. Clicking it opens a JetBrains Gateway connection URI that:

1. Launches JetBrains Gateway on your local machine.
2. Connects to the workspace via SSH.
3. Opens the workspace directory in your chosen IDE.

### Prerequisites for JetBrains

- [JetBrains Gateway](https://www.jetbrains.com/remote-development/gateway/) installed locally
- An active JetBrains IDE license

## Configuring Dotfiles

Dotfiles personalize your workspace with shell configuration, aliases, editor settings, and other preferences. You configure dotfiles during workspace creation or in a workspace template.

### During Workspace Creation

In the creation form, expand the **Dotfiles** section and provide:

- **Repository URL**: The Git URL of your dotfiles repository (e.g., `https://github.com/your-user/dotfiles.git`).
- **Install Command** (optional): The command to run after cloning. If omitted, the controller auto-detects an install script from the repository.

### In a Workspace Template

Platform or team admins can include dotfiles in a template so all workspaces created from it share the same base configuration:

```yaml
apiVersion: butler.butlerlabs.dev/v1alpha1
kind: WorkspaceTemplate
metadata:
  name: go-dev
  namespace: butler-system
spec:
  displayName: Go Development
  category: backend
  scope: cluster
  template:
    image: "ghcr.io/butlerdotdev/workspace-go:1.24"
    dotfiles:
      url: "https://github.com/your-org/shared-dotfiles.git"
      installCommand: "make install"
    resources:
      cpu: "4"
      memory: "8Gi"
    storageSize: "20Gi"
```

### How It Works

1. On first workspace creation, the controller clones the dotfiles repository into the workspace.
2. The controller runs the install command (or auto-detects one).
3. The `DotfilesInstalled` condition tracks completion.
4. Dotfiles persist on the PVC. Stopping and restarting the workspace does not re-run the install.

To update your dotfiles, connect to the workspace and pull changes manually, then re-run your install script.

## Managing Workspace Lifecycle

### Viewing Workspace Status

The Chambers plugin dashboard lists all your workspaces with their current phase, cluster, and connection status. Click a workspace to view detailed status including individual conditions.

From the CLI:

```bash
# List all your workspaces
butlerctl workspace list

# Get details for a specific workspace
butlerctl workspace get my-workspace
```

### Stopping a Workspace

Stopping a workspace deletes the pod but preserves the PVC. This frees compute resources while keeping your data intact.

**From the Portal**: Click the **Stop** button on the workspace detail page.

**From the CLI**:

```bash
butlerctl workspace stop my-workspace
```

The workspace transitions to `Stopped`. Your files, installed packages, and configuration remain on the persistent volume.

### Starting a Stopped Workspace

**From the Portal**: Click the **Start** button on a stopped workspace.

**From the CLI**:

```bash
butlerctl workspace start my-workspace
```

The workspace transitions through `Starting` to `Running`. A new pod is created and attached to the existing PVC. This is faster than initial creation because the image may already be cached on the node and repositories do not need to be cloned again.

### Deleting a Workspace

Deleting a workspace removes the pod, PVC, and all associated data permanently.

**From the Portal**: Click the **Delete** button on the workspace detail page. Confirm the deletion in the dialog.

**From the CLI**:

```bash
butlerctl workspace delete my-workspace
```

:::warning
Deleting a workspace is irreversible. All files stored on the workspace's persistent volume are permanently removed.
:::

### Automatic Lifecycle

Workspaces have two automatic inactivity behaviors:

| Behavior | Default | What Happens |
|----------|---------|--------------|
| Idle timeout | 4 hours | SSH service is removed after this duration from last connect. Pod continues running. Reconnecting creates a new SSH service. |
| Auto-stop | 8 hours | Pod is deleted after this duration from last SSH disconnect. PVC persists. |

Additionally, the cluster administrator can configure `autoDeleteAfter` on the TenantCluster (default: 30 days). Stopped workspaces older than this threshold are deleted automatically, including their PVCs.

You can override the idle timeout and auto-stop duration during workspace creation:

```yaml
idleTimeout: "8h"    # Keep SSH service active longer
autoStopAfter: "24h" # Stop pod after 24 hours of no connections
```

Set `autoStopAfter` to `0` to disable automatic pod stopping.

## Resource Limits and Quotas

Workspace resources are constrained at two levels.

### Per-Workspace Limits

Each workspace specifies CPU and memory as both requests and limits:

| Resource | Default | Configurable |
|----------|---------|-------------|
| CPU | 2 cores | Yes, during creation |
| Memory | 4Gi | Yes, during creation |
| Storage | 10Gi | Yes, during creation |

### Per-Cluster Quotas

The TenantCluster administrator sets aggregate limits for the `workspaces` namespace:

| Quota | Default | Description |
|-------|---------|-------------|
| `maxCPU` | 16 | Total CPU across all workspaces on the cluster |
| `maxMemory` | 32Gi | Total memory across all workspaces on the cluster |
| `maxStorage` | 100Gi | Total PVC storage across all workspaces on the cluster |
| `maxWorkspaces` | 20 | Maximum number of workspaces on the cluster (0 = unlimited) |

If creating a workspace would exceed a cluster quota, the creation fails with a quota exceeded error. To resolve this, stop or delete unused workspaces to free resources, or ask your cluster administrator to increase the quota.

You can check current usage from the CLI:

```bash
butlerctl workspace list --cluster my-cluster
```

## Troubleshooting

### Workspace Stuck in Creating

**Symptoms**: The workspace remains in the `Creating` phase for more than 5 minutes.

**Diagnosis**: Check the workspace conditions on the detail page or via CLI:

```bash
butlerctl workspace get my-workspace -o yaml
```

Look at which condition is not yet `True`:

- `PVCReady: False` indicates a storage issue on the tenant cluster (check StorageClass availability).
- `PodReady: False` indicates the pod failed to start (check image pull errors or resource constraints).
- `RepositoryCloned: False` indicates a Git clone failure (check repository URL and credentials).

### SSH Connection Refused

**Symptoms**: `ssh: connect to host ... port ...: Connection refused`

**Possible causes**:

1. The SSH service was removed due to idle timeout. Click **Connect** in the Portal to create a new SSH service.
2. The workspace is in `Stopped` phase. Start the workspace first.
3. Network connectivity between your machine and the tenant cluster's LoadBalancer is blocked. Verify firewall rules.

### Workspace Auto-Stopped Unexpectedly

**Symptoms**: Your workspace moved to `Stopped` while you were away.

**Explanation**: The `autoStopAfter` timer (default: 8 hours) runs from the last SSH disconnect time. To prevent this, increase the `autoStopAfter` value when creating the workspace or set it to `0` to disable auto-stop.
