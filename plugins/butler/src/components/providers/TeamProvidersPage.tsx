// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import { butlerApiRef } from '../../api/ButlerApi';
import { extractWebhookDenial } from '../../api/ButlerApiError';
import type { Provider } from '../../api/types/providers';
import { providerScope } from '../../api/types/providers';
import { useTeamProviders } from '../../hooks/useTeamProviders';
import { useCanOperateTeam } from '../../hooks/useCanOperateTeam';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb } from '../../theme';
import {
  AlertTriangleIcon,
  ButlerButton,
  ButlerCallout,
  ButlerCard,
  ButlerChip,
  ButlerDialog,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerGrid,
  ButlerKeyValueList,
  ButlerKeyValueRow,
  ButlerLoading,
  ButlerPageHeader,
  ButlerStack,
  ButlerStatusBadge,
} from '../ui';
import { ProviderIcon } from './ProviderIcon';

const PROVIDER_LABELS: Record<string, string> = {
  aws: 'Amazon Web Services',
  azure: 'Microsoft Azure',
  gcp: 'Google Cloud Platform',
  harvester: 'Harvester',
  nutanix: 'Nutanix',
  proxmox: 'Proxmox',
};

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    card: { cursor: 'pointer' },
    head: { display: 'flex', alignItems: 'center', gap: 12 },
    name: {
      margin: 0,
      fontSize: 15,
      fontWeight: 500,
      color: rgb(t.palette.neutral[100]),
    },
    type: { margin: '2px 0 0', fontSize: 12, color: t.text.subtle },
    chips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    facts: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 8,
      marginTop: 12,
    },
    fact: { margin: 0, fontSize: 12, color: t.text.subtle },
    factValue: {
      display: 'block',
      fontFamily: t.fontMono,
      fontSize: 13,
      color: rgb(t.palette.neutral[200]),
    },
    actions: { display: 'flex', justifyContent: 'flex-end', marginTop: 12 },
    note: { margin: 0, fontSize: 12, color: t.text.subtle },
    lead: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(t.palette.neutral[300]),
    },
  };
});

/** Where a cloud provider lives, or nothing for an on-premises one. */
function providerPlace(provider: Provider): {
  region?: string;
  network?: string;
} {
  const { spec } = provider;
  if (spec.aws) return { region: spec.aws.region, network: spec.aws.vpcId };
  if (spec.azure) {
    return { region: spec.azure.location, network: spec.azure.vnetName };
  }
  if (spec.gcp) return { region: spec.gcp.region, network: spec.gcp.network };
  return {};
}

/**
 * The providers a team may create clusters against, which is the same
 * list its create form offers.
 *
 * Every team role can read this: the server serves the list to all of
 * them. Removing a provider is offered to the roles the server lets
 * operate the team, and only for a provider scoped to this team; a
 * platform provider is the platform's to manage and is shown as such.
 * Connecting a new cloud account is not offered here yet and is recorded
 * as a gap rather than presented half-built.
 */
