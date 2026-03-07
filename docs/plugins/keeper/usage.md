---
sidebar_position: 3
sidebar_label: Usage Guide
---

# Usage Guide

This guide walks you through common Keeper workflows: publishing artifacts, searching the registry, managing versions, running approval workflows, consuming artifacts, and configuring team access.

## Prerequisites

Before you begin, ensure you have:

- Access to a running Butler Portal instance with the Keeper plugin enabled
- Membership in at least one Butler team (operator or admin role for publishing)
- The artifact files you want to publish (Terraform module, Helm chart, OPA policy, or Backstage template)

## Publishing a New Artifact

To register a new artifact and upload its first version:

### Step 1: Navigate to the Registry

Open Butler Portal and select **Registry** from the sidebar navigation. This opens the Keeper artifact catalog.

### Step 2: Create the Artifact

Click **New Artifact** in the top right corner. Fill in the artifact metadata:

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | Unique identifier within your team (lowercase, hyphens allowed) | `vpc-module` |
| **Type** | Artifact type | Terraform Module |
| **Team** | Owning Butler team | `platform-engineering` |
| **Description** | What this artifact provides | `Standard VPC with public and private subnets` |
| **Tags** | Optional search tags | `networking`, `aws`, `vpc` |

Click **Create** to register the artifact.

### Step 3: Upload the First Version

After creating the artifact, you are prompted to upload the first version.

1. Set the **version** number. For a new artifact, start with `0.1.0` (or `1.0.0` if the module is already stable).
2. Write a **changelog** entry describing what this version includes.
3. Upload the artifact files:
   - **Terraform Module**: a `.tar.gz` or `.zip` archive containing the module directory
   - **Helm Chart**: a packaged chart archive (`.tgz`) produced by `helm package`
   - **OPA Policy**: a `.tar.gz` archive containing Rego files and `policy.yaml`
   - **Backstage Template**: a `.tar.gz` archive containing `template.yaml` and any skeleton files
4. Click **Upload** to create the version in Draft state.

Keeper validates the uploaded archive against the expected structure for the artifact type. If validation fails, you receive an error message describing what is missing or malformed.

## Browsing and Searching the Registry

The Registry page displays all published artifacts across all teams.

### Filtering

Use the filter controls at the top of the catalog to narrow results:

| Filter | Options |
|--------|---------|
| **Type** | Terraform Module, Helm Chart, OPA Policy, Backstage Template |
| **Team** | Any Butler team |
| **Status** | Published (default for browse), Draft, Review, Approved |
| **Tags** | Free-text tag filter |

### Search

The search bar performs full-text search across artifact names, descriptions, and tags. Results are ranked by relevance and display the artifact name, type, owning team, latest published version, and last updated timestamp.

### Artifact Detail View

Click any artifact to view its detail page. The detail view shows:

- Artifact metadata (name, type, team, description, tags)
- Version history with status indicators
- The currently published version's changelog
- Consumption instructions specific to the artifact type
- A link to the owning team's page in the Backstage catalog

## Version Management

### Creating a New Version

From an artifact's detail page, click **New Version** to create a new version.

1. The version field pre-fills with the next suggested patch increment. Adjust the version number according to semver rules.
2. Write a changelog entry describing the changes.
3. Upload the updated artifact archive.
4. Click **Upload** to create the version in Draft state.

### Comparing Versions

To compare two versions of an artifact:

1. Open the artifact detail page.
2. Select the **Versions** tab to see the full version history.
3. Select two versions using the checkboxes on the left.
4. Click **Compare** to view a side-by-side diff.

The comparison view highlights:

- Added, removed, and modified files
- Changes to metadata and configuration values
- Changelog differences

This is useful for evaluating what changed before upgrading to a newer version.

### Version History

The version history table shows all versions (including drafts and in-review versions, if you are a team member). Each row displays:

| Column | Description |
|--------|-------------|
| **Version** | Semver string |
| **Status** | Draft, Review, Approved, or Published |
| **Author** | User who created the version |
| **Created** | Upload timestamp |
| **Published** | Publication timestamp (if applicable) |

## Approval Workflows

Keeper requires all versions to pass through an approval workflow before publication. This section describes each step.

### Submitting for Review

After uploading a version in Draft state:

1. Open the version detail page.
2. Verify the artifact contents and changelog are complete.
3. Click **Submit for Review**.
4. The version moves to **Review** state.

Team members with the operator or admin role receive a notification that a new version is awaiting review.

### Reviewing a Version

As a reviewer (operator or admin role on the owning team, and not the version author):

1. Open the version detail page. Review-pending versions are flagged in the **Versions** tab.
2. Inspect the artifact contents using the built-in file browser.
3. Compare against the previous version to understand what changed.
4. Choose one of two actions:
   - **Approve**: moves the version to **Approved** state. Add an optional approval comment.
   - **Request Changes**: returns the version to **Draft** state. Provide a comment explaining what needs to change.

