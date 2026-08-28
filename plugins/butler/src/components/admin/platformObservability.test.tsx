// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * The platform observability page describes the central pipeline and the
 * fleet enrolled in it. It reads the pipeline configuration (every role)
 * and the fleet status (platform admin), sends the server the requests
 * it defines, and never manages a collector itself: that stays on each
 * cluster's Observability tab, which it links to.
 */
import '@testing-library/jest-dom';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderInTestApp,
  TestApiProvider,
  MockErrorApi,
} from '@backstage/test-utils';
import { alertApiRef, errorApiRef } from '@backstage/core-plugin-api';
import type { AlertApi } from '@backstage/core-plugin-api';
import { butlerApiRef } from '../../api/ButlerApi';
import { ButlerApiError } from '../../api/ButlerApiError';
import { MockButlerApi } from '../../api/MockButlerApi';
import { platformViewerIdentity } from '../../api/fixtures/identities';
import { rootRouteRef } from '../../routes';
import { TeamProvider } from '../../contexts/TeamProvider';
import { PlatformObservabilityPage } from './PlatformObservabilityPage';

const alertApi: AlertApi = {
  post: jest.fn(),
  alert$: () =>
    ({ subscribe: () => ({ unsubscribe: () => {}, closed: false }) } as any),
};

function renderPage(api: MockButlerApi) {
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
            path="/butler/admin/observability"
            element={<PlatformObservabilityPage />}
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: ['/butler/admin/observability'],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

const admin = () => new MockButlerApi();
const viewer = () => new MockButlerApi({ identity: platformViewerIdentity });

describe('platform observability as a platform admin', () => {
  beforeEach(() => localStorage.clear());

  it('shows the pipeline with its three facts kept apart', async () => {
    const api = admin();
    const addons = jest.spyOn(api, 'listClusterAddons');
    await renderPage(api);

    expect(
      await screen.findByRole('heading', { name: 'Observability' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'pipelines' })).toHaveAttribute(
      'href',
      '/butler/t/platform-engineering/clusters/platform-engineering/pipelines',
    );
    expect(screen.getByText('http://10.40.2.29:8080')).toBeInTheDocument();
    expect(screen.getByText('Unreachable')).toBeInTheDocument();
    expect(screen.getByText(/port 8686/)).toBeInTheDocument();
    expect(screen.getByLabelText('Fleet summary')).toBeInTheDocument();
    // The fleet is read through the server's status, never by walking
    // each cluster's addons from the page.
    expect(addons).not.toHaveBeenCalled();
  });

  it('links each fleet row to that cluster’s observability tab', async () => {
    const api = admin();
    await renderPage(api);
    const table = await screen.findByRole('table', {
      name: 'Fleet observability',
    });
    const status = await api.getObservabilityStatus();
    const first = status.clusters[0];
    const link = within(table).getByRole('link', { name: first.name });
    expect(link.getAttribute('href')).toMatch(
      new RegExp(
        `/clusters/${first.namespace}/${first.name}\\?tab=observability$`,
      ),
    );
    expect(
      within(table).getAllByText(/Not installed|Installed/).length,
    ).toBeGreaterThan(0);
  });

  it('sends the collection defaults whole and unchanged on a plain save', async () => {
    const user = userEvent.setup();
    const api = admin();
    const update = jest.spyOn(api, 'updateObservabilityConfig');
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Observability' });

    const cfg = await api.getObservabilityConfig();
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toEqual({ collection: cfg.collection });
    expect(update.mock.calls[0][0]).not.toHaveProperty('pipeline');
  });

  it('disables auto-enroll toward endpoints the pipeline lacks', async () => {
    const api = new MockButlerApi({
      observabilityConfig: {
        configured: true,
        pipeline: {
          clusterName: 'pipelines',
          clusterNamespace: 'platform-engineering',
          logEndpoint: 'http://10.40.2.29:8080',
        },
      },
    });
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Observability' });
    expect(
      screen.getByRole('checkbox', { name: /^Vector agent \(logs\)/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole('checkbox', { name: /^Prometheus \(metrics\)/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: /^OpenTelemetry collector/ }),
    ).toBeDisabled();
  });

  it('edits endpoints, keeping the cluster and refusing a bare host', async () => {
    const user = userEvent.setup();
    const api = admin();
    const update = jest.spyOn(api, 'updateObservabilityConfig');
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Observability' });

    await user.click(screen.getByRole('button', { name: 'Edit endpoints' }));
    const trace = screen.getByLabelText('Trace OTLP endpoint');
    await user.clear(trace);
    await user.type(trace, '10.40.2.41:4318');
    await user.click(screen.getByRole('button', { name: 'Save endpoints' }));
    expect(
      await screen.findByText(/Must include scheme and host/),
    ).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();

    await user.clear(trace);
    await user.type(trace, 'http://10.40.2.41:4318');
    await user.click(screen.getByRole('button', { name: 'Save endpoints' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toEqual({
      pipeline: {
        clusterName: 'pipelines',
        clusterNamespace: 'platform-engineering',
        logEndpoint: 'http://10.40.2.29:8080',
        metricEndpoint: 'http://10.40.2.29:9000',
        traceEndpoint: 'http://10.40.2.41:4318',
      },
    });
  });

  it('deregisters only after confirmation and then offers registration', async () => {
    const user = userEvent.setup();
    const api = admin();
    const deregister = jest.spyOn(api, 'deregisterObservabilityPipeline');
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Observability' });

    await user.click(screen.getByRole('button', { name: 'Deregister' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(
      'No cluster, addon or collector is deleted',
    );
    expect(deregister).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole('button', { name: 'Deregister pipeline' }),
    );

    await waitFor(() => expect(deregister).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole('heading', { name: 'Register pipeline' }),
    ).toBeInTheDocument();
  });

  it('registers a Ready cluster with the endpoints given', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({
      observabilityConfig: { configured: false },
    });
    const setup = jest.spyOn(api, 'setupObservabilityPipeline');
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Register pipeline' });

    const clusters = (await api.listClusters()).clusters;
    const ready = clusters.find(c => c.status?.phase === 'Ready')!;
    await user.selectOptions(
      screen.getByLabelText('Pipeline cluster'),
      `${ready.metadata.namespace}/${ready.metadata.name}`,
    );
    await user.type(screen.getByLabelText('Log endpoint *'), 'http://agg:8080');
    await user.click(screen.getByRole('button', { name: 'Register pipeline' }));

    await waitFor(() => expect(setup).toHaveBeenCalled());
    expect(setup.mock.calls[0][0]).toEqual({
      clusterName: ready.metadata.name,
      clusterNamespace: ready.metadata.namespace,
      logEndpoint: 'http://agg:8080',
      metricEndpoint: undefined,
      traceEndpoint: undefined,
    });
    const links = await screen.findAllByRole('link', {
      name: ready.metadata.name,
    });
    expect(links.length).toBeGreaterThan(0);
  });

  it('refuses to register a cluster that is not Ready', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi({
      observabilityConfig: { configured: false },
    });
    const setup = jest.spyOn(api, 'setupObservabilityPipeline');
    await renderPage(api);
    await screen.findByRole('heading', { name: 'Register pipeline' });
    const clusters = (await api.listClusters()).clusters;
    const notReady = clusters.find(c => c.status?.phase !== 'Ready');
    if (!notReady) return;
    await user.selectOptions(
      screen.getByLabelText('Pipeline cluster'),
      `${notReady.metadata.namespace}/${notReady.metadata.name}`,
    );
    expect(
      screen.getByText(/The server only registers a Ready cluster/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Register pipeline' }),
    ).toBeDisabled();
    expect(setup).not.toHaveBeenCalled();
  });

  it('shows fleet status failures other than 403 as a warning', async () => {
    const api = admin();
    jest
      .spyOn(api, 'getObservabilityStatus')
      .mockRejectedValue(new Error('failed to list tenant clusters'));
    await renderPage(api);
    expect(
      await screen.findByText('Fleet status unavailable'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('failed to list tenant clusters'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Fleet summary')).not.toBeInTheDocument();
  });

  it('explains a server without observability routes', async () => {
    const api = new MockButlerApi({ observabilityConfig: null });
    await renderPage(api);
    expect(
      await screen.findByText('Observability is not available on this server'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Register/ })).toBeNull();
  });
});

describe('platform observability as a platform viewer', () => {
  beforeEach(() => localStorage.clear());

  it('reads the pipeline configuration and is told the fleet needs an admin', async () => {
    const api = viewer();
    const status = jest.spyOn(api, 'getObservabilityStatus');
    await renderPage(api);

    expect(
      await screen.findByRole('heading', { name: 'Observability' }),
    ).toBeInTheDocument();
    expect(screen.getByText('http://10.40.2.29:8080')).toBeInTheDocument();
    expect(
      await screen.findByText('Fleet status needs a platform admin'),
    ).toBeInTheDocument();
    await waitFor(() => expect(status).toHaveBeenCalled());
    await expect(status.mock.results[0].value).rejects.toBeInstanceOf(
      ButlerApiError,
    );
    expect(screen.getAllByText('Platform admin only').length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByLabelText('Fleet summary')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Edit endpoints' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deregister' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save defaults' })).toBeNull();
    expect(screen.getByLabelText('Pod logs')).toBeDisabled();
  });

  it('is not offered registration when no pipeline exists', async () => {
    const api = new MockButlerApi({
      identity: platformViewerIdentity,
      observabilityConfig: { configured: false },
    });
    await renderPage(api);
    expect(
      await screen.findByText('No pipeline registered'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Registering a pipeline needs a platform admin.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Register pipeline' }),
    ).toBeNull();
  });
});
