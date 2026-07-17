import { ConfigReader } from '@backstage/config';
import {
  auditPluginsWithPermission,
  DynamicPluginsForAudit,
} from './pluginsWithPermissionAuditModule';

// Tests the runtime audit's decision logic against injected mocks.
// The mechanism catches silent-passthrough — pins it here so an audit
// that never fires and an audit with nothing to find can be told apart
// in review, not only at runtime.
//
// Scenarios covered:
//   - no dynamic plugins loaded       -> info "nothing to audit"
//   - plugin declares perms + listed  -> no error
//   - plugin declares perms + unlisted -> error naming plugin id + count + consequence
//   - plugin listed + 404 on metadata -> info naming both possible causes
//   - plugin unlisted + 404           -> silent (debug only)
//   - plugin has no pluginId in manifest -> skipped with debug
//   - mixed multi-plugin              -> only the gap-plugin triggers error

type FakePlugin = { name: string; pluginId?: string | null };

function fakeDynamicPlugins(plugins: FakePlugin[]): DynamicPluginsForAudit<FakePlugin> {
  return {
    backendPlugins: () => plugins,
    getScannedPackage: (plugin: FakePlugin) => ({
      manifest: {
        name: plugin.name,
        backstage: { pluginId: plugin.pluginId },
      },
    }),
  };
}

function makeMockLogger() {
  const calls: Record<'info' | 'warn' | 'error' | 'debug', string[]> = {
    info: [],
    warn: [],
    error: [],
    debug: [],
  };
  const logger = {
    info: (msg: string) => {
      calls.info.push(msg);
    },
    warn: (msg: string) => {
      calls.warn.push(msg);
    },
    error: (msg: string) => {
      calls.error.push(msg);
    },
    debug: (msg: string) => {
      calls.debug.push(msg);
    },
    child: () => logger,
  } as unknown as import('@backstage/backend-plugin-api').LoggerService;
  return { logger, calls };
}

// Mock the global fetch API. Each test installs its own handler.
const originalFetch = globalThis.fetch;
function installFetch(handler: (url: string) => Response) {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = ((url: string) =>
    Promise.resolve(handler(url))) as unknown as typeof fetch;
}
afterEach(() => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
});

// Baseline stubs for the DI deps that this test does not exercise.
const stubDiscovery = {
  getBaseUrl: async (pluginId: string) => `http://localhost:7007/api/${pluginId}`,
  getExternalBaseUrl: async () => 'http://external',
};
const stubAuth = {
  getOwnServiceCredentials: async () => ({ principal: { type: 'service', subject: 't' } }),
  getPluginRequestToken: async () => ({ token: 'test-token' }),
} as unknown as import('@backstage/backend-plugin-api').AuthService;

