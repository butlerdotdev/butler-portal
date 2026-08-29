// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { useApi, alertApiRef } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../../api/ButlerApi';
import type { TenantControlPlaneSummary } from '../../api/types/steward';
import {
  ButlerCard,
  ButlerEmptyState,
  ButlerGrid,
  ButlerKeyValueList,
  ButlerKeyValueRow,
  ButlerLoading,
  ButlerStack,
  ButlerStatusBadge,
} from '../ui';

export const CONTROL_PLANE_EMPTY_TEXT =
  'Control plane information not available. The cluster may still be provisioning.';

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
    return <ButlerLoading />;
  }

  if (!tcp) {
    return (
      <ButlerEmptyState
        title="Control plane not available"
        description={CONTROL_PLANE_EMPTY_TEXT}
      />
    );
  }

  const s = tcp.status ?? {};
  const Row = ButlerKeyValueRow;

  return (
    <ButlerStack>
      <ButlerGrid>
        <ButlerCard title="Control Plane">
          <ButlerKeyValueList>
            <Row label="Phase">
              <ButlerStatusBadge status={s.phase || 'Unknown'} />
            </Row>
            <Row label="API Server Version" mono>
              {s.version || 'N/A'}
            </Row>
            <Row label="Endpoint" mono>
              {s.controlPlaneEndpoint || 'N/A'}
            </Row>
            <Row label="Replicas">
              {`${s.readyReplicas ?? 0}/${s.replicas ?? 0} ready`}
            </Row>
            <Row label="LoadBalancer IP" mono>
              {s.loadBalancerIP || 'N/A'}
            </Row>
            <Row label="Service Port">
              {s.servicePort ? String(s.servicePort) : 'N/A'}
            </Row>
          </ButlerKeyValueList>
        </ButlerCard>
        <ButlerCard title="Backend">
          <ButlerKeyValueList>
            <Row label="DataStore">{s.dataStoreName || 'N/A'}</Row>
            <Row label="Driver">{s.dataStoreDriver || 'N/A'}</Row>
            <Row label="Konnectivity">
              {s.konnectivityEnabled ? 'Enabled' : 'Disabled'}
            </Row>
            {s.workerBootstrap?.provider && (
              <Row label="Bootstrap Provider">{s.workerBootstrap.provider}</Row>
            )}
            {s.workerBootstrap?.endpoint && (
              <Row label="Bootstrap Endpoint" mono>
                {s.workerBootstrap.endpoint}
              </Row>
            )}
          </ButlerKeyValueList>
        </ButlerCard>
      </ButlerGrid>
      <ButlerCard title="Resource Info">
        <ButlerKeyValueList>
          <Row label="TCP Name" mono>
            {tcp.name}
          </Row>
          <Row label="TCP Namespace" mono>
            {tcp.namespace}
          </Row>
          <Row label="Spec Version">{tcp.specVersion || 'N/A'}</Row>
        </ButlerKeyValueList>
      </ButlerCard>
    </ButlerStack>
  );
};
