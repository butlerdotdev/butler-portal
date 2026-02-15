// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useRef, useCallback, useEffect } from 'react';
import { useApi, discoveryApiRef } from '@backstage/core-plugin-api';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
} from '@material-ui/core';
import '@xterm/xterm/css/xterm.css';

export interface TerminalTarget {
  name: string;
  podName?: string;
}

interface WorkspaceTerminalDialogProps {
  open: boolean;
  target: TerminalTarget | null;
  clusterNamespace: string;
  clusterName: string;
  initialCommand?: string;
  onClose: () => void;
}

export function WorkspaceTerminalDialog({
  open,
  target,
  clusterNamespace,
  clusterName,
  initialCommand,
  onClose,
}: WorkspaceTerminalDialogProps) {
  const discoveryApi = useApi(discoveryApiRef);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<string>('disconnected');

  // Extract primitive values from target so dependencies are stable across
  // parent re-renders (object reference changes, primitive values don't).
  const targetName = target?.name;
  const targetPod = target?.podName;

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (terminalInstance.current) {
      terminalInstance.current.dispose();
      terminalInstance.current = null;
    }
    fitAddonRef.current = null;
    setStatus('disconnected');
  }, []);

  const connect = useCallback(async () => {
    if (!targetName || !targetPod || !terminalRef.current) return;

    cleanup();
    setStatus('connecting');

    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]);

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily:
        '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        selectionBackground: '#3f3f46',
      },
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        // Fit may fail if terminal is not visible yet
      }
    });

    terminalInstance.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln(`Connecting to workspace ${targetName}...`);
    term.writeln('');

    try {
      const baseUrl = await discoveryApi.getBaseUrl('butler');
      const wsUrl = baseUrl
        .replace(/^http/, 'ws')
        .replace(/\/api\/butler$/, '');
      const fullWsUrl = `${wsUrl}/api/butler/ws/terminal/workspace/${clusterNamespace}/${clusterName}/${targetPod}`;

      const ws = new WebSocket(fullWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        term.writeln('\x1b[32mConnected.\x1b[0m');
        term.writeln('');

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

        // Send initial command after shell prompt is ready
        if (initialCommand) {
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'data', data: initialCommand + '\n' }));
            }
          }, 500);
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          term.write(event.data);
        } else if (event.data instanceof Blob) {
          event.data.text().then(text => term.write(text));
        }
      };

      ws.onerror = () => {
        setStatus('error');
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

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }));
        }
      });

      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });
    } catch (e) {
      setStatus('error');
      const message =
        e instanceof Error ? e.message : 'Failed to establish connection';
      term.writeln(`\x1b[31mFailed to connect: ${message}\x1b[0m`);
    }
  }, [targetName, targetPod, discoveryApi, clusterNamespace, clusterName, initialCommand, cleanup]);

  useEffect(() => {
    if (open && targetName && targetPod) {
      const timer = setTimeout(() => connect(), 100);
      return () => clearTimeout(timer);
    }
    cleanup();
    return undefined;
  }, [open, targetName, targetPod, connect, cleanup]);

  useEffect(() => {
    if (!open) return undefined;
    const handleResize = () => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {
          // Ignore
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [open]);

  const handleClose = () => {
    cleanup();
    onClose();
  };

  if (!target) return null;

  const statusColor =
    status === 'connected'
      ? '#4caf50'
      : status === 'connecting'
        ? '#ff9800'
        : '#757575';

  return (
    <Dialog open={open} onClose={handleClose} fullScreen>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box display="flex" alignItems="center" style={{ gap: 8 }}>
            <Typography variant="h6">Terminal: {target.name}</Typography>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: statusColor,
                display: 'inline-block',
              }}
            />
            <Typography variant="body2" color="textSecondary">
              {status}
            </Typography>
          </Box>
          <Button size="small" variant="outlined" onClick={() => connect()}>
            Reconnect
          </Button>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box
          style={{
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4,
            overflow: 'hidden',
            backgroundColor: '#0a0a0a',
          }}
        >
          <div ref={terminalRef} style={{ height: 'calc(100vh - 160px)', padding: 4 }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
