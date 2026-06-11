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

import {
  Content,
  EmptyState,
  Header,
  Page,
} from '@backstage/core-components';
import { makeStyles } from '@material-ui/core';
import {
  ButlerLabsPluginMeta,
  pluginEnabledConfigKey,
} from './butlerLabsPluginsMeta';

// PluginNotEnabledPage replaces Backstage's generic NotFound page when a user
// reaches a Butler Labs plugin's route while the plugin is gated off for this
// deployment. The page is intentional, branded, and uniform across every
// gated plugin: shipping uniformly across internal + external deployments is
// the design call -- the same disabled-but-discoverable surface signals the
// product roadmap to every user, regardless of which deployment they are on.
//
// The page uses Backstage's EmptyState with `missing="info"` to match the
// existing in-app precedent (EntityPage's "No CI/CD available" surface). The
// Page + Header + Content layout mirrors the structure every other Butler
// page uses so this never reads as a leftover error screen.
//
// This file changes only the frontend presentation. The backend gate stays
// genuinely off: when plugins.<name>.enabled is false the corresponding
// /api/<plugin>/* routes return 404 because the backend feature is never
// loaded. See packages/backend/src/butlerLabsPluginGates.ts.

const useStyles = makeStyles(theme => ({
  configKey: {
    fontFamily: theme.typography.fontFamily,
    backgroundColor: theme.palette.background.default,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: `${theme.spacing(0.25)}px ${theme.spacing(0.75)}px`,
    fontSize: '0.95em',
  },
}));

export const PluginNotEnabledPage = ({
  meta,
}: {
  meta: ButlerLabsPluginMeta;
}) => {
  const classes = useStyles();
  const configKey = pluginEnabledConfigKey(meta);

  return (
    <Page themeId="home">
      <Header
        title={meta.brandName}
        subtitle="Available but not enabled for this deployment"
      />
      <Content>
        <EmptyState
          missing="info"
          title={`${meta.brandName} is not enabled here`}
          description={
            <>
              {meta.longDescription}
              <br />
              <br />
              To enable it for this deployment, ask your administrator to set{' '}
              <span className={classes.configKey}>{configKey}</span> to{' '}
              <span className={classes.configKey}>true</span> in the portal's
              Helm values, then reconcile the deployment.
            </>
          }
        />
      </Content>
    </Page>
  );
};
