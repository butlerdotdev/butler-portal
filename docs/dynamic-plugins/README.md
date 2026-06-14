---
sidebar_position: 4
sidebar_label: Dynamic plugins
---

# Dynamic plugins

Butler Portal extends without forking. An operator points the portal
at a list of plugin references in chart values; the portal pulls them
on the next pod start, verifies their integrity, and loads them at
runtime. Adding a plugin is a chart-values change, not a portal-source
change.

This section is the adopter-facing documentation for that capability.
The portal itself is open source, and adopters who want to fork are
welcome to. The dynamic-plugin path exists for the operators who do
not -- the ones who want to add what their team needs to the portal
their organization runs, without taking ownership of the portal's
release pipeline.

Start with the [quickstart](./quickstart.md). It walks you from an
empty directory to a real federated plugin rendering on a real portal,
in steps you can copy. Once that works, the reference and authoring
pages cover the surface in depth.

## When dynamic plugins are the right answer

Dynamic plugins are right when:

* You want to add a UI surface (a new sidebar entry, a new page, a
  catalog card) without rebuilding the portal image.
* Your portal operator and your plugin author are different people or
  different teams.
* You are running a portal someone else releases, and you do not want
  to take on the maintenance of a forked release branch every time
  the upstream portal moves.

Dynamic plugins are not the right answer when:

* You need to modify portal-wide behavior (auth, theming, routing
  table). Those are static-build concerns.
* You need to ship private code to a portal you do not control
  the registry credentials for. Plugin distribution still requires
  somewhere the portal's installer can pull from.

Both frontend and backend dynamic plugins are supported on 0.5.1+.
Backend plugins follow the
[`@backstage/backend-dynamic-feature-service`](https://www.npmjs.com/package/@backstage/backend-dynamic-feature-service)
shape and load via the same `dynamicPlugins.plugins[]` block. The
[quickstart](./quickstart.md) walks through a frontend plugin first;
[Talking to a backend](./backend-wiring.md) covers backend plugins in
depth.

## What ships

The portal image at 0.5.1+ contains:

* The `@module-federation/runtime` host that loads frontend plugin
  remotes.
* The host singleton table (`react`, `react-dom`, `react-router-dom`,
  `@material-ui/core/styles`, `@material-ui/styles`). Frontend plugins
  share these with the host instead of bundling their own.
* The `dynamicPluginsExports` reader that turns a loaded frontend
  plugin into mounted routes and sidebar items.
* The `@backstage/backend-dynamic-feature-service` loader that
  registers a loaded backend plugin's routes against the portal's
  `httpRouter` service.
* The installer integration in the Helm chart's pod spec.

The standalone installer image (`butler-portal-plugin-installer`)
performs the pull-verify-stage step before the portal pod starts. The
default is `continueOnError: false`: a failed integrity check aborts
the pod, so a bad plugin reference does not silently disappear from
the running portal.

The plugin-side toolchain (`rhdh-cli` plus the optional
`@butlerlabs/portal-plugin-cli` wrapper) is what an author runs in
their own repo to produce the artifact the portal consumes. The same
toolchain produces both frontend and backend dynamic plugins.
