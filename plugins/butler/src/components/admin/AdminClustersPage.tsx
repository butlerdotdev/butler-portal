// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerApiRef } from '../../api/ButlerApi';
import type { Cluster, ManagementCluster } from '../../api/types/clusters';
import type { TeamInfo } from '../../api/types/teams';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb, rgba } from '../../theme';
import {
  ButlerButton,
  ButlerCallout,
  ButlerDialog,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerGroupEmpty,
  ButlerGroupNested,
  ButlerGroupSection,
  ButlerLoading,
  ButlerPageHeader,
  ButlerSearchInput,
  ButlerSelect,
  ButlerStack,
  CheckIcon,
  envAccent,
  neutralAccent,
  PlusIcon,
} from '../ui';
import { ClusterListRow } from '../clusters/ClusterListRow';

/** Console `ENVIRONMENT_LABEL` (`src/types/environments.ts`). */
export const ENVIRONMENT_LABEL = 'butler.butlerlabs.dev/environment';

const GROUP_STORAGE_KEY = 'butler-portal.admin-clusters.groups';
const COLLAPSE_STORAGE_KEY = 'butler-portal.admin-clusters.collapsed';

interface GroupState {
  byEnv: boolean;
  byTeam: boolean;
}

type ViewMode = 'flat' | 'env' | 'team' | 'team-env';

function loadGroupState(): GroupState {
  try {
    const raw = localStorage.getItem(GROUP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { byEnv: parsed.byEnv === true, byTeam: parsed.byTeam === true };
      }
    }
  } catch {
    // Fall through to the flat default.
  }
  return { byEnv: false, byTeam: false };
}

function saveGroupState(state: GroupState) {
  try {
    localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable; the preference is session-only.
  }
}

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.filter((v): v is string => typeof v === 'string'));
      }
    }
  } catch {
    // Ignore; all sections start expanded.
  }
  return new Set();
}

function saveCollapsed(set: Set<string>) {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Storage unavailable; the preference is session-only.
  }
}

function deriveViewMode(s: GroupState): ViewMode {
  if (s.byTeam && s.byEnv) return 'team-env';
  if (s.byTeam) return 'team';
  if (s.byEnv) return 'env';
  return 'flat';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    toolbar: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 16,
    },
    search: {
      flex: 1,
      minWidth: 200,
      maxWidth: 448,
    },
    toolbarSelect: {
      width: 'auto',
      backgroundColor: t.surface,
    },
    clear: {
      padding: 0,
      border: 'none',
      background: 'none',
      fontFamily: t.fontSans,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
      cursor: 'pointer',
      transition: 'color 150ms',
      '&:hover': { color: t.text.secondary },
    },
    countRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    },
    count: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    groupBy: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    groupLabel: {
      marginRight: 4,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    groupNote: {
      fontSize: 12,
      lineHeight: '16px',
      fontStyle: 'italic',
      color: t.text.subtle,
    },
    chip: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 12px',
      borderRadius: t.radius.pill,
      border: `1px solid ${t.border}`,
      backgroundColor: t.surface,
      fontFamily: t.fontSans,
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      color: t.text.muted,
      cursor: 'pointer',
      transition: 'border-color 150ms, color 150ms, background-color 150ms',
      '&:hover': { borderColor: t.borderStrong },
      '&:focus-visible': {
        outline: `2px solid ${rgb(p.violet[500])}`,
        outlineOffset: 2,
      },
    },
    chipActive: {
      backgroundColor: rgba(p.violet[500], 0.2),
      color: rgb(p.violet[300]),
      borderColor: rgba(p.violet[500], 0.4),
      '&:hover': { borderColor: rgba(p.violet[500], 0.4) },
    },
    list: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    modalText: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    modalLink: {
      display: 'inline-block',
      marginTop: 8,
      fontSize: 14,
      color: rgb(p.violet[400]),
      textDecoration: 'none',
      '&:hover': { color: rgb(p.violet[300]) },
    },
  };
});

function GroupChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  const classes = useStyles();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(classes.chip, active && classes.chipActive)}
    >
      {active && <CheckIcon size={12} strokeWidth={3} />}
      {label}
    </button>
  );
}

