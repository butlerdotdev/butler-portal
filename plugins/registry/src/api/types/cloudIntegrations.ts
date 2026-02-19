// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

// ── Enums ────────────────────────────────────────────────────────────

export type CloudProvider = 'aws' | 'gcp' | 'azure' | 'custom';
export type AuthMethod = 'oidc' | 'static' | 'assume_role';
export type CloudIntegrationStatus = 'active' | 'disabled' | 'error';

// ── Cloud Integration ────────────────────────────────────────────────

export interface CloudIntegration {
  id: string;
  name: string;
  description: string | null;
  team: string | null;
  provider: CloudProvider;
  auth_method: AuthMethod;
  credential_config: Record<string, unknown>;
  supported_ci_providers: string[] | null;
  status: CloudIntegrationStatus;
  last_validated_at: string | null;
  validation_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCloudIntegrationRequest {
  name: string;
  description?: string;
  provider: CloudProvider;
  auth_method: AuthMethod;
  credential_config: Record<string, unknown>;
  supported_ci_providers?: string[];
}

export interface CloudIntegrationBinding {
  id: string;
  cloud_integration_id: string;
  integration_name: string;
  provider: CloudProvider;
  auth_method: AuthMethod;
  priority: number;
}

export interface ValidateCloudIntegrationResponse {
  valid: boolean;
  error?: string;
}
