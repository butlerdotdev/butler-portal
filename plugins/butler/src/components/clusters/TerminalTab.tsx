// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState, useCallback } from 'react';
import { useApi, discoveryApiRef } from '@backstage/core-plugin-api';
import { buildButlerWsUrl } from '../../api/wsUrl';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { butlerTokens, rgb } from '../../theme';
import { ButlerCard } from '../ui';

interface TerminalTabProps {
  clusterNamespace: string;
  clusterName: string;
}

// Console ClusterTerminal chrome: 500px card, compact status bar, terminal
// surface fixed to the console's dark page colour in both themes (the xterm
// palette below is the console's and is not a UI token).
const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    card: {
      height: 500,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    },
    bar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      backgroundColor: t.surface,
      borderBottom: `1px solid ${t.border}`,
      flexShrink: 0,
    },
    status: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
    dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
    connected: { backgroundColor: rgb(p.green[500]) },
    connecting: {
      backgroundColor: rgb(p.yellow[500]),
      animation: '$butlerPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    },
    error: { backgroundColor: rgb(p.red[500]) },
    disconnected: { backgroundColor: rgb(p.neutral[500]) },
    '@keyframes butlerPulse': {
      '50%': { opacity: 0.5 },
    },
    label: {
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    separator: { fontSize: 14, color: rgb(p.neutral[600]) },
    cluster: { fontSize: 14, color: t.text.subtle, fontFamily: t.fontMono },
    reconnect: {
      padding: '4px 8px',
      borderRadius: t.radius.sm,
      border: 'none',
      backgroundColor: rgb(p.neutral[800]),
      color: rgb(p.neutral[300]),
      fontFamily: t.fontSans,
      fontSize: 12,
      lineHeight: '16px',
      cursor: 'pointer',
      transition: 'background-color 150ms',
      '&:hover': { backgroundColor: rgb(p.neutral[700]) },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.accent}`,
      },
      '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
    },
    terminal: {
      flex: 1,
      minHeight: 0,
      padding: 8,
      backgroundColor: '#0a0a0a',
      '& .xterm': { height: '100%' },
    },
  };
});

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
        cursor: '#22c55e',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#22c55e33',
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
      const fullWsUrl = buildButlerWsUrl(
        baseUrl,
        `/ws/terminal/tenant/${clusterNamespace}/${clusterName}`,
      );

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

  const dotClass =
    status === 'connected'
      ? classes.connected
      : status === 'connecting'
        ? classes.connecting
        : status === 'error'
          ? classes.error
          : classes.disconnected;

  const statusLabel =
    status === 'connected'
      ? 'Connected'
      : status === 'connecting'
        ? 'Connecting...'
        : status === 'error'
          ? errorMsg || 'Error'
          : 'Disconnected';

  return (
    <ButlerCard flush className={classes.card}>
      <div className={classes.bar}>
        <div className={classes.status}>
          <span className={clsx(classes.dot, dotClass)} aria-hidden />
          <span className={classes.label} role="status" title={statusLabel}>
            {statusLabel}
          </span>
          <span className={classes.separator} aria-hidden>
            |
          </span>
          <span className={classes.cluster}>{clusterName}</span>
        </div>
        {status !== 'connected' && (
          <button
            type="button"
            className={classes.reconnect}
            onClick={connect}
            disabled={status === 'connecting'}
          >
            Reconnect
          </button>
        )}
      </div>
      <div ref={terminalRef} className={classes.terminal} />
    </ButlerCard>
  );
};
