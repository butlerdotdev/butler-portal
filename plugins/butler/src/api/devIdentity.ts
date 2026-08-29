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
const DEV_IDENTITY_STORAGE = 'butler-dev-identity';
const DEV_IDENTITY_PARAM = 'devRole';
export const DEV_IDENTITY_HEADER = 'x-butler-dev-identity';

/** Vite and rspack both inline this, so the body drops from prod bundles. */
const isDevBuild = process.env.NODE_ENV !== 'production';

/**
 * Tabs in one browser share a cookie jar, so a cookie can hold only one
 * identity for the whole browser. sessionStorage is per tab, which is what
 * lets five tabs of one window each review a different role.
 *
 * A tab claims its identity once, from `?devRole=` on the URL, and keeps it
 * for the life of the tab. The cookie remains the fallback, so a window
 * opened by the launcher still works.
 */
function captureFromUrl(): void {
  if (!isDevBuild || typeof window === 'undefined') {
    return;
  }
  try {
    const role = new URLSearchParams(window.location.search).get(
      DEV_IDENTITY_PARAM,
    );
    if (role) {
      window.sessionStorage.setItem(DEV_IDENTITY_STORAGE, role);
    }
  } catch {
    // A browser with storage disabled falls back to the cookie.
  }
}

captureFromUrl();

function fromSession(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage.getItem(DEV_IDENTITY_STORAGE) ?? undefined;
  } catch {
    return undefined;
  }
}

function fromCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const cookie = document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${DEV_IDENTITY_COOKIE}=`));
  if (!cookie) return undefined;
  return decodeURIComponent(cookie.slice(DEV_IDENTITY_COOKIE.length + 1));
}

export function devIdentityHeader(): Record<string, string> {
  if (!isDevBuild) {
    return {};
  }
  const value = fromSession() ?? fromCookie();
  return value ? { [DEV_IDENTITY_HEADER]: value } : {};
}
