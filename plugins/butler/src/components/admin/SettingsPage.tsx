// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import type { ReactNode } from 'react';
import { butlerApiRef } from '../../api/ButlerApi';
import type {
  ComponentResources,
  PlatformConfig,
} from '../../api/types/config';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerAccessDenied,
  ButlerBanner,
  ButlerCard,
  ButlerErrorState,
  ButlerInput,
  ButlerLoading,
  ButlerPageHeader,
  ButlerSelect,
  ButlerStack,
  ButlerSwitch,
  ButlerTextarea,
} from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    page: { maxWidth: 896 },
    counts: {
      display: 'flex',
      gap: 16,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    sectionTitle: {
      margin: '0 0 16px',
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 500,
      color: t.text.primary,
    },
    intro: {
      margin: '0 0 16px',
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    fields: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    },
    grid2: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 16,
    },
    grid4: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 12,
      '@media (min-width: 768px)': {
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      },
    },
    rowTitle: {
      margin: '0 0 8px',
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
      color: rgb(p.neutral[300]),
    },
    rows: {
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
    },
    amber: {
      margin: 0,
      fontSize: 12,
      lineHeight: '16px',
      color: rgb(p.amber[400]),
    },
  };
});

const Section = ({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) => {
  const classes = useStyles();
  return (
    <ButlerCard style={{ padding: 24 }}>
      <h2 className={classes.sectionTitle}>{title}</h2>
      {intro && <p className={classes.intro}>{intro}</p>}
      {children}
    </ButlerCard>
  );
};

const ResourceRow = ({
  label,
  value,
}: {
  label: string;
  value?: ComponentResources;
}) => {
  const classes = useStyles();
  return (
    <div>
      <h3 className={classes.rowTitle}>{label}</h3>
      <div className={classes.grid4}>
        <ButlerInput
          label="Request CPU"
          value={value?.requests?.cpu || ''}
          placeholder="100m"
          readOnly
          disabled
        />
        <ButlerInput
          label="Request Memory"
          value={value?.requests?.memory || ''}
          placeholder="256Mi"
          readOnly
          disabled
        />
        <ButlerInput
          label="Limit CPU"
          value={value?.limits?.cpu || ''}
          placeholder="2"
          readOnly
          disabled
        />
        <ButlerInput
          label="Limit Memory"
          value={value?.limits?.memory || ''}
          placeholder="1Gi"
          readOnly
          disabled
        />
      </div>
    </div>
  );
};

// Every control is read-only: the Portal API client only exposes
// GET /admin/config, so the page mirrors the console's viewer state
// (disabled fields, no Save buttons) until an update call exists.
export const SettingsPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const { isAdmin } = useTeamContext();
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setConfig(await api.getPlatformConfig());
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <ButlerAccessDenied
        resourceType="page"
        message="Platform administrator access is required to view platform settings."
        homeTo={routes.root()}
      />
    );
  }

  let body: React.ReactNode;
  if (loading) {
    body = <ButlerLoading />;
  } else if (error || !config) {
    body = (
      <ButlerErrorState
        message={error?.message || 'Failed to load platform configuration'}
        onRetry={load}
      />
    );
  } else {
    const exposure = config.controlPlaneExposure;
    const mode = exposure?.mode || 'LoadBalancer';
    const addons = config.defaultAddonVersions || {};
    const limits = config.defaultTeamLimits || {};
    const cp = config.defaultControlPlaneResources || {};
    const factory = config.imageFactory;
    const audit = config.audit || {};
    body = (
      <>
        <ButlerBanner
          title="Read-only"
          message="Platform settings can be viewed here. Changes must be made from the Butler Console until the Portal supports editing."
        />

        <Section title="General Settings">
          <div className={classes.fields}>
            <ButlerSelect
              label="Multi-Tenancy Mode"
              value={config.multiTenancy?.mode || 'Optional'}
              help="Enforced: all clusters must belong to a team. Optional: teams available but not required. Disabled: no teams."
              disabled
            >
              <option value="Disabled">Disabled</option>
              <option value="Optional">Optional</option>
              <option value="Enforced">Enforced</option>
            </ButlerSelect>
            <ButlerInput
              label="Default Namespace"
              value={config.defaultNamespace || ''}
              placeholder="butler-tenants"
              readOnly
              disabled
            />
            <ButlerInput
              label="Default Provider"
              value={config.defaultProviderRef?.name || ''}
              placeholder="ProviderConfig name (e.g. harvester-prod)"
              readOnly
              disabled
            />
          </div>
        </Section>

        <Section title="Control Plane Exposure">
          <div className={classes.fields}>
            <ButlerSelect label="Exposure Mode" value={mode} disabled>
              <option value="LoadBalancer">
                LoadBalancer (1 IP per tenant)
              </option>
              <option value="Ingress">Ingress (shared IP, SNI routing)</option>
              <option value="Gateway">Gateway API (shared IP, TLSRoute)</option>
            </ButlerSelect>
            {(mode === 'Ingress' || mode === 'Gateway') && (
              <ButlerInput
                label="Hostname Pattern"
                value={exposure?.hostname || ''}
                placeholder="*.k8s.platform.example.com"
                readOnly
                disabled
              />
            )}
            {mode === 'Ingress' && (
              <div className={classes.grid2}>
                <ButlerInput
                  label="Ingress Class Name"
                  value={exposure?.ingressClassName || ''}
                  placeholder="haproxy"
                  readOnly
                  disabled
                />
                <ButlerSelect
                  label="Controller Type"
                  value={exposure?.controllerType || ''}
                  disabled
                >
                  <option value="">Select controller type</option>
                  <option value="haproxy">HAProxy</option>
                  <option value="nginx">NGINX</option>
                  <option value="traefik">Traefik</option>
                  <option value="generic">Generic</option>
                </ButlerSelect>
              </div>
            )}
            {mode === 'Gateway' && (
              <ButlerInput
                label="Gateway Reference"
                value={exposure?.gatewayRef || ''}
                placeholder="namespace/gateway-name"
                readOnly
                disabled
              />
            )}
            {config.status?.tcpProxyRequired && (
              <p className={classes.amber}>
                TCP proxy is auto-enabled for all tenants in {mode} mode.
              </p>
            )}
          </div>
        </Section>

        <Section
          title="Default Addon Versions"
          intro="Default versions used when tenant clusters don't specify their own."
        >
          <div className={classes.grid2}>
            <ButlerInput
              label="Cilium"
              value={addons.cilium || ''}
              placeholder="1.16.1"
              readOnly
              disabled
            />
            <ButlerInput
              label="MetalLB"
              value={addons.metallb || ''}
              placeholder="0.14.8"
              readOnly
              disabled
            />
            <ButlerInput
              label="cert-manager"
              value={addons.certManager || ''}
              placeholder="1.15.3"
              readOnly
              disabled
            />
            <ButlerInput
              label="Longhorn"
              value={addons.longhorn || ''}
              placeholder="1.7.2"
              readOnly
              disabled
            />
            <ButlerInput
              label="Traefik"
              value={addons.traefik || ''}
              placeholder="31.1.1"
              readOnly
              disabled
            />
            <ButlerInput
              label="FluxCD"
              value={addons.fluxcd || ''}
              placeholder="2.14.0"
              readOnly
              disabled
            />
          </div>
        </Section>

        <Section
          title="Default Team Limits"
          intro="Default resource limits applied to new teams. Can be overridden per team."
        >
          <div className={classes.grid2}>
            <ButlerInput
              label="Max Clusters"
              value={limits.maxClusters ?? ''}
              placeholder="10"
              readOnly
              disabled
            />
            <ButlerInput
              label="Max Workers Per Cluster"
              value={limits.maxWorkersPerCluster ?? ''}
              placeholder="20"
              readOnly
              disabled
            />
            <ButlerInput
              label="Max Total CPU"
              value={limits.maxTotalCPU || ''}
              placeholder="100 (cores)"
              readOnly
              disabled
            />
            <ButlerInput
              label="Max Total Memory"
              value={limits.maxTotalMemory || ''}
              placeholder="256Gi"
              readOnly
              disabled
            />
            <ButlerInput
              label="Max Total Storage"
              value={limits.maxTotalStorage || ''}
              placeholder="1Ti"
              readOnly
              disabled
            />
          </div>
        </Section>

        <Section
          title="Default Control Plane Resources"
          intro="Default resource requests/limits for tenant control plane components. Applied to new clusters without per-cluster overrides. Leave blank for BestEffort QoS."
        >
          <div className={classes.rows}>
            <ResourceRow label="API Server" value={cp.apiServer} />
            <ResourceRow
              label="Controller Manager"
              value={cp.controllerManager}
            />
            <ResourceRow label="Scheduler" value={cp.scheduler} />
          </div>
        </Section>

        <Section title="Image Factory">
          <div className={classes.fields}>
            <ButlerInput
              label="Factory URL"
              value={factory?.url || ''}
              placeholder="https://factory.butlerlabs.dev"
              readOnly
              disabled
            />
            <ButlerInput
              label="Credentials Secret"
              value={factory?.credentialsRef || ''}
              placeholder="Secret name containing API key"
              readOnly
              disabled
            />
            <ButlerInput
              label="Default Schematic ID"
              value={factory?.defaultSchematicID || ''}
              placeholder="SHA-256 hex string"
              readOnly
              disabled
              mono
            />
            <ButlerSwitch
              label="Auto Sync"
              help="Automatically sync images when a cluster references an unavailable image"
              checked={!!factory?.autoSync}
              onChange={() => undefined}
              disabled
            />
          </div>
        </Section>

        <Section
          title="Audit Log"
          intro="Configure audit event recording. Events are always emitted as structured logs. Optionally forward to an external system via webhook."
        >
          <div className={classes.fields}>
            <ButlerSwitch
              label="Enabled"
              help="Record audit events for mutations and auth actions"
              checked={!!audit.enabled}
              onChange={() => undefined}
              disabled
            />
            <ButlerInput
              label="Webhook URL"
              value={audit.webhookURL || ''}
              placeholder="https://siem.company.com/api/v1/audit"
              help="POST audit events to this URL for external integration (SIEM, log aggregator, etc). Leave empty to disable."
              readOnly
              disabled
            />
            <ButlerInput
              label="Buffer Size"
              value={audit.bufferSize ?? ''}
              placeholder="10000"
              help="In-memory ring buffer capacity for recent audit queries in the console. Default 10,000."
              readOnly
              disabled
            />
          </div>
        </Section>

        <Section
          title="Notifications"
          intro="Forward real-time notifications to external systems (Slack, PagerDuty, Microsoft Teams, etc)."
        >
          <ButlerInput
            label="Webhook URL"
            value={config.notifications?.webhookURL || ''}
            placeholder="https://hooks.slack.com/services/..."
            help="POST notifications to this URL. Leave empty to disable."
            readOnly
            disabled
          />
        </Section>

        <Section
          title="SSH Authorized Key"
          intro="Default SSH public key injected into non-Talos worker nodes for diagnostic access. Can be overridden per cluster."
        >
          <ButlerTextarea
            aria-label="SSH authorized key"
            value={config.sshAuthorizedKey || ''}
            placeholder="ssh-ed25519 AAAA..."
            rows={3}
            mono
            readOnly
            disabled
          />
        </Section>
      </>
    );
  }

  return (
    <ButlerStack className={classes.page}>
      <ButlerPageHeader
        title="Platform Settings"
        subtitle="Configure platform-wide Butler settings"
        actions={
          config?.status ? (
            <div className={classes.counts}>
              <span>{config.status.teamCount} teams</span>
              <span>{config.status.clusterCount} clusters</span>
            </div>
          ) : undefined
        }
      />
      {body}
    </ButlerStack>
  );
};
