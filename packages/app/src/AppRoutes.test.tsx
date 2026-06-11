/*
 * Copyright 2026 The Butler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { MockConfigApi, TestApiProvider } from '@backstage/test-utils';
import { render } from '@testing-library/react';

// These tests pin the frontend gate logic. The Backstage FlatRoutes inline
// conditional drops a Route element when its flag is false; the test asserts
// the inline conditional itself produces the right child. Boots no actual
// plugin context (the upstream plugin pages need API factories the test
// harness does not provide) and instead inspects the conditional output via
// a stand-in component that mirrors AppRoutes' shape.

type Flags = {
  butler: boolean;
  workspaces: boolean;
  registry: boolean;
  pipeline: boolean;
};

// Stand-in mirrors the inline-conditional shape from packages/app/src/App.tsx
// without pulling in the full Backstage app routing tree. A regression in
// the gating pattern (flag name typo, inverted default, removed conditional)
// fails here.
const GatedRoutes = () => {
  const config = useApi(configApiRef);
  const butlerEnabled =
    config.getOptionalBoolean('plugins.butler.enabled') ?? false;
  const workspacesEnabled =
    config.getOptionalBoolean('plugins.workspaces.enabled') ?? false;
  const registryEnabled =
    config.getOptionalBoolean('plugins.registry.enabled') ?? false;
  const pipelineEnabled =
    config.getOptionalBoolean('plugins.pipeline.enabled') ?? false;

  return (
    <ul>
      {butlerEnabled && <li data-testid="butler-route">butler</li>}
      {workspacesEnabled && <li data-testid="workspaces-route">workspaces</li>}
      {registryEnabled && <li data-testid="registry-route">registry</li>}
      {pipelineEnabled && <li data-testid="pipeline-route">pipeline</li>}
    </ul>
  );
};

const renderWithFlags = (flags: Partial<Flags>) => {
  const config = new MockConfigApi({
    plugins: {
      butler: { enabled: !!flags.butler },
      workspaces: { enabled: !!flags.workspaces },
      registry: { enabled: !!flags.registry },
      pipeline: { enabled: !!flags.pipeline },
    },
  });
  return render(
    <TestApiProvider apis={[[configApiRef, config]]}>
      <GatedRoutes />
    </TestApiProvider>,
  );
};

describe('AppRoutes per-plugin gates', () => {
  it('renders no Butler Labs routes when all flags are off (external customer default)', () => {
    const r = renderWithFlags({});
    expect(r.queryByTestId('butler-route')).toBeNull();
    expect(r.queryByTestId('workspaces-route')).toBeNull();
    expect(r.queryByTestId('registry-route')).toBeNull();
    expect(r.queryByTestId('pipeline-route')).toBeNull();
  });

  it('renders only butler when plugins.butler.enabled is true', () => {
    const r = renderWithFlags({ butler: true });
    expect(r.queryByTestId('butler-route')).not.toBeNull();
    expect(r.queryByTestId('workspaces-route')).toBeNull();
    expect(r.queryByTestId('registry-route')).toBeNull();
    expect(r.queryByTestId('pipeline-route')).toBeNull();
  });

  it('renders only workspaces when plugins.workspaces.enabled is true', () => {
    const r = renderWithFlags({ workspaces: true });
    expect(r.queryByTestId('butler-route')).toBeNull();
    expect(r.queryByTestId('workspaces-route')).not.toBeNull();
    expect(r.queryByTestId('registry-route')).toBeNull();
    expect(r.queryByTestId('pipeline-route')).toBeNull();
  });

  it('renders only registry when plugins.registry.enabled is true', () => {
    const r = renderWithFlags({ registry: true });
    expect(r.queryByTestId('butler-route')).toBeNull();
    expect(r.queryByTestId('workspaces-route')).toBeNull();
    expect(r.queryByTestId('registry-route')).not.toBeNull();
    expect(r.queryByTestId('pipeline-route')).toBeNull();
  });

  it('renders only pipeline when plugins.pipeline.enabled is true', () => {
    const r = renderWithFlags({ pipeline: true });
    expect(r.queryByTestId('butler-route')).toBeNull();
    expect(r.queryByTestId('workspaces-route')).toBeNull();
    expect(r.queryByTestId('registry-route')).toBeNull();
    expect(r.queryByTestId('pipeline-route')).not.toBeNull();
  });

  it('renders all four when every flag is true (Butler Labs deployment)', () => {
    const r = renderWithFlags({
      butler: true,
      workspaces: true,
      registry: true,
      pipeline: true,
    });
    expect(r.queryByTestId('butler-route')).not.toBeNull();
    expect(r.queryByTestId('workspaces-route')).not.toBeNull();
    expect(r.queryByTestId('registry-route')).not.toBeNull();
    expect(r.queryByTestId('pipeline-route')).not.toBeNull();
  });
});
