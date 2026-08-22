// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import type { FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { butlerApiRef } from '../../api/ButlerApi';
import { useTeamContext } from '../../hooks/useTeamContext';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { butlerTokens, rgb, rgba } from '../../theme';
import {
  ButlerButton,
  ButlerCallout,
  ButlerCard,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerInput,
  ButlerKeyValueList,
  ButlerKeyValueRow,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
  ButlerTextarea,
} from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    card: { padding: 24 },
    cardTitle: {
      margin: '0 0 16px',
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 500,
      color: t.text.strong,
    },
    cardTitleTight: { marginBottom: 4 },
    cardDescription: {
      margin: '0 0 16px',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
    },
    formFooter: {
      display: 'flex',
      justifyContent: 'flex-end',
    },
    muted: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    accessGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: 24,
      '@media (min-width: 768px)': {
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      },
    },
    accessTitle: {
      margin: '0 0 8px',
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: rgb(p.neutral[300]),
    },
    chips: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 8px',
      borderRadius: t.radius.sm,
      fontSize: 14,
      lineHeight: '20px',
      backgroundColor: rgb(p.neutral[800]),
      color: t.text.secondary,
    },
    chipGroup: {
      backgroundColor: rgba(p.blue[500], 0.2),
      color: rgb(p.blue[200]),
    },
    chipRole: { color: t.text.subtle },
    chipRoleGroup: { color: rgba(p.blue[300], 0.6) },
  };
});

interface TeamDetail {
  metadata?: {
    name: string;
    namespace?: string;
    uid?: string;
    creationTimestamp?: string;
  };
  spec?: {
    displayName?: string;
    description?: string;
    resourceQuotas?: {
      maxClusters?: number;
      maxWorkersPerCluster?: number;
      maxTotalWorkers?: number;
      maxNodesPerCluster?: number;
      maxTotalNodes?: number;
    };
    access?: {
      users?: Array<{ email: string; role: string }>;
      groups?: Array<{ name: string; role: string }>;
    };
  };
  status?: {
    namespace?: string;
    phase?: string;
  };
}

const QUOTA_ROWS: Array<{
  key: keyof NonNullable<NonNullable<TeamDetail['spec']>['resourceQuotas']>;
  label: string;
}> = [
  { key: 'maxClusters', label: 'Max Clusters' },
  { key: 'maxTotalNodes', label: 'Max Total Nodes' },
  { key: 'maxNodesPerCluster', label: 'Max Nodes per Cluster' },
  { key: 'maxTotalWorkers', label: 'Max Total Workers' },
  { key: 'maxWorkersPerCluster', label: 'Max Workers per Cluster' },
];

