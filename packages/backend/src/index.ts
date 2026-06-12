/*
 * Hi!
 *
 * Note that this is an EXAMPLE Backstage backend. Please check the README.
 *
 * Happy hacking!
 */

import { createBackend } from '@backstage/backend-defaults';
import {
  coreServices,
  createBackendFeatureLoader,
} from '@backstage/backend-plugin-api';
import { dynamicPluginsFeatureLoader } from '@backstage/backend-dynamic-feature-service';
import { selectEnabledButlerLabsPlugins } from './butlerLabsPluginGates';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-proxy-backend'));

// scaffolder plugin
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
backend.add(
  import('@backstage/plugin-scaffolder-backend-module-notifications'),
);

// techdocs plugin
backend.add(import('@backstage/plugin-techdocs-backend'));

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
// See https://backstage.io/docs/backend-system/building-backends/migrating#the-auth-plugin
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
// Custom Google auth module -- issues tokens from Google profile email
// without requiring User entities in the catalog.
backend.add(import('./authModuleGoogleProvider'));
// See https://backstage.io/docs/auth/guest/provider

// catalog plugin
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);

// GitHub entity discovery -- auto-discovers catalog-info.yaml from GitHub orgs
backend.add(
  import('@backstage/plugin-catalog-backend-module-github'),
);

// See https://backstage.io/docs/features/software-catalog/configuration#subscribing-to-catalog-errors
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));

// permission plugin
backend.add(import('@backstage/plugin-permission-backend'));
// Test policy: denies registry.environment.delete, allows everything else.
// Replace with allow-all-policy for unrestricted access:
//   import('@backstage/plugin-permission-backend-module-allow-all-policy')
backend.add(import('./permissionPolicy'));

// search plugin
backend.add(import('@backstage/plugin-search-backend'));

// search engine
// See https://backstage.io/docs/features/search/search-engines
backend.add(import('@backstage/plugin-search-backend-module-pg'));

// search collators
backend.add(import('@backstage/plugin-search-backend-module-catalog'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

// kubernetes plugin
backend.add(import('@backstage/plugin-kubernetes-backend'));

// notifications and signals plugins
backend.add(import('@backstage/plugin-notifications-backend'));
backend.add(import('@backstage/plugin-signals-backend'));

// Butler-Labs-branded plugins (butler/Chambers/Keeper/Herald) are runtime-gated
// per plugins.<name>.enabled in app-config. createBackendFeatureLoader is the
// idiomatic mechanism: it receives coreServices.rootConfig as a dep and yields
// features at backend-init time, so the gate runs inside the backend lifecycle
// rather than at module scope where config isn't yet available. Stock Backstage
// plugins above are unconditional.
//
// Genuine off: when a flag is false the import is never yielded, so the plugin's
// register() never runs, httpRouter.use(...) never mounts, and the corresponding
// /api/* routes return 404. Hidden-but-live is not a failure mode here.
//
// registry-backend/catalog (the RegistryEntityProvider) piggy-backs on
// plugins.registry.enabled. A separate flag invites a misconfiguration where
// catalog discovery runs against a missing registry plugin.
backend.add(
  createBackendFeatureLoader({
    deps: { config: coreServices.rootConfig },
    async *loader({ config }) {
      // Spec list lives in butlerLabsPluginGates.ts so the selection logic
      // is unit-testable without booting the backend. Dynamic imports stay
      // here so the module loads only when the flag is true.
      for (const spec of selectEnabledButlerLabsPlugins(config)) {
        for (const moduleId of spec.modules) {
          // workspaces is frontend-only; not represented in any spec.
          switch (moduleId) {
            case '@internal/plugin-butler-backend':
              yield import('@internal/plugin-butler-backend');
              break;
            case '@internal/plugin-registry-backend':
              yield import('@internal/plugin-registry-backend');
              break;
            case '@internal/plugin-registry-backend/catalog':
              yield import('@internal/plugin-registry-backend/catalog');
              break;
            case '@internal/plugin-pipeline-backend':
              yield import('@internal/plugin-pipeline-backend');
              break;
            default:
              throw new Error(`unknown Butler Labs plugin module: ${moduleId}`);
          }
        }
      }
    },
  }),
);

// Customer-installed dynamic plugins (0.5.0+). Loads plugins from the
// path configured at dynamicPlugins.rootDirectory in app-config -- the
// chart's optional init container populates that directory at pod start.
// Runs alongside the static Butler-Labs gates above; they are independent
// paths. A customer can ship their own backend plugin in their own OCI
// registry, reference it in HelmRelease values, and it loads here with
// the same lifecycle a built-in plugin gets.
//
// Operator-controlled, not license-checked: an operator enables a plugin
// by referencing it in dynamicPlugins.plugins[] -- no entitlement call,
// no remote check. This is the open-product model: software is fully open
// and complete; the operator decides what runs in their portal.
//
// When dynamicPlugins.rootDirectory is unset (the default), the loader
// is a no-op: no directory to scan, no plugins to register, no error.
// Non-adopters render identically to the pre-0.5.0 backend.
backend.add(dynamicPluginsFeatureLoader());

backend.start();
