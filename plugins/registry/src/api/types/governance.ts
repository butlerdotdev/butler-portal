// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export interface GovernanceSummary {
  pendingApprovals: number;
  approvedVersions: number;
  rejectedVersions: number;
  totalArtifacts: number;
}

export interface PendingApproval {
  id: string;
  artifact_id: string;
  version: string;
  artifact_name: string;
  artifact_namespace: string;
  artifact_type: string;
  published_by: string | null;
  created_at: string;
}

export interface ApprovalListResponse {
  items: PendingApproval[];
  totalCount: number;
}

export interface StalenessAlert {
  artifactId: string;
  namespace: string;
  name: string;
  type: string;
  lastUpdated: string;
  daysSinceUpdate: number;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  resource_name: string | null;
  resource_namespace: string | null;
  version: string | null;
  details: Record<string, unknown> | null;
  occurred_at: string;
}

export interface AuditLogResponse {
  items: AuditEntry[];
  totalCount: number;
  nextCursor: string | null;
}

export interface AuditLogOptions {
  cursor?: string;
  limit?: number;
  resource_type?: string;
  action?: string;
}
