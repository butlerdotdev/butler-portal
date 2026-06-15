---
sidebar_position: 5
sidebar_label: Chart configuration
---

# Chart configuration

For operators running Butler Portal who want to add dynamic plugins.
This page is the operator-facing chart values reference: every
`dynamicPlugins` knob, what it controls, why the default is what it
is, and which knobs are operator-empowerment vs which are
operator-required.

The chart version this describes: butler-portal 0.5.2.

## The whole block

The chart's defaults for `dynamicPlugins`:

```yaml
dynamicPlugins:
  enabled: false
  allowedSources: []
  installer:
    image: ghcr.io/butlerdotdev/butler-portal-plugin-installer
    tag: "0.1.0"
    pullPolicy: IfNotPresent
    continueOnError: false
  plugins: []
```

You enable the runtime, set what sources you trust, list the plugins
you want, and the portal pulls + verifies + loads them at boot. The
defaults are hygiene: an operator who installs the chart with no
override gets the stock Backstage IDP shell with no dynamic plugins
loaded and no installer container running.

## enabled

```yaml
dynamicPlugins:
  enabled: true
```

When `false` (the default), the chart renders no install-dynamic-
plugins initContainer, no dynamic-plugins volume, no
`APP_CONFIG_dynamicPlugins_rootDirectory` env var, no NODE_PATH env
var. The disabled-state pod template is byte-identical to chart 0.4.0,
so a customer who bumps the chart version without setting this flag
sees zero pod rollouts. A regression test pins this byte-identical
guarantee in CI.

When `true`, the chart renders the init container, the volume, the
config map, and the env vars on the main container. The dynamic-
plugin runtime is active. The portal pulls and loads everything in
`plugins[]` at boot.

## allowedSources

```yaml
dynamicPlugins:
  allowedSources:
    - oci://ghcr.io/my-org
    - https://artifacts.internal.example.com/plugins
```

The installer rejects any `plugins[].package` entry whose URI does
not start with one of these prefixes. The rejection happens before
the pull, before the integrity check, before any byte hits the
volume.

You control your supply chain. A misconfigured chart values change
that tries to install a plugin from an unexpected registry produces
a `plugin_rejected reason=source_not_allowed` event in the init
container logs and aborts the pod (when continueOnError is
`false`). The portal does not load surprise plugins.

When the field is unset or empty, the installer warns at startup
(`event=startup_permissive_mode reason=allowedSources_unset_permissive`)
but accepts all sources. The warning is intentional: an operator
running with no source whitelist is making an explicit choice that
gets logged.

For production deployments, set this. For early experimentation,
the permissive mode is convenient and the warning makes the
trade-off visible.

## continueOnError

```yaml
dynamicPlugins:
  installer:
    continueOnError: false
```

`false` (the default): the installer aborts the pod on the first
rejected plugin. Integrity mismatch, OCI pull failure, source not
allowed -- any of these and the pod fails to start. The previous
running pod stays up (the Deployment's RollingUpdate strategy holds
the old replica while the new one is not Ready).

`true`: the installer continues past rejected plugins. The pod boots
with whatever plugins did install successfully. A rejected plugin
shows up in the init container's audit log but does not block boot.

Use `false` for security-critical plugins (the default). The
trade-off is operator-visible: a known-bad-but-non-critical plugin
prevents portal rollout. Use `true` when graceful degradation is
more important than fail-closed -- a dashboard pulling from a
flaky registry that you would rather skip than block the portal on.

The flag is global. There is no per-plugin override. For mixed
criticality, run two HelmReleases (one fail-closed for critical
plugins, one fail-open for the rest) -- though most operators do not
need this complexity.

## installer.image / installer.tag

```yaml
dynamicPlugins:
  installer:
    image: ghcr.io/butlerdotdev/butler-portal-plugin-installer
    tag: "0.1.0"
```

The image and tag of the installer container. Override when:

* You run a fork or wrapped variant of the installer (for example,
  to add a custom auth provider or to enforce cosign verification).
* You want to pin to a different upstream release than the chart's
  default.
* You mirror the image to a private registry.

The default points at the Butler Labs canonical installer. Chart
0.5.2 ships with installer 0.1.0; chart releases may bump this
default as the installer evolves.

## installer.pullPolicy

```yaml
dynamicPlugins:
  installer:
    pullPolicy: IfNotPresent
```

Kubernetes' standard image pull policy semantics. The installer
image is small and changes infrequently; `IfNotPresent` is the right
default. `Always` is appropriate when you are testing a moving tag
during development. `Never` only makes sense if you pre-populate the
image into the node's local registry yourself.

