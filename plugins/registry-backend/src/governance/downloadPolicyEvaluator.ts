// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { RegistryDatabase } from '../database/RegistryDatabase';
import { resolveEffectivePolicy } from './policyResolver';
import type {
  ArtifactRow,
  VersionRow,
  EnforcementLevel,
  PolicyEvaluationOutcome,
  PolicyRuleResult,
} from '../database/types';

export interface DownloadPolicyResult {
  outcome: PolicyEvaluationOutcome;
  enforcementLevel: EnforcementLevel;
  ruleResults: PolicyRuleResult[];
  warnings: string[];
}

/**
 * Evaluate download-time policy for an artifact version.
 *
 * Only rules relevant at download time are evaluated:
 * - requirePassingTests
 * - requirePassingValidate
 * - requiredScanGrade
 *
 * Approval-time rules (minApprovers, preventSelfApproval, autoApprovePatches)
 * are skipped since they don't apply to downloads.
 */
export async function evaluateDownloadPolicy(
  db: RegistryDatabase,
  artifact: ArtifactRow,
  version: VersionRow,
  actor?: string,
): Promise<DownloadPolicyResult> {
  const effective = await resolveEffectivePolicy(db, {
    id: artifact.id,
    namespace: artifact.namespace,
    team: artifact.team,
    approval_policy: artifact.approval_policy,
  });

  const ruleResults: PolicyRuleResult[] = [];
  const warnings: string[] = [];
  let hasFail = false;

  const rules = effective.rules;

  // Evaluate requirePassingTests
  if (rules.requirePassingTests) {
    const runs = await db.listRuns(artifact.id, { status: 'succeeded' });
    const hasPassingTest = runs.items.some(
      r => r.operation === 'test' && r.version === version.version && r.status === 'succeeded',
    );
    if (hasPassingTest) {
      ruleResults.push({ rule: 'requirePassingTests', result: 'pass' });
    } else {
      ruleResults.push({
        rule: 'requirePassingTests',
        result: 'fail',
        message: 'No passing test run found for this version',
      });
      warnings.push('Policy requires passing test run');
      hasFail = true;
    }
  }

  // Evaluate requirePassingValidate
  if (rules.requirePassingValidate) {
    const runs = await db.listRuns(artifact.id, { status: 'succeeded' });
    const hasPassingValidate = runs.items.some(
      r => r.operation === 'validate' && r.version === version.version && r.status === 'succeeded',
    );
    if (hasPassingValidate) {
      ruleResults.push({ rule: 'requirePassingValidate', result: 'pass' });
    } else {
      ruleResults.push({
        rule: 'requirePassingValidate',
        result: 'fail',
        message: 'No passing validate run found for this version',
      });
      warnings.push('Policy requires passing validate run');
      hasFail = true;
    }
  }

  // Evaluate requiredScanGrade
  if (rules.requiredScanGrade) {
    const scanResults = await db.getCiResults(version.id);
    const scans = scanResults.filter(r => r.result_type === 'security-scan');
    if (scans.length === 0) {
      ruleResults.push({
        rule: 'requiredScanGrade',
        result: 'fail',
        message: 'No security scan results found',
      });
      warnings.push(`Policy requires scan grade ${rules.requiredScanGrade} or better`);
      hasFail = true;
    } else {
      const gradeOrder = ['A', 'B', 'C', 'D', 'F'];
      const requiredIdx = gradeOrder.indexOf(rules.requiredScanGrade);
      const hasPassingGrade = scans.some(s => {
        const idx = gradeOrder.indexOf(s.grade ?? '');
        return idx >= 0 && idx <= requiredIdx;
      });
      if (hasPassingGrade) {
        ruleResults.push({ rule: 'requiredScanGrade', result: 'pass' });
      } else {
        ruleResults.push({
          rule: 'requiredScanGrade',
          result: 'fail',
          message: `Best scan grade does not meet required ${rules.requiredScanGrade}`,
        });
        warnings.push(`Policy requires scan grade ${rules.requiredScanGrade} or better`);
        hasFail = true;
      }
    }
  }

  // If no download-relevant rules exist, pass
  if (ruleResults.length === 0) {
    return {
      outcome: 'pass',
      enforcementLevel: effective.enforcementLevel,
      ruleResults: [],
      warnings: [],
    };
  }

  const outcome: PolicyEvaluationOutcome = hasFail
    ? (effective.enforcementLevel === 'warn' ? 'warn' : 'fail')
    : 'pass';

  // Record the evaluation (fire-and-forget)
  db.createPolicyEvaluation({
    artifact_id: artifact.id,
    version_id: version.id,
    trigger: 'download',
    enforcement_level: effective.enforcementLevel,
    rules_evaluated: ruleResults,
    outcome,
    actor,
  }).catch(() => {});

  return {
    outcome,
    enforcementLevel: effective.enforcementLevel,
    ruleResults,
    warnings,
  };
}
