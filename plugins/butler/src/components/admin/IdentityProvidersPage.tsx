// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { alertApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';

import { butlerApiRef } from '../../api/ButlerApi';
import type { IdentityProvider } from '../../api/types/identity-providers';
import {
  describeDiscovery,
  identityProviderReadiness,
} from '../../utils/identityProviderRequest';
import { EditIdentityProviderDialog } from './EditIdentityProviderDialog';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb, rgba } from '../../theme';
import {
  ButlerButton,
  ButlerCard,
  ButlerChip,
  ButlerDialog,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
  ButlerStatusBadge,
  EditIcon,
  KeyIcon,
  PlusIcon,
  TrashIcon,
} from '../ui';
import {
  IdentityProviderIcon,
  formatIdentityProviderAge,
  getIdentityProviderType,
} from './IdentityProviderIcons';

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
      padding: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    },
    iconTile: {
      width: 48,
      height: 48,
      borderRadius: t.radius.lg,
      backgroundColor: rgb(p.neutral[800]),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    iconTileSm: { width: 40, height: 40 },
    info: { flex: 1, minWidth: 0 },
    nameRow: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
    name: {
      margin: 0,
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 500,
      color: t.text.strong,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    typeChip: { padding: '2px 8px', fontWeight: 400 },
    issuer: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    age: {
      flexShrink: 0,
      width: 96,
      textAlign: 'right',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    actions: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
    errorCard: {
      padding: 16,
      borderColor: rgba(p.red[500], 0.2),
      backgroundColor: rgba(p.red[500], 0.1),
    },
    errorText: {
      margin: '0 0 8px',
      fontSize: 16,
      lineHeight: '24px',
      color: rgb(p.red[400]),
    },
    emptyCard: { textAlign: 'center', padding: 32 },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: '50%',
      backgroundColor: rgb(p.neutral[800]),
      color: t.text.subtle,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 16px',
    },
    emptyTitle: {
      margin: '0 0 8px',
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 500,
      color: t.text.secondary,
    },
    emptyText: {
      margin: '0 auto 16px',
      maxWidth: 448,
      fontSize: 16,
      lineHeight: '24px',
      color: t.text.subtle,
    },
    detail: { display: 'flex', flexDirection: 'column', gap: 16 },
    badgeSlot: { marginLeft: 'auto' },
    block: {
      padding: 16,
      borderRadius: t.radius.lg,
      backgroundColor: t.inset,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    blockTitle: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      letterSpacing: '0.025em',
      textTransform: 'uppercase',
      color: t.text.muted,
    },
    grid2: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 12,
    },
    kvLabel: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    kvValue: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.secondary,
    },
    kvSmall: { fontSize: 12, lineHeight: '16px' },
    kvMono: {
      fontFamily: t.fontMono,
      overflowWrap: 'anywhere',
      color: rgb(p.neutral[300]),
    },
    scopes: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    scope: {
      backgroundColor: rgb(p.neutral[700]),
      color: rgb(p.neutral[300]),
      padding: '2px 8px',
      fontWeight: 400,
    },
    message: {
      margin: 0,
      padding: 12,
      borderRadius: t.radius.lg,
      backgroundColor: t.inset,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
    },
    messageFailed: {
      backgroundColor: rgba(p.red[500], 0.1),
      border: `1px solid ${rgba(p.red[500], 0.2)}`,
      color: rgb(p.red[400]),
    },
    deleteText: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      color: rgb(p.neutral[300]),
    },
    deleteName: { fontWeight: 600, color: t.text.strong },
    deleteHint: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
  };
});