export const TeamProvidersPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const params = useParams();
  const { activeTeam, activeTeamDisplayName } = useTeamContext();
  const team = params.team ?? activeTeam ?? '';
  const canOperate = useCanOperateTeam(team);
  const { providers, loading, error, refresh } = useTeamProviders(team);

  const [selected, setSelected] = useState<Provider | null>(null);
  const [removing, setRemoving] = useState<Provider | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const header = (
    <ButlerPageHeader
      title="Providers"
      subtitle={`Infrastructure available to ${
        activeTeamDisplayName || team || 'this team'
      }`}
    />
  );

  if (loading && providers.length === 0) {
    return (
      <ButlerStack>
        {header}
        <ButlerLoading />
      </ButlerStack>
    );
  }
  if (error && providers.length === 0) {
    return (
      <ButlerStack>
        {header}
        <ButlerErrorState
          message="Failed to load providers"
          detail={error.message}
          onRetry={() => refresh()}
        />
      </ButlerStack>
    );
  }

  const handleRemove = async () => {
    if (!removing) return;
    setBusy(true);
    setRemoveError(null);
    try {
      await api.deleteTeamProvider(
        team,
        removing.metadata.namespace,
        removing.metadata.name,
      );
      setRemoving(null);
      await refresh();
    } catch (err) {
      setRemoveError(
        extractWebhookDenial(
          err instanceof Error ? err.message : 'Failed to remove provider',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ButlerStack>
      {header}

      {providers.length === 0 ? (
        <ButlerEmptyState
          title="No providers available to this team"
          description="Clusters are created against a provider. None is scoped to this team and no platform provider exists. Ask a platform admin to assign one."
        />
      ) : (
        <ButlerGrid>
          {providers.map(provider => {
            const type = provider.spec.provider;
            const scope = providerScope(provider);
            const place = providerPlace(provider);
            const ips = provider.status?.capacity?.availableIPs;
            const mode = provider.spec.network?.mode;
            return (
              <ButlerCard
                key={provider.metadata.uid ?? provider.metadata.name}
                hoverable
                className={classes.card}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(provider)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') setSelected(provider);
                }}
                aria-label={`Provider ${provider.metadata.name}`}
              >
                <div className={classes.head}>
                  <ProviderIcon type={type} tile />
                  <div>
                    <p className={classes.name}>{provider.metadata.name}</p>
                    <p className={classes.type}>
                      {PROVIDER_LABELS[type] ?? type}
                    </p>
                  </div>
                </div>
                <div className={classes.chips}>
                  <ButlerStatusBadge
                    status={provider.status?.ready ? 'Ready' : 'Pending'}
                  />
                  <ButlerChip tone={scope === 'team' ? 'violet' : 'neutral'}>
                    {scope === 'team' ? 'Team scoped' : 'Platform wide'}
                  </ButlerChip>
                  {mode && (
                    <ButlerChip tone="blue">
                      {mode === 'cloud' ? 'Cloud network' : 'IPAM'}
                    </ButlerChip>
                  )}
                </div>
                {(place.region || place.network || ips !== undefined) && (
                  <div className={classes.facts}>
                    {place.region && (
                      <p className={classes.fact}>
                        Region
                        <span className={classes.factValue}>
                          {place.region}
                        </span>
                      </p>
                    )}
                    {place.network && (
                      <p className={classes.fact}>
                        Network
                        <span className={classes.factValue}>
                          {place.network}
                        </span>
                      </p>
                    )}
                    {ips !== undefined && (
                      <p className={classes.fact}>
                        Available addresses
                        <span className={classes.factValue}>
                          {ips.toLocaleString()}
                        </span>
                      </p>
                    )}
                  </div>
                )}
                {scope === 'team' && canOperate && (
                  <div className={classes.actions}>
                    <ButlerButton
                      variant="danger"
                      size="sm"
                      onClick={e => {
                        e.stopPropagation();
                        setRemoveError(null);
                        setRemoving(provider);
                      }}
                    >
                      Remove
                    </ButlerButton>
                  </div>
                )}
              </ButlerCard>
            );
          })}
        </ButlerGrid>
      )}

      <ButlerCard title="About providers">
        <p className={classes.note}>
          A platform provider is available to every team and is managed by
          platform admins. A team provider belongs to this team alone; a cluster
          from any other team that references it is refused at admission.
          Connecting a new cloud account to this team is not offered here yet.
        </p>
      </ButlerCard>

      {selected && (
        <ButlerDialog
          open
          onClose={() => setSelected(null)}
          title={selected.metadata.name}
          subtitle={
            PROVIDER_LABELS[selected.spec.provider] ?? selected.spec.provider
          }
          icon={<ProviderIcon type={selected.spec.provider} />}
          width={512}
          footer={
            <ButlerButton variant="secondary" onClick={() => setSelected(null)}>
              Close
            </ButlerButton>
          }
        >
          <ButlerKeyValueList>
            <ButlerKeyValueRow label="Status" dense>
              {selected.status?.ready ? 'Ready' : 'Pending'}
            </ButlerKeyValueRow>
            <ButlerKeyValueRow label="Scope" dense>
              {providerScope(selected) === 'team'
                ? `Scoped to ${selected.spec.scope?.teamRef?.name ?? team}`
                : 'Platform wide'}
            </ButlerKeyValueRow>
            <ButlerKeyValueRow label="Namespace" dense mono>
              {selected.metadata.namespace}
            </ButlerKeyValueRow>
            {selected.spec.network?.mode && (
              <ButlerKeyValueRow label="Addressing" dense>
                {selected.spec.network.mode === 'cloud'
                  ? 'Managed by the cloud'
                  : 'Allocated from a network pool'}
              </ButlerKeyValueRow>
            )}
            {providerPlace(selected).region && (
              <ButlerKeyValueRow label="Region" dense mono>
                {providerPlace(selected).region}
              </ButlerKeyValueRow>
            )}
            {selected.status?.capacity?.availableIPs !== undefined && (
              <ButlerKeyValueRow label="Available addresses" dense>
                {selected.status.capacity.availableIPs.toLocaleString()}
              </ButlerKeyValueRow>
            )}
            {selected.spec.credentialsRef && (
              <ButlerKeyValueRow label="Credentials" dense mono>
                {`secret ${selected.spec.credentialsRef.name}`}
              </ButlerKeyValueRow>
            )}
          </ButlerKeyValueList>
          {selected.status?.conditions?.some(c => c.status !== 'True') && (
            <ButlerCallout tone="warning" compact title="Not fully ready">
              {selected.status.conditions
                .filter(c => c.status !== 'True')
                .map(c => `${c.type}: ${c.message}`)
                .join(' ')}
            </ButlerCallout>
          )}
        </ButlerDialog>
      )}

      {removing && (
        <ButlerDialog
          open
          onClose={busy ? () => {} : () => setRemoving(null)}
          title="Remove provider"
          subtitle={removing.metadata.name}
          icon={<AlertTriangleIcon />}
          iconTone="danger"
          busy={busy}
          footer={
            <>
              <ButlerButton
                variant="secondary"
                onClick={() => setRemoving(null)}
                disabled={busy}
              >
                Cancel
              </ButlerButton>
              <ButlerButton
                variant="danger"
                onClick={handleRemove}
                disabled={busy}
              >
                {busy ? 'Removing...' : 'Remove provider'}
              </ButlerButton>
            </>
          }
        >
          <p className={classes.lead}>
            This disconnects the provider from {activeTeamDisplayName || team}.
            Clusters already running on it keep running, but no new cluster can
            be created against it from this team.
          </p>
          <ButlerKeyValueList>
            <ButlerKeyValueRow label="Provider" dense mono>
              {removing.metadata.name}
            </ButlerKeyValueRow>
            <ButlerKeyValueRow label="Type" dense>
              {PROVIDER_LABELS[removing.spec.provider] ??
                removing.spec.provider}
            </ButlerKeyValueRow>
            <ButlerKeyValueRow label="Team" dense mono>
              {team}
            </ButlerKeyValueRow>
          </ButlerKeyValueList>
          {removeError && (
            <ButlerCallout tone="danger" title="Could not remove">
              {removeError}
            </ButlerCallout>
          )}
        </ButlerDialog>
      )}
    </ButlerStack>
  );
};
