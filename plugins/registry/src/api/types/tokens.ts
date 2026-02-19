// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export type TokenScope = 'read' | 'write' | 'admin';

export interface RegistryToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: TokenScope[];
  namespace: string | null;
  team: string | null;
  created_by: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface CreateTokenRequest {
  name: string;
  scopes: TokenScope[];
  namespace?: string;
  team?: string;
  expiresInDays?: number;
}

export interface CreateTokenResponse {
  token: RegistryToken;
  secretValue: string;
}