### Publishing a Version

Only team admins can publish. After a version reaches the Approved state:

1. Open the version detail page.
2. Click **Publish**.
3. Confirm the action in the dialog.

The version moves to **Published** state and becomes available to all consumers. The artifact's catalog entity in Backstage updates to reflect the new latest version.

:::warning
Publishing is permanent. A published version cannot be unpublished or modified. If you discover an issue after publishing, create a new version with the fix.
:::

### Approval History

Every state transition is recorded in the approval history. Open the **Approval History** tab on a version detail page to see:

- Who submitted the version for review
- Who approved or requested changes, with comments
- Who published the version
- Timestamps for each action

## Consuming Artifacts

Once an artifact version is published, other teams and tools can consume it. The consumption method depends on the artifact type.

### Terraform Modules

Reference a Keeper Terraform module in your configuration using the registry source URL:

```hcl
module "vpc" {
  source  = "keeper.portal.butlerlabs.dev/platform-engineering/vpc-module/aws"
  version = "1.3.0"

  cidr_block = "10.0.0.0/16"
  az_count   = 3
}
```

The source URL follows the format:

```
keeper.portal.butlerlabs.dev/<team>/<artifact-name>/<provider>
```

You can also download the module archive directly from the artifact detail page.

### Helm Charts

Reference a Keeper Helm chart using the registry as a Helm repository:

```bash
helm repo add keeper https://keeper.portal.butlerlabs.dev/charts/<team>
helm install monitoring keeper/monitoring-chart --version 2.1.0
```

For Flux HelmReleases:

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: keeper-platform-engineering
spec:
  type: oci
  url: oci://keeper.portal.butlerlabs.dev/charts/platform-engineering
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: monitoring
spec:
  chart:
    spec:
      chart: monitoring-chart
      version: "2.1.0"
      sourceRef:
        kind: HelmRepository
        name: keeper-platform-engineering
```

### OPA Policies

Reference OPA policy bundles from Keeper in your OPA Gatekeeper or Conftest configuration:

```yaml
# OPA Gatekeeper external data provider
apiVersion: externaldata.gatekeeper.sh/v1beta1
kind: Provider
metadata:
  name: keeper-policies
spec:
  url: https://keeper.portal.butlerlabs.dev/policies/platform-engineering/security-baseline/1.0.0
```

For CI-based policy checks with Conftest:

```bash
conftest pull keeper.portal.butlerlabs.dev/policies/platform-engineering/security-baseline:1.0.0
conftest test deployment.yaml
```

### Backstage Templates

Backstage templates published through Keeper are automatically registered in the Portal scaffolder catalog. Users can discover and launch them from the **Create** page in Portal without any additional configuration.

If you run a separate Backstage instance, reference the template location:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Location
metadata:
  name: keeper-templates
spec:
  type: url
  target: https://keeper.portal.butlerlabs.dev/templates/platform-engineering/new-service/1.0.0/template.yaml
```

## Managing Team Access

Keeper inherits access control from Butler's Team CRD. You do not configure permissions directly in Keeper. Instead, manage team membership through Butler.

### Adding a Team Member

To grant someone access to your team's artifacts, add them to the Butler team:

```yaml
apiVersion: butler.butlerlabs.dev/v1alpha1
kind: Team
metadata:
  name: platform-engineering
spec:
  access:
    users:
      - email: alice@example.com
        role: admin
      - email: bob@example.com
        role: operator
      - email: carol@example.com
        role: viewer
    groups:
      - name: platform-engineers
        role: operator
```

Apply the updated Team resource to your Butler management cluster:

```bash
kubectl apply -f team.yaml
```

Changes take effect immediately. The next time the user accesses Portal, their Keeper permissions reflect their updated team role.

### Role Summary

| Action | Required Role |
|--------|---------------|
| Browse and consume published artifacts | Any (including non-members) |
| Create artifacts and upload versions | Operator or Admin |
| Submit versions for review | Operator or Admin |
| Review and approve versions | Operator or Admin (not the version author) |
| Publish approved versions | Admin |
| Delete artifacts | Admin |

### Cross-Team Visibility

All published artifacts are visible to every Portal user regardless of team membership. Keeper is designed to encourage reuse. Teams cannot restrict who can view or consume their published artifacts. Only the management actions (creating, reviewing, publishing, deleting) require team membership.

## See Also

- [Concepts](./concepts.md) for definitions of artifacts, versions, and approval states
- [Overview](./README.md) for a high-level introduction to Keeper
- [Butler Portal Overview](/butler-portal/intro) for the broader Portal platform
