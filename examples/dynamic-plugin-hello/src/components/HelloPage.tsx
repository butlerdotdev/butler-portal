/*
 * Copyright 2026 The Butler Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { Page, Header, Content } from '@backstage/core-components';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Typography,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';

// The page the dynamic plugin renders at its declared route. The
// "Hello from the Butler Portal dynamic-plugins runtime" string under
// data-testid="hello-dynamic-plugin-marker" is the distinctive marker
// the 0.5.1 boot-test asserts -- a string only this rendered component
// produces. If the manifest endpoint is broken, the federation runtime
// fails to load this module, or the DynamicPluginsLoader does not
// resolve the importName, the marker is absent and the boot-test fails
// red.
//
// The rest of the page is the live showcase: metadata about how this
// plugin reached the portal, plus a button that calls the bundled
// backend dynamic plugin (see examples/dynamic-plugin-hello-backend)
// and renders the response. The page exists to make the dynamic-plugin
// capability concretely visible on the live portal -- the metadata
// reinforces that the page was loaded at runtime from an OCI artifact,
// and the ping round-trip shows the full-stack dynamic plugin pattern
// in two clicks.

const PLUGIN_METADATA = {
  pluginName: 'butler-hello-dynamic-plugin',
  pluginVersion: '0.1.0',
  // The literal source URI the portal pulled this artifact from. Edit
  // in lockstep when the artifact moves; the showcase intentionally
  // hardcodes a URI rather than reading from runtime config so an
  // adopter who copies this example sees the source declaration as
  // part of the plugin's own contract.
  source:
    'oci://ghcr.io/butlerdotdev/butler-portal-test-fixture:hello-dynamic-0.5.1',
  sourceUrl:
    'https://github.com/butlerdotdev/butler-portal/tree/main/examples/dynamic-plugin-hello',
};

type PingResponse = {
  ok: boolean;
  marker: string;
  [key: string]: unknown;
};

const useStyles = makeStyles(theme => ({
  cardWrap: {
    padding: theme.spacing(3),
    maxWidth: 760,
  },
  meta: {
    display: 'flex',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
    marginBottom: theme.spacing(2),
  },
  markerBox: {
    margin: theme.spacing(3, 0),
    padding: theme.spacing(2),
    background: theme.palette.background.default,
    borderRadius: theme.shape.borderRadius,
    textAlign: 'center',
  },
  responseBox: {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '0.85rem',
    background: theme.palette.background.default,
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    margin: theme.spacing(2, 0, 0),
  },
  source: {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '0.78rem',
    color: theme.palette.text.secondary,
    wordBreak: 'break-all',
  },
}));

export const HelloPage = () => {
  const classes = useStyles();
  const [response, setResponse] = useState<PingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ping = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hello-dynamic-backend/ping', {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(
          `Backend responded HTTP ${res.status}. Confirm the bundled backend dynamic plugin is installed in dynamicPlugins.plugins[].`,
        );
      }
      const data = (await res.json()) as PingResponse;
      setResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <Page themeId="tool">
      <Header
        title="Sample Dynamic Plugin"
        subtitle="Loaded at runtime via dynamicPlugins.plugins[]"
      />
      <Content>
        <Box className={classes.cardWrap}>
          <Card>
            <CardContent>
              <Typography variant="body1" paragraph>
                This page was loaded at runtime from an OCI artifact
                referenced in the portal's <code>dynamicPlugins.plugins[]</code>{' '}
                chart values. The portal image is unchanged; only chart
                values changed to install this plugin.
              </Typography>

              <Box className={classes.meta}>
                <Chip
                  size="small"
                  label={`plugin: ${PLUGIN_METADATA.pluginName}`}
                />
                <Chip
                  size="small"
                  label={`version: ${PLUGIN_METADATA.pluginVersion}`}
                />
                <Chip size="small" label="loaded: runtime" color="primary" />
              </Box>
              <Typography variant="caption" component="div" className={classes.source}>
                Source: {PLUGIN_METADATA.source}
              </Typography>

              <Box
                className={classes.markerBox}
                data-testid="hello-dynamic-plugin-marker"
              >
                <Typography variant="h6">
                  Hello from the Butler Portal dynamic-plugins runtime
                </Typography>
              </Box>

              <Typography variant="body2" paragraph>
                The plugin ships a bundled backend dynamic plugin alongside
                this frontend. The backend registers a <code>/ping</code>{' '}
                route at <code>/api/hello-dynamic-backend</code>; press
                the button below to call it and see the round-trip.
              </Typography>

              {response && (
                <pre
                  className={classes.responseBox}
                  data-testid="hello-dynamic-backend-response"
                >
                  {JSON.stringify(response, null, 2)}
                </pre>
              )}
              {error && (
                <Typography
                  color="error"
                  variant="body2"
                  data-testid="hello-dynamic-backend-error"
                >
                  Backend call failed: {error}
                </Typography>
              )}
            </CardContent>
            <CardActions>
              <Button
                variant="contained"
                color="primary"
                onClick={ping}
                disabled={loading}
                data-testid="hello-dynamic-backend-ping-button"
              >
                {loading ? 'Pinging...' : 'Ping the bundled backend'}
              </Button>
              <Button
                href={PLUGIN_METADATA.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the source
              </Button>
            </CardActions>
          </Card>
        </Box>
      </Content>
    </Page>
  );
};
