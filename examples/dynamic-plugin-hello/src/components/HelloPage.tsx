/*
 * Copyright 2026 The Butler Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Page, Header, Content } from '@backstage/core-components';

// The page the dynamic plugin renders at its declared route. The
// "Hello from the Butler Portal dynamic-plugins runtime" string is the
// distinctive marker the 0.5.1 boot-test asserts -- a string only this
// rendered component produces. If the manifest endpoint is broken, the
// federation runtime fails to load this module, or the
// DynamicPluginsLoader does not resolve the importName, that string is
// absent and the test fails red.
export const HelloPage = () => (
  <Page themeId="tool">
    <Header
      title="Hello from a dynamic plugin"
      subtitle="Loaded at runtime via Module Federation"
    />
    <Content>
      <div data-testid="hello-dynamic-plugin-marker">
        Hello from the Butler Portal dynamic-plugins runtime
      </div>
    </Content>
  </Page>
);