export const TeamSettingsPage = () => {
  const classes = useStyles();
  const { team } = useParams<{ team: string }>();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const navigate = useNavigate();
  const { teams, isAdmin } = useTeamContext();

  const [teamDetail, setTeamDetail] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const currentTeam = teams.find(t => t.name === team);
  const canEdit = currentTeam?.role === 'admin' || isAdmin;

  const loadTeam = useCallback(async () => {
    if (!team) return;
    setLoading(true);
    setError(null);
    try {
      const response: TeamDetail = await api.getTeam(team);
      setTeamDetail(response);
      setDisplayName(response?.spec?.displayName || '');
      setDescription(response?.spec?.description || '');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load team details',
      );
    } finally {
      setLoading(false);
    }
  }, [api, team]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!team || !canEdit) return;
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      await api.updateTeam(team, { displayName, description });
      setSaveMessage('Team settings have been updated');
      await loadTeam();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save settings',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!team) {
    return (
      <ButlerEmptyState
        title="No team selected"
        description="Navigate to a team to view its settings."
      />
    );
  }

  if (loading) return <ButlerLoading />;

  if (error) {
    return (
      <ButlerErrorState
        message="Failed to load settings"
        detail={error}
        onRetry={loadTeam}
      />
    );
  }

  const quotas = teamDetail?.spec?.resourceQuotas;
  const quotaRows = QUOTA_ROWS.filter(r => quotas?.[r.key] !== undefined);
  const users = teamDetail?.spec?.access?.users ?? [];
  const groups = teamDetail?.spec?.access?.groups ?? [];
  const namespace =
    teamDetail?.status?.namespace ||
    teamDetail?.metadata?.namespace ||
    `team-${team}`;
  const created = teamDetail?.metadata?.creationTimestamp
    ? new Date(teamDetail.metadata.creationTimestamp).toLocaleDateString(
        undefined,
        { year: 'numeric', month: 'long', day: 'numeric' },
      )
    : '-';

  return (
    <ButlerStack>
      <ButlerPageHeader
        title="Settings"
        subtitle="Configure team settings"
        onBack={() => navigate(routes.team({ team }))}
      />

      <ButlerCard flush className={classes.card}>
        <h2 className={`${classes.cardTitle} ${classes.cardTitleTight}`}>
          Resource Quotas
        </h2>
        <p className={classes.cardDescription}>
          Limits configured for your team
        </p>
        {quotaRows.length > 0 ? (
          <ButlerKeyValueList dense>
            {quotaRows.map(r => (
              <ButlerKeyValueRow key={r.key} label={r.label} mono dense>
                {quotas?.[r.key]}
              </ButlerKeyValueRow>
            ))}
          </ButlerKeyValueList>
        ) : (
          <p className={classes.muted}>
            No resource quotas configured for this team.
          </p>
        )}
      </ButlerCard>

      <ButlerCard flush className={classes.card}>
        <h2 className={classes.cardTitle}>Team Settings</h2>
        <form className={classes.form} onSubmit={handleSave}>
          {saveMessage && (
            <ButlerCallout tone="success" compact role="status">
              {saveMessage}
            </ButlerCallout>
          )}
          {saveError && (
            <ButlerCallout tone="danger" compact role="alert">
              {saveError}
            </ButlerCallout>
          )}
          <ButlerInput
            label="Team Name"
            value={teamDetail?.metadata?.name || team}
            disabled
            readOnly
            help="Team names cannot be changed"
          />
          <ButlerInput
            label="Display Name"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="My Team"
            disabled={!canEdit}
          />
          <ButlerTextarea
            label="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Team description..."
            rows={3}
            disabled={!canEdit}
          />
          <ButlerKeyValueList dense>
            <ButlerKeyValueRow label="Namespace" mono dense>
              {namespace}
            </ButlerKeyValueRow>
            <ButlerKeyValueRow label="Created" dense>
              {created}
            </ButlerKeyValueRow>
          </ButlerKeyValueList>
          {canEdit && (
            <div className={classes.formFooter}>
              <ButlerButton type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </ButlerButton>
            </div>
          )}
        </form>
      </ButlerCard>

      <ButlerCard flush className={classes.card}>
        <h2 className={classes.cardTitle}>Access Configuration</h2>
        <div className={classes.accessGrid}>
          <div>
            <h3 className={classes.accessTitle}>Users</h3>
            {users.length > 0 ? (
              <div className={classes.chips}>
                {users.map((user, index) => (
                  <span key={`user-${index}`} className={classes.chip}>
                    {user.email}
                    <span className={classes.chipRole}>({user.role})</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className={classes.muted}>No direct user access configured.</p>
            )}
          </div>
          <div>
            <h3 className={classes.accessTitle}>Groups</h3>
            {groups.length > 0 ? (
              <div className={classes.chips}>
                {groups.map((group, index) => (
                  <span
                    key={`group-${index}`}
                    className={`${classes.chip} ${classes.chipGroup}`}
                  >
                    {group.name}
                    <span className={classes.chipRoleGroup}>
                      ({group.role})
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p className={classes.muted}>No group access configured.</p>
            )}
          </div>
        </div>
      </ButlerCard>
    </ButlerStack>
  );
};
