// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { alertApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';

import { butlerApiRef } from '../../api/ButlerApi';
import type {
  CAInfoResponse,
  NetworkInfo,
  Provider,
  ValidateResponse,
} from '../../api/types/providers';
import {
  describeValidation,
  providerReadiness,
} from '../../utils/providerRequest';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb, rgba } from '../../theme';
import {
  ArchiveIcon,
  ButlerButton,
  ButlerCard,
  ButlerChip,
  ButlerDialog,
  ButlerErrorState,
  ButlerInsetPanel,
  ButlerLoading,
  ButlerPageHeader,
  ButlerSpinner,
  ButlerStack,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from '../ui';
import { EditProviderDialog } from './EditProviderDialog';
import { ProviderIcon } from './ProviderIcon';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    list: {
      display: 'grid',
      gap: 16,
      margin: 0,
      padding: 0,
      listStyle: 'none',
    },
    card: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    },
    identity: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      minWidth: 0,
    },
    nameRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    name: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: t.text.primary,
    },
    namespace: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    // Console renders the type chip in untokenized Tailwind purple; the
    // violet token is the closest themed equivalent.
    typeChip: {
      backgroundColor: rgba(p.violet[500], 0.1),
      color: rgb(p.violet[400]),
      textTransform: 'capitalize',
      padding: '2px 8px',
    },
    stats: {
      display: 'flex',
      alignItems: 'center',
      gap: 24,
      flexWrap: 'wrap',
    },
    stat: { textAlign: 'right' },
    statLabel: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      letterSpacing: '0.025em',
      textTransform: 'uppercase',
      color: t.text.subtle,
    },
    statValue: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.secondary,
    },
    mono: {
      fontFamily: t.fontMono,
      maxWidth: 200,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    valid: { color: rgb(p.green[400]) },
    invalid: { color: rgb(p.red[400]) },
    actions: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    deleteButton: {
      color: t.text.subtle,
      '&:hover': {
        color: rgb(p.red[400]),
        backgroundColor: rgba(p.red[500], 0.1),
      },
    },
    emptyIcon: {
      width: 48,
      height: 48,
      borderRadius: '50%',
      backgroundColor: rgb(p.neutral[800]),
      color: t.text.subtle,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 16px',
    },
    emptyCard: { textAlign: 'center', padding: 32 },
    emptyTitle: {
      margin: '0 0 8px',
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 500,
      color: t.text.secondary,
    },
    emptyText: {
      margin: '0 0 16px',
      fontSize: 16,
      lineHeight: '24px',
      color: t.text.muted,
    },
    detail: {
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
    },
    sectionTitle: {
      margin: '0 0 12px',
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: t.text.muted,
    },
    infoGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 16,
    },
    infoLabel: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    infoValue: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      fontFamily: t.fontMono,
      color: t.text.secondary,
      overflowWrap: 'anywhere',
    },
    subtle: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    conditions: { display: 'flex', flexDirection: 'column', gap: 8 },
    condition: {
      padding: 12,
      borderRadius: t.radius.lg,
      border: `1px solid ${t.borderStrong}`,
      backgroundColor: t.inset,
    },
    conditionTrue: {
      borderColor: rgba(p.green[500], 0.2),
      backgroundColor: rgba(p.green[500], 0.05),
    },
    conditionFalse: {
      borderColor: rgba(p.red[500], 0.2),
      backgroundColor: rgba(p.red[500], 0.05),
    },
    conditionRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    conditionHead: { display: 'flex', alignItems: 'center', gap: 8 },
    conditionType: {
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: t.text.secondary,
    },
    conditionReason: {
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    conditionMessage: {
      margin: '4px 0 0',
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.muted,
    },
    networks: { display: 'flex', flexDirection: 'column', gap: 8 },
    network: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: 12,
      borderRadius: t.radius.lg,
      border: `1px solid ${t.borderStrong}`,
      backgroundColor: t.inset,
    },
    networkName: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      fontFamily: t.fontMono,
      color: t.text.secondary,
    },
    networkDescription: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    vlan: {
      backgroundColor: rgb(p.neutral[700]),
      color: rgb(p.neutral[300]),
      padding: '2px 8px',
    },
    loadingRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 14,
      color: t.text.subtle,
    },
    deleteText: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      color: rgb(p.neutral[300]),
    },
    deleteName: {
      fontFamily: t.fontMono,
      fontWeight: 600,
      color: rgb(p.red[400]),
    },
    deleteHint: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
  };
});

