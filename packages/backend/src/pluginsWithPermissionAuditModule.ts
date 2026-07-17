import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { dynamicPluginsServiceRef } from '@backstage/backend-dynamic-feature-service';

// Runtime audit for permission.rbac.pluginsWithPermission gaps.
//
// The chart-time guard (butler-portal.validateRbacPluginsWithPermission)
// fails helm template on opted-in plugins whose id is missing from
// permission.rbac.pluginsWithPermission. The chart-time warn helper
// surfaces uncategorized plugin entries in NOTES.txt. Both mechanisms
// see values-file INTENT.
//
// This module sees values-file REALITY. At startup, after dynamic
// plugins load:
//
// 1. Enumerate loaded backend plugins via dynamicPluginsServiceRef —
//    the same source-of-truth the plugin-installer uses. Independent of
//    permission.rbac.pluginsWithPermission, so unlisted plugins are
//    visible to the enumeration.
// 2. For each loaded plugin, HTTP-fetch its
//    /.well-known/backstage/permissions/metadata endpoint (auto-wired
//    by @backstage/plugin-permission-node's createPermissionIntegrationRouter
//    when the plugin calls permissionsRegistry.addPermissions() or
//    .addResourceType()). Read the declared permissions.
// 3. If the plugin declared >0 permissions AND its pluginId is missing
//    from permission.rbac.pluginsWithPermission, log level=error with
//    the consequence phrasing: "authz is NOT running for this plugin;
//    its gated writes pass through as ALLOW."
//
// Coverage limit (load-bearing, see PR body and the plugin-authoring
// docs update landing in the same PR):
//
// A plugin that only calls createPermission({name}) + permissions.
// authorize() WITHOUT ever calling permissionsRegistry.addPermissions()
// or .addResourceType() never populates /permission/metadata. This
// audit is blind to that pattern. The plugin-authoring guide's
// "Minimal example" is updated in this PR to always call
// addPermissions() so the pattern the docs teach registers with the
// framework's own discovery endpoint. Detection becomes complete as
// the convention spreads.
//
// The convention is also independently correct: addPermissions()
// populates the same endpoint RBAC uses for discovery. A plugin
// skipping it is already invisible to RBAC's own tooling.

interface PermissionMetadata {
  permissions?: Array<{ name: string; attributes?: unknown; resourceType?: string }>;
  rules?: unknown[];
}

const CATEGORIZED_LOG_PREFIX = '[pluginsWithPermission audit]';
const DYNAMIC_PLUGIN_SETTLE_MS = 5000;

export default createBackendModule({
  pluginId: 'permission',
  moduleId: 'butler-portal-audit',
  register(reg) {
    reg.registerInit({
      deps: {
        logger: coreServices.rootLogger,
        config: coreServices.rootConfig,
        discovery: coreServices.discovery,
        auth: coreServices.auth,
        lifecycle: coreServices.rootLifecycle,
        dynamicPlugins: dynamicPluginsServiceRef,
      },
      async init({ logger, config, discovery, auth, lifecycle, dynamicPlugins }) {
        lifecycle.addStartupHook(async () => {
          // Give dynamic plugins a moment to finish their init sequence.
          // Dynamic-plugin loading is async and the startup hook fires
          // before every plugin has necessarily finished all its
          // registerInit paths. Settle briefly so /permission/metadata
          // reflects the fully-registered state.
          await new Promise(resolve => setTimeout(resolve, DYNAMIC_PLUGIN_SETTLE_MS));

          const listed = new Set(
            config.getOptionalStringArray('permission.rbac.pluginsWithPermission') ?? [],
          );

          const backendPlugins = dynamicPlugins.backendPlugins();
          if (backendPlugins.length === 0) {
            logger.info(`${CATEGORIZED_LOG_PREFIX} no dynamic backend plugins loaded; nothing to audit`);
            return;
          }

          logger.info(
            `${CATEGORIZED_LOG_PREFIX} auditing ${backendPlugins.length} loaded dynamic backend plugin(s) against permission.rbac.pluginsWithPermission (${listed.size} entries)`,
          );

          let gapsFound = 0;
          for (const plugin of backendPlugins) {
            let pluginId: string | undefined;
            try {
              const scanned = dynamicPlugins.getScannedPackage(plugin);
              // The plugin's own backstage.pluginId in package.json is
              // the authoritative source; fall back to the package
              // name only if pluginId is unset (Backstage tolerates this).
              pluginId =
                (scanned.manifest.backstage as { pluginId?: string })?.pluginId ??
                scanned.manifest.name;
            } catch (err) {
              logger.warn(
                `${CATEGORIZED_LOG_PREFIX} could not resolve pluginId for '${plugin.name}': ${err}. Skipping this entry.`,
              );
              continue;
            }
            if (!pluginId) continue;

            let baseUrl: string;
            try {
              baseUrl = await discovery.getBaseUrl(pluginId);
            } catch (err) {
              logger.debug(
                `${CATEGORIZED_LOG_PREFIX} discovery.getBaseUrl('${pluginId}') failed: ${err}. Skipping (plugin may not expose an HTTP surface).`,
              );
              continue;
            }

            let credential: string;
            try {
              const own = await auth.getOwnServiceCredentials();
              const { token } = await auth.getPluginRequestToken({
                onBehalfOf: own,
                targetPluginId: pluginId,
              });
              credential = token;
            } catch (err) {
              logger.debug(
                `${CATEGORIZED_LOG_PREFIX} could not mint service-to-service token for '${pluginId}': ${err}. Skipping.`,
              );
              continue;
            }

            let metadata: PermissionMetadata;
            try {
              const res = await fetch(
                `${baseUrl}/.well-known/backstage/permissions/metadata`,
                { headers: { Authorization: `Bearer ${credential}` } },
              );
              if (!res.ok) {
                // 404 is the common case: the plugin never called
                // addPermissions/addResourceType, so no integration
                // router was wired. Not an error — the plugin is invisible
                // to the audit by design (see coverage limit above).
                logger.debug(
                  `${CATEGORIZED_LOG_PREFIX} plugin '${pluginId}' returned ${res.status} on /permission/metadata; treating as no-permissions-declared`,
                );
                continue;
              }
              metadata = (await res.json()) as PermissionMetadata;
            } catch (err) {
              logger.debug(
                `${CATEGORIZED_LOG_PREFIX} fetch /permission/metadata failed for '${pluginId}': ${err}. Skipping.`,
              );
              continue;
            }

            const declaredCount = metadata.permissions?.length ?? 0;
            if (declaredCount === 0) continue;

            if (!listed.has(pluginId)) {
              gapsFound++;
              logger.error(
                `${CATEGORIZED_LOG_PREFIX} plugin '${pluginId}' declared ${declaredCount} permission(s) at runtime and is NOT in permission.rbac.pluginsWithPermission. Authz is NOT running for this plugin: RBAC's discovery API returns [] for it, and every authorize() call for its permissions passes through as ALLOW regardless of your policy CSV. Add '${pluginId}' to permission.rbac.pluginsWithPermission.`,
              );
            }
          }

          if (gapsFound === 0) {
            logger.info(
              `${CATEGORIZED_LOG_PREFIX} audit complete: no gaps found (every plugin that declared permissions at runtime is listed in permission.rbac.pluginsWithPermission)`,
            );
          } else {
            logger.error(
              `${CATEGORIZED_LOG_PREFIX} audit complete: ${gapsFound} plugin(s) declared permissions at runtime but are NOT listed in permission.rbac.pluginsWithPermission. Each is unenforced. See individual log entries above.`,
            );
          }
        });
      },
    });
  },
});
