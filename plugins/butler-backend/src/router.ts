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

import { Request, Response, Router } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import {
  LoggerService,
  HttpAuthService,
  UserInfoService,
  AuthService,
} from '@backstage/backend-plugin-api';
import { AuthManager } from './service/AuthManager';
import { PortalSigner } from './service/PortalSigner';

/**
 * applyPortalCarrierSwap is the Stage 2 per-request carrier switch.
 *
 * When PortalSigner is null (Stage 2 dormant default, and the steady state
 * in any deployment that has not yet mounted a signing key Secret), this
 * function is a no-op: forwardHeaders stays exactly as the caller built
 * them, which means the legacy admin Bearer plus X-Butler-User-Email
 * carrier reaches butler-server byte-identically to pre-Stage-2 traffic.
 *
 * When PortalSigner is non-null AND we have a resolved user identity,
 * the function replaces forwardHeaders.Authorization with a portal-minted
 * Ed25519 proof keyed by subEmail, and deletes any X-Butler-User-Email
 * header (the proof's sub claim carries the identity end-to-end; the
 * legacy impersonation header becomes redundant and is removed so
 * butler-server's pre-Stage-4 header-trust branch does not also fire).
 *
 * The function mutates forwardHeaders in place so the call sites keep the
 * legacy header-building code verbatim and add a single line that applies
 * the swap at the end.
 *
 * Exported for unit testing of the load-bearing per-request switch.
 */
export function applyPortalCarrierSwap(opts: {
  forwardHeaders: Record<string, string>;
  portalSigner: PortalSigner | null;
  subEmail: string | undefined;
}): void {
  const { forwardHeaders, portalSigner, subEmail } = opts;
  if (portalSigner && subEmail) {
    forwardHeaders.Authorization = `Bearer ${portalSigner.sign(subEmail)}`;
    delete forwardHeaders['X-Butler-User-Email'];
  }
}

/**
 * Creates an Express router that proxies all requests to butler-server.
 *
 * The router:
 * - Strips the Backstage plugin prefix (e.g., /api/butler)
 * - Adds the /api prefix expected by butler-server for HTTP routes
 * - Adds the butler-server JWT Authorization header
 * - Extracts the Backstage user's email and forwards it as X-Butler-User-Email
 * - Forwards the X-Butler-Team header from incoming requests
 * - Handles WebSocket upgrade for /ws/* paths via manual relay
 */
