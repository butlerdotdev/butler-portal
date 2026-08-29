// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import '@testing-library/jest-dom';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../../api/ButlerApi';
import { ButlerApiError } from '../../../api/ButlerApiError';
import { MockButlerApi } from '../../../api/MockButlerApi';
import type { InstalledAddon } from '../../../api/types/addons';
import { ObservabilityTab } from './ObservabilityTab';

const NS = 'platform-engineering';
const NAME = 'e2e-talos';

const addon = (over: Partial<InstalledAddon>): InstalledAddon => ({
  name: 'x',
  status: 'Installed',
  managedBy: 'butler',
  ...over,
});

function withAddons(api: MockButlerApi, addons: InstalledAddon[]) {
  return jest.spyOn(api, 'listClusterAddons').mockResolvedValue({ addons });
}

function render(api: MockButlerApi, canOperate = true) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <ObservabilityTab
        clusterNamespace={NS}
        clusterName={NAME}
        canOperate={canOperate}
      />
    </TestApiProvider>,
  );
}

const card = (label: string) =>
  screen.getByRole('region', { name: `${label} collection` });

describe('signal state is read from the server, not inferred', () => {
  it('shows each signal from its addon and the pipeline it sends to', async () => {
    const api = new MockButlerApi();
    withAddons(api, [
      addon({
        name: 'e2e-talos-vector-agent',
        addon: 'vector-agent',
        status: 'Installing',
      }),
      addon({
        name: 'prom',
        addon: 'prometheus-operator',
        status: 'Installed',
        installedVersion: '65.8.1',
      }),
    ]);
    await render(api);

    expect(await screen.findByText('Platform pipeline')).toBeInTheDocument();
    expect(within(card('Logs')).getByText('Enabling')).toBeInTheDocument();
    expect(
      within(card('Logs')).getByText(/not collecting yet/),
    ).toBeInTheDocument();
    expect(within(card('Metrics')).getByText('Collecting')).toBeInTheDocument();
    expect(within(card('Metrics')).getByText(/v65\.8\.1/)).toBeInTheDocument();
    expect(within(card('Traces')).getByText('Not enabled')).toBeInTheDocument();
  });

  it('surfaces a failure with the server message', async () => {
    const api = new MockButlerApi();
    withAddons(api, [
      addon({
        addon: 'otel-collector',
        status: 'Failed',
        message: 'image pull back-off',
      }),
    ]);
    await render(api);

    await screen.findByText('Platform pipeline');
    expect(within(card('Traces')).getByText('Failed')).toBeInTheDocument();
    expect(
      within(card('Traces')).getByText('image pull back-off'),
    ).toBeInTheDocument();
  });

  it('says plainly when no platform pipeline is registered', async () => {
    const api = new MockButlerApi({ observabilityConfig: null });
    withAddons(api, []);
    await render(api);

    expect(await screen.findByText('No platform pipeline')).toBeInTheDocument();
    expect(
      within(card('Traces')).getByText(/debug exporter/),
    ).toBeInTheDocument();
  });

  it('reports a failed read with a retry', async () => {
    const api = new MockButlerApi();
    jest.spyOn(api, 'listClusterAddons').mockRejectedValue(new Error('boom'));
    await render(api);

    expect(
      await screen.findByText('Failed to load observability state'),
    ).toBeVisible();
  });
});

describe('actions follow the caller’s authority', () => {
  it('offers nothing to a caller who may not operate the cluster', async () => {
    const api = new MockButlerApi();
    withAddons(api, [addon({ addon: 'vector-agent', status: 'Installed' })]);
    await render(api, false);

    await screen.findByText('Platform pipeline');
    expect(
      screen.queryByRole('button', { name: /enable/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /disable/i }),
    ).not.toBeInTheDocument();
  });

  it('does not offer to remove a platform-managed collector', async () => {
    const api = new MockButlerApi();
    withAddons(api, [
      addon({
        addon: 'vector-agent',
        status: 'Installed',
        managedBy: 'platform',
      }),
    ]);
    await render(api);

    await screen.findByText('Platform pipeline');
    expect(screen.getByText('Managed by the platform.')).toBeInTheDocument();
    expect(
      within(card('Logs')).queryByRole('button', { name: /disable/i }),
    ).not.toBeInTheDocument();
  });

  it('holds the disable button while the collector is still moving', async () => {
    const api = new MockButlerApi();
    withAddons(api, [addon({ addon: 'vector-agent', status: 'Installing' })]);
    await render(api);

    await screen.findByText('Platform pipeline');
    expect(
      within(card('Logs')).getByRole('button', { name: /disable/i }),
    ).toBeDisabled();
  });
});

