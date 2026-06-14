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

import { init, loadRemote, registerRemotes } from '@module-federation/runtime';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactRouterDom from 'react-router-dom';
import * as MuiCoreStyles from '@material-ui/core/styles';
import * as MuiStyles from '@material-ui/styles';
import { Remote } from './types';

// Why this exists.
//
// The 0.5.0 stub deferred the host-side Module Federation runtime
// integration with a TODO that pointed at Phase 5. Re-attempting in
// 0.5.1 with @scalprum/react-core revealed Scalprum's hard dependency
// on webpack's Module Federation HOST runtime: getSharedScope calls
// Object.keys(__webpack_share_scopes__), and __webpack_share_scopes__
// only exists when the host bundle was built with
// ModuleFederationPlugin as a host. Backstage's CLI does NOT do that
// (it builds a normal app bundle), so the global is undefined and the
// ScalprumProvider's first useMemo crashed with "Cannot convert
// undefined or null to object" before the SignInPage could render.
//
// @module-federation/runtime is the same Module Federation v2 runtime
// the build-side plugin uses, exposed as a programmatic API. It
// maintains its own share scope (GlobalShareScopeMap, see
// node_modules/@module-federation/runtime-core/dist/index.cjs.js) and
// does NOT touch the webpack __webpack_share_scopes__ global, so it
// works in a host bundle that was NOT built with
// ModuleFederationPlugin. RHDH solves the same problem differently
// (custom webpack config that adds the host MF runtime); we use the
// runtime package directly, which is the lighter contract.
//
// HOST_SHARED is the singleton shared module table the host provides
// to every dynamic plugin. A dynamic plugin's manifest lists the modules
// it expects the host to supply (see mf-manifest.json -> shared[]); if
// any are missing the plugin uses its own bundled copy, which breaks
// React Context (every plugin would have its own React module) and
// makes Material UI's JSS keyed lookups inconsistent across the host
// and the plugin (host buttons look different from plugin buttons,
// react-router can't share the route table).
//
// Versions reflect what the host actually carries; mismatches between
// what's declared here and the deps the host bundle actually contains
// surface as "Shared module not loaded" errors at remote-load time and
// are caught by the boot-test marker assertion.
// Versions reflect the workspace package.json constraint resolved at
// install time. The plugin manifest uses requiredVersion: "*" for all
// shared singletons; the host provides definite versions so MF's
// resolution short-circuits to the host's lib.
const HOST_VERSIONS = {
	react: '18.2.0',
	'react-dom': '18.2.0',
	'react-router-dom': '6.30.1',
	'@material-ui/core/styles': '4.12.4',
	'@material-ui/styles': '4.11.5',
};

const HOST_SHARED = {
	react: {
		version: HOST_VERSIONS.react,
		lib: () => React,
		shareConfig: {
			singleton: true,
			requiredVersion: `^${HOST_VERSIONS.react}`,
		},
	},
	'react-dom': {
		version: HOST_VERSIONS['react-dom'],
		lib: () => ReactDOM,
		shareConfig: {
			singleton: true,
			requiredVersion: `^${HOST_VERSIONS['react-dom']}`,
		},
	},
	'react-router-dom': {
		version: HOST_VERSIONS['react-router-dom'],
		lib: () => ReactRouterDom,
		shareConfig: {
			singleton: true,
			requiredVersion: `^${HOST_VERSIONS['react-router-dom']}`,
		},
	},
	// Material UI v4: the styling primitives are split across two packages
	// AND used as singletons by every consumer. Without these shared, a
	// plugin's makeStyles/withStyles call gets its own StyleSheetManager
	// instance and theme.spacing/theme.palette become undefined relative
	// to the host's ThemeProvider context. Symptom is the
	// "e.spacing is not a function" exception raised when the plugin's
	// component first renders.
	'@material-ui/core/styles': {
		version: HOST_VERSIONS['@material-ui/core/styles'],
		lib: () => MuiCoreStyles,
		shareConfig: {
			singleton: true,
			requiredVersion: `^${HOST_VERSIONS['@material-ui/core/styles']}`,
		},
	},
	'@material-ui/styles': {
		version: HOST_VERSIONS['@material-ui/styles'],
		lib: () => MuiStyles,
		shareConfig: {
			singleton: true,
			requiredVersion: `^${HOST_VERSIONS['@material-ui/styles']}`,
		},
	},
};

// The host name is opaque to plugins but must be stable across init
// calls (the runtime treats name as the host instance identifier). A
// re-init with the same name is idempotent in @module-federation/
// runtime; we still gate behind initialized so we don't pay the
// useless serial init cost on every render.
const HOST_NAME = 'butler_portal_host';

let initialized = false;
const registeredRemotes = new Set<string>();

// Translate a Remote (as returned by the backend's /remotes endpoint)
// into the shape @module-federation/runtime expects. entryGlobalName
// matches the remote's globalName in its mf-manifest.json (the
// federation runtime uses it to attach the loaded entry to window).
function toMfRemote(remote: Remote) {
	return {
		name: remote.remoteInfo.name,
		alias: remote.packageName,
		entry: remote.remoteInfo.entry,
	};
}

// initializeMfRuntime initializes the host federation runtime once and
// registers any new remotes on subsequent calls. Safe to call multiple
// times -- the first call wires up shared singletons, later calls just
// register new remotes.
export function initializeMfRuntime(remotes: Remote[]): void {
	if (!initialized) {
		init({
			name: HOST_NAME,
			remotes: remotes.map(toMfRemote),
			shared: HOST_SHARED,
		});
		initialized = true;
		for (const r of remotes) registeredRemotes.add(r.remoteInfo.name);
		return;
	}
	const fresh = remotes.filter(r => !registeredRemotes.has(r.remoteInfo.name));
	if (fresh.length > 0) {
		registerRemotes(fresh.map(toMfRemote));
		for (const r of fresh) registeredRemotes.add(r.remoteInfo.name);
	}
}

// loadRemoteModule returns the federated module under the given
// remote's exposed module path. The runtime returns null on failure
// (network, missing exposed module, integrity, etc); callers must
// handle null. For our DynamicPluginsLoader, null on the root module
// skips the whole plugin; null on an importName skips just that one
// route.
//
// loadRemote() expects the request as "<alias>/<modulePath>" where
// modulePath does NOT include the "./" prefix MF exposes use. For
// remotes that bundle everything under the root "." expose, the
// modulePath is "." and the runtime expects the request to be just
// "<alias>" with no trailing separator -- "<alias>." is parsed as a
// missing module and fails with RUNTIME-004.
export async function loadRemoteModule<T = unknown>(
	remoteAlias: string,
	exposedModule: string,
): Promise<T | null> {
	const stripped = exposedModule.replace(/^\.\/?/, '');
	const key = stripped.length === 0 ? remoteAlias : `${remoteAlias}/${stripped}`;
	return loadRemote<T>(key);
}