export async function createRouter(options: {
  baseUrl: string;
  authManager: AuthManager;
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  auth: AuthService;
  logger: LoggerService;
  // Stage 2: when non-null and a user identity is resolvable, outgoing
  // proxy + WS-relay requests carry a portal-minted Ed25519 proof in
  // Authorization (no X-Butler-User-Email). When null (Stage 2 default
  // until the chart mounts a signing key Secret) the legacy carrier path
  // is unchanged.
  portalSigner?: PortalSigner | null;
}): Promise<Router> {
  const { baseUrl, authManager, httpAuth, userInfo, auth, logger } = options;
  const portalSigner = options.portalSigner ?? null;
  const targetUrl = baseUrl.replace(/\/+$/, '');

  const router = Router();

  // WebSocket relay setup. We use noServer mode because Backstage does not
  // expose the http.Server to plugins at init time: RootHttpRouterService
  // and HttpRouterService only expose `use`, and the server is captured
  // inside @backstage/backend-defaults's rootHttpRouterServiceFactory and
  // never handed to plugins. The only way to reach the server from a
  // plugin is `req.socket.server` from an Express middleware, so the
  // upgrade listener is necessarily attached lazily on the first incoming
  // HTTP request to /api/butler.
  //
  // The window between server.listen and that first request is benign:
  // Node's http.Server silently closes upgrade connections when no
  // 'upgrade' listener is registered (per Node docs for the 'upgrade'
  // event). An upgrade attempt during the window is dropped, not passed
  // through unauthenticated. The only observable effect is that a very
  // early legitimate WebSocket client fails to connect and must retry
  // after the first HTTP request lands. No auth-bypass path exists during
  // the window, so a synchronous attach is not required for correctness.
  //
  // The upgradeHandlerAttached boolean is the idempotency guard: the
  // listener is registered exactly once across the process lifetime,
  // regardless of how many requests race through this middleware.
  const wss = new WebSocketServer({ noServer: true });
  const upgradeHandler = createButlerUpgradeHandler({
    httpAuth,
    wss,
    targetUrl,
    authManager,
    logger,
    portalSigner,
    userInfo,
    auth,
  });
  let upgradeHandlerAttached = false;

  router.use((req: Request, _res: Response, next) => {
    if (!upgradeHandlerAttached) {
      const server = (req as any).socket?.server;
      if (server) {
        server.on('upgrade', upgradeHandler);
        upgradeHandlerAttached = true;
        logger.info('WebSocket upgrade handler attached to HTTP server');
      }
    }
    next();
  });

  /**
   * Resolves the Backstage user's email from the request credentials.
   * Returns undefined if the user is not authenticated or is a guest.
   */
  async function resolveUserEmail(req: Request): Promise<string | undefined> {
    try {
      const credentials = await httpAuth.credentials(req, {
        allow: ['user'],
      });

      if (auth.isPrincipal(credentials, 'user')) {
        const info = await userInfo.getUserInfo(credentials);
        // userEntityRef is like "user:default/abagan"
        const entityRef = info.userEntityRef;
        // For now, we don't have a catalog lookup — derive email from the
        // entity name + configured domain. The entity name comes from the
        // email local part set in our sign-in resolver.
        const name = entityRef.split('/').pop();
        if (name && name.includes('@')) {
          return name;
        }
        // If the entity ref doesn't contain @, this is a local-part-only ref.
        // We can't derive the full email without more context.
        // Return the name so the frontend at least has the identity.
        return name || undefined;
      }
    } catch {
      // Not authenticated or guest user — fall through
    }
    return undefined;
  }

  /**
   * Helper to call butler-server as the service account.
   */
  async function butlerFetch(path: string): Promise<any> {
    const token = await authManager.getToken();
    const nodeFetch = await import('node-fetch');
    const fetch = nodeFetch.default;
    const response = await fetch(`${targetUrl}/api${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return response.json();
  }

  /**
   * GET /_identity
   *
   * Returns the current Backstage user's Butler identity:
   * - email, displayName (from Backstage identity)
   * - isPlatformAdmin, teams (resolved from butler-server)
   *
   * This bridges the gap between Backstage auth and butler-server auth:
   * the proxy authenticates to butler-server with a service account, but
   * this endpoint resolves the actual user's permissions and team memberships.
   */

  /**
   * GET /_health
   *
   * Unauthenticated monitoring endpoint. Returns AuthManager's current
   * state without going through Backstage default-deny so external
   * monitoring tools (Prometheus blackbox, Pingdom, etc.) can poll it
   * without a Backstage session.
   *
   * Response shape:
   *   200 OK    { status: "ok",       authenticated: true,  tokenExpiresAt: <unix-seconds> }
   *   503 Down  { status: "degraded", authenticated: false, lastError: "<message>" }
   *
   * This is intentionally NOT wired to the chart's readiness probe. The
   * probe stays on the global /healthcheck path so a degraded butler
   * plugin does not take down the IDP shell, catalog, or TechDocs. The
   * endpoint exists for operator-facing alerting, not kubelet signals.
   *
   * The lastError field surfaces the message from the most recent failed
   * login attempt. butler-server's auth error responses are non-sensitive
   * today (e.g., `{"error":"Invalid credentials"}`); no credentials or
   * tokens are included in the lastError text.
   *
   * Forward-compat note: lastError contains a substring of butler-server's
   * HTTP error response body. If butler-server's auth-error response shape
   * ever evolves to include sensitive details (user identifiers, partial
   * tokens, internal diagnostics), those would leak via this unauthenticated
   * endpoint. Either sanitize lastError here before returning, or audit
   * butler-server's error responses before any /api/auth/* changes ship.
   * Tracked in the followup queue.
   */
  router.get('/_health', (_req: Request, res: Response) => {
    const snapshot = authManager.getHealthSnapshot();
    if (snapshot.authenticated) {
      res.status(200).json({ status: 'ok', ...snapshot });
    } else {
      res.status(503).json({ status: 'degraded', ...snapshot });
    }
  });

  router.get('/_identity', async (req: Request, res: Response) => {
    try {
      const userLocalPart = await resolveUserEmail(req);

      if (!userLocalPart) {
        res.json({
          authenticated: false,
          email: null,
          displayName: 'Guest',
          isPlatformAdmin: false,
          teams: [],
        });
        return;
      }

      // Try to find the user in butler-server by listing all users
      // and matching on email
      const usersResponse = await butlerFetch('/users');
      const users = usersResponse?.users ?? [];

      // Match on email or username
      let matchedUser: any = null;
      for (const u of users) {
        const userEmail = u.email || u.metadata?.name || '';
        const userName = u.username || u.metadata?.name || '';
        if (
          userEmail.toLowerCase().startsWith(userLocalPart.toLowerCase() + '@') ||
          userEmail.toLowerCase() === userLocalPart.toLowerCase() ||
          userName.toLowerCase() === userLocalPart.toLowerCase()
        ) {
          matchedUser = u;
          break;
        }
      }

      const isPlatformAdmin = matchedUser?.isPlatformAdmin === true ||
        matchedUser?.isAdmin === true ||
        matchedUser?.role === 'admin';

      // Get all teams and check membership for this user
      const teamsResponse = await butlerFetch('/teams');
      const allTeams = teamsResponse?.teams ?? [];

      const userTeams: any[] = [];

      for (const team of allTeams) {
        const teamName = team.name || team.metadata?.name;
        if (!teamName) continue;

        const membersResponse = await butlerFetch(`/teams/${teamName}/members`);
        const members = membersResponse?.members ?? [];

        for (const member of members) {
          const memberEmail = member.email || '';
          const memberName = member.username || member.name || '';
          if (
            memberEmail.toLowerCase().startsWith(userLocalPart.toLowerCase() + '@') ||
            memberEmail.toLowerCase() === userLocalPart.toLowerCase() ||
            memberName.toLowerCase() === userLocalPart.toLowerCase()
          ) {
            userTeams.push({
              ...team,
              role: member.role || 'viewer',
            });
            break;
          }
        }
      }

      // Construct the canonical email. This MUST match what we send as
      // X-Butler-User-Email in proxy requests so workspace ownership,
      // SSH key resolution, and dashboard filtering all use the same email.
      const canonicalEmail = userLocalPart.includes('@')
        ? userLocalPart
        : `${userLocalPart}@butlerlabs.dev`;

      logger.info('Resolved Backstage user identity', {
        user: userLocalPart,
        email: canonicalEmail,
        isPlatformAdmin,
        teamCount: userTeams.length,
      });

      res.json({
        authenticated: true,
        email: canonicalEmail,
        displayName: matchedUser?.name || matchedUser?.displayName || userLocalPart,
        isPlatformAdmin,
        teams: userTeams,
      });
    } catch (err) {
      logger.error('Failed to resolve user identity', { error: String(err) });
      res.status(500).json({
        error: 'Failed to resolve user identity',
        message: String(err),
      });
    }
  });

  // Proxy all HTTP requests to butler-server
  router.all('/*', async (req: Request, res: Response) => {
    try {
      const token = await authManager.getToken();

      // Build the butler-server target path.
      // req.path is relative to this router's mount point.
      // All butler-server API endpoints are under /api, so prefix with /api.
      const targetPath = `/api${req.path}`;
      const targetUrlFull = `${targetUrl}${targetPath}`;

      // Build forwarded headers
      const forwardHeaders: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };

      // Extract Backstage user email and forward it.
      // The sign-in resolver creates entity refs from the email local part
      // (e.g., abagan@butlerlabs.dev → user:default/abagan), so we may
      // only get the local part. Reconstruct the full email for the server
      // to use as the effective user identity.
      const userEmail = await resolveUserEmail(req);
      let fullEmail: string | undefined;
      if (userEmail) {
        fullEmail = userEmail.includes('@')
          ? userEmail
          : `${userEmail}@butlerlabs.dev`;
        forwardHeaders['X-Butler-User-Email'] = fullEmail;
      }

      // Stage 2 carrier switch. When PortalSigner is null (the production
      // default until Stage 3 mounts the signing key Secret) this is a
      // no-op and the legacy admin Bearer + X-Butler-User-Email above
      // reaches butler-server byte-identically. When activated, the proof
      // replaces the Authorization Bearer and the impersonation header is
      // dropped.
      applyPortalCarrierSwap({ forwardHeaders, portalSigner, subEmail: fullEmail });

      // Forward content-type if present
      if (req.headers['content-type']) {
        forwardHeaders['Content-Type'] = req.headers['content-type'] as string;
      }

      // Forward accept header if present
      if (req.headers['accept']) {
        forwardHeaders['Accept'] = req.headers['accept'] as string;
      }

      // Forward X-Butler-Team header for team-scoped requests
      if (req.headers['x-butler-team']) {
        forwardHeaders['X-Butler-Team'] = req.headers[
          'x-butler-team'
        ] as string;
      }

      // Forward X-Request-ID for tracing
      if (req.headers['x-request-id']) {
        forwardHeaders['X-Request-ID'] = req.headers[
          'x-request-id'
        ] as string;
      }

      logger.debug('Proxying request to butler-server', {
        method: req.method,
        incomingPath: req.path,
        targetPath,
        userEmail: userEmail || 'anonymous',
      });

      // Determine the request body.
      // Backstage's Express middleware (express.json()) parses the body before
      // it reaches plugin routers, so req.on('data') yields nothing. We must
      // re-serialize req.body when it has already been parsed.
      let body: Buffer | string | undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.body !== undefined && req.body !== null && Object.keys(req.body).length > 0) {
          // Body was already parsed by Express middleware
          body = JSON.stringify(req.body);
          forwardHeaders['Content-Type'] = 'application/json';
        } else {
          // Try reading raw stream as fallback (e.g., non-JSON bodies)
          const bodyChunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => bodyChunks.push(chunk));
          await new Promise<void>((resolve, reject) => {
            req.on('end', resolve);
            req.on('error', reject);
          });
          const rawBody = Buffer.concat(bodyChunks);
          if (rawBody.length > 0) {
            body = rawBody;
          }
        }
      }

      // Use dynamic import for node-fetch to handle ESM/CJS
      const nodeFetch = await import('node-fetch');
      const fetch = nodeFetch.default;

      const proxyResponse = await fetch(targetUrlFull, {
        method: req.method,
        headers: forwardHeaders,
        body,
        redirect: 'manual',
      });

      // Forward response status
      res.status(proxyResponse.status);

      // Forward response headers (skip hop-by-hop headers)
      const hopByHop = new Set([
        'connection',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailers',
        'transfer-encoding',
        'upgrade',
      ]);

      proxyResponse.headers.forEach((value, name) => {
        if (!hopByHop.has(name.toLowerCase())) {
          res.setHeader(name, value);
        }
      });

      // Stream the response body
      if (proxyResponse.body) {
        proxyResponse.body.pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      logger.error('Failed to proxy request to butler-server', {
        method: req.method,
        path: req.path,
        error: String(err),
      });

      if (!res.headersSent) {
        res.status(502).json({
          error: 'Failed to proxy request to butler-server',
          message: String(err),
        });
      }
    }
  });

  return router;
}

/**
 * Builds the http.Server 'upgrade' listener for /api/butler/ws/* paths.
 *
 * Defense-in-depth role: the framework's HTTP credentialsBarrier is the
 * primary authentication gate for plugin routes, but it only runs on HTTP
 * requests, not on raw WebSocket upgrades. This listener exists to ensure
 * that the day a WebSocket route is added to this plugin, an upgrade
 * arriving directly on /api/butler/ws/* is authenticated before the
 * handshake completes. The path is deliberately retained even though no
 * production WebSocket route currently exercises it; deleting it would
 * remove the only guard for that future code path, and recreating it
 * later would be done without the context that produced it. Per-action
 * authorization (P0 #3 / P1 #4) is a separate downstream concern that
 * layers on top of this authentication check.
 *
 * Non-matching paths are not consumed: other 'upgrade' listeners on the
 * same http.Server (for example, webpack HMR in dev mode) remain free to
 * handle them.
 *
 * Extracted as a named factory so the guard logic can be unit-tested
 * directly without standing up a Backstage backend or http.Server.
 */
export function createButlerUpgradeHandler(deps: {
  httpAuth: HttpAuthService;
  wss: WebSocketServer;
  targetUrl: string;
  authManager: AuthManager;
  logger: LoggerService;
  // Stage 2 optional deps. When portalSigner, userInfo, and auth are ALL
  // provided, the upgrade handler resolves the user identity from the
  // upgrade credentials and threads it into handleWsRelay so the outgoing
  // WebSocket carries a portal-minted proof. When any of the three is
  // absent (the default; the unmodified existing test scaffold also omits
  // them), the legacy admin-Bearer carrier is preserved unchanged.
  portalSigner?: PortalSigner | null;
  userInfo?: UserInfoService;
  auth?: AuthService;
}): (request: IncomingMessage, socket: Duplex, head: Buffer) => void {
  const {
    httpAuth,
    wss,
    targetUrl,
    authManager,
    logger,
    portalSigner,
    userInfo,
    auth,
  } = deps;
  return (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = request.url || '';
    if (!pathname.startsWith('/api/butler/ws/')) {
      return;
    }
    // allowLimitedAccess: a browser WebSocket carries no Authorization
    // header; the caller is identified by the backstage-auth cookie the
    // frontend obtains from this plugin's cookie endpoint.
    httpAuth
      .credentials(request as any, {
        allow: ['user', 'service'],
        allowLimitedAccess: true,
      })
      .then(async credentials => {
        // Resolve the acting user's email when the Stage 2 carrier is
        // configured AND the credentials principal is a user. This mirrors
        // the HTTP proxy's resolveUserEmail: entity ref local part with
        // butlerlabs.dev domain fallback. When portalSigner is null or
        // the upgrade is a service-principal call, subEmail stays
        // undefined and handleWsRelay falls back to the legacy carrier.
        let subEmail: string | undefined;
        if (
          portalSigner &&
          userInfo &&
          auth &&
          auth.isPrincipal(credentials, 'user')
        ) {
          try {
            const info = await userInfo.getUserInfo(credentials);
            const name = info.userEntityRef.split('/').pop();
            if (name) {
              subEmail = name.includes('@')
                ? name
                : `${name}@butlerlabs.dev`;
            }
          } catch {
            // Identity resolution failure falls through to the legacy
            // carrier rather than rejecting the upgrade. Same posture as
            // the HTTP path's resolveUserEmail catch.
          }
        }
        wss.handleUpgrade(request, socket as any, head, clientWs => {
          const wsPath = pathname.replace('/api/butler', '');
          handleWsRelay(
            clientWs,
            wsPath,
            targetUrl,
            authManager,
            logger,
            portalSigner ?? null,
            subEmail,
          );
        });
      })
      .catch(() => {
        socket.end(
          'HTTP/1.1 401 Unauthorized\r\n' +
            'WWW-Authenticate: Bearer\r\n' +
            'Connection: close\r\n' +
            'Content-Length: 0\r\n' +
            '\r\n',
        );
      });
  };
}

/**
 * Relays WebSocket messages between a client connection (from the browser)
 * and butler-server. This bypasses Express routing (which doesn't handle
 * WebSocket upgrades) by using the ws library directly.
 */
async function handleWsRelay(
  clientWs: WebSocket,
  path: string,
  targetUrl: string,
  authManager: AuthManager,
  logger: LoggerService,
  portalSigner: PortalSigner | null = null,
  subEmail: string | undefined = undefined,
) {
  try {
    const token = await authManager.getToken();
    const wsTargetUrl = targetUrl.replace(/^http/, 'ws') + path;

    logger.info('Opening WebSocket relay', { path, target: wsTargetUrl });

    // Stage 2 carrier switch, mirrored from the HTTP proxy via the same
    // applyPortalCarrierSwap helper. With portalSigner null (Stage 2
    // default and the legacy production carrier) wsHeaders keeps Bearer
    // admin token unchanged. With portalSigner active and subEmail
    // resolved from the upgrade credentials, Authorization is replaced
    // with the portal-minted proof.
    const wsHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    applyPortalCarrierSwap({ forwardHeaders: wsHeaders, portalSigner, subEmail });

    const serverWs = new WebSocket(wsTargetUrl, {
      headers: wsHeaders,
    });

    let alive = true;
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    serverWs.on('open', () => {
      logger.debug('WebSocket relay connected to butler-server');

      // Send pings to the browser every 20s. The browser auto-responds
      // with pongs (WebSocket protocol). This keeps the browser→relay
      // connection alive through proxies and prevents idle timeouts.
      pingInterval = setInterval(() => {
        if (clientWs.readyState === WebSocket.OPEN) {
          if (!alive) {
            logger.debug('Client WebSocket ping timeout, closing');
            clientWs.terminate();
            return;
          }
          alive = false;
          clientWs.ping();
        }
      }, 20_000);
    });

    // Track browser pong responses
    clientWs.on('pong', () => {
      alive = true;
    });

    // Relay: butler-server → client
    // The isBinary flag preserves text vs binary frame type through the relay.
    // butler-server sends text frames; without this, ws sends Buffers as binary
    // and the browser receives Blob objects instead of strings.
    serverWs.on('message', (data, isBinary) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });

    // Relay: client → butler-server
    clientWs.on('message', (data, isBinary) => {
      if (serverWs.readyState === WebSocket.OPEN) {
        serverWs.send(data, { binary: isBinary });
      }
    });

    const cleanup = () => {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    };

    // Handle butler-server close
    // Close codes 1004-1006, 1015 are reserved and cannot be sent in a
    // close frame — only forward codes that are valid for the ws library.
    serverWs.on('close', (code, reason) => {
      logger.debug('Butler-server WebSocket closed', { code });
      cleanup();
      if (clientWs.readyState === WebSocket.OPEN) {
        const safeCode =
          code >= 1000 && code <= 4999 && ![1004, 1005, 1006, 1015].includes(code)
            ? code
            : 1000;
        clientWs.close(safeCode, reason);
      }
    });

    // Handle client close
    clientWs.on('close', (code, reason) => {
      logger.debug('Client WebSocket closed', { code });
      cleanup();
      if (serverWs.readyState === WebSocket.OPEN) {
        const safeCode =
          code >= 1000 && code <= 4999 && ![1004, 1005, 1006, 1015].includes(code)
            ? code
            : 1000;
        serverWs.close(safeCode, reason);
      }
    });

    // Handle butler-server error
    serverWs.on('error', err => {
      logger.error('Butler-server WebSocket error', { error: String(err) });
      cleanup();
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(1011, 'Server connection error');
      }
    });

    // Handle client error
    clientWs.on('error', err => {
      logger.error('Client WebSocket error', { error: String(err) });
      cleanup();
      if (serverWs.readyState === WebSocket.OPEN) {
        serverWs.close(1011, 'Client connection error');
      }
    });
  } catch (err) {
    logger.error('Failed to establish WebSocket relay', {
      error: String(err),
    });
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, 'Failed to establish relay');
    }
  }
}
