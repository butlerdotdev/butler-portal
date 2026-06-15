---
sidebar_position: 4
sidebar_label: Publishing
---

# Publishing

How to turn the `dist-dynamic/` output of `rhdh-cli plugin export`
into an artifact the portal's installer can pull and verify. The
[quickstart](./quickstart.md) walks the minimum path; this page covers
versioning, security, registries, and the operator-side
considerations.

## What the installer accepts

Two schemes:

* `oci://<registry>/<path>:<tag>` -- OCI artifact. Pulled with oras.
* `https://<host>/<path>.tgz` -- HTTPS gzipped tarball. Pulled with
  curl.

Both are mandatory-integrity: every entry in
`dynamicPlugins.plugins[]` carries an `integrity:
sha512-<base64>` value. The installer computes the actual sha512 of
the downloaded artifact and rejects mismatches before any extraction.
There is no `integrity: any` escape.

OCI is the recommended path: registries provide auth, immutability,
audit, and ecosystem tooling out of the box. HTTPS works for cases
where you have an internal artifact server already and adding a
registry is more friction than it solves.

## Packing the artifact

The portal's installer extracts with `tar --strip-components=1`
expecting a `package/` directory at the top of the tarball. Pack the
build output that way:

```bash
PACK_DIR=$(mktemp -d)
mkdir -p "$PACK_DIR/stage/package"
cp -R dist-dynamic/. "$PACK_DIR/stage/package/"
tar -czf "$PACK_DIR/package.tgz" -C "$PACK_DIR/stage" package
```

The tarball at `$PACK_DIR/package.tgz` is what you push. Do not
include a leading `dist-dynamic/`; the installer strips one level and
expects `package/` underneath.

## Computing the integrity

```bash
HEX=$(shasum -a 512 "$PACK_DIR/package.tgz" | awk '{print $1}')
B64=$(printf '%s' "$HEX" | xxd -r -p | base64 -w0 2>/dev/null || \
      printf '%s' "$HEX" | xxd -r -p | base64 | tr -d '\n')
INTEGRITY="sha512-$B64"
echo "$INTEGRITY"
```

`base64 -w0` is required on Linux: the default wraps at 76 chars and
the resulting multi-line string in the chart's YAML value field
corrupts the auth string the installer parses. macOS `base64`
ignores the `-w` flag and does not wrap, so the fallback works on
both platforms.

The integrity value goes into your operator's `dynamicPlugins.
plugins[<n>].integrity`. The installer computes the same value at
install time and rejects the entry on mismatch.

## OCI push

```bash
echo "$REGISTRY_TOKEN" | oras login <registry> -u "$REGISTRY_USER" --password-stdin
cd "$PACK_DIR"
oras push <registry>/<path>:<tag> package.tgz:application/gzip
```

The `application/gzip` media type is what the installer expects on
the layer; oras ships the artifact as a single-layer OCI image with
that media type.

A successful push prints the digest. Tag and digest together
uniquely identify the artifact; the integrity above is the third
identification layer (since tags can be moved, digests prove content
identity at push time, and integrity proves the operator's
referenced bytes match the installed bytes).

### Registry support matrix

The portal's installer uses oras 1.x. Any oras-compatible OCI
registry works:

| Registry | Auth | Visibility scope |
|---|---|---|
| ghcr.io | GitHub PAT or workflow token | Public / internal-org / private; org-package access controls available. |
| AWS ECR | IAM credentials | IAM-scoped. |
| Quay | Robot account token or OAuth | Public / private. |
| Harbor | Robot account or OIDC | Project-scoped with fine-grained roles. |
| Docker Hub | Username + token | Public / private. |

The installer container runs as the distroless nonroot user
(65532:65532) and reads Docker auth from a config.json at
`$DOCKER_CONFIG/config.json`. For private sources, the operator
wires registry credentials through the installer's auth mount (see
the chart's installer values).

For Butler Labs' canonical example plugins, the source
(`ghcr.io/butlerdotdev/butler-portal-test-fixture`) is public; the
portal pulls anonymously.

## HTTPS tarball alternative

```bash
# After packing the tarball as above:
curl -X POST \
  -H "Authorization: Bearer $ARTIFACT_TOKEN" \
  -F "file=@$PACK_DIR/package.tgz" \
  https://artifacts.example.com/plugins/my-plugin/0.1.0
