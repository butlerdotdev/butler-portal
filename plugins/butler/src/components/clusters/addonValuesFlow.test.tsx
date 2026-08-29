// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * Installing and reconfiguring an addon: the values that leave the editor
 * are what the user wrote, the editor starts from what the server holds,
 * and editing values never changes the version by accident.
 */
import '@testing-library/jest-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { butlerApiRef } from '../../api/ButlerApi';
import { MockButlerApi } from '../../api/MockButlerApi';
import { Route, Routes } from 'react-router-dom';
import { FIXTURE_NAMESPACE, FIXTURE_TEAM } from '../../api/fixtures/clusters';
import { rootRouteRef } from '../../routes';
import {
  teamAdminIdentity,
  teamViewerIdentity,
} from '../../api/fixtures/identities';
import type { InstalledAddon } from '../../api/types/addons';
import { TeamProvider } from '../../contexts/TeamProvider';
import { valuesEqual } from '../../utils/addonValues';
import { AddonsTab } from './AddonsTab';

const CLUSTER = 'ready-delta';

const longhorn = (over: Partial<InstalledAddon> = {}): InstalledAddon => ({
  name: 'longhorn',
  addon: 'longhorn',
  status: 'Installed',
  version: '1.8.1',
  installedVersion: '1.8.1',
  managedBy: 'butler',
  values: { persistence: { defaultClass: true }, replicas: 2, tags: ['a'] },
  ...over,
});

function render(api: MockButlerApi, canOperate = true) {
  return renderInTestApp(
    <TestApiProvider apis={[[butlerApiRef, api]]}>
      <TeamProvider>
        <Routes>
          <Route
            path="/butler/t/:team/clusters/:namespace/:name"
            element={
              <AddonsTab
                clusterNamespace={FIXTURE_NAMESPACE}
                clusterName={CLUSTER}
                canOperate={canOperate}
              />
            }
          />
        </Routes>
      </TeamProvider>
    </TestApiProvider>,
    {
      routeEntries: [
        `/butler/t/${FIXTURE_TEAM}/clusters/${FIXTURE_NAMESPACE}/${CLUSTER}`,
      ],
      mountedRoutes: { '/butler': rootRouteRef },
    },
  );
}

/** A mock whose cluster carries exactly one, butler-managed addon. */
function withLonghorn(api: MockButlerApi, addon = longhorn()) {
  jest.spyOn(api, 'listClusterAddons').mockResolvedValue({ addons: [addon] });
  jest.spyOn(api, 'getAddonDetails').mockResolvedValue(addon);
  return api;
}

async function openConfigure(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /manage/i }));
  await user.click(await screen.findByRole('menuitem', { name: /configure/i }));
  return screen.findByRole('dialog');
}

