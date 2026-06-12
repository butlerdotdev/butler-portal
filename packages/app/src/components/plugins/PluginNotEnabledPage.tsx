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

import { Content, Header, Page } from '@backstage/core-components';
import {
  Box,
  Chip,
  Typography,
  makeStyles,
} from '@material-ui/core';
import {
  ButlerLabsPluginMeta,
  pluginEnabledConfigKey,
} from './butlerLabsPluginsMeta';
import { borderColor } from '../../themes/paletteAccess';

// PluginNotEnabledPage replaces Backstage's generic NotFound page when a user
// reaches a Butler Labs plugin's route while the plugin is gated off for this
// deployment. Branded, hero-illustrated, themed to match butlerlabs.dev's
// product surface so it never reads as a leftover error screen. Uniform
// across internal and external deployments: every viewer sees the
// brand, the role, and the path to enable.
//
// The backend gate stays genuinely off: when plugins.<name>.enabled is false
// the corresponding /api/<plugin>/* routes return 404 because the backend
// feature is never loaded. See packages/backend/src/butlerLabsPluginGates.ts.

const useStyles = makeStyles(theme => ({
  hero: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 560,
    padding: theme.spacing(6, 6),
    borderRadius: 14,
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${borderColor(theme)}`,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 460px)',
    columnGap: theme.spacing(6),
    alignItems: 'center',
    [theme.breakpoints.down('sm')]: {
      gridTemplateColumns: '1fr',
      minHeight: 'unset',
      padding: theme.spacing(4, 3),
    },
  },
  // Soft brand-tinted glow behind the mascot.
  glow: {
    position: 'absolute',
    right: -120,
    top: -120,
    width: 720,
    height: 720,
    pointerEvents: 'none',
    background: `radial-gradient(circle at 50% 50%, ${theme.palette.primary.main}22 0%, ${theme.palette.primary.main}10 35%, transparent 70%)`,
    [theme.breakpoints.down('sm')]: {
      display: 'none',
    },
  },
  copy: {
    position: 'relative',
    zIndex: 1,
    maxWidth: 640,
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.25),
    marginBottom: theme.spacing(2),
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: theme.palette.text.secondary,
    opacity: 0.6,
  },
  statusText: {
    color: theme.palette.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontSize: '0.78rem',
    fontWeight: 600,
  },
  brandName: {
    fontSize: '3.25rem',
    fontWeight: 700,
    color: theme.palette.text.primary,
    lineHeight: 1.05,
    marginBottom: theme.spacing(0.5),
    [theme.breakpoints.down('sm')]: { fontSize: '2.25rem' },
  },
  role: {
    fontSize: '1.1rem',
    fontWeight: 500,
    color: theme.palette.primary.main,
    fontStyle: 'italic',
    marginBottom: theme.spacing(3),
  },
  origin: {
    fontSize: '1.0625rem',
    lineHeight: 1.65,
    color: theme.palette.text.primary,
    marginBottom: theme.spacing(4),
  },
  enableCard: {
    backgroundColor: theme.palette.background.default,
    border: `1px solid ${borderColor(theme)}`,
    borderRadius: 10,
    padding: theme.spacing(2.25, 2.5),
  },
  enableHeading: {
    fontSize: '0.78rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1),
  },
  enableBody: {
    fontSize: '0.95rem',
    color: theme.palette.text.primary,
    lineHeight: 1.55,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(0.75),
  },
  codeChip: {
    fontFamily:
      '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace',
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    color: theme.palette.text.primary,
    height: 26,
    fontSize: '0.85rem',
  },
  mascotSlot: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 380,
    [theme.breakpoints.down('sm')]: { minHeight: 260, marginTop: theme.spacing(3) },
  },
  mascot: {
    width: '100%',
    maxWidth: 440,
    height: 'auto',
    objectFit: 'contain',
    filter: 'drop-shadow(0 24px 40px rgba(0,0,0,0.45))',
    userSelect: 'none',
    pointerEvents: 'none',
  },
}));

export const PluginNotEnabledPage = ({
  meta,
  dependencyMeta,
}: {
  meta: ButlerLabsPluginMeta;
  /**
   * When set, meta is enabled but it depends on dependencyMeta which is off.
   * Page reads as "<meta> requires <dependencyMeta>" and the enable card
   * tells the operator to flip BOTH config keys. Chambers is the current
   * dependency case: workspaces=true is meaningless without butler=true
   * because Chambers proxies every backend call through butler-backend.
   */
  dependencyMeta?: ButlerLabsPluginMeta;
}) => {
  const classes = useStyles();
  const configKey = pluginEnabledConfigKey(meta);
  const dependsOnConfigKey = dependencyMeta
    ? pluginEnabledConfigKey(dependencyMeta)
    : undefined;

  const statusText = dependencyMeta
    ? `Enabled, but requires ${dependencyMeta.brandName} which is off`
    : 'Available, not enabled for this deployment';

  return (
    <Page themeId="home">
      <Header
        title={meta.brandName}
        subtitle={meta.role}
      />
      <Content>
        <Box className={classes.hero}>
          <div className={classes.glow} />
          <div className={classes.copy}>
            <div className={classes.statusRow}>
              <span className={classes.statusDot} />
              <span
                className={classes.statusText}
                data-testid="plugin-not-enabled-status"
              >
                {statusText}
              </span>
            </div>
            <Typography variant="h1" className={classes.brandName}>
              {meta.brandName}
            </Typography>
            <Typography className={classes.role}>{meta.role}</Typography>
            <Typography className={classes.origin}>{meta.origin}</Typography>
            <Box className={classes.enableCard}>
              <Typography className={classes.enableHeading}>
                {dependencyMeta
                  ? `Enable ${dependencyMeta.brandName} for this deployment`
                  : 'Enable for this deployment'}
              </Typography>
              <Typography component="div" className={classes.enableBody}>
                {dependencyMeta && dependsOnConfigKey ? (
                  <>
                    <span>
                      {meta.brandName} proxies its backend through{' '}
                      {dependencyMeta.brandName}. Ask your administrator to set
                    </span>
                    <Chip
                      size="small"
                      label={dependsOnConfigKey}
                      className={classes.codeChip}
                    />
                    <span>to</span>
                    <Chip
                      size="small"
                      label="true"
                      className={classes.codeChip}
                    />
                    <span>
                      in the portal's Helm values. {configKey} is already on.
                    </span>
                  </>
                ) : (
                  <>
                    <span>Ask your administrator to set</span>
                    <Chip
                      size="small"
                      label={configKey}
                      className={classes.codeChip}
                    />
                    <span>to</span>
                    <Chip
                      size="small"
                      label="true"
                      className={classes.codeChip}
                    />
                    <span>in the portal's Helm values.</span>
                  </>
                )}
              </Typography>
            </Box>
          </div>
          <div className={classes.mascotSlot}>
            <img
              className={classes.mascot}
              src={meta.mascotPath}
              alt={`${meta.brandName} mascot`}
              loading="lazy"
            />
          </div>
        </Box>
      </Content>
    </Page>
  );
};
