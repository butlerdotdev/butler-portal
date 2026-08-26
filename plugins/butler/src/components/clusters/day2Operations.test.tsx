// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
  MockErrorApi,
} from '@backstage/test-utils';
import { alertApiRef, errorApiRef } from '@backstage/core-plugin-api';
import type { AlertApi } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import { ButlerApiError } from '../../api/ButlerApiError';
import {
  FIXTURE_NAMESPACE,
  FIXTURE_TEAM,
  readyCluster,
} from '../../api/fixtures/clusters';
import {
  platformAdminIdentity,
  platformViewerIdentity,
  teamAdminIdentity,
  teamOperatorIdentity,
  teamViewerIdentity,
} from '../../api/fixtures/identities';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { ClusterDetailPage } from './ClusterDetailPage';

const alertApi: AlertApi = {
  post: () => {},
  alert$: () =>
    ({ subscribe: () => ({ unsubscribe: () => {}, closed: false }) } as any),
};

function renderDetail(api: MockButlerApi) {
  return renderInTestApp(
    <TestApiProvider
      apis={[
        [butlerApiRef, api],
        [alertApiRef, alertApi],
        [errorApiRef, new MockErrorApi()],
      ]}
    >
      <TeamProvider>
        <Routes>
          <Route
            path="/butler/t/:team/clusters/:namespace/:name"
            element={<ClusterDetailPage />}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: [
        `/butler/t/${FIXTURE_TEAM}/clusters/${FIXTURE_NAMESPACE}/${readyCluster.metadata.name}`,
      ],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

const heading = () =>
  screen.findByRole('heading', { name: readyCluster.metadata.name });

/**
 * The operations are offered to exactly the roles butler-server's
 * checkOperatePermission allows: a viewer of either kind is refused, so
 * offering them the action would be a control that always fails.
 */
describe('day two operations are offered by role', () => {
  it.each([
    ['platform admin', platformAdminIdentity, true],
    ['team admin', teamAdminIdentity, true],
    ['team operator', teamOperatorIdentity, true],
    ['team viewer', teamViewerIdentity, false],
    ['platform viewer', platformViewerIdentity, false],
  ])('%s offered edit and scale: %s', async (_name, identity, offered) => {
    await renderDetail(new MockButlerApi({ identity }));
    await heading();

    for (const action of ['Edit', 'Scale Workers']) {
      const button = screen.queryByRole('button', { name: action });
      if (offered) expect(button).toBeInTheDocument();
      else expect(button).not.toBeInTheDocument();
    }
  });
});

describe('scale workers', () => {
  it('sends the new count and reports what the server accepted', async () => {
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    const scale = jest.spyOn(api, 'scaleCluster');
    await renderDetail(api);
    await heading();

    fireEvent.click(screen.getByRole('button', { name: 'Scale Workers' }));
    const input = await screen.findByLabelText(/Worker Replicas/);
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Scale' }));

    await waitFor(() => {
      expect(scale).toHaveBeenCalledWith(
        FIXTURE_NAMESPACE,
        readyCluster.metadata.name,
        5,
      );
    });
  });

  it('calls out node removal and asks for it explicitly', async () => {
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    await renderDetail(api);
    await heading();

    fireEvent.click(screen.getByRole('button', { name: 'Scale Workers' }));
    const input = await screen.findByLabelText(/Worker Replicas/);
    fireEvent.change(input, { target: { value: '1' } });

    expect(await screen.findByText(/will be removed/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove Nodes' }),
    ).toBeInTheDocument();
  });

  it('shows the server refusal instead of reporting success', async () => {
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    jest.spyOn(api, 'scaleCluster').mockRejectedValue(
      new ButlerApiError({
        status: 403,
        message: 'Butler API error (403): viewer role cannot scale clusters',
      }),
    );
    await renderDetail(api);
    await heading();

    fireEvent.click(screen.getByRole('button', { name: 'Scale Workers' }));
    const input = await screen.findByLabelText(/Worker Replicas/);
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Scale' }));

    expect(
      await screen.findByText(/cannot scale clusters/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scale' })).toBeInTheDocument();
  });
});

describe('edit cluster', () => {
  it('sends only the changed fields with the resource version', async () => {
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    const update = jest.spyOn(api, 'updateCluster');
    await renderDetail(api);
    await heading();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const replicas = await screen.findByLabelText(/^Replicas/);
    fireEvent.change(replicas, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const request = update.mock.calls[0][2];
    expect(request.resourceVersion).toBe(readyCluster.metadata.resourceVersion);
    expect(request.workers).toEqual({ replicas: 4 });
    expect(request.kubernetesVersion).toBeUndefined();
  });

  it('puts a server field error next to the field that caused it', async () => {
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    jest.spyOn(api, 'updateCluster').mockRejectedValue(
      new ButlerApiError({
        status: 400,
        message: 'Butler API error (400): validation failed',
        fieldErrors: [
          {
            field: 'spec.workers.replicas',
            reason: 'must be between 1 and 100',
          },
        ],
      }),
    );
    await renderDetail(api);
    await heading();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const replicas = await screen.findByLabelText(/^Replicas/);
    fireEvent.change(replicas, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(
      await screen.findByText('must be between 1 and 100'),
    ).toBeInTheDocument();
    // The dialog stays open so the change is not lost.
    expect(
      screen.getByRole('button', { name: 'Save Changes' }),
    ).toBeInTheDocument();
  });

  it('refuses a downgrade before the request is made', async () => {
    const api = new MockButlerApi({ identity: teamAdminIdentity });
    const update = jest.spyOn(api, 'updateCluster');
    await renderDetail(api);
    await heading();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const version = await screen.findByLabelText(/Control Plane Version/);
    fireEvent.change(version, { target: { value: 'v1.30.2' } });

    expect(
      await screen.findByText(/Downgrades are not supported/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
  });

  it('names what cannot be changed here', async () => {
    await renderDetail(new MockButlerApi({ identity: teamAdminIdentity }));
    await heading();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByText('Not editable here')).toBeInTheDocument();
  });
});

describe('change environment', () => {
  const withEnvironments = (api: MockButlerApi) => {
    // The environments page and this dialog read the same client method,
    // so stubbing it here is stubbing the one source both consume.
    jest.spyOn(api, 'getTeamClusterContext').mockResolvedValue({
      environments: [
        { name: 'staging', limits: { maxClusters: 10 } },
        { name: 'production', limits: { maxClusters: 4 } },
      ],
    });
    return api;
  };

  it('is not offered when the team runs no environments', async () => {
    await renderDetail(
      new MockButlerApi({ identity: teamAdminIdentity, environments: [] }),
    );
    await heading();

    expect(
      screen.queryByRole('button', { name: 'Change Environment' }),
    ).not.toBeInTheDocument();
  });

  it('moves the cluster to the chosen environment', async () => {
    const api = withEnvironments(
      new MockButlerApi({ identity: teamAdminIdentity }),
    );
    const change = jest.spyOn(api, 'changeClusterEnvironment');
    await renderDetail(api);
    await heading();

    const open = await screen.findByRole('button', {
      name: 'Change Environment',
    });
    fireEvent.click(open);
    fireEvent.click(await screen.findByRole('radio', { name: /production/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Change environment' }));

    await waitFor(() => {
      expect(change).toHaveBeenCalledWith(
        FIXTURE_NAMESPACE,
        readyCluster.metadata.name,
        'production',
      );
    });
  });

  it('shows the admission refusal rather than claiming the move happened', async () => {
    const api = withEnvironments(
      new MockButlerApi({ identity: teamAdminIdentity }),
    );
    jest.spyOn(api, 'changeClusterEnvironment').mockRejectedValue(
      new ButlerApiError({
        status: 403,
        message:
          'Butler API error (403): admission webhook "vtenantcluster.kb.io" denied the request: environment production is at its cluster limit',
      }),
    );
    await renderDetail(api);
    await heading();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Change Environment' }),
    );
    fireEvent.click(await screen.findByRole('radio', { name: /production/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Change environment' }));

    // The webhook prose is trimmed to the part that explains the refusal.
    expect(
      await screen.findByText(/environment production is at its cluster limit/),
    ).toBeInTheDocument();
  });

  it('is not offered to a viewer', async () => {
    const api = withEnvironments(
      new MockButlerApi({ identity: teamViewerIdentity }),
    );
    await renderDetail(api);
    await heading();

    expect(
      screen.queryByRole('button', { name: 'Change Environment' }),
    ).not.toBeInTheDocument();
  });
});
