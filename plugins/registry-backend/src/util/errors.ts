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

import { Response } from 'express';
import type { RegistryRole } from '@internal/plugin-registry-common';
import { hasMinRole } from '@internal/plugin-registry-common';

export type ErrorCode =
  | 'ARTIFACT_NOT_FOUND'
  | 'VERSION_NOT_FOUND'
  | 'VERSION_ALREADY_EXISTS'
  | 'ARTIFACT_ALREADY_EXISTS'
  | 'APPROVAL_DENIED'
  | 'INVALID_WEBHOOK_SIGNATURE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'RUN_NOT_FOUND'
  | 'TOKEN_NOT_FOUND'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'INSUFFICIENT_SCOPE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'BINDING_EXISTS'
  | 'INTEGRATION_NOT_FOUND'
  | 'VARIABLE_SET_NOT_FOUND'
  | 'RESOURCE_NOT_FOUND';

export class RegistryError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RegistryError';
  }
}

export function notFound(code: ErrorCode, message: string): RegistryError {
  return new RegistryError(404, code, message);
}

export function conflict(code: ErrorCode, message: string): RegistryError {
  return new RegistryError(409, code, message);
}

export function badRequest(message: string, details?: Record<string, unknown>): RegistryError {
  return new RegistryError(400, 'VALIDATION_ERROR', message, details);
}

export function unauthorized(message: string): RegistryError {
  return new RegistryError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message: string): RegistryError {
  return new RegistryError(403, 'FORBIDDEN', message);
}

/**
 * Team ownership guard. Throws notFound if the resource belongs to a
 * different team than the active team context. Uses 404 (not 403) to
 * avoid leaking resource existence across teams.
 *
 * Allows access when:
 * - No active team context (admin / standalone mode)
 * - Resource has no team (platform-wide resource)
 * - Teams match
 */
export function assertTeamAccess(
  resource: { team?: string | null } | null | undefined,
  activeTeam: string | undefined,
): void {
  if (!resource) throw notFound('ARTIFACT_NOT_FOUND', 'Resource not found');
  if (activeTeam && resource.team && resource.team !== activeTeam) {
    throw notFound('ARTIFACT_NOT_FOUND', 'Resource not found');
  }
}

/**
 * Team-scoped role check. Verifies that the user's role on the active
 * team meets the minimum required level. Skips the check in admin mode
 * (no active team) — the Backstage permission framework handles that.
 */
export function requireMinRole(
  req: { activeTeam?: string; activeRole?: RegistryRole },
  minRole: RegistryRole,
): void {
  if (!req.activeTeam) return;
  if (!req.activeRole || !hasMinRole(req.activeRole, minRole)) {
    throw forbidden('Insufficient role for this action');
  }
}

export function sendError(res: Response, err: unknown): void {
  if (err instanceof RegistryError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({
    error: {
      message,
      code: 'INTERNAL_ERROR' as ErrorCode,
    },
  });
}
