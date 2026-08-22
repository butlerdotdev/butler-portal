// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { alertApiRef } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../../api/ButlerApi';
import type { ButlerApi } from '../../api/ButlerApi';
import { ControlPlaneTab, CONTROL_PLANE_EMPTY_TEXT } from './ControlPlaneTab';

const alertApi = { post: jest.fn(), alert$: jest.fn() };

function render(getClusterTenantControlPlane: jest.Mock) {
  const api = { getClusterTenantControlPlane } as unknown as ButlerApi;
  return renderInTestApp(
    <TestApiProvider
      apis={[
        [butlerApiRef, api],
        [alertApiRef, alertApi],
      ]}
    >
      <ControlPlaneTab clusterNamespace="ns" clusterName="c1" />
    </TestApiProvider>,
  );
}

describe('ControlPlaneTab', () => {
  beforeEach(() => {
    alertApi.post.mockReset();
  });

  it('renders the control plane projection', async () => {
    await render(
      jest.fn().mockResolvedValue({
        name: 'c1',
        namespace: 'tenant-c1',
        specVersion: 'v1.31.2',
        status: {
          phase: 'Ready',
          version: 'v1.31.2',
          controlPlaneEndpoint: '10.0.0.5:6443',
          replicas: 3,
          readyReplicas: 2,
          servicePort: 6443,
          loadBalancerIP: '10.0.0.5',
          dataStoreName: 'default',
          dataStoreDriver: 'etcd',
          konnectivityEnabled: true,
          workerBootstrap: { provider: 'kubeadm', endpoint: 'https://boot' },
        },
      }),
    );
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.5:6443')).toBeInTheDocument();
    expect(screen.getByText('2/3 ready')).toBeInTheDocument();
    expect(screen.getByText('6443')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.5')).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
    expect(screen.getByText('etcd')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('kubeadm')).toBeInTheDocument();
    expect(screen.getByText('https://boot')).toBeInTheDocument();
    expect(screen.getByText('tenant-c1')).toBeInTheDocument();
    expect(alertApi.post).not.toHaveBeenCalled();
  });

  it('shows the empty state on 404 without alerting', async () => {
    await render(
      jest
        .fn()
        .mockRejectedValue(
          new Error('Butler API error (404): TenantControlPlane not found'),
        ),
    );
    expect(screen.getByText(CONTROL_PLANE_EMPTY_TEXT)).toBeInTheDocument();
    expect(alertApi.post).not.toHaveBeenCalled();
  });

  it('alerts on non-404 failures', async () => {
    await render(
      jest.fn().mockRejectedValue(new Error('Butler API error (500): boom')),
    );
    expect(screen.getByText(CONTROL_PLANE_EMPTY_TEXT)).toBeInTheDocument();
    expect(alertApi.post).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error' }),
    );
  });
});