export const IdentityProvidersPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const alertApi = useApi(alertApiRef);
  const routes = useButlerRoutes();
  const { isAdmin: canMutate } = useTeamContext();

  const [providers, setProviders] = useState<IdentityProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<IdentityProvider | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IdentityProvider | null>(
    null,
  );
  const [validating, setValidating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<IdentityProvider | null>(null);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listIdentityProviders();
      setProviders(response.identityProviders ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load identity providers',
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleValidate = async (name: string) => {
    setValidating(true);
    try {
      const result = await api.validateIdentityProvider(name);
      const described = describeDiscovery(result);
      alertApi.post({
        message: `${described.headline}: ${described.detail}`,
        severity: result.valid ? 'success' : 'error',
        display: 'transient',
      });
    } catch (err) {
      alertApi.post({
        message: err instanceof Error ? err.message : 'Validation failed',
        severity: 'error',
        display: 'transient',
      });
    } finally {
      setValidating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const label = deleteTarget.spec.displayName || deleteTarget.metadata.name;
    try {
      const result = await api.deleteIdentityProvider(
        deleteTarget.metadata.name,
      );
      alertApi.post({
        message:
          result?.status === 'cleaned'
            ? result.message || `Cleaned up orphaned resources for ${label}`
            : `Deleted ${label}`,
        severity: 'success',
        display: 'transient',
      });
      setDeleteTarget(null);
      setSelected(null);
      fetchProviders();
    } catch (err) {
      alertApi.post({
        message:
          err instanceof Error ? err.message : 'Failed to delete provider',
        severity: 'error',
        display: 'transient',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <ButlerLoading />;

  const createPath = routes.adminCreateIdentityProvider();

  return (
    <>
      <ButlerStack>
        <ButlerPageHeader
          title="Identity Providers"
          subtitle="Configure SSO authentication providers for Butler Console"
          actions={
            canMutate ? (
              <ButlerButton
                component={RouterLink}
                to={createPath}
                startIcon={<PlusIcon />}
              >
                Add Provider
              </ButlerButton>
            ) : undefined
          }
        />

        {error && (
          <ButlerCard flush className={classes.errorCard} role="alert">
            <p className={classes.errorText}>{error}</p>
            <ButlerButton
              variant="secondary"
              size="sm"
              onClick={fetchProviders}
            >
              Retry
            </ButlerButton>
          </ButlerCard>
        )}

        {!error && providers.length === 0 && (
          <ButlerCard flush className={classes.emptyCard}>
            <div className={classes.emptyIcon}>
              <KeyIcon size={32} />
            </div>
            <h3 className={classes.emptyTitle}>No Identity Providers</h3>
            <p className={classes.emptyText}>
              Add an OIDC identity provider to enable SSO authentication for
              your users. Butler supports Google Workspace, Microsoft Entra ID,
              Okta, and other OIDC providers.
            </p>
            {canMutate && (
              <ButlerButton component={RouterLink} to={createPath}>
                Add Your First Provider
              </ButlerButton>
            )}
          </ButlerCard>
        )}

        {providers.length > 0 && (
          <ul className={classes.list} aria-label="Identity providers">
            {providers.map(provider => {
              const issuerURL = provider.spec.oidc?.issuerURL || '';
              const displayName =
                provider.spec.displayName || provider.metadata.name;
              const phase = provider.status?.phase || 'Active';
              return (
                <li key={provider.metadata.name}>
                  <ButlerCard flush className={classes.card}>
                    <div className={classes.iconTile}>
                      <IdentityProviderIcon issuerURL={issuerURL} />
                    </div>
                    <div className={classes.info}>
                      <div className={classes.nameRow}>
                        <h3 className={classes.name}>{displayName}</h3>
                        <ButlerChip className={classes.typeChip}>
                          {getIdentityProviderType(issuerURL)}
                        </ButlerChip>
                      </div>
                      <p className={classes.issuer} title={issuerURL}>
                        {issuerURL}
                      </p>
                    </div>
                    <ButlerStatusBadge status={phase} />
                    <div className={classes.age}>
                      {formatIdentityProviderAge(
                        provider.metadata.creationTimestamp,
                      )}
                    </div>
                    <div className={classes.actions}>
                      <ButlerButton
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelected(provider)}
                        aria-label={`View ${displayName}`}
                      >
                        View
                      </ButlerButton>
                      {canMutate && (
                        <ButlerButton
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditTarget(provider)}
                          aria-label={`Edit ${displayName}`}
                        >
                          Edit
                        </ButlerButton>
                      )}
                      {canMutate && (
                        <ButlerButton
                          variant="danger"
                          size="sm"
                          onClick={() => setDeleteTarget(provider)}
                          aria-label={`Delete ${displayName}`}
                        >
                          Delete
                        </ButlerButton>
                      )}
                    </div>
                  </ButlerCard>
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
        title={selected?.spec.displayName || selected?.metadata.name || ''}
        subtitle={selected ? `@${selected.metadata.name}` : undefined}
        icon={
          selected ? (
            <div className={clsx(classes.iconTile, classes.iconTileSm)}>
              <IdentityProviderIcon issuerURL={selected.spec.oidc?.issuerURL} />
            </div>
          ) : undefined
        }
        footer={
          selected && (
            <>
              <ButlerButton
                variant="secondary"
                onClick={() => setSelected(null)}
              >
                Close
              </ButlerButton>
              {canMutate && (
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
              {canMutate && (
                <ButlerButton
                  onClick={() => handleValidate(selected.metadata.name)}
                  disabled={validating}
                >
                  {validating ? 'Validating...' : 'Test Connection'}
                </ButlerButton>
              )}
            </>
          )
        }
      >
        {selected && <IdentityProviderDetail provider={selected} />}
      </ButlerDialog>

      {canMutate && editTarget && (
        <EditIdentityProviderDialog
          open
          provider={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(name, request) => api.updateIdentityProvider(name, request)}
          onSaved={async () => {
            alertApi.post({
              message: `Identity provider updated: ${
                editTarget.spec.displayName || editTarget.metadata.name
              }`,
              severity: 'success',
              display: 'transient',
            });
            setEditTarget(null);
            await fetchProviders();
          }}
        />
      )}

      {canMutate && (
        <ButlerDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          busy={deleting}
          title="Delete Identity Provider"
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
            Are you sure you want to delete the identity provider{' '}
            <span className={classes.deleteName}>
              {deleteTarget?.spec.displayName || deleteTarget?.metadata.name}
            </span>
            ?
          </p>
          <p className={classes.deleteHint}>
            This will remove the SSO configuration. Users authenticating via
            this provider will no longer be able to log in.
          </p>
        </ButlerDialog>
      )}
    </>
  );
};

const IdentityProviderDetail = ({
  provider,
}: {
  provider: IdentityProvider;
}) => {
  const classes = useStyles();
  const issuerURL = provider.spec.oidc?.issuerURL || '';
  const phase = provider.status?.phase;
  const endpoints = provider.status?.discoveredEndpoints;
  const readiness = identityProviderReadiness(provider);
  const oidc = provider.spec.oidc;

  return (
    <div className={classes.detail}>
      <div className={classes.badgeSlot}>
        {phase ? (
          <ButlerStatusBadge status={phase} />
        ) : (
          <ButlerChip>{readiness.headline}</ButlerChip>
        )}
        <p className={classes.kvLabel}>{readiness.detail}</p>
      </div>

      <div className={classes.block}>
        <h4 className={classes.blockTitle}>Configuration</h4>
        <div className={classes.grid2}>
          <div>
            <p className={classes.kvLabel}>Type</p>
            <p className={classes.kvValue}>
              {getIdentityProviderType(issuerURL)}
            </p>
          </div>
          <div>
            <p className={classes.kvLabel}>Created</p>
            <p className={classes.kvValue}>
              {formatIdentityProviderAge(provider.metadata.creationTimestamp)}
            </p>
          </div>
        </div>
        <div>
          <p className={classes.kvLabel}>Issuer URL</p>
          <p className={clsx(classes.kvValue, classes.kvMono)}>{issuerURL}</p>
        </div>
        <div>
          <p className={classes.kvLabel}>Client ID</p>
          <p className={clsx(classes.kvValue, classes.kvMono)}>
            {provider.spec.oidc?.clientID || '-'}
          </p>
        </div>
        <div>
          <p className={classes.kvLabel}>Redirect URL</p>
          <p className={clsx(classes.kvValue, classes.kvMono)}>
            {provider.spec.oidc?.redirectURL || '-'}
          </p>
        </div>
        <div>
          <p className={classes.kvLabel}>Client Secret</p>
          <p className={clsx(classes.kvValue, classes.kvMono)}>
            {oidc?.clientSecretRef?.name
              ? `Configured in secret ${oidc.clientSecretRef.name}`
              : 'No secret reference'}
          </p>
        </div>
        <div className={classes.grid2}>
          <div>
            <p className={classes.kvLabel}>Email Claim</p>
            <p className={clsx(classes.kvValue, classes.kvMono)}>
              {oidc?.emailClaim || 'email (default)'}
            </p>
          </div>
          <div>
            <p className={classes.kvLabel}>Groups Claim</p>
            <p className={clsx(classes.kvValue, classes.kvMono)}>
              {oidc?.groupsClaim || 'groups (default)'}
            </p>
          </div>
        </div>
        <div>
          <p className={classes.kvLabel}>TLS Verification</p>
          <p className={classes.kvValue}>
            {oidc?.insecureSkipVerify ? 'Skipped (insecure)' : 'Enforced'}
          </p>
        </div>
        {provider.spec.oidc?.hostedDomain && (
          <div>
            <p className={classes.kvLabel}>Hosted Domain</p>
            <p className={classes.kvValue}>{provider.spec.oidc.hostedDomain}</p>
          </div>
        )}
        {provider.spec.oidc?.scopes && provider.spec.oidc.scopes.length > 0 && (
          <div>
            <p className={classes.kvLabel}>Scopes</p>
            <div className={classes.scopes}>
              {provider.spec.oidc.scopes.map(scope => (
                <ButlerChip key={scope} className={classes.scope}>
                  {scope}
                </ButlerChip>
              ))}
            </div>
          </div>
        )}
      </div>

      {endpoints &&
        (endpoints.authorizationEndpoint || endpoints.tokenEndpoint) && (
          <div className={classes.block}>
            <h4 className={classes.blockTitle}>Discovered Endpoints</h4>
            {endpoints.authorizationEndpoint && (
              <div>
                <p className={clsx(classes.kvLabel, classes.kvSmall)}>
                  Authorization
                </p>
                <p
                  className={clsx(
                    classes.kvValue,
                    classes.kvSmall,
                    classes.kvMono,
                  )}
                >
                  {endpoints.authorizationEndpoint}
                </p>
              </div>
            )}
            {endpoints.tokenEndpoint && (
              <div>
                <p className={clsx(classes.kvLabel, classes.kvSmall)}>Token</p>
                <p
                  className={clsx(
                    classes.kvValue,
                    classes.kvSmall,
                    classes.kvMono,
                  )}
                >
                  {endpoints.tokenEndpoint}
                </p>
              </div>
            )}
          </div>
        )}

      {provider.status?.message && (
        <p
          className={clsx(
            classes.message,
            phase === 'Failed' && classes.messageFailed,
          )}
        >
          {provider.status.message}
        </p>
      )}
    </div>
  );
};