```

The operator references it in chart values:

```yaml
- package: https://artifacts.example.com/plugins/my-plugin/0.1.0/package.tgz
  integrity: sha512-<value>
```

HTTPS distribution has weaker provenance than an OCI registry: no
digest, no content-addressable storage, no immutability guarantee
unless you build one yourself. Use OCI when you can.

## Versioning conventions

A plugin's version lives in three independent places:

* `package.json` `version` (semver in your source repo).
* The OCI tag the artifact is pushed to.
* The integrity value (changes on every content rebuild).

The portal's chart `dynamicPlugins.plugins[].package` pins by tag
(`oci://.../my-plugin:0.1.0`). The integrity pins to specific bytes
within that tag. If you re-publish the same tag with different
bytes, every existing portal that already pulled the prior bytes
keeps running them (the installer pulls once per pod boot, and the
content is verified against the integrity in chart values).

This produces the operator-friendly default: a chart-values change
is the only way a new plugin version reaches the running portal. A
re-published tag with different bytes will be rejected by the
existing integrity (until the operator updates both the tag and the
integrity together).

Pin discipline:

* For Butler Labs' own showcase: pin both tag and integrity. A
  re-publish must coordinate with a chart-values change on
  butler-portal-live.
* For your own plugins: same. The pin is what makes deploys
  reviewable; without it, "what is actually running" drifts.

### Multiple tags for one artifact

Some operators want a stable channel reference (`:latest`,
`:1.x`) alongside a pinned version (`:1.2.3`). oras supports
multi-tag push:

```bash
oras push <registry>/<path>:1.2.3,1.x,latest package.tgz:application/gzip
```

The portal's chart pins one specific reference per plugin entry. The
operator chooses whether to pin the floating tag (and live with
re-publish surprises) or the immutable tag (and update chart values
on every release).

## Signing

The 0.5.x release ships integrity (sha512 SRI), not signing. The
plugin's bytes are content-addressable and verified, but the
publisher's identity is not cryptographically attached to the
artifact. An operator who wants to enforce "only artifacts signed by
this key" runs cosign verification out-of-band (in CI, in an
admission policy, or in a custom installer wrapper) until the chart
adds first-class signing support.

The roadmap for signing: sigstore cosign integration in chart 0.6.x
(after the 0.5.x adopter docs land). The integrity gate is enough
for the operator-trust model: the operator chose the source, the
operator wrote the integrity value, the installer enforces both at
boot.

## What the operator sees

After you push, give the operator three values:

```
package:   oci://<registry>/<path>:<tag>
integrity: sha512-<base64>
source:    <link to the source repo at the built commit>
```

The first two go into `dynamicPlugins.plugins[]`. The third is for
audit and onboarding. The operator's chart-values change references
both; the change is reviewable and durable in their config repo.

## Republishing flow

When you release a new plugin version:

1. Bump `package.json` version.
2. Build (`yarn export-dynamic`).
3. Pack and integrity-compute.
4. Push to a new tag (do not overwrite a published tag).
5. Hand the new package + integrity to the operator.
6. Operator updates the chart values, helm-upgrades the portal.
7. The portal pod rolls, the installer pulls the new artifact, the
   new plugin loads at boot.

Roll-back is a chart-values revert: change `package` and
`integrity` back to the prior values, helm-upgrade. The prior
artifact is pulled and loads. The portal does not retain a local
cache of plugin versions; every boot pulls fresh against the chart
values.

## Validating the published artifact before the operator runs it

Run the portal's
[release-boot-test workflow](https://github.com/butlerdotdev/butler-portal/blob/main/.github/workflows/release-boot-test.yaml)
against your own plugin's URI before handing the integrity to the
operator. The workflow boots a fresh portal image, installs the
referenced plugin, asserts the marker route renders for the
frontend and the marker route responds for the backend. Green there
gives you a real-amd64-on-the-built-image confidence that the chart
deploy is going to work.

The same workflow runs on every Butler Labs portal release against
the canonical examples, so you can copy the harness shape for your
own plugin's CI.