## plugins[]

```yaml
dynamicPlugins:
  plugins:
    - package: oci://ghcr.io/my-org/my-plugin:1.2.3
      integrity: sha512-<base64>
    - package: https://artifacts.internal.example.com/another.tgz
      integrity: sha512-<base64>
```

The list of plugins the portal loads at boot. The installer iterates
this list in order. Each entry needs:

* `package`: the OCI or HTTPS URI.
* `integrity`: the SRI-format sha512 of the artifact bytes.

Both are required; entries missing either are rejected. There is no
implicit version (the URI tag is the version) and no implicit
integrity (you compute it explicitly).

Order matters only for deterministic boot log ordering -- the
runtime mounts routes independently after the install step
completes.

A single artifact can ship both a frontend and a backend plugin (the
canonical example does this: the frontend and backend are two
separate packages, each entered in `plugins[]` separately). The
runtime loads each by its declared `backstage.role`.

## What the installer logs

The init container emits structured log lines:

```
ts=2026-06-15T01:08:47Z level=INFO event=startup config_file=/etc/butler-portal/dynamic-plugins.yaml root=/dynamic-plugins-root continue_on_error=false plugin_count=2 allowed_sources=["oci://ghcr.io/butlerdotdev/butler-portal-test-fixture"]
ts=2026-06-15T01:08:47Z level=INFO event=plugin_installed package=oci://... integrity="..." digest_verified=ok name=... dest=/dynamic-plugins-root/...
ts=2026-06-15T01:08:47Z level=INFO event=completed installed=2 rejected=0 skipped=0
```

Pipe these to your logging stack for audit. The
`digest_verified=ok` line is the proof that the artifact's bytes
match the integrity. A rejection emits
`event=plugin_rejected reason=integrity_mismatch
expected="sha512-..." computed="sha512-..."` with both values
inline, enough to diagnose without rerunning.

## Recovering from a failed cutover

If a chart change with `dynamicPlugins.enabled: true` fails to roll
the pod (the init container CrashLoopBackOffs, a plugin rejection
aborts the pod, the integrity is wrong), the recovery is the standard
Flux revert:

1. The old pod stays serving (the Deployment's RollingUpdate strategy
   does not terminate it until the new one is Ready).
2. Revert the offending commit in the GitOps repo.
3. Force the GitRepository + HelmRelease to reconcile.
4. If Helm is wedged on the upgrade timeout, `helm rollback
   butler-portal-butler-portal <prior-revision> --wait` clears the
   stuck upgrade fast.
5. The new pod terminates, the old pod keeps serving, GitOps is
   back in sync.

Revert-don't-fix-forward applies: do not patch the chart values
in place trying to make the broken state work. Revert first, then
diagnose, then re-cut.

## The path correction history (chart 0.5.0-0.5.1)

For operators upgrading from an older chart: the chart 0.5.0 and
0.5.1 mounted the dynamic-plugins volume at
`/opt/butler-portal/dynamic-plugins` while the installer hardcodes
`/dynamic-plugins-root` as its write destination. Any operator who
set `dynamicPlugins.enabled: true` on those chart versions saw the
init container CrashLoopBackOff with `mkdir: cannot create directory
/dynamic-plugins-root: Permission denied`. Chart 0.5.2 corrects the
path on all three template references and a chart unittest pins it.

If you are on chart 0.5.0 or 0.5.1 with `dynamicPlugins.enabled:
false`, upgrade to 0.5.2 at your convenience -- the disabled-state
pod template stays byte-identical to 0.4.0 so the upgrade does not
roll your pods. Then enable dynamicPlugins when you have plugins to
install.

## Security model summary

The defense in depth, lowest to highest layer:

1. **You choose the source.** `allowedSources` whitelists registry
   prefixes; the installer rejects anything else.
2. **You choose the version.** `plugins[].package` pins a specific
   tag (or digest, for OCI).
3. **You verify the bytes.** `plugins[].integrity` is mandatory and
   the installer rejects mismatches before extraction.
4. **You watch the audit.** The installer emits structured events
   for every install / rejection / skip.
5. **You control failure mode.** `continueOnError: false` (default)
   stops the pod on the first rejection; `true` lets it boot
   degraded.

Layers 1-4 are operator-empowerment: every check is something you
configured and can audit. The chart imposes nothing on layer 5 by
default (it fails closed); you choose otherwise explicitly.
