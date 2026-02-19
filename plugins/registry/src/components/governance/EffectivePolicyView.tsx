// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  makeStyles,
} from '@material-ui/core';
import { Progress, EmptyState } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import type {
  EffectivePolicy,
  PolicyEvaluation,
  EnforcementLevel,
} from '../../api/types/policies';

const useStyles = makeStyles(theme => ({
  section: {
    marginTop: theme.spacing(3),
  },
  enforcementChip: {
    marginBottom: theme.spacing(2),
  },
  blockChip: {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
  },
  warnChip: {
    backgroundColor: theme.palette.warning.main,
    color: theme.palette.warning.contrastText,
  },
  auditChip: {
    backgroundColor: theme.palette.grey[500],
    color: theme.palette.common.white,
  },
  passChip: {
    backgroundColor: theme.palette.success.main,
    color: theme.palette.success.contrastText,
  },
  failChip: {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
  },
  warnOutcomeChip: {
    backgroundColor: theme.palette.warning.main,
    color: theme.palette.warning.contrastText,
  },
}));

function enforcementChipClass(
  level: EnforcementLevel,
  classes: ReturnType<typeof useStyles>,
): string {
  switch (level) {
    case 'block':
      return classes.blockChip;
    case 'warn':
      return classes.warnChip;
    case 'audit':
      return classes.auditChip;
    default:
      return '';
  }
}

function outcomeChipClass(
  outcome: string,
  classes: ReturnType<typeof useStyles>,
): string {
  switch (outcome) {
    case 'pass':
      return classes.passChip;
    case 'fail':
      return classes.failChip;
    case 'warn':
      return classes.warnOutcomeChip;
    default:
      return '';
  }
}

interface RuleDisplay {
  name: string;
  value: string;
  source: string;
}

function buildRuleRows(policy: EffectivePolicy): RuleDisplay[] {
  const rows: RuleDisplay[] = [];
  const rules = policy.rules;
  const sourceLabel = (idx: number) => {
    if (!policy.sources || policy.sources.length === 0) return '-';
    const src = policy.sources[idx] ?? policy.sources[0];
    if (!src) return '-';
    if (src.type === 'template') {
      const scopeInfo = src.scopeValue
        ? `${src.scopeType}:${src.scopeValue}`
        : src.scopeType;
      return `${src.templateName ?? src.templateId ?? 'template'} (${scopeInfo})`;
    }
    return 'inline';
  };

  const defaultSource = sourceLabel(0);

  if (rules.minApprovers !== undefined && rules.minApprovers > 0) {
    rows.push({
      name: 'Minimum Approvers',
      value: String(rules.minApprovers),
      source: defaultSource,
    });
  }
  if (rules.requiredScanGrade) {
    rows.push({
      name: 'Required Scan Grade',
      value: rules.requiredScanGrade,
      source: defaultSource,
    });
  }
  if (rules.requirePassingTests) {
    rows.push({
      name: 'Require Passing Tests',
      value: 'Yes',
      source: defaultSource,
    });
  }
  if (rules.requirePassingValidate) {
    rows.push({
      name: 'Require Passing Validate',
      value: 'Yes',
      source: defaultSource,
    });
  }
  if (rules.preventSelfApproval) {
    rows.push({
      name: 'Prevent Self-Approval',
      value: 'Yes',
      source: defaultSource,
    });
  }
  if (rules.autoApprovePatches) {
    rows.push({
      name: 'Auto-Approve Patches',
      value: 'Yes',
      source: defaultSource,
    });
  }

  return rows;
}

interface EffectivePolicyViewProps {
  namespace: string;
  name: string;
}

export function EffectivePolicyView({
  namespace,
  name,
}: EffectivePolicyViewProps) {
  const classes = useStyles();
  const api = useRegistryApi();

  const [policy, setPolicy] = useState<EffectivePolicy | null>(null);
  const [evaluations, setEvaluations] = useState<PolicyEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [policyData, evalData] = await Promise.all([
        api.getEffectivePolicy(namespace, name),
        api.listPolicyEvaluations(namespace, name, { limit: 10 }),
      ]);
      setPolicy(policyData);
      setEvaluations(evalData.evaluations ?? []);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load effective policy',
      );
    } finally {
      setLoading(false);
    }
  }, [api, namespace, name]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load effective policy"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchData}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!policy) {
    return (
      <EmptyState
        title="No effective policy"
        description="No policy has been configured for this artifact."
        missing="data"
      />
    );
  }

  const ruleRows = buildRuleRows(policy);

  return (
    <>
      <Box>
        <Typography variant="h6" gutterBottom>
          Effective Policy
        </Typography>
        <Chip
          label={`Enforcement: ${policy.enforcementLevel}`}
          size="small"
          className={`${classes.enforcementChip} ${enforcementChipClass(policy.enforcementLevel, classes)}`}
        />

        {ruleRows.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            No rules are active for this artifact.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Rule</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell>Source</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ruleRows.map(row => (
                  <TableRow key={row.name}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.value}</TableCell>
                    <TableCell>{row.source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* Recent Evaluations */}
      <Box className={classes.section}>
        <Typography variant="h6" gutterBottom>
          Recent Evaluations
        </Typography>
        {evaluations.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            No policy evaluations have been performed yet.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Trigger</TableCell>
                  <TableCell>Outcome</TableCell>
                  <TableCell>Enforcement</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell>Evaluated At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {evaluations.map(ev => (
                  <TableRow key={ev.id}>
                    <TableCell>{ev.trigger}</TableCell>
                    <TableCell>
                      <Chip
                        label={ev.outcome}
                        size="small"
                        className={outcomeChipClass(ev.outcome, classes)}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={ev.enforcement_level}
                        size="small"
                        className={enforcementChipClass(
                          ev.enforcement_level,
                          classes,
                        )}
                      />
                    </TableCell>
                    <TableCell>{ev.actor || '-'}</TableCell>
                    <TableCell>
                      {new Date(ev.evaluated_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </>
  );
}
