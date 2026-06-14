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
import { ScalprumProvider } from '@scalprum/react-core';
import type { AppsConfig } from '@scalprum/core';
import { Remote, RemotesResponse, EMPTY_REMOTES } from './types';
import { DynamicPluginsLoader } from './DynamicPluginsLoader';

// The real endpoint the backend's frontendRemotesServerService mounts.
// Verified against
// node_modules/@backstage/backend-dynamic-feature-service/dist/server/router.cjs.js
// (the `/remotes` route + `info.title: ".backstage/dynamic-features"`
// mount prefix). The 0.5.0 release shipped a wrong URL pointing at
// /api/dynamic-plugins/manifest -- the endpoint never existed and the
// fetch always 404'd. See
// notes/butler-portal-dynamic-plugins-verification-gap-empty-vs-broken.md
// for the verification-gap lesson that surfaced this.
const REMOTES_URL = '/.backstage/dynamic-features/remotes';

// ScalprumRoot wraps the React tree and bootstraps the dynamic plugin
// runtime. There are three paths:
//
//   1. Remotes fetch in flight (manifest === null) -> render nothing.
//      jsdom tests resolve promises in the same tick so this never
//      flashes; real browsers see a brief blank before the first
//      network round trip settles. Acceptable; the fetch is one
//      same-origin request to the backend the SPA is hosted from.
//
//   2. Empty remotes (chart default state, or the operator chose not
//      to configure plugins, or the backend has not yet registered
//      the frontendRemotesServerService -- which happens when
//      dynamicPlugins.rootDirectory is unset in config) -> render
//      children verbatim. No ScalprumProvider wrapping, no
//      federation runtime active, no DynamicRoot context populated.
//      This is the Phase 3 #6 disabled-state parity guarantee:
//      with no dynamic plugins the rendered tree is identical to
//      chart 0.4.0.
//
//   3. Non-empty remotes -> wrap in ScalprumProvider with the
//      Module Federation config translated from the Remote[] list,
//      then wrap inside DynamicPluginsLoader which subscribes to
//      the PluginStore, loads each plugin's federated entry,
//      filters its registered extensions for the core.dynamic-route
//      and core.dynamic-menu-item types, and populates
//      DynamicRootContext for the App.tsx render path. App.tsx's
//      DataDrivenFlatRoutes (from Phase 3) maps that context into
//      FlatRoutes alongside BASELINE_ROUTES; the routes the dynamic
//      plugin registers mount at their declared paths.
//
// 0.5.0 -> 0.5.1 changes:
//
//   - URL: /api/dynamic-plugins/manifest -> /.backstage/dynamic-features/remotes
//   - Response shape: { plugins: Record<...> } -> Remote[]
//   - Non-empty path: stub return <>{children}</> -> real ScalprumProvider
//     + DynamicPluginsLoader wiring. The 0.5.0 release shipped this
//     branch as a deferred stub (with a comment about Phase 5 picking
//     it up; Phase 5 did not). 0.5.1 implements it for real.
//
// What this does NOT touch:
//
//   - The createConfigSecretEnumerator path that crashed at PR #21.
//     That runs on the BACKEND at boot, completes before HTML ships.
//   - The createApp discovery walker that indexes static routable
//     extensions. ScalprumRoot wraps the result of createRoot; the
//     walker has already run by the time ScalprumRoot's first render
//     fires.
export const ScalprumRoot = ({ children }: { children: ReactNode }) => {
	const [remotes, setRemotes] = useState<RemotesResponse | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch(REMOTES_URL, { credentials: 'include' })
			.then(async response => {
				if (!response.ok) {
					// 404 (rootDirectory unset / feature loader gate closed)
					// and 5xx (backend issue) both fall through to the empty
					// list -- transparent pass-through. A broken endpoint
					// must not block the portal from booting.
					return EMPTY_REMOTES;
				}
				return (await response.json()) as RemotesResponse;
			})
			.catch(() => EMPTY_REMOTES)
			.then(result => {
				if (!cancelled) {
					setRemotes(result);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (remotes === null) {
		// In flight. Render nothing rather than a flicker.
		return null;
	}

	if (remotes.length === 0) {
		// Empty (the chart 0.5.0 default state). Transparent pass-through:
		// the host sees an empty DynamicRootContext via the createContext
		// default, the Slot components render nothing, and the page is
		// identical to chart 0.4.0. This is the load-bearing
		// disabled-state parity branch.
		return <>{children}</>;
	}

	// Non-empty: build the Scalprum AppsConfig from the Remote[] list and
	// hand it to ScalprumProvider. Each Remote becomes one app in
	// Scalprum's keyed-by-name config; manifestLocation is the full URL
	// the backend served for the plugin's mf-manifest.json.
	const config: AppsConfig = Object.fromEntries(
		remotes.map((r: Remote) => [
			r.packageName,
			{
				name: r.remoteInfo.name,
				manifestLocation: r.remoteInfo.entry,
			},
		]),
	);

	return (
		<ScalprumProvider config={config}>
			<DynamicPluginsLoader remotes={remotes}>
				{children}
			</DynamicPluginsLoader>
		</ScalprumProvider>
	);
};
