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
import type { PipelineRole } from '@internal/plugin-pipeline-common';
import { hasMinRole } from '@internal/plugin-pipeline-common';

export type ErrorCode =
  | 'PIPELINE_NOT_FOUND'
  | 'VERSION_NOT_FOUND'
  | 'PIPELINE_ALREADY_EXISTS'
  | 'VALIDATION_ERROR'
  | 'VRL_COMPILE_ERROR'
  | 'VRL_EXECUTION_ERROR'
  | 'VRL_UNAVAILABLE'
  | 'DAG_INVALID'
  | 'CONFIG_COLLISION'
  | 'AGENT_NOT_FOUND'
  | 'TOKEN_NOT_FOUND'
  | 'GROUP_NOT_FOUND'
  | 'TOKEN_REVOKED'
  | 'TOKEN_EXPIRED'
  | 'DEPLOYMENT_NOT_FOUND'
  | 'GROUP_HAS_DEPLOYMENTS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR';

export class PipelineError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}

export function notFound(code: ErrorCode, message: string): PipelineError {
  return new PipelineError(404, code, message);
}

export function conflict(code: ErrorCode, message: string): PipelineError {
  return new PipelineError(409, code, message);
}

export function badRequest(
  message: string,
  details?: Record<string, unknown>,
): PipelineError {
  return new PipelineError(400, 'VALIDATION_ERROR', message, details);
}

export function unauthorized(message: string): PipelineError {
  return new PipelineError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message: string): PipelineError {
  return new PipelineError(403, 'FORBIDDEN', message);
}

export function serviceUnavailable(
  code: ErrorCode,
  message: string,
): PipelineError {
  return new PipelineError(503, code, message);
}

/**
 * Team ownership guard. Throws notFound if the resource belongs to a
 * different team than the active team context. Uses 404 (not 403) to
 * avoid leaking resource existence across teams.
 */
export function assertTeamAccess(
  resource: { team?: string | null } | null | undefined,
  activeTeam: string | undefined,
): void {
  if (!resource)
    throw notFound('PIPELINE_NOT_FOUND', 'Resource not found');
  if (activeTeam && resource.team && resource.team !== activeTeam) {
    throw notFound('PIPELINE_NOT_FOUND', 'Resource not found');
  }
}

/**
 * Team-scoped role check. Verifies that the user's role on the active
 * team meets the minimum required level. Skips the check only when no
 * active team is selected (admin view mode). When a team IS selected,
 * the user's actual team role is enforced — even for platform admins.
 */
export function requireMinRole(
  req: { activeTeam?: string; activeRole?: PipelineRole },
  minRole: PipelineRole,
): void {
  if (!req.activeTeam) return;
  if (!req.activeRole || !hasMinRole(req.activeRole, minRole)) {
    throw forbidden('Insufficient role for this action');
  }
}

export function sendError(res: Response, err: unknown): void {
  if (err instanceof PipelineError) {
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
