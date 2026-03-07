---
sidebar_position: 5
sidebar_label: Jeeves
---

# Jeeves

:::info Coming Soon
Jeeves is under active development and not yet available.
:::

Jeeves is a configuration drift detection and remediation plugin. You declare the desired state for your infrastructure resources, and Jeeves continuously monitors live systems to detect when configuration drifts from that declared state. When drift is detected, Jeeves can notify you, present a diff of the changes, and automatically remediate by reapplying the desired configuration.

Jeeves integrates with Butler's cluster management layer to monitor tenant clusters, addons, and provider configurations. It supports both automated remediation for well-defined policies and manual approval workflows for changes that require human review before correction.