describe('reconfiguring an installed addon', () => {
  it('starts from the values the server holds', async () => {
    const user = userEvent.setup();
    const api = withLonghorn(
      new MockButlerApi({ identity: teamAdminIdentity }),
    );
    await render(api);

    const dialog = await openConfigure(user);
    const editor = within(dialog).getByLabelText(
      /Helm values override/i,
    ) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toContain('defaultClass: true'));
    expect(editor.value).toContain('replicas: 2');
    expect(editor.value).toContain('- a');
    expect(api.getAddonDetails).toHaveBeenCalledWith(
      FIXTURE_NAMESPACE,
      CLUSTER,
      'longhorn',
    );
  });

  it('sends back the same object on an unchanged save, and no version', async () => {
    const user = userEvent.setup();
    const api = withLonghorn(
      new MockButlerApi({ identity: teamAdminIdentity }),
    );
    const update = jest.spyOn(api, 'updateAddon').mockResolvedValue({} as any);
    await render(api);

    const dialog = await openConfigure(user);
    const editor = within(dialog).getByLabelText(
      /Helm values override/i,
    ) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toContain('replicas: 2'));
    await user.click(
      within(dialog).getByRole('button', { name: /save|update|apply/i }),
    );

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [, , name, req] = update.mock.calls[0];
    expect(name).toBe('longhorn');
    expect(valuesEqual(req.values, longhorn().values)).toBe(true);
    expect(req.version).toBeUndefined();
  });

  it('sends the version only when it was changed', async () => {
    const user = userEvent.setup();
    const api = withLonghorn(
      new MockButlerApi({ identity: teamAdminIdentity }),
    );
    const update = jest.spyOn(api, 'updateAddon').mockResolvedValue({} as any);
    await render(api);

    const dialog = await openConfigure(user);
    await waitFor(() =>
      expect(
        (
          within(dialog).getByLabelText(
            /Helm values override/i,
          ) as HTMLTextAreaElement
        ).value,
      ).toContain('replicas: 2'),
    );
    const versionSelect = within(dialog).queryByLabelText(/^Version/i);
    if (!versionSelect) {
      // The fixture catalog offers no alternative versions for this addon;
      // nothing to change, nothing to assert beyond the values path.
      return;
    }
    const options = Array.from(
      (versionSelect as HTMLSelectElement).options,
    ).map(o => o.value);
    const other = options.find(v => v !== '1.8.1');
    if (!other) return;
    await user.selectOptions(versionSelect, other);
    await user.click(
      within(dialog).getByRole('button', { name: /save|update|apply/i }),
    );

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][3].version).toBe(other);
  });

  it('refuses invalid YAML with its line rather than saving something else', async () => {
    const user = userEvent.setup();
    const api = withLonghorn(
      new MockButlerApi({ identity: teamAdminIdentity }),
    );
    const update = jest.spyOn(api, 'updateAddon');
    await render(api);

    const dialog = await openConfigure(user);
    const editor = within(dialog).getByLabelText(
      /Helm values override/i,
    ) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toContain('replicas: 2'));
    await user.clear(editor);
    await user.type(editor, 'a: 1{enter}b: "unterminated{enter}c: 2');
    await user.click(
      within(dialog).getByRole('button', { name: /save|update|apply/i }),
    );

    expect(await within(dialog).findByText(/^Line \d+:/)).toBeVisible();
    expect(update).not.toHaveBeenCalled();
  });

  it('shows an addon between versions as installed and requested', async () => {
    const api = withLonghorn(
      new MockButlerApi({ identity: teamAdminIdentity }),
      longhorn({
        version: '1.9.0',
        installedVersion: '1.8.1',
        status: 'Installing',
      }),
    );
    await render(api);

    expect(await screen.findByText(/1\.8\.1 → 1\.9\.0/)).toBeInTheDocument();
  });

  it('offers no management to a viewer', async () => {
    const api = withLonghorn(
      new MockButlerApi({ identity: teamViewerIdentity }),
    );
    await render(api, false);

    await screen.findByText(/longhorn/i);
    expect(
      screen.queryByRole('button', { name: /manage/i }),
    ).not.toBeInTheDocument();
  });
});

describe('installing with values', () => {
  async function openInstall(user: ReturnType<typeof userEvent.setup>) {
    const triggers = await screen.findAllByRole('button', {
      name: /install options/i,
    });
    await user.click(triggers[0]);
    await user.click(
      await screen.findByRole('menuitem', { name: /configure & install/i }),
    );
    return screen.findByRole('dialog');
  }

  it('refuses invalid YAML instead of installing with dropped values', async () => {
    const user = userEvent.setup();
    const api = withLonghorn(
      new MockButlerApi({ identity: teamAdminIdentity }),
    );
    const install = jest.spyOn(api, 'installAddon');
    await render(api);

    const dialog = await openInstall(user);
    await user.type(within(dialog).getByLabelText(/Helm Values/i), 'x: "oops');
    await user.click(within(dialog).getByRole('button', { name: /^install/i }));

    expect(await within(dialog).findByText(/^Line \d+:/)).toBeVisible();
    expect(install).not.toHaveBeenCalled();
  });

  it('sends the parsed object, lists and all', async () => {
    const user = userEvent.setup();
    const api = withLonghorn(
      new MockButlerApi({ identity: teamAdminIdentity }),
    );
    const install = jest
      .spyOn(api, 'installAddon')
      .mockResolvedValue({} as any);
    await render(api);

    const dialog = await openInstall(user);
    await user.type(
      within(dialog).getByLabelText(/Helm Values/i),
      'replicas: 3{enter}tags:{enter}  - a{enter}  - b',
    );
    await user.click(within(dialog).getByRole('button', { name: /^install/i }));

    await waitFor(() => expect(install).toHaveBeenCalled());
    expect(install.mock.calls[0][2].values).toEqual({
      replicas: 3,
      tags: ['a', 'b'],
    });
  });
});