describe('enabling a signal', () => {
  it('installs the collector addon with the pipeline endpoint and re-reads', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    const list = withAddons(api, []);
    const install = jest
      .spyOn(api, 'installAddon')
      .mockResolvedValue({ status: 'accepted' } as any);
    await render(api);
    await screen.findByText('Platform pipeline');

    await user.click(
      within(card('Traces')).getByRole('button', { name: /enable/i }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      (
        within(dialog).getByLabelText(
          /OTLP export endpoint/i,
        ) as HTMLInputElement
      ).value,
    ).toBe('http://10.40.2.41:4318');
    const reads = list.mock.calls.length;
    await user.click(
      within(dialog).getByRole('button', { name: /enable traces/i }),
    );

    await waitFor(() => expect(install).toHaveBeenCalled());
    const [ns, name, req] = install.mock.calls[0];
    expect([ns, name, req.addon]).toEqual([NS, NAME, 'otel-collector']);
    expect((req.values as any).config.exporters).toEqual({
      otlphttp: { endpoint: 'http://10.40.2.41:4318' },
    });
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(reads), {
      timeout: 3000,
    });
  });

  it('keeps the dialog open and shows why enablement was refused', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    withAddons(api, []);
    jest.spyOn(api, 'installAddon').mockRejectedValue(
      new ButlerApiError({
        status: 400,
        message: 'addon definition not found: otel-collector',
      }),
    );
    await render(api);
    await screen.findByText('Platform pipeline');

    await user.click(
      within(card('Traces')).getByRole('button', { name: /enable/i }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: /enable traces/i }),
    );

    expect(
      await within(dialog).findByText(/addon definition not found/),
    ).toBeVisible();
  });
});

describe('disabling a signal', () => {
  it('confirms, names the consequence, uninstalls and re-reads', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    const list = withAddons(api, [
      addon({
        name: 'e2e-talos-otel-collector',
        addon: 'otel-collector',
        status: 'Installed',
      }),
    ]);
    const uninstall = jest
      .spyOn(api, 'uninstallAddon')
      .mockResolvedValue(undefined);
    await render(api);
    await screen.findByText('Platform pipeline');

    await user.click(
      within(card('Traces')).getByRole('button', { name: /disable/i }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        /stop being collected as soon as the collector is gone/,
      ),
    ).toBeInTheDocument();
    const reads = list.mock.calls.length;
    await user.click(
      within(dialog).getByRole('button', { name: /disable traces/i }),
    );

    await waitFor(() =>
      expect(uninstall).toHaveBeenCalledWith(
        NS,
        NAME,
        'e2e-talos-otel-collector',
      ),
    );
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(reads));
  });

  it('treats a collector that is already gone as disabled', async () => {
    const user = userEvent.setup();
    const api = new MockButlerApi();
    const list = withAddons(api, [
      addon({ addon: 'otel-collector', status: 'Installed' }),
    ]);
    jest
      .spyOn(api, 'uninstallAddon')
      .mockRejectedValue(
        new ButlerApiError({ status: 404, message: 'addon not found' }),
      );
    await render(api);
    await screen.findByText('Platform pipeline');

    await user.click(
      within(card('Traces')).getByRole('button', { name: /disable/i }),
    );
    const dialog = await screen.findByRole('dialog');
    const reads = list.mock.calls.length;
    await user.click(
      within(dialog).getByRole('button', { name: /disable traces/i }),
    );

    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(reads));
  });
});

describe('the tab watches a transition rather than assuming it', () => {
  it('polls while a collector is installing and stops once it is installed', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const api = new MockButlerApi();
    const list = jest
      .spyOn(api, 'listClusterAddons')
      .mockResolvedValueOnce({
        addons: [addon({ addon: 'otel-collector', status: 'Installing' })],
      })
      .mockResolvedValue({
        addons: [addon({ addon: 'otel-collector', status: 'Installed' })],
      });
    await render(api);
    await screen.findByText('Platform pipeline');
    expect(list).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(5100);
    });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        within(card('Traces')).getByText('Collecting'),
      ).toBeInTheDocument(),
    );

    await act(async () => {
      jest.advanceTimersByTime(11000);
    });
    // Settled: no further reads.
    expect(list).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
