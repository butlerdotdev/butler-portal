// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState } from 'react';
import { useApi, alertApiRef } from '@backstage/core-plugin-api';
import { InfoCard, Progress, EmptyState } from '@backstage/core-components';
import { Grid, Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { butlerApiRef } from '../../api/ButlerApi';
import type { TenantControlPlaneSummary } from '../../api/types/steward';
import { StatusBadge } from '../StatusBadge/StatusBadge';

export const CONTROL_PLANE_EMPTY_TEXT =
  'Control plane information not available. The cluster may still be provisioning.';

const useStyles = makeStyles(theme => ({
  row: {
    display: 'flex',
    padding: theme.spacing(1, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  label: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    minWidth: 180,
  },
  value: {
    color: theme.palette.text.primary,
    wordBreak: 'break-all',
  },
}));

interface ControlPlaneTabProps {
  clusterNamespace: string;
  clusterName: string;
}

function isNotFound(e: unknown): boolean {
  return e instanceof Error && /\(404\)/.test(e.message);
}

export const ControlPlaneTab = ({
  clusterNamespace,
  clusterName,
}: ControlPlaneTabProps) => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const alertApi = useApi(alertApiRef);
  const [tcp, setTcp] = useState<TenantControlPlaneSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getClusterTenantControlPlane(clusterNamespace, clusterName)
      .then(result => {
        if (!cancelled) setTcp(result);
      })
      .catch(e => {
        if (cancelled) return;
        setTcp(null);
        if (!isNotFound(e)) {
          alertApi.post({
            message: `Failed to load control plane: ${
              e instanceof Error ? e.message : String(e)
            }`,
            severity: 'error',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, alertApi, clusterNamespace, clusterName]);

  if (loading) {
    return <Progress />;
  }

  if (!tcp) {
    return (
      <EmptyState
        title="Control plane not available"
        description={CONTROL_PLANE_EMPTY_TEXT}
        missing="info"
      />
    );
  }

  const s = tcp.status ?? {};
  const Row = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div className={classes.row}>
      <Typography className={classes.label}>{label}</Typography>
      <Typography component="div" className={classes.value}>
        {children}
      </Typography>
    </div>
  );

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <InfoCard title="Control Plane">
          <div>
            <Row label="Phase">
              <StatusBadge status={s.phase || 'Unknown'} />
            </Row>
            <Row label="API Server Version">{s.version || 'N/A'}</Row>
            <Row label="Endpoint">{s.controlPlaneEndpoint || 'N/A'}</Row>
            <Row label="Replicas">
              {`${s.readyReplicas ?? 0}/${s.replicas ?? 0} ready`}
            </Row>
            <Row label="LoadBalancer IP">{s.loadBalancerIP || 'N/A'}</Row>
            <Row label="Service Port">
              {s.servicePort ? String(s.servicePort) : 'N/A'}
            </Row>
          </div>
        </InfoCard>
      </Grid>
      <Grid item xs={12} md={6}>
        <InfoCard title="Components">
          <div>
            <Row label="DataStore">{s.dataStoreName || 'N/A'}</Row>
            <Row label="DataStore Driver">{s.dataStoreDriver || 'N/A'}</Row>
            <Row label="Konnectivity">
              {s.konnectivityEnabled ? 'Enabled' : 'Disabled'}
            </Row>
            {s.workerBootstrap?.provider && (
              <Row label="Bootstrap Provider">
                {s.workerBootstrap.provider}
              </Row>
            )}
            {s.workerBootstrap?.endpoint && (
              <Row label="Bootstrap Endpoint">
                {s.workerBootstrap.endpoint}
              </Row>
            )}
          </div>
        </InfoCard>
      </Grid>
      <Grid item xs={12} md={6}>
        <InfoCard title="TenantControlPlane">
          <div>
            <Row label="Name">{tcp.name}</Row>
            <Row label="Namespace">{tcp.namespace}</Row>
            <Row label="Spec Version">{tcp.specVersion || 'N/A'}</Row>
          </div>
        </InfoCard>
      </Grid>
    </Grid>
  );
};
