// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

// ── Enums ────────────────────────────────────────────────────────────

export type VariableSetStatus = 'active' | 'archived';
export type VariableCategory = 'terraform' | 'env';

// ── Variable Set ─────────────────────────────────────────────────────

export interface VariableSet {
  id: string;
  name: string;
  description: string | null;
  team: string | null;
  auto_attach: boolean;
  status: VariableSetStatus;
  entry_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VariableSetEntry {
  id?: string;
  key: string;
  value: string | null;
  sensitive: boolean;
  hcl: boolean;
  category: VariableCategory;
  description: string | null;
  ci_secret_name: string | null;
}

export interface CreateVariableSetRequest {
  name: string;
  description?: string;
  auto_attach?: boolean;
}

export interface VariableSetBinding {
  id: string;
  variable_set_id: string;
  set_name: string;
  priority: number;
}

// ── Resolved Variables (debug/preview) ───────────────────────────────

export interface ResolvedVariable {
  key: string;
  value: string | null;
  source: string;
  sensitive: boolean;
  category: VariableCategory;
}