function metadataResponse(permissions: Array<{ name: string }>): Response {
  return new Response(JSON.stringify({ permissions }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function notFoundResponse(): Response {
  return new Response('', { status: 404 });
}

describe('auditPluginsWithPermission', () => {
  it('emits info "nothing to audit" when no dynamic backend plugins are loaded', async () => {
    const { logger, calls } = makeMockLogger();
    await auditPluginsWithPermission({
      logger,
      config: new ConfigReader({
        permission: { rbac: { pluginsWithPermission: ['catalog'] } },
      }),
      discovery: stubDiscovery,
      auth: stubAuth,
      dynamicPlugins: fakeDynamicPlugins([]),
    });
    expect(calls.info.some(m => m.includes('nothing to audit'))).toBe(true);
    expect(calls.error).toHaveLength(0);
  });

  it('logs level=error naming plugin id + count + consequence when an unlisted plugin declares permissions', async () => {
    const { logger, calls } = makeMockLogger();
    installFetch(url => {
      if (url.includes('/api/foo/')) {
        return metadataResponse([{ name: 'foo.thing.read' }, { name: 'foo.thing.write' }]);
      }
      return notFoundResponse();
    });
    await auditPluginsWithPermission({
      logger,
      config: new ConfigReader({
        permission: { rbac: { pluginsWithPermission: ['catalog'] } },
      }),
      discovery: stubDiscovery,
      auth: stubAuth,
      dynamicPlugins: fakeDynamicPlugins([{ name: 'foo-pkg', pluginId: 'foo' }]),
    });
    const errText = calls.error.join('\n');
    expect(errText).toMatch(/plugin 'foo'/);
    expect(errText).toMatch(/declared 2 permission/);
    expect(errText).toMatch(/passes? through as ALLOW/);
    expect(errText).toMatch(/authz is NOT running/i);
    expect(errText).toMatch(/Add 'foo'/);
  });

  it('emits no error when a plugin declaring permissions is listed', async () => {
    const { logger, calls } = makeMockLogger();
    installFetch(url => {
      if (url.includes('/api/foo/')) {
        return metadataResponse([{ name: 'foo.thing.read' }]);
      }
      return notFoundResponse();
    });
    await auditPluginsWithPermission({
      logger,
      config: new ConfigReader({
        permission: { rbac: { pluginsWithPermission: ['catalog', 'foo'] } },
      }),
      discovery: stubDiscovery,
      auth: stubAuth,
      dynamicPlugins: fakeDynamicPlugins([{ name: 'foo-pkg', pluginId: 'foo' }]),
    });
    expect(calls.error).toHaveLength(0);
    expect(calls.info.some(m => m.includes('no gaps found'))).toBe(true);
  });

  it('surfaces info (not error) when a listed plugin returns 404, naming both possible causes', async () => {
    const { logger, calls } = makeMockLogger();
    installFetch(() => notFoundResponse());
    await auditPluginsWithPermission({
      logger,
      config: new ConfigReader({
        permission: { rbac: { pluginsWithPermission: ['catalog', 'foo'] } },
      }),
      discovery: stubDiscovery,
      auth: stubAuth,
      dynamicPlugins: fakeDynamicPlugins([{ name: 'foo-pkg', pluginId: 'foo' }]),
    });
    expect(calls.error).toHaveLength(0);
    const infoText = calls.info.join('\n');
    expect(infoText).toMatch(/plugin 'foo' is listed in permission\.rbac\.pluginsWithPermission/);
    expect(infoText).toMatch(/listing is stale/);
    expect(infoText).toMatch(/missing the registration call/);
  });

  it('is silent (debug only) when an unlisted plugin returns 404 — the by-design coverage limit', async () => {
    const { logger, calls } = makeMockLogger();
    installFetch(() => notFoundResponse());
    await auditPluginsWithPermission({
      logger,
      config: new ConfigReader({
        permission: { rbac: { pluginsWithPermission: ['catalog'] } },
      }),
      discovery: stubDiscovery,
      auth: stubAuth,
      dynamicPlugins: fakeDynamicPlugins([{ name: 'foo-pkg', pluginId: 'foo' }]),
    });
    expect(calls.error).toHaveLength(0);
    // No info line about the plugin specifically (info exists for the
    // "auditing N loaded plugins" summary + "no gaps found" close).
    expect(calls.info.some(m => m.includes("plugin 'foo'"))).toBe(false);
    // Debug line is present so operators tuning verbose logs can see it.
    expect(calls.debug.some(m => m.includes("plugin 'foo'"))).toBe(true);
  });

  it('skips plugin entries with no backstage.pluginId in manifest without erroring', async () => {
    const { logger, calls } = makeMockLogger();
    installFetch(() => notFoundResponse());
    await auditPluginsWithPermission({
      logger,
      config: new ConfigReader({
        permission: { rbac: { pluginsWithPermission: ['catalog'] } },
      }),
      discovery: stubDiscovery,
      auth: stubAuth,
      dynamicPlugins: fakeDynamicPlugins([{ name: 'anon-pkg', pluginId: null }]),
    });
    expect(calls.error).toHaveLength(0);
    expect(calls.debug.some(m => m.includes('has no backstage.pluginId'))).toBe(true);
  });

  it('flags only the gap plugin in a mixed set of one-listed + one-unlisted declaring plugins', async () => {
    const { logger, calls } = makeMockLogger();
    installFetch(url => {
      if (url.includes('/api/foo/')) return metadataResponse([{ name: 'foo.a.read' }]);
      if (url.includes('/api/bar/')) return metadataResponse([{ name: 'bar.b.write' }]);
      return notFoundResponse();
    });
    await auditPluginsWithPermission({
      logger,
      config: new ConfigReader({
        permission: { rbac: { pluginsWithPermission: ['catalog', 'foo'] } },
      }),
      discovery: stubDiscovery,
      auth: stubAuth,
      dynamicPlugins: fakeDynamicPlugins([
        { name: 'foo-pkg', pluginId: 'foo' },
        { name: 'bar-pkg', pluginId: 'bar' },
      ]),
    });
    // Two error lines: one per-plugin error for 'bar' + one summary.
    // Zero mentions of 'foo' in the per-plugin error lines.
    const errText = calls.error.join('\n');
    expect(errText).toMatch(/plugin 'bar'/);
    expect(errText).not.toMatch(/plugin 'foo'/);
    expect(errText).toMatch(/1 plugin\(s\) declared permissions at runtime/);
  });
});
