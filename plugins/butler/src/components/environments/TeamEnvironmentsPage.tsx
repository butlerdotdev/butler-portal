// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { butlerApiRef } from '../../api/ButlerApi';
import type {
  EnvironmentRequest,
  TeamEnvironment,
} from '../../api/types/environments';
import type { Cluster } from '../../api/types/clusters';
import { useTeamEnvironments } from '../../hooks/useTeamEnvironments';
import { useTeamContext } from '../../hooks/useTeamContext';
import {
  clusterCountsByEnvironment,
  orphanedEnvironments,
} from '../../utils/environment';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerButton,
  ButlerCallout,
  ButlerCard,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
  ButlerStatGrid,
  ButlerStatTile,
  ButlerTable,
} from '../ui';
import type { ButlerColumn } from '../ui';
import { EnvironmentFormDialog } from './EnvironmentFormDialog';
import { DeleteEnvironmentDialog } from './DeleteEnvironmentDialog';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    name: {
      margin: 0,
      fontFamily: t.fontMono,
      fontSize: 14,
      color: rgb(t.palette.neutral[100]),
    },
    meta: { margin: '4px 0 0', fontSize: 12, color: t.text.subtle },
    muted: { color: t.text.subtle, fontStyle: 'italic' },
    actions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
    note: { margin: 0, fontSize: 12, color: t.text.subtle },
  };
});

function formatLimit(value: number | undefined): string {
  return value == null ? 'unlimited' : String(value);
}

/**
 * A team's environments: what they are, how much they allow, and which
 * clusters are in them.
 *
 * Every role that can read the team can read this page, because the
 * server serves the environments to all of them. Creating, editing and
 * deleting are offered to team admins and platform admins, matching the
 * authority the admission webhook enforces on environment limits.
 */
