# Butler Labs Product Naming Taxonomy

Butler Labs products are named after roles from the British estate household tradition. Each name maps to its product's core function and carries a distinct character that informs UI copy, documentation tone, and marketing language.

## Product Family

| Name | Product | One-liner |
|------|---------|-----------|
| **Butler** | KaaS Platform | Kubernetes-as-a-Service across any infrastructure |
| **Steward** | Hosted Control Planes | Lightweight, shared control planes for tenant clusters |
| **Portal** | Internal Developer Platform | The developer's gateway to the estate |
| **Alfred** | AI Knowledge Platform | Intelligent answers from your infrastructure knowledge |
| **Chambers** | Dev Environments | Private environments, prepared and ready |
| **Keeper** | IaC Registry & Governance | Governed stores for infrastructure code |
| **Herald** | Observability Pipelines | Telemetry routing at fleet scale |
| **Jeeves** | Config Management | Proactive drift remediation via pluggable Ansible |

## Character Profiles

### Butler

**Role**: The head butler — orchestrates the entire estate.

Butler is the top-level platform. It provisions and manages Kubernetes clusters across any infrastructure provider. Everything flows through Butler.

### Steward

**Role**: The estate steward — manages property on behalf of the owner.

Steward runs lightweight, shared hosted control planes for tenant Kubernetes clusters. The steward manages the estate (cluster infrastructure) so the lord (tenant) doesn't have to worry about the underlying operations.

### Portal

**Role**: The portal — the grand entrance to the estate.

Butler Portal is the Backstage-based internal developer platform. It's the single entry point where developers discover services, manage infrastructure, and access all Butler Labs products.

### Alfred

**Role**: The iconic fictional butler — intelligent, anticipatory, loyal.

Alfred is the AI Knowledge Platform. Like Batman's butler, Alfred anticipates what you need before you ask, drawing on deep knowledge of your infrastructure to provide intelligent answers.

### Chambers

**Role**: The chamberlain managed the lord's private chambers — personal rooms prepared and equipped for each resident.

Chambers provisions isolated cloud development environments. Each chamber is a private, fully equipped space prepared to its occupant's specifications — Git repos cloned, dotfiles installed, SSH keys injected, editor configs ready. Like chambers in a great estate, each is prepared upon request and ready when you arrive.

**Voice**: Intimate, personal, ready-when-you-arrive.
*"Your chamber is prepared, sir."*

### Keeper

**Role**: The Keeper of the Wardrobe was one of the most powerful household officers — chief executive overseeing the secure storage of treasures, archives, and armaments, with full inventory governance and financial accountability.

Keeper is the IaC artifact registry and governance platform. It stores infrastructure modules with versioning, manages approval workflows, enforces OPA policies, tracks costs, and runs security scans. Like the Keeper of the Wardrobe, it doesn't just store things — it governs them.

**Voice**: Authoritative, meticulous, the gatekeeper of quality.
*"The Keeper has inspected and approved these provisions."*

### Herald

**Role**: The herald carried news and announcements across the estate — ensured information reached the right people at the right time, traveling circuits to distant outposts.

Herald is the observability pipeline builder and fleet management platform. It routes telemetry signals (logs, metrics, traces) from sources to destinations, managing distributed Vector agents across the fleet. Like a herald traveling circuits, it ensures signals reach their intended audience reliably.

**Voice**: Swift, reliable, far-reaching.
*"The Herald carries word across the realm."*

### Jeeves

**Role**: Reginald Jeeves — P.G. Wodehouse's archetypal gentleman's gentleman, famous for quietly solving problems before his employer notices they exist.

Jeeves is the config management platform with pluggable Ansible architecture. It declares desired state, detects drift, and auto-remediates. Jeeves doesn't just watch and report — it watches and fixes. Like the fictional Jeeves straightening Bertie's tie before he reaches the mirror, it proactively corrects configuration drift before it becomes an incident.

**Voice**: Proactive, discreet, competent.
*"Very good, sir. I've taken the liberty of correcting the configuration."*

## UI Copy Guidelines

### Sidebar Labels

Use the product name only (no "Butler" prefix in the Portal sidebar since everything is already under Butler Labs):

- Butler
- Chambers
- Keeper
- Herald

### Taglines (for cards, feature sections)

| Product | Tagline |
|---------|---------|
| Chambers | Private development environments, prepared and ready |
| Keeper | Governed stores for infrastructure code |
| Herald | Telemetry routing at fleet scale |
| Jeeves | Proactive drift remediation via pluggable Ansible |

### Descriptions (for marketing, longer-form)

| Product | Description |
|---------|-------------|
| Chambers | Provision isolated dev environments with pre-configured tools, dependencies, and cluster access. Each chamber is tailored to its occupant. |
| Keeper | Store, version, and distribute Terraform modules, Helm charts, and policy bundles. The Keeper ensures every artifact meets governance standards before reaching production. |
| Herald | Design, deploy, and manage telemetry pipelines at scale. Herald routes logs, metrics, and traces from any source to any destination with real-time topology visualization. |
| Jeeves | Declare desired state, detect drift, and auto-remediate across your fleet. Jeeves quietly corrects configuration before it becomes an incident. |
