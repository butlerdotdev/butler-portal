// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * One audit event as butler-server records it (`internal/audit.Event`).
 * The server writes an event for every mutation and for the two reads
 * that hand out material (kubeconfig, export), plus sign-in events.
 * `requestSummary` is the request body after the server's scrubber and
 * truncated; `user` is the caller's email, or "anonymous".
 */
export interface AuditEntry {
  timestamp: string;
  user: string;
  /** create | update | delete | scale | export | download-kubeconfig | login | logout | group-sync | get */
  action: string;
  /** Server-derived from the path prefix; "Unknown" for nested admin routes. */
  resourceType?: string;
  /** The `{name}` path parameter of the request, when the route has one. */
  resourceName?: string;
  resourceNamespace?: string;
  /**
   * The team the caller was acting as (the X-Butler-Team context on the
   * request), not the team that owns the resource. Team audit filters on
   * this field.
   */
  teamRef?: string;
  httpMethod?: string;
  path?: string;
  statusCode?: number;
  success: boolean;
  requestSummary?: string;
  errorMessage?: string;
  sourceIP?: string;
  /** Identity provider for sign-in events. */
  provider?: string;
}

export interface AuditListResponse {
  entries: AuditEntry[] | null;
  total: number;
  offset: number;
  limit: number;
}

/** Query parameters `parseAuditQuery` accepts; limit is 1 to 200, default 50. */
export interface AuditQuery {
  user?: string;
  action?: string;
  resourceType?: string;
  success?: 'true' | 'false';
  /** RFC3339 or YYYY-MM-DD. */
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function auditQueryString(query: AuditQuery): string {
  const params = new URLSearchParams();
  for (const key of [
    'user',
    'action',
    'resourceType',
    'success',
    'from',
    'to',
  ] as const) {
    const v = query[key];
    if (v) params.set(key, String(v));
  }
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
