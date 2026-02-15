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
}): Promise<Router> {
  const { baseUrl, authManager, httpAuth, userInfo, auth, logger } = options;
  const targetUrl = baseUrl.replace(/\/+$/, '');

  const router = Router();

  // WebSocket relay setup
  // We use noServer mode because Backstage owns the HTTP server.
  // On the first incoming HTTP request, we grab the server reference
  // and attach an upgrade listener for butler WebSocket paths.
  const wss = new WebSocketServer({ noServer: true });
  let upgradeHandlerAttached = false;

  router.use((req: Request, _res: Response, next) => {
    if (!upgradeHandlerAttached) {
      const server = (req as any).socket?.server;
      if (server) {
        server.on(
          'upgrade',
          (request: IncomingMessage, socket: Duplex, head: Buffer) => {
            const pathname = request.url || '';

            // Only handle WebSocket upgrades for butler plugin paths
            if (pathname.startsWith('/api/butler/ws/')) {
              wss.handleUpgrade(request, socket as any, head, clientWs => {
                // Strip /api/butler prefix to get butler-server path
                const wsPath = pathname.replace('/api/butler', '');
                handleWsRelay(clientWs, wsPath, targetUrl, authManager, logger);
              });
            }
            // For non-matching paths, don't consume the socket —
            // other upgrade handlers (e.g., webpack HMR) will handle them.
          },
        );
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
      if (userEmail) {
        const fullEmail = userEmail.includes('@')
          ? userEmail
          : `${userEmail}@butlerlabs.dev`;
        forwardHeaders['X-Butler-User-Email'] = fullEmail;
      }

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
) {
  try {
    const token = await authManager.getToken();
    const wsTargetUrl = targetUrl.replace(/^http/, 'ws') + path;

    logger.info('Opening WebSocket relay', { path, target: wsTargetUrl });

    const serverWs = new WebSocket(wsTargetUrl, {
      headers: { Authorization: `Bearer ${token}` },
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
