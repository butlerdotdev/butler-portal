// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { butlerApiRef } from '../../api/ButlerApi';
import type { ClusterCreationPolicy } from '../../api/types/policies';
import {
  OPTION_TYPE_LABELS,
  policyScopeLabel,
  policyTier,
} from '../../api/types/policies';
import { useButlerResource } from '../../hooks/useButlerResource';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb } from '../../theme';
import { formatAge } from '../../utils/formatAge';
import {
  ButlerCard,
  ButlerChip,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
  ButlerTable,
} from '../ui';
import type { ButlerColumn } from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    link: {
      color: rgb(t.palette.blue[400]),
      textDecoration: 'none',
      '&:hover': { textDecoration: 'underline' },
    },
    mono: { fontFamily: t.fontMono, fontSize: 13 },
    chips: { display: 'flex', flexWrap: 'wrap', gap: 4 },
    note: { margin: 0, fontSize: 12, color: t.text.subtle },
  };
});

const TIER_LABEL = {
  platformWide: 'Platform wide',
  team: 'Team',
  teamAndEnvironment: 'Team and environment',
} as const;

/**
 * The cluster creation policies in force across the estate.
 *
 * Reading needs a platform role, which butler-server enforces; a team
 * never reads a policy directly and sees only its effect on the option
 * lists when creating a cluster. Creating, editing and deleting policies
 * is not offered here yet and stays a recorded gap.
 */
export const PoliciesPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const { canAccessAdmin } = useTeamContext();

  const state = useButlerResource<ClusterCreationPolicy[]>(
    async () => (await api.listPolicies()).policies ?? [],
    { deps: [api], enabled: canAccessAdmin },
  );

  const columns: ButlerColumn<ClusterCreationPolicy>[] = [
    {
      id: 'name',
      header: 'Policy',
      primary: true,
      render: policy => (
        <a
          className={classes.link}
          href={routes.adminPolicy({ name: policy.metadata.name })}
        >
          {policy.metadata.name}
        </a>
      ),
    },
    {
      id: 'scope',
      header: 'Scope',
      render: policy => {
        const tier = policyTier(policy);
        return (
          <div className={classes.chips}>
            <ButlerChip tone={tier === 'platformWide' ? 'neutral' : 'violet'}>
              {tier ? TIER_LABEL[tier] : 'Invalid'}
            </ButlerChip>
            <span className={classes.mono}>{policyScopeLabel(policy)}</span>
          </div>
        );
      },
    },
    {
      id: 'providers',
      header: 'Providers',
      render: policy =>
        policy.spec.targetProviders?.length
          ? policy.spec.targetProviders.join(', ')
          : 'All',
    },
    {
      id: 'options',
      header: 'Rules',
      render: policy => (
        <div className={classes.chips}>
          {Object.entries(policy.spec.options ?? {}).map(([type, rule]) => (
            <ButlerChip key={type} tone="blue">
              {`${OPTION_TYPE_LABELS[type] ?? type}: ${rule?.mode}`}
            </ButlerChip>
          ))}
        </div>
      ),
    },
    {
      id: 'health',
      header: 'Status',
      render: policy => {
        const notReady = policy.status?.conditions?.find(
          c => c.status !== 'True',
        );
        if (notReady) {
          return (
            <ButlerChip tone="yellow">
              {notReady.reason ?? 'Attention'}
            </ButlerChip>
          );
        }
        return <ButlerChip tone="green">Applied</ButlerChip>;
      },
    },
    {
      id: 'age',
      header: 'Age',
      render: policy =>
        policy.metadata.creationTimestamp
          ? formatAge(policy.metadata.creationTimestamp)
          : '',
    },
  ];

  const header = (
    <ButlerPageHeader
      title="Cluster Creation Policies"
      subtitle="Rules that shape the images, networks, clusters and storage a new cluster may use"
    />
  );

  if (state.status === 'loading') return <ButlerLoading />;
  if (state.status === 'error' && !state.data) {
    return (
      <ButlerStack>
        {header}
        <ButlerErrorState
          message="Failed to load policies"
          detail={state.error.message}
          onRetry={() => state.refresh()}
        />
      </ButlerStack>
    );
  }

  const policies = state.data ?? [];

  return (
    <ButlerStack>
      {header}
      {policies.length === 0 ? (
        <ButlerEmptyState
          title="No cluster creation policies"
          description="Every option list is offered unfiltered. A policy narrows or orders the images, networks, clusters or storage containers a cluster may be created with."
        />
      ) : (
        <ButlerTable
          columns={columns}
          rows={policies}
          rowKey={policy => policy.metadata.name}
          aria-label="Cluster creation policies"
        />
      )}
      <ButlerCard title="How policies apply">
        <p className={classes.note}>
          The most specific scope wins for each option type: a rule for a team
          and environment shadows a team rule, which shadows a platform wide
          rule. Rules do not combine across scopes. The platform applies them
          inside the option lists a cluster is created from, so a team sees the
          effect rather than the policy. Creating and editing policies is done
          through the platform tooling; this view is read only.
        </p>
      </ButlerCard>
    </ButlerStack>
  );
};
