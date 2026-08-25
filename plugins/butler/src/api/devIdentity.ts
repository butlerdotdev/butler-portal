// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Local role review only.
 *
 * The portal reaches its backend with a bearer token rather than cookies,
 * so a review session has to name the identity it is acting as on the
 * request itself. The backend accepts the name only when its own dev
 * harness is enabled, maps it to one of the configured users, and lets
 * butler-server make every authorization decision for that user. Naming
 * an identity here cannot grant a capability the user does not have, and
 * in a production build this compiles to a constant false.
 */
const DEV_IDENTITY_COOKIE = 'butler-dev-identity';
export const DEV_IDENTITY_HEADER = 'x-butler-dev-identity';

/** Vite and rspack both inline this, so the body drops from prod bundles. */
const isDevBuild = process.env.NODE_ENV !== 'production';

export function devIdentityHeader(): Record<string, string> {
  if (!isDevBuild || typeof document === 'undefined') {
    return {};
  }
  const cookie = document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${DEV_IDENTITY_COOKIE}=`));
  if (!cookie) {
    return {};
  }
  const value = decodeURIComponent(
    cookie.slice(DEV_IDENTITY_COOKIE.length + 1),
  );
  return value ? { [DEV_IDENTITY_HEADER]: value } : {};
}