const providerKey = (p: Provider) =>
  `${p.metadata.namespace}/${p.metadata.name}`;

function formatAge(createdAt?: string): string {
  if (!createdAt) return 'Unknown';
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) return `${diffDays}d ago`;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours > 0) return `${diffHours}h ago`;
  return 'Just now';
}

function getEndpoint(provider: Provider): string {
  if (provider.spec.credentialsRef?.name) {
    return `Secret: ${provider.spec.credentialsRef.name}`;
  }
  if (provider.spec.nutanix?.endpoint) {
    const port = provider.spec.nutanix.port || 9440;
    return `${provider.spec.nutanix.endpoint}:${port}`;
  }
  if (provider.spec.proxmox?.endpoint) return provider.spec.proxmox.endpoint;
  return 'N/A';
}

export const ProvidersPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const alertApi = useApi(alertApiRef);
  const routes = useButlerRoutes();
  const { isAdmin: canMutate } = useTeamContext();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<
    Record<string, ValidateResponse>
  >({});
  const [selected, setSelected] = useState<Provider | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<Provider | null>(null);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listProviders();
      setProviders(response.providers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleValidate = async (provider: Provider, e?: MouseEvent) => {
    e?.stopPropagation();
    const key = providerKey(provider);
    setValidating(key);
    try {
      const result = await api.validateProvider(
        provider.metadata.namespace,
        provider.metadata.name,
      );
      setValidationResults(prev => ({ ...prev, [key]: result }));
      const described = describeValidation(result);
      alertApi.post({
        message: `${described.headline}: ${described.detail}`,
        severity: result.valid ? 'success' : 'error',
        display: 'transient',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Validation failed';
      setValidationResults(prev => ({
        ...prev,
        [key]: { valid: false, message },
      }));
      alertApi.post({
        message: `Validation Error: ${message}`,
        severity: 'error',
        display: 'transient',
      });
    } finally {
      setValidating(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteProvider(
        deleteTarget.metadata.namespace,
        deleteTarget.metadata.name,
      );
      alertApi.post({
        message: `Provider Deleted: ${deleteTarget.metadata.name} has been deleted`,
        severity: 'success',
        display: 'transient',
      });
      setProviders(prev =>
        prev.filter(p => providerKey(p) !== providerKey(deleteTarget)),
      );
      setDeleteTarget(null);
    } catch (err) {
      alertApi.post({
        message: `Delete Failed: ${
          err instanceof Error ? err.message : 'Failed to delete provider'
        }`,
        severity: 'error',
        display: 'transient',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <ButlerLoading />;

  if (error) {
    return <ButlerErrorState message={error} onRetry={loadProviders} />;
  }

  const addButton = (
    <ButlerButton
      component={RouterLink}
      to={routes.adminCreateProvider()}
      startIcon={<PlusIcon />}
    >
      Add Provider
    </ButlerButton>
  );

  return (
    <>
      <ButlerStack>
        <ButlerPageHeader
          title="Providers"
          subtitle="Infrastructure provider configurations for cluster provisioning"
          actions={canMutate ? addButton : undefined}
        />

        {providers.length === 0 ? (
          <ButlerCard flush className={classes.emptyCard}>
            <div className={classes.emptyIcon}>
              <ArchiveIcon size={24} />
            </div>
            <h3 className={classes.emptyTitle}>No Providers</h3>
            <p className={classes.emptyText}>
              Get started by adding your first infrastructure provider.
            </p>
            {canMutate && (
              <ButlerButton
                component={RouterLink}
                to={routes.adminCreateProvider()}
              >
                Add Provider
              </ButlerButton>
            )}
          </ButlerCard>
        ) : (
          <ul className={classes.list} aria-label="Providers">
            {providers.map(provider => {
              const key = providerKey(provider);
              return (
                <li key={provider.metadata.uid ?? key}>
                  <ProviderCard
                    provider={provider}
                    canMutate={canMutate}
                    isValidating={validating === key}
                    validationResult={validationResults[key]}
                    onClick={() => setSelected(provider)}
                    onValidate={e => handleValidate(provider, e)}
                    onEdit={e => {
                      e.stopPropagation();
                      setEditTarget(provider);
                    }}
                    onDelete={e => {
                      e.stopPropagation();
                      setDeleteTarget(provider);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </ButlerStack>

      <ButlerDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        width={512}
        title={selected?.metadata.name ?? ''}
        subtitle={selected?.metadata.namespace}
        icon={
          selected ? (
            <ProviderIcon type={selected.spec.provider} tile />
          ) : undefined
        }
        footer={
          <>
            <ButlerButton variant="secondary" onClick={() => setSelected(null)}>
              Close
            </ButlerButton>
            {canMutate && selected && (
              <ButlerButton
                variant="secondary"
                startIcon={<EditIcon />}
                onClick={() => {
                  setEditTarget(selected);
                  setSelected(null);
                }}
              >
                Edit
              </ButlerButton>
            )}
            {canMutate && selected && (
              <ButlerButton
                variant="danger"
                onClick={() => {
                  setDeleteTarget(selected);
                  setSelected(null);
                }}
              >
                Delete
              </ButlerButton>
            )}
          </>
        }
      >
        {selected && (
          <ProviderDetail
            provider={selected}
            canMutate={canMutate}
            isValidating={validating === providerKey(selected)}
            validationResult={validationResults[providerKey(selected)]}
            onValidate={() => handleValidate(selected)}
          />
        )}
      </ButlerDialog>

      {canMutate && editTarget && (
        <EditProviderDialog
          open
          provider={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(ns, name, request) => api.updateProvider(ns, name, request)}
          onSaved={async () => {
            alertApi.post({
              message: `Provider Updated: ${editTarget.metadata.name} has been updated`,
              severity: 'success',
              display: 'transient',
            });
            setEditTarget(null);
            await loadProviders();
          }}
        />
      )}

      {canMutate && (
        <ButlerDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          busy={deleting}
          title="Delete Provider"
          subtitle="This action cannot be undone"
          icon={<TrashIcon />}
          iconTone="danger"
          footer={
            <>
              <ButlerButton
                variant="secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </ButlerButton>
              <ButlerButton
                variant="danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Provider'}
              </ButlerButton>
            </>
          }
        >
          <p className={classes.deleteText}>
            Are you sure you want to delete provider{' '}
            <span className={classes.deleteName}>
              {deleteTarget?.metadata.name}
            </span>
            ?
          </p>
          <p className={classes.deleteHint}>
            This will also delete the associated credentials secret. Any
            clusters using this provider will not be affected.
          </p>
        </ButlerDialog>
      )}
    </>
  );
};

interface ProviderCardProps {
  provider: Provider;
  canMutate: boolean;
  isValidating: boolean;
  validationResult?: ValidateResponse;
  onClick: () => void;
  onValidate: (e: MouseEvent) => void;
  onEdit: (e: MouseEvent) => void;
  onDelete: (e: MouseEvent) => void;
}

const ProviderCard = ({
  provider,
  canMutate,
  isValidating,
  validationResult,
  onClick,
  onValidate,
  onEdit,
  onDelete,
}: ProviderCardProps) => {
  const classes = useStyles();
  const type = provider.spec.provider || 'unknown';
  const readiness = providerReadiness(provider);
  return (
    <ButlerCard
      hoverable
      className={classes.card}
      role="button"
      tabIndex={0}
      aria-label={`${provider.metadata.name} details`}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className={classes.identity}>
        <ProviderIcon type={type} tile />
        <div>
          <div className={classes.nameRow}>
            <p className={classes.name}>{provider.metadata.name}</p>
            <ButlerChip className={classes.typeChip}>{type}</ButlerChip>
          </div>
          <p className={classes.namespace}>{provider.metadata.namespace}</p>
        </div>
      </div>

      <div className={classes.stats}>
        <div className={classes.stat}>
          <p className={classes.statLabel}>Endpoint</p>
          <p
            className={clsx(classes.statValue, classes.mono)}
            title={getEndpoint(provider)}
          >
            {getEndpoint(provider)}
          </p>
        </div>
        <div className={classes.stat}>
          <p className={classes.statLabel}>Age</p>
          <p className={classes.statValue}>
            {formatAge(provider.metadata.creationTimestamp)}
          </p>
        </div>
        {validationResult && (
          <div className={classes.stat}>
            <p className={classes.statLabel}>Status</p>
            <p
              className={clsx(
                classes.statValue,
                validationResult.valid ? classes.valid : classes.invalid,
              )}
            >
              {describeValidation(validationResult).headline}
            </p>
          </div>
        )}
        <div className={classes.stat}>
          <p className={classes.statLabel}>Readiness</p>
          <p className={classes.statValue} title={readiness.detail}>
            {readiness.headline}
          </p>
        </div>
        {canMutate && (
          <div className={classes.actions}>
            <ButlerButton
              variant="secondary"
              onClick={onValidate}
              disabled={isValidating}
            >
              {isValidating ? 'Testing...' : 'Test'}
            </ButlerButton>
            <ButlerButton
              variant="ghost"
              onClick={onEdit}
              title="Edit provider"
              aria-label={`Edit provider ${provider.metadata.name}`}
              style={{ padding: 8 }}
            >
              <EditIcon />
            </ButlerButton>
            <ButlerButton
              variant="ghost"
              className={classes.deleteButton}
              onClick={onDelete}
              title="Delete provider"
              aria-label={`Delete provider ${provider.metadata.name}`}
              style={{ padding: 8 }}
            >
              <TrashIcon />
            </ButlerButton>
          </div>
        )}
      </div>
    </ButlerCard>
  );
};

const InfoRow = ({ label, value }: { label: string; value: string }) => {
  const classes = useStyles();
  return (
    <div>
      <p className={classes.infoLabel}>{label}</p>
      <p className={classes.infoValue}>{value}</p>
    </div>
  );
};

interface ProviderDetailProps {
  provider: Provider;
  canMutate: boolean;
  isValidating: boolean;
  validationResult?: ValidateResponse;
  onValidate: () => void;
}

const ProviderDetail = ({
  provider,
  canMutate,
  isValidating,
  validationResult,
  onValidate,
}: ProviderDetailProps) => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const type = provider.spec.provider;
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  const [networksLoading, setNetworksLoading] = useState(false);
  const [networksError, setNetworksError] = useState<string | null>(null);
  const [caInfo, setCaInfo] = useState<CAInfoResponse | null>(null);
  const [caError, setCaError] = useState<string | null>(null);
  const readiness = providerReadiness(provider);

  useEffect(() => {
    let cancelled = false;
    setCaInfo(null);
    setCaError(null);
    api
      .getProviderCAInfo(provider.metadata.namespace, provider.metadata.name)
      .then(res => {
        if (!cancelled) setCaInfo(res);
      })
      .catch(err => {
        if (!cancelled) {
          setCaError(
            err instanceof Error ? err.message : 'Failed to load CA info',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, provider.metadata.namespace, provider.metadata.name]);

  useEffect(() => {
    let cancelled = false;
    setNetworksLoading(true);
    setNetworksError(null);
    api
      .listProviderNetworks(provider.metadata.namespace, provider.metadata.name)
      .then(res => {
        if (!cancelled) setNetworks(res.networks ?? []);
      })
      .catch(err => {
        if (!cancelled) {
          setNetworksError(
            err instanceof Error ? err.message : 'Failed to load networks',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setNetworksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, provider.metadata.namespace, provider.metadata.name]);

  const lastValidated = provider.status?.lastValidationTime
    ? new Date(provider.status.lastValidationTime).toLocaleString()
    : undefined;

  return (
    <div className={classes.detail}>
      <ButlerInsetPanel
        title="Connection Status"
        description={
          validationResult ? (
            <span
              className={
                validationResult.valid ? classes.valid : classes.invalid
              }
            >
              {describeValidation(validationResult).headline}.{' '}
              {describeValidation(validationResult).detail}
            </span>
          ) : (
            `Not tested this session. ${readiness.headline}: ${readiness.detail}`
          )
        }
        action={
          canMutate ? (
            <ButlerButton
              variant="secondary"
              onClick={onValidate}
              disabled={isValidating}
            >
              {isValidating ? 'Testing...' : 'Test Connection'}
            </ButlerButton>
          ) : undefined
        }
      />

      <div>
        <h4 className={classes.sectionTitle}>Provider Details</h4>
        <div className={classes.infoGrid}>
          <InfoRow label="Type" value={type} />
          <InfoRow label="Namespace" value={provider.metadata.namespace} />
          <InfoRow
            label="Created"
            value={
              provider.metadata.creationTimestamp
                ? new Date(provider.metadata.creationTimestamp).toLocaleString()
                : 'Unknown'
            }
          />
          <InfoRow
            label="Credentials"
            value={provider.spec.credentialsRef?.name || 'None'}
          />
          <InfoRow label="Readiness" value={readiness.headline} />
          {provider.status?.validated !== undefined && (
            <InfoRow
              label="Credentials present"
              value={provider.status.validated ? 'Yes' : 'No'}
            />
          )}
          {provider.spec.scope && (
            <InfoRow
              label="Scope"
              value={
                provider.spec.scope.type === 'team'
                  ? `Team ${provider.spec.scope.teamRef?.name ?? ''}`
                  : 'Platform'
              }
            />
          )}
          {provider.status?.capacity && (
            <InfoRow
              label="Capacity"
              value={`${provider.status.capacity.availableIPs ?? '?'} IPs, ~${
                provider.status.capacity.estimatedTenants ?? '?'
              } tenants`}
            />
          )}
          {lastValidated && (
            <InfoRow label="Last Validated" value={lastValidated} />
          )}
        </div>
      </div>

      {type === 'nutanix' && provider.spec.nutanix && (
        <div>
          <h4 className={classes.sectionTitle}>Nutanix Configuration</h4>
          <div className={classes.infoGrid}>
            <InfoRow
              label="Endpoint"
              value={provider.spec.nutanix.endpoint || 'N/A'}
            />
            <InfoRow
              label="Port"
              value={String(provider.spec.nutanix.port || 9440)}
            />
            <InfoRow
              label="Insecure TLS"
              value={provider.spec.nutanix.insecure ? 'Yes' : 'No'}
            />
          </div>
        </div>
      )}

      {type === 'proxmox' && provider.spec.proxmox && (
        <div>
          <h4 className={classes.sectionTitle}>Proxmox Configuration</h4>
          <div className={classes.infoGrid}>
            <InfoRow
              label="Endpoint"
              value={provider.spec.proxmox.endpoint || 'N/A'}
            />
            <InfoRow
              label="Insecure TLS"
              value={provider.spec.proxmox.insecure ? 'Yes' : 'No'}
            />
          </div>
        </div>
      )}

      {type === 'harvester' && (
        <div>
          <h4 className={classes.sectionTitle}>Harvester Configuration</h4>
          <p className={classes.subtle}>Connection via kubeconfig</p>
        </div>
      )}

      {provider.spec.network && (
        <div>
          <h4 className={classes.sectionTitle}>Network</h4>
          <div className={classes.infoGrid}>
            <InfoRow
              label="Mode"
              value={provider.spec.network.mode ?? 'default'}
            />
            {provider.spec.network.subnet && (
              <InfoRow label="Subnet" value={provider.spec.network.subnet} />
            )}
            {provider.spec.network.gateway && (
              <InfoRow label="Gateway" value={provider.spec.network.gateway} />
            )}
            {provider.spec.network.dnsServers?.length ? (
              <InfoRow
                label="DNS"
                value={provider.spec.network.dnsServers.join(', ')}
              />
            ) : null}
            {provider.spec.network.poolRefs?.length ? (
              <InfoRow
                label="Pools"
                value={provider.spec.network.poolRefs
                  .map(r =>
                    r.priority !== undefined
                      ? `${r.name} (${r.priority})`
                      : r.name,
                  )
                  .join(', ')}
              />
            ) : null}
          </div>
        </div>
      )}

      {provider.spec.limits && (
        <div>
          <h4 className={classes.sectionTitle}>Limits</h4>
          <div className={classes.infoGrid}>
            <InfoRow
              label="Max clusters per team"
              value={String(provider.spec.limits.maxClustersPerTeam ?? 'None')}
            />
            <InfoRow
              label="Max nodes per team"
              value={String(provider.spec.limits.maxNodesPerTeam ?? 'None')}
            />
          </div>
        </div>
      )}

      <div>
        <h4 className={classes.sectionTitle}>Certificate Authority</h4>
        {caError ? (
          <p className={classes.subtle}>{caError}</p>
        ) : !caInfo ? (
          <p className={classes.subtle}>Loading CA info...</p>
        ) : !caInfo.configured ? (
          <p className={classes.subtle}>No CA bundle configured</p>
        ) : (
          <div className={classes.infoGrid}>
            {caInfo.health && <InfoRow label="Health" value={caInfo.health} />}
            {caInfo.nearestExpiry && (
              <InfoRow
                label="Nearest expiry"
                value={new Date(caInfo.nearestExpiry).toLocaleString()}
              />
            )}
            {(caInfo.certificates ?? []).map(cert => (
              <InfoRow
                key={`${cert.subject}-${cert.notAfter}`}
                label={cert.subject || 'Certificate'}
                value={
                  cert.notAfter
                    ? `Expires ${new Date(cert.notAfter).toLocaleDateString()}`
                    : 'No expiry reported'
                }
              />
            ))}
          </div>
        )}
      </div>

      {provider.status?.conditions && provider.status.conditions.length > 0 && (
        <div>
          <h4 className={classes.sectionTitle}>Conditions</h4>
          <div className={classes.conditions}>
            {provider.status.conditions.map(condition => {
              const tone =
                condition.status === 'True'
                  ? 'green'
                  : condition.status === 'False'
                  ? 'red'
                  : 'neutral';
              return (
                <div
                  key={condition.type}
                  className={clsx(
                    classes.condition,
                    tone === 'green' && classes.conditionTrue,
                    tone === 'red' && classes.conditionFalse,
                  )}
                >
                  <div className={classes.conditionRow}>
                    <div className={classes.conditionHead}>
                      <ButlerChip tone={tone}>{condition.status}</ButlerChip>
                      <span className={classes.conditionType}>
                        {condition.type}
                      </span>
                    </div>
                    {condition.reason && (
                      <span className={classes.conditionReason}>
                        {condition.reason}
                      </span>
                    )}
                  </div>
                  {condition.message && (
                    <p className={classes.conditionMessage}>
                      {condition.message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h4 className={classes.sectionTitle}>Provider Networks</h4>
        {networksLoading ? (
          <div className={classes.loadingRow}>
            <ButlerSpinner small />
            <span>Loading networks...</span>
          </div>
        ) : networksError ? (
          <p className={classes.subtle}>{networksError}</p>
        ) : networks.length === 0 ? (
          <p className={classes.subtle}>No networks found</p>
        ) : (
          <div className={classes.networks}>
            {networks.map(network => (
              <div key={network.id || network.name} className={classes.network}>
                <div>
                  <p className={classes.networkName}>{network.name}</p>
                  {network.description && (
                    <p className={classes.networkDescription}>
                      {network.description}
                    </p>
                  )}
                </div>
                {network.vlan !== undefined && (
                  <ButlerChip className={classes.vlan}>
                    VLAN {network.vlan}
                  </ButlerChip>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
