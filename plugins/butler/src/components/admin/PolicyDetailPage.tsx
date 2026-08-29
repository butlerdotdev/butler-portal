// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useNavigate, useParams } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { butlerApiRef } from '../../api/ButlerApi';
import type { ClusterCreationPolicy } from '../../api/types/policies';
import {
  OPTION_TYPE_LABELS,
  describeRuleMode,
  policyScopeLabel,
  policyTier,
} from '../../api/types/policies';
import { useButlerResource } from '../../hooks/useButlerResource';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerCallout,
  ButlerCard,
  ButlerChip,
  ButlerErrorState,
  ButlerGrid,
  ButlerKeyValueList,
  ButlerKeyValueRow,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
} from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    rule: {
      padding: '12px 0',
      borderTop: `1px solid ${t.border}`,
      '&:first-child': { borderTop: 'none', paddingTop: 0 },
    },
    ruleHead: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    ruleType: {
      margin: 0,
      fontSize: 14,
      fontWeight: 500,
      color: rgb(t.palette.neutral[100]),
    },
    ruleText: {
      margin: '0 0 6px',
      fontSize: 13,
      color: rgb(t.palette.neutral[300]),
    },
    values: { display: 'flex', flexWrap: 'wrap', gap: 4 },
    mono: { fontFamily: t.fontMono },
    note: { margin: 0, fontSize: 12, color: t.text.subtle },
  };
});

const TIER_TEXT = {
  platformWide:
    'Applies to every team unless a team or environment rule shadows it.',
  team: 'Applies to every cluster this team creates, in any environment, unless an environment rule shadows it.',
  teamAndEnvironment:
    'Applies only to clusters this team creates in this environment. It is the most specific scope and shadows any other.',
} as const;

/**
 * One cluster creation policy, read only: where it applies, which
 * providers it targets, and what each rule does to the option list it
 * governs. The wording of each rule matches the note a team sees on the
 * create form, so an admin reading this and an operator reading that are
 * told the same thing.
 */
export const PolicyDetailPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const navigate = useNavigate();
  const { name = '' } = useParams<{ name: string }>();
  const { canAccessAdmin } = useTeamContext();

  const state = useButlerResource<ClusterCreationPolicy>(
    () => api.getPolicy(name),
    { deps: [api, name], enabled: canAccessAdmin && Boolean(name) },
  );

  if (state.status === 'loading') return <ButlerLoading />;
  if (state.status === 'error' || !state.data) {
    return (
      <ButlerStack>
        <ButlerPageHeader
          title={name}
          subtitle="Cluster creation policy"
          onBack={() => navigate(routes.adminPolicies())}
        />
        <ButlerErrorState
          message="Policy not found"
          detail={state.status === 'error' ? state.error.message : undefined}
          onRetry={() => state.refresh()}
        />
      </ButlerStack>
    );
  }

  const policy = state.data;
  const tier = policyTier(policy);
  const rules = Object.entries(policy.spec.options ?? {});
  const notReady =
    policy.status?.conditions?.filter(c => c.status !== 'True') ?? [];

  return (
    <ButlerStack>
      <ButlerPageHeader
        title={policy.metadata.name}
        subtitle="Cluster creation policy"
        onBack={() => navigate(routes.adminPolicies())}
        titleAdornment={
          <ButlerChip tone={tier === 'platformWide' ? 'neutral' : 'violet'}>
            {policyScopeLabel(policy)}
          </ButlerChip>
        }
      />

      {notReady.length > 0 && (
        <ButlerCallout tone="warning" title="Not fully applied">
          {notReady
            .map(c => `${c.reason ?? c.type}: ${c.message ?? ''}`)
            .join(' ')}
          {policy.status?.staleReferences?.length
            ? ` Stale references: ${policy.status.staleReferences.join(', ')}.`
            : ''}
        </ButlerCallout>
      )}

      <ButlerGrid>
        <ButlerCard title="Scope">
          <ButlerKeyValueList>
            <ButlerKeyValueRow label="Tier" dense>
              {tier === 'platformWide'
                ? 'Platform wide'
                : tier === 'team'
                ? 'Team'
                : tier === 'teamAndEnvironment'
                ? 'Team and environment'
                : 'Invalid'}
            </ButlerKeyValueRow>
            {policy.spec.scope.team && (
              <ButlerKeyValueRow label="Team" dense mono>
                {policy.spec.scope.team.teamRef.name}
              </ButlerKeyValueRow>
            )}
            {policy.spec.scope.teamAndEnvironment && (
              <>
                <ButlerKeyValueRow label="Team" dense mono>
                  {policy.spec.scope.teamAndEnvironment.teamRef.name}
                </ButlerKeyValueRow>
                <ButlerKeyValueRow label="Environment" dense mono>
                  {policy.spec.scope.teamAndEnvironment.environmentName}
                </ButlerKeyValueRow>
              </>
            )}
          </ButlerKeyValueList>
          {tier && <p className={classes.note}>{TIER_TEXT[tier]}</p>}
        </ButlerCard>

        <ButlerCard title="Target providers">
          {policy.spec.targetProviders?.length ? (
            <div className={classes.values}>
              {policy.spec.targetProviders.map(p => (
                <ButlerChip key={p} tone="neutral">
                  {p}
                </ButlerChip>
              ))}
            </div>
          ) : (
            <p className={classes.note}>
              Every provider. The rules below apply whichever provider a cluster
              is created against.
            </p>
          )}
        </ButlerCard>
      </ButlerGrid>

      <ButlerCard title="Rules">
        {rules.length === 0 ? (
          <p className={classes.note}>
            This policy defines no rules, so it changes nothing.
          </p>
        ) : (
          rules.map(([type, rule]) => (
            <div key={type} className={classes.rule}>
              <div className={classes.ruleHead}>
                <p className={classes.ruleType}>
                  {OPTION_TYPE_LABELS[type] ?? type}
                </p>
                <ButlerChip tone="blue">{rule?.mode}</ButlerChip>
              </div>
              <p className={classes.ruleText}>
                {describeRuleMode(
                  rule?.mode ?? '',
                  (OPTION_TYPE_LABELS[type] ?? type).toLowerCase(),
                )}
                {rule?.recommendedReason ? ` ${rule.recommendedReason}` : ''}
              </p>
              {rule?.values?.length ? (
                <div className={classes.values}>
                  {rule.values.map(v => (
                    <ButlerChip
                      key={v}
                      tone={v === rule.default ? 'green' : 'neutral'}
                    >
                      <span className={classes.mono}>{v}</span>
                      {v === rule.default ? ' (default)' : ''}
                    </ButlerChip>
                  ))}
                </div>
              ) : rule?.default ? (
                <div className={classes.values}>
                  <ButlerChip tone="green">
                    <span className={classes.mono}>{rule.default}</span>
                    {' (default)'}
                  </ButlerChip>
                </div>
              ) : null}
            </div>
          ))
        )}
      </ButlerCard>

      <ButlerCard title="Managing this policy">
        <p className={classes.note}>
          Editing and deleting policies is done through the platform tooling.
          This view is read only.
        </p>
      </ButlerCard>
    </ButlerStack>
  );
};
