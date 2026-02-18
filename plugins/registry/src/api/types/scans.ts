// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export type ScanGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface ScanResult {
  id: string;
  version_id: string;
  result_type: string;
  scanner: string | null;
  grade: ScanGrade | null;
  summary: Record<string, unknown>;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface CostEstimate {
  id: string;
  version_id: string;
  result_type: 'cost-estimate';
  scanner: string | null;
  summary: {
    monthlyCost?: number;
    currency?: string;
  };
  details: Record<string, unknown> | null;
  created_at: string;
}
