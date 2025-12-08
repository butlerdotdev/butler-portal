// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState, useCallback } from 'react';
import { useApi, discoveryApiRef } from '@backstage/core-plugin-api';
import { Typography, Button, Box } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import RefreshIcon from '@material-ui/icons/Refresh';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalTabProps {
  clusterNamespace: string;
  clusterName: string;
}

const useStyles = makeStyles(theme => ({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    display: 'inline-block',
  },
  connected: {
    backgroundColor: theme.palette.success.main,
  },
  disconnected: {
    backgroundColor: theme.palette.error.main,
  },
  connecting: {
    backgroundColor: theme.palette.warning.main,
  },
  terminalWrapper: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
  },
  terminalContainer: {
    height: 500,
    padding: theme.spacing(1),
  },
  errorBox: {
    padding: theme.spacing(2),
    border: `1px solid ${theme.palette.error.main}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.error.main + '10',
  },
}));

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export const TerminalTab = ({
  clusterNamespace,
  clusterName,
}: TerminalTabProps) => {
  const classes = useStyles();
  const discoveryApi = useApi(discoveryApiRef);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const connect = useCallback(async () => {
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (terminalInstance.current) {
      terminalInstance.current.dispose();
      terminalInstance.current = null;
    }

    if (!terminalRef.current) return;

    setStatus('connecting');
    setErrorMsg(null);

    // Initialize the terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        selectionBackground: '#3f3f46',
        black: '#09090b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#fafafa',
      },
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);

    // Small delay to ensure DOM is ready before fitting
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        // Fit may fail if terminal is not visible
      }
    });

    terminalInstance.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('Connecting to cluster terminal...');
    term.writeln(`Cluster: ${clusterNamespace}/${clusterName}`);
    term.writeln('');

    // Build WebSocket URL
    try {
      const baseUrl = await discoveryApi.getBaseUrl('butler');
      const wsUrl = baseUrl
        .replace(/^http/, 'ws')
        .replace(/\/api\/butler$/, '');
      const fullWsUrl = `${wsUrl}/api/butler/ws/terminal/tenant/${clusterNamespace}/${clusterName}`;

      const ws = new WebSocket(fullWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        term.writeln('\x1b[32mConnected.\x1b[0m');
        term.writeln('');

        // Send initial resize
        const dimensions = fitAddon.proposeDimensions();
        if (dimensions) {
          ws.send(
            JSON.stringify({
              type: 'resize',
              cols: dimensions.cols,
              rows: dimensions.rows,
            }),
          );
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        // butler-server sends raw terminal output (not JSON-wrapped)
        if (typeof event.data === 'string') {
          term.write(event.data);
        } else if (event.data instanceof Blob) {
          // Fallback: binary frames arrive as Blob objects
          event.data.text().then(text => term.write(text));
        }
      };

      ws.onerror = () => {
        setStatus('error');
        setErrorMsg('WebSocket connection error. Please check your network and try again.');
        term.writeln('\x1b[31mConnection error.\x1b[0m');
      };

      ws.onclose = (event: CloseEvent) => {
        setStatus('disconnected');
        if (event.code !== 1000) {
          term.writeln('');
          term.writeln(
            `\x1b[33mConnection closed (code: ${event.code}).\x1b[0m`,
          );
        } else {
          term.writeln('');
          term.writeln('\x1b[33mSession ended.\x1b[0m');
        }
      };

      // Forward terminal input to WebSocket
      // butler-server expects {type: 'data', data: '...'} for input
      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }));
        }
      });

      // Handle terminal resize
      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });
    } catch (e) {
      setStatus('error');
      const message =
        e instanceof Error ? e.message : 'Failed to establish connection';
      setErrorMsg(message);
      term.writeln(`\x1b[31mFailed to connect: ${message}\x1b[0m`);
    }
  }, [discoveryApi, clusterNamespace, clusterName]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {
          // Fit may fail if terminal is not visible
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (terminalInstance.current) {
        terminalInstance.current.dispose();
        terminalInstance.current = null;
      }
    };
  }, [connect]);

  const statusClass =
    status === 'connected'
      ? classes.connected
      : status === 'connecting'
        ? classes.connecting
        : classes.disconnected;

  const statusLabel =
    status === 'connected'
      ? 'Connected'
      : status === 'connecting'
        ? 'Connecting...'
        : status === 'error'
          ? 'Error'
          : 'Disconnected';

  return (
    <div className={classes.container}>
      <div className={classes.toolbar}>
        <div className={classes.statusIndicator}>
          <span className={`${classes.dot} ${statusClass}`} />
          <Typography variant="body2">{statusLabel}</Typography>
        </div>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={connect}
          disabled={status === 'connecting'}
        >
          {status === 'connected' ? 'Reconnect' : 'Connect'}
        </Button>
      </div>

      {errorMsg && (
        <Box className={classes.errorBox}>
          <Typography variant="body2" color="error">
            {errorMsg}
          </Typography>
        </Box>
      )}

      <div className={classes.terminalWrapper}>
        <div ref={terminalRef} className={classes.terminalContainer} />
      </div>
    </div>
  );
};
