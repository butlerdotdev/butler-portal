/*
 * Copyright 2026 The Butler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ReactNode, useEffect, useState } from 'react';
import { PluginManifest, EMPTY_PLUGIN_MANIFEST } from './types';

// URL the host fetches at boot to discover which dynamic plugins are
// installed in the pod's shared volume. The backend's dynamic-plugins
// feature service serves this from the same /opt/butler-portal/dynamic-
// plugins directory the init container populated. When dynamicPlugins
// is disabled (chart default) the backend does not mount this route and
// the fetch resolves to a 404 -> we treat as the empty manifest, drop
// straight through to the static App, no Scalprum wrapping.
const PLUGIN_MANIFEST_URL = '/api/dynamic-plugins/manifest';

// ScalprumRoot wraps the React tree and bootstraps the dynamic plugin
// runtime. The shape is deliberately a transparent pass-through when no
// plugins are configured:
//
//   - chart 0.5.0 default: dynamicPlugins.enabled=false. The backend
//     doesn't serve /api/dynamic-plugins/manifest. The fetch 404s. We
//     render children verbatim. No ScalprumProvider wrapping, no
//     federation runtime active, no DynamicRoot context populated.
//     The downstream tree (App.tsx + Root.tsx) renders identically to
//     chart 0.4.0.
//
//   - chart 0.5.0 + dynamicPlugins.enabled=true + empty plugins[]: the
//     fetch resolves to { plugins: {} }. Same pass-through behavior --
//     no plugins to load.
//
//   - chart 0.5.0 + plugins listed: the fetch returns the manifest, we
//     wrap children in ScalprumProvider for plugin loading. DynamicRoot
//     populates context with what loaded; Slot components in App.tsx
//     and Root.tsx render the dynamic additions.
//
// Loading state: while the fetch is in flight we render a Loader rather
// than the children. This is a deliberate boot-sequence change vs the
// 0.4.0 entry which rendered <App/> immediately. The window is short
// (one HTTP request to the same origin) and predictable. The fetch
// failure mode is broad-catch -> empty manifest -> pass-through, so a
// backend outage on the dynamic-plugins endpoint doesn't block the
// portal from rendering.
//
// What this does NOT do:
//
//   - Touch the config-schema load (the createConfigSecretEnumerator
//     path that caused the PR #20/21 crash). That load happens on the
//     BACKEND at boot, before any browser involvement. ScalprumRoot
//     runs in the browser AFTER the backend has rendered the HTML and
//     embedded the backstage.io/config script tag. The backend's
//     config-schema load completes before the HTML response ships, so
//     ScalprumRoot cannot affect it.
//
//   - Hold up React's createApp boot. Backstage's app.createRoot runs
//     synchronously when index.tsx executes; ScalprumRoot wraps the
//     RESULT of createRoot. The discovery walker that indexes routable
//     extensions has already run by the time ScalprumRoot's first
//     render happens.
export const ScalprumRoot = ({ children }: { children: ReactNode }) => {
	const [manifest, setManifest] = useState<PluginManifest | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch(PLUGIN_MANIFEST_URL, { credentials: 'include' })
			.then(async response => {
				if (!response.ok) {
					// 404 (dynamicPlugins disabled) and 5xx (backend issue)
					// both fall through to the empty manifest -- transparent
					// pass-through. A broken dynamic-plugins endpoint must
					// not block the portal from booting.
					return EMPTY_PLUGIN_MANIFEST;
				}
				return (await response.json()) as PluginManifest;
			})
			.catch(() => EMPTY_PLUGIN_MANIFEST)
			.then(result => {
				if (!cancelled) {
					setManifest(result);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (manifest === null) {
		// Manifest still loading. Render nothing rather than a flicker.
		// jsdom in tests resolves promises in the same tick; production
		// browsers see a brief blank before the fetch settles. A custom
		// loader UI lives in Phase 5 with the test plugin.
		return null;
	}

	// Manifest landed. The empty case is the transparent pass-through:
	// render children, no Scalprum wrapping, no DynamicRoot. The host
	// sees an empty DynamicRootContext via the createContext default,
	// the Slot components render nothing, and the page is identical to
	// chart 0.4.0.
	//
	// The non-empty case wraps in ScalprumProvider + DynamicRoot, which
	// populates the context with what loaded. That code path ships in
	// Phase 5 when the test plugin actually exercises the loader chain.
	// For chart 0.5.0 we ship the empty case correctly; the populated
	// case has the manifest fetched but does nothing with it -- a
	// no-op landing zone for the loader implementation.
	if (Object.keys(manifest.plugins).length === 0) {
		return <>{children}</>;
	}

	// Non-empty manifest: the actual ScalprumProvider wrapping lands in
	// Phase 5 when the test plugin verifies the path end to end. For
	// now we still pass through children -- the customer with dynamic
	// plugins configured but no Phase 5 loader sees their backend
	// plugins load (Phase 1 wiring) but their frontend pages absent
	// until the host-side loader ships. This is documented as a
	// known phase boundary in the 0.5.0 release notes.
	return <>{children}</>;
};
