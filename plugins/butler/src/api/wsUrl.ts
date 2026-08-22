// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Builds the WebSocket URL for a butler-backend relay path from the plugin's
 * discovered HTTP base URL. The discovery base URL already ends in
 * `/api/butler`, so `path` is appended relative to that prefix.
 */
export function buildButlerWsUrl(baseUrl: string, path: string): string {
  const origin = baseUrl.replace(/^http/, 'ws').replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${suffix}`;
}