interface AdminTeam extends TeamInfo {
  namespace?: string;
  environments?: Array<{
    name: string;
    limits?: { maxClustersPerMember?: number };
  }>;
}

export const AdminClustersPage = () => {
  const classes = useStyles();
  const theme = useTheme();
  const tokens = butlerTokens(theme);
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const navigate = useNavigate();
  const { isAdmin } = useTeamContext();

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [management, setManagement] = useState<ManagementCluster | null>(null);
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState('');

  const [groupState, setGroupStateInternal] = useState<GroupState>(() =>
    loadGroupState(),
  );
  const setGroupState = useCallback((next: GroupState) => {
    setGroupStateInternal(next);
    saveGroupState(next);
  }, []);
  const viewMode = useMemo(() => deriveViewMode(groupState), [groupState]);

  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    loadCollapsed(),
  );
  const toggleCollapsed = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveCollapsed(next);
      return next;
    });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [clustersRes, mgmtRes, teamsRes] = await Promise.allSettled([
        api.listClusters(),
        api.getManagement(),
        api.listAllTeams(),
      ]);
      if (clustersRes.status === 'fulfilled') {
        setClusters(clustersRes.value.clusters || []);
      } else {
        throw clustersRes.reason;
      }
      // The management summary and the team list are decoration for the
      // estate view; the page still renders without them.
      setManagement(mgmtRes.status === 'fulfilled' ? mgmtRes.value : null);
      setTeams(
        teamsRes.status === 'fulfilled'
          ? ((teamsRes.value.teams || []) as AdminTeam[])
          : [],
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [fetchData, isAdmin]);

  const namespaces = useMemo(
    () => [...new Set(clusters.map(c => c.metadata.namespace))].sort(),
    [clusters],
  );
  const statuses = useMemo(
    () => [...new Set(clusters.map(c => c.status?.phase || 'Unknown'))].sort(),
    [clusters],
  );

  const teamsByNamespace = useMemo(() => {
    const m = new Map<string, AdminTeam>();
    for (const t of teams) {
      if (t.namespace) m.set(t.namespace, t);
      m.set(t.name, t);
    }
    return m;
  }, [teams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = clusters.filter(c => {
      if (q) {
        const hit =
          c.metadata.name.toLowerCase().includes(q) ||
          c.metadata.namespace.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (teamFilter && c.metadata.namespace !== teamFilter) return false;
      if (statusFilter && (c.status?.phase || 'Unknown') !== statusFilter) {
        return false;
      }
      return true;
    });
    // Console default sort: newest first.
    return result.sort((a, b) =>
      (b.metadata.creationTimestamp || '').localeCompare(
        a.metadata.creationTimestamp || '',
      ),
    );
  }, [clusters, search, teamFilter, statusFilter]);

  // The ENV column shows in the flat view when any cluster carries the
  // label; grouped views carry env identity in the section header.
  const showEnv = useMemo(
    () =>
      viewMode === 'flat' &&
      clusters.some(c => !!c.metadata.labels?.[ENVIRONMENT_LABEL]),
    [viewMode, clusters],
  );

  const perMemberCapByEnv = useMemo(() => {
    const caps = new Map<string, Set<number>>();
    for (const t of teams) {
      for (const env of t.environments ?? []) {
        const cap = env.limits?.maxClustersPerMember;
        if (cap == null || cap <= 0) continue;
        if (!caps.has(env.name)) caps.set(env.name, new Set());
        caps.get(env.name)!.add(cap);
      }
    }
    const out = new Map<string, { value: number | null; varies: boolean }>();
    for (const [name, values] of caps) {
      out.set(
        name,
        values.size === 1
          ? { value: [...values][0], varies: false }
          : { value: null, varies: true },
      );
    }
    return out;
  }, [teams]);

  const envSections = useMemo(() => {
    if (viewMode !== 'env') return null;
    const byEnv = new Map<string, Cluster[]>();
    for (const c of filtered) {
      const key = c.metadata.labels?.[ENVIRONMENT_LABEL] || '';
      if (!byEnv.has(key)) byEnv.set(key, []);
      byEnv.get(key)!.push(c);
    }
    const named = [...byEnv.keys()].filter(k => k !== '').sort();
    const sections = named.map(k => ({
      key: k,
      label: k,
      accent: envAccent(tokens, k),
      clusters: byEnv.get(k) || [],
      cap: perMemberCapByEnv.get(k),
    }));
    if (byEnv.has('')) {
      sections.push({
        key: '__unlabeled__',
        label: '(no environment)',
        accent: neutralAccent(tokens),
        clusters: byEnv.get('') || [],
        cap: undefined,
      });
    }
    return sections;
  }, [viewMode, filtered, perMemberCapByEnv, tokens]);

  const teamSections = useMemo(() => {
    if (viewMode !== 'team') return null;
    const byTeam = new Map<string, Cluster[]>();
    for (const c of filtered) {
      const key = c.metadata.namespace || '';
      if (!byTeam.has(key)) byTeam.set(key, []);
      byTeam.get(key)!.push(c);
    }
    return [...byTeam.keys()].sort().map(k => {
      const team = teamsByNamespace.get(k);
      return {
        key: k || '__no-team__',
        label: team?.displayName || team?.name || k || '(no team)',
        namespace: k,
        clusters: byTeam.get(k) || [],
      };
    });
  }, [viewMode, filtered, teamsByNamespace]);

  const teamEnvSections = useMemo(() => {
    if (viewMode !== 'team-env') return null;
    const byTeam = new Map<string, Map<string, Cluster[]>>();
    for (const c of filtered) {
      const teamKey = c.metadata.namespace || '';
      const envKey = c.metadata.labels?.[ENVIRONMENT_LABEL] || '';
      if (!byTeam.has(teamKey)) byTeam.set(teamKey, new Map());
      const envMap = byTeam.get(teamKey)!;
      if (!envMap.has(envKey)) envMap.set(envKey, []);
      envMap.get(envKey)!.push(c);
    }
    const keys = [...byTeam.keys()].sort((a, b) =>
      (teamsByNamespace.get(a)?.displayName || a).localeCompare(
        teamsByNamespace.get(b)?.displayName || b,
      ),
    );
    return keys.map(teamKey => {
      const team = teamsByNamespace.get(teamKey);
      const envMap = byTeam.get(teamKey)!;
      const named = [...envMap.keys()].filter(k => k !== '').sort();
      const envs = named.map(e => ({
        key: `${teamKey}::${e}`,
        label: e,
        accent: envAccent(tokens, e),
        clusters: envMap.get(e) || [],
        cap: team?.environments?.find(x => x.name === e)?.limits
          ?.maxClustersPerMember,
      }));
      if (envMap.has('')) {
        envs.push({
          key: `${teamKey}::__unlabeled__`,
          label: '(no environment)',
          accent: neutralAccent(tokens),
          clusters: envMap.get('') || [],
          cap: undefined,
        });
      }
      return {
        key: teamKey || '__no-team__',
        label: team?.displayName || team?.name || teamKey || '(no team)',
        namespace: teamKey,
        total: [...envMap.values()].reduce((n, arr) => n + arr.length, 0),
        envs,
      };
    });
  }, [viewMode, filtered, teamsByNamespace, tokens]);

  const clusterRow = (cluster: Cluster, accentBorder?: string) => {
    const team = cluster.spec.teamRef?.name || cluster.metadata.namespace;
    const stats = [
      {
        label: 'Provider',
        value: cluster.spec.providerConfigRef?.name || 'Default',
      },
      ...(showEnv
        ? [
            {
              label: 'Env',
              value: cluster.metadata.labels?.[ENVIRONMENT_LABEL] || '-',
            },
          ]
        : []),
      { label: 'Version', value: cluster.spec.kubernetesVersion || 'Unknown' },
      { label: 'Workers', value: String(cluster.spec.workers?.replicas ?? 0) },
    ];
    return (
      <div
        key={`${cluster.metadata.namespace}/${cluster.metadata.name}`}
        role="listitem"
      >
        <ClusterListRow
          to={routes.clusterDetail({
            team,
            namespace: cluster.metadata.namespace,
            name: cluster.metadata.name,
          })}
          name={cluster.metadata.name}
          namespace={cluster.metadata.namespace}
          phase={cluster.status?.phase || 'Unknown'}
          stats={stats}
          accentBorder={accentBorder}
        />
      </div>
    );
  };

  const renderSectionBody = (rows: Cluster[], border: string) =>
    rows.length === 0 ? (
      <ButlerGroupEmpty>No clusters in this section.</ButlerGroupEmpty>
    ) : (
      <div className={classes.list} role="list">
        {rows.map(c => clusterRow(c, border))}
      </div>
    );

  const hasFilters = Boolean(search || teamFilter || statusFilter);
  const totalCount = clusters.length + (management ? 1 : 0);
  const violet = rgb(tokens.palette.violet[500]);

  let body: React.ReactNode;
  if (loading) {
    body = <ButlerLoading />;
  } else if (error) {
    body = (
      <ButlerErrorState
        message="Failed to load clusters"
        detail={error.message}
        onRetry={fetchData}
      />
    );
  } else {
    body = (
      <>
        <div className={classes.toolbar}>
          <ButlerSearchInput
            className={classes.search}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search clusters..."
            aria-label="Search clusters"
          />
          <ButlerSelect
            aria-label="Filter by team"
            className={classes.toolbarSelect}
            value={teamFilter}
            onChange={e => setTeamFilter(e.target.value)}
          >
            <option value="">All Teams</option>
            {namespaces.map(ns => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
          </ButlerSelect>
          <ButlerSelect
            aria-label="Filter by status"
            className={classes.toolbarSelect}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {statuses.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </ButlerSelect>
          {hasFilters && (
            <button
              type="button"
              className={classes.clear}
              onClick={() => {
                setSearch('');
                setTeamFilter('');
                setStatusFilter('');
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className={classes.countRow}>
          <p className={classes.count}>
            Showing {filtered.length} of {totalCount} clusters
          </p>
          <div
            role="group"
            aria-label="Group clusters by"
            className={classes.groupBy}
          >
            <span className={classes.groupLabel}>Group by</span>
            <GroupChip
              active={groupState.byEnv}
              onClick={() =>
                setGroupState({ ...groupState, byEnv: !groupState.byEnv })
              }
              label="Environment"
            />
            <GroupChip
              active={groupState.byTeam}
              onClick={() =>
                setGroupState({ ...groupState, byTeam: !groupState.byTeam })
              }
              label="Team"
            />
            {groupState.byEnv && groupState.byTeam && (
              <span className={classes.groupNote}>team &rarr; env</span>
            )}
          </div>
        </div>

        {management && !hasFilters && (
          <ClusterListRow
            to={routes.adminManagement()}
            name="Management Cluster"
            namespace="butler-system"
            phase={management.phase}
            tone="violet"
            tag="Management"
            stats={[
              {
                label: 'Nodes',
                value: `${management.nodes.ready}/${management.nodes.total}`,
              },
              { label: 'Version', value: management.kubernetesVersion },
              { label: 'Tenants', value: String(management.tenantClusters) },
            ]}
          />
        )}

        {viewMode === 'flat' && filtered.length > 0 && (
          <div className={classes.list} role="list" aria-label="Clusters">
            {filtered.map(c => clusterRow(c))}
          </div>
        )}

        {viewMode === 'env' && envSections && (
          <ButlerStack>
            {envSections.map(section => {
              const key = `env:${section.key}`;
              const cap = section.cap;
              const sublabel = [
                plural(section.clusters.length, 'cluster'),
                cap?.varies
                  ? 'per-member cap: varies by team'
                  : cap?.value != null
                  ? `per-member cap: ${cap.value}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <ButlerGroupSection
                  key={key}
                  label={section.label}
                  sublabel={sublabel}
                  accentDot={section.accent.dot}
                  tint={section.accent.headerTint}
                  collapsed={collapsed.has(key)}
                  onToggle={() => toggleCollapsed(key)}
                >
                  {renderSectionBody(section.clusters, section.accent.border)}
                </ButlerGroupSection>
              );
            })}
          </ButlerStack>
        )}

        {viewMode === 'team' && teamSections && (
          <ButlerStack>
            {teamSections.map(section => {
              const key = `team:${section.key}`;
              return (
                <ButlerGroupSection
                  key={key}
                  label={section.label}
                  sublabel={`${section.namespace || 'no namespace'} · ${plural(
                    section.clusters.length,
                    'cluster',
                  )}`}
                  accentDot={violet}
                  tint={rgba(tokens.palette.violet[500], 0.05)}
                  collapsed={collapsed.has(key)}
                  onToggle={() => toggleCollapsed(key)}
                >
                  {renderSectionBody(section.clusters, violet)}
                </ButlerGroupSection>
              );
            })}
          </ButlerStack>
        )}

        {viewMode === 'team-env' && teamEnvSections && (
          <ButlerStack>
            {teamEnvSections.map(team => {
              const teamKey = `tenv-team:${team.key}`;
              return (
                <ButlerGroupSection
                  key={teamKey}
                  label={team.label}
                  sublabel={`${team.namespace || 'no namespace'} · ${plural(
                    team.total,
                    'cluster',
                  )} · ${plural(team.envs.length, 'env')}`}
                  accentDot={violet}
                  tint={rgba(tokens.palette.violet[500], 0.05)}
                  collapsed={collapsed.has(teamKey)}
                  onToggle={() => toggleCollapsed(teamKey)}
                >
                  <ButlerGroupNested>
                    {team.envs.map(env => {
                      const envKey = `tenv-env:${env.key}`;
                      const sub = [
                        plural(env.clusters.length, 'cluster'),
                        env.cap != null ? `per-member cap: ${env.cap}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <ButlerGroupSection
                          key={envKey}
                          label={env.label}
                          sublabel={sub}
                          accentDot={env.accent.dot}
                          tint={env.accent.headerTint}
                          collapsed={collapsed.has(envKey)}
                          onToggle={() => toggleCollapsed(envKey)}
                          nested
                        >
                          {renderSectionBody(env.clusters, env.accent.border)}
                        </ButlerGroupSection>
                      );
                    })}
                  </ButlerGroupNested>
                </ButlerGroupSection>
              );
            })}
          </ButlerStack>
        )}

        {filtered.length === 0 && (!management || hasFilters) && (
          <ButlerEmptyState title="No clusters found" />
        )}
      </>
    );
  }

  const closeCreate = () => {
    setShowCreate(false);
    setSelectedTeam('');
  };

  return (
    <ButlerStack>
      <ButlerPageHeader
        title="All Clusters"
        subtitle="View and manage clusters across all teams"
        actions={
          isAdmin ? (
            <ButlerButton
              startIcon={<PlusIcon />}
              onClick={() => setShowCreate(true)}
            >
              Create Cluster
            </ButlerButton>
          ) : undefined
        }
      />
      {body}

      <ButlerDialog
        open={showCreate}
        onClose={closeCreate}
        title="Create Cluster"
        footer={
          teams.length > 0 ? (
            <>
              <ButlerButton variant="secondary" onClick={closeCreate}>
                Cancel
              </ButlerButton>
              <ButlerButton
                disabled={!selectedTeam}
                onClick={() => {
                  if (!selectedTeam) return;
                  closeCreate();
                  navigate(routes.createCluster({ team: selectedTeam }));
                }}
              >
                Continue
              </ButlerButton>
            </>
          ) : undefined
        }
      >
        {teams.length === 0 ? (
          <ButlerCallout tone="warning">
            <p className={classes.modalText}>
              No teams exist yet. Please create a team first before creating a
              cluster.
            </p>
            <RouterLink
              to={routes.adminTeams()}
              className={classes.modalLink}
              onClick={closeCreate}
            >
              Go to Teams &rarr;
            </RouterLink>
          </ButlerCallout>
        ) : (
          <>
            <p className={classes.modalText}>
              Select the team namespace where the cluster will be created:
            </p>
            <ButlerSelect
              aria-label="Team"
              value={selectedTeam}
              onChange={e => setSelectedTeam(e.target.value)}
            >
              <option value="">Select a team...</option>
              {teams.map(team => (
                <option key={team.name} value={team.name}>
                  {team.displayName || team.name}
                  {team.namespace && team.namespace !== team.name
                    ? ` (${team.namespace})`
                    : ''}
                </option>
              ))}
            </ButlerSelect>
          </>
        )}
      </ButlerDialog>
    </ButlerStack>
  );
};
