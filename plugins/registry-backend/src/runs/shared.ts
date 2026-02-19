// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import crypto from 'crypto';

/**
 * Generate a callback token and its SHA256 hash.
 * The plaintext token is returned once to the caller and never stored.
 * Only the hash is persisted in the database.
 */
export function generateCallbackToken(): {
  token: string;
  tokenHash: string;
} {
  const token = `brce_${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  return { token, tokenHash };
}

/**
 * Verify a callback token against its stored hash.
 */
export function verifyCallbackTokenHash(
  token: string,
  expectedHash: string,
): boolean {
  const tokenHash = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  return tokenHash === expectedHash;
}

/**
 * Extract Bearer token from Authorization header.
 * Returns null if header is missing or malformed.
 */
export function extractBearerToken(
  authHeader: string | undefined,
): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

/**
 * Terminal statuses for module runs — updates should be rejected for these.
 */
export const TERMINAL_MODULE_RUN_STATUSES = [
  'cancelled',
  'timed_out',
  'discarded',
  'skipped',
] as const;

/**
 * Active module run statuses — only one run in these states per module.
 */
export const ACTIVE_MODULE_RUN_STATUSES = [
  'running',
  'planned',
  'applying',
] as const;