export const TeamEnvironmentsPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const params = useParams();
  const { activeTeam, activeTeamDisplayName, isTeamAdmin, canAccessAdmin } =
    useTeamContext();
  const team = params.team ?? activeTeam ?? '';

  const { environments, loading, error, refresh } = useTeamEnvironments(team);
  const canEdit = isTeamAdmin || canAccessAdmin;

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clustersLoaded, setClustersLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TeamEnvironment | null>(null);
  const [deleting, setDeleting] = useState<TeamEnvironment | null>(null);

  // Membership is the environment label on the team's clusters, so the
  // counts come from the cluster list rather than from the environment.
  const loadClusters = useCallback(async () => {
    if (!team) return;
    try {
      const res = await api.listClusters({ team });
      setClusters(res.clusters ?? []);
    } catch {
      setClusters([]);
    } finally {
      setClustersLoaded(true);
    }
  }, [api, team]);

  useEffect(() => {
    void loadClusters();
  }, [loadClusters]);

  const { counts, unassigned } = useMemo(
    () => clusterCountsByEnvironment(clusters),
    [clusters],
  );
  const orphaned = useMemo(
    () => orphanedEnvironments(counts, environments),
    [counts, environments],
  );

  const afterChange = useCallback(async () => {
    setCreating(false);
    setEditing(null);
    setDeleting(null);
    await refresh();
    await loadClusters();
  }, [refresh, loadClusters]);

  const columns: ButlerColumn<TeamEnvironment>[] = [
    {
      id: 'name',
      header: 'Environment',
      primary: true,
      render: env => {
        const defaults = env.clusterDefaults
          ? Object.values(env.clusterDefaults).filter(
              v => v !== undefined && v !== '',
            ).length
          : 0;
        const access =
          (env.access?.users?.length ?? 0) + (env.access?.groups?.length ?? 0);
        const parts = [
          defaults > 0 ? `${defaults} default${defaults === 1 ? '' : 's'}` : '',
          access > 0
            ? `${access} access entr${access === 1 ? 'y' : 'ies'}`
            : '',
        ].filter(Boolean);
        return (
          <div>
            <p className={classes.name}>{env.name}</p>
            {parts.length > 0 && (
              <p className={classes.meta}>{parts.join(' · ')}</p>
            )}
          </div>
        );
      },
    },
    {
      id: 'description',
      header: 'Description',
      render: env =>
        env.description?.trim() ? (
          env.description
        ) : (
          <span className={classes.muted}>None</span>
        ),
    },
    {
      id: 'maxClusters',
      header: 'Max clusters',
      render: env => formatLimit(env.limits?.maxClusters),
    },
    {
      id: 'maxPerMember',
      header: 'Max per member',
      render: env => formatLimit(env.limits?.maxClustersPerMember),
    },
    {
      id: 'clusters',
      header: 'Clusters',
      render: env => {
        const count = counts[env.name] ?? 0;
        const max = env.limits?.maxClusters;
        return max == null ? `${count}` : `${count} of ${max}`;
      },
    },
  ];

  if (canEdit) {
    columns.push({
      id: 'actions',
      header: '',
      align: 'right',
      render: env => (
        <div className={classes.actions}>
          <ButlerButton
            variant="secondary"
            size="sm"
            onClick={() => setEditing(env)}
          >
            Edit
          </ButlerButton>
          <ButlerButton
            variant="danger"
            size="sm"
            onClick={() => setDeleting(env)}
          >
            Delete
          </ButlerButton>
        </div>
      ),
    });
  }

  const header = (
    <ButlerPageHeader
      title="Environments"
      subtitle={`Groups and quotas within ${
        activeTeamDisplayName || team || 'this team'
      }`}
      actions={
        canEdit ? (
          <ButlerButton onClick={() => setCreating(true)}>
            Create environment
          </ButlerButton>
        ) : undefined
      }
    />
  );

  if (loading && environments.length === 0) {
    return (
      <ButlerStack>
        {header}
        <ButlerLoading />
      </ButlerStack>
    );
  }

  if (error && environments.length === 0) {
    return (
      <ButlerStack>
        {header}
        <ButlerErrorState
          message="Failed to load environments"
          detail={error.message}
          onRetry={() => refresh()}
        />
      </ButlerStack>
    );
  }

  const assigned = Object.entries(counts).reduce((sum, [, n]) => sum + n, 0);

  return (
    <ButlerStack>
      {header}

      <ButlerStatGrid>
        <ButlerStatTile
          label="Environments"
          value={String(environments.length)}
        />
        <ButlerStatTile
          label="Clusters in an environment"
          value={String(assigned)}
        />
        <ButlerStatTile
          label="Not in any environment"
          value={clustersLoaded ? String(unassigned) : '-'}
        />
      </ButlerStatGrid>

      {orphaned.length > 0 && (
        <ButlerCallout
          tone="amber"
          title="Clusters point at a missing environment"
        >
          {orphaned.map(name => `${name} (${counts[name]})`).join(', ')} no
          longer exists on this team. Those clusters keep running and count
          against the team total, but against no environment limit. Recreating
          the environment under the same name adopts them again.
        </ButlerCallout>
      )}

      {environments.length === 0 ? (
        <ButlerEmptyState
          title="No environments defined"
          description={
            canEdit
              ? 'Create one to group this team’s clusters and cap how many may exist in each.'
              : 'This team has not defined any environments. A team admin can add them.'
          }
        />
      ) : (
        <ButlerTable
          columns={columns}
          rows={environments}
          rowKey={env => env.name}
          aria-label="Team environments"
        />
      )}

      <ButlerCard title="How environments behave">
        <p className={classes.note}>
          A cluster carries its environment as a label, which is why the name
          cannot change once created. Clusters made before an environment
          existed carry no label and count only against the team total. Moving a
          cluster between environments is done from the cluster itself.
        </p>
      </ButlerCard>

      {creating && team && (
        <EnvironmentFormDialog
          open
          mode="create"
          team={team}
          existingNames={environments.map(e => e.name)}
          onClose={() => setCreating(false)}
          onSaved={afterChange}
          onSubmit={(request: EnvironmentRequest) =>
            api.createTeamEnvironment(team, request)
          }
        />
      )}

      {editing && team && (
        <EnvironmentFormDialog
          open
          mode="edit"
          team={team}
          environment={editing}
          existingNames={environments.map(e => e.name)}
          onClose={() => setEditing(null)}
          onSaved={afterChange}
          onSubmit={(request: EnvironmentRequest) =>
            api.updateTeamEnvironment(team, editing.name, request)
          }
        />
      )}

      {deleting && team && (
        <DeleteEnvironmentDialog
          open
          team={team}
          environment={deleting}
          clusterCount={counts[deleting.name] ?? 0}
          onClose={() => setDeleting(null)}
          onDeleted={afterChange}
          onDelete={(t, name) => api.deleteTeamEnvironment(t, name)}
        />
      )}
    </ButlerStack>
  );
};
