// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, makeStyles } from '@material-ui/core';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import type { RunLogEntry } from '../../api/types/environments';

const TERMINAL_STATUSES = [
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
  'discarded',
  'skipped',
];

/**
 * Strip ANSI escape sequences from a string.
 * Handles CSI sequences (e.g. colors), OSC sequences, and simple escapes.
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[^[\]]/g, '');
}

const useStyles = makeStyles(theme => ({
  root: {
    position: 'relative' as const,
    borderRadius: theme.shape.borderRadius,
    overflow: 'hidden',
  },
  viewport: {
    backgroundColor: '#1e1e1e',
    maxHeight: 500,
    overflow: 'auto',
    padding: theme.spacing(1.5, 0),
  },
  line: {
    display: 'flex',
    fontFamily: 'Consolas, Monaco, monospace',
    fontSize: '0.8rem',
    lineHeight: 1.6,
    padding: '0 12px',
    '&:hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.04)',
    },
  },
  lineNumber: {
    flexShrink: 0,
    width: 48,
    textAlign: 'right' as const,
    paddingRight: 12,
    color: '#858585',
    userSelect: 'none' as const,
  },
  lineContent: {
    flex: 1,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
  },
  stdout: {
    color: '#d4d4d4',
  },
  stderr: {
    color: '#f48771',
  },
  waiting: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    backgroundColor: '#1e1e1e',
    borderRadius: theme.shape.borderRadius,
  },
  waitingText: {
    color: '#858585',
    fontFamily: 'Consolas, Monaco, monospace',
    fontSize: '0.85rem',
  },
  scrollIndicator: {
    position: 'absolute' as const,
    bottom: 8,
    right: 20,
    backgroundColor: 'rgba(30, 30, 30, 0.9)',
    border: '1px solid #444',
    borderRadius: theme.shape.borderRadius,
    padding: '4px 10px',
    cursor: 'pointer',
    color: '#d4d4d4',
    fontFamily: 'Consolas, Monaco, monospace',
    fontSize: '0.75rem',
    '&:hover': {
      backgroundColor: 'rgba(60, 60, 60, 0.95)',
    },
  },
}));

interface RunLogViewerProps {
  /** The module run ID to fetch logs for. */
  runId: string;
  /** Polling interval in milliseconds. Defaults to 3000. */
  pollingInterval?: number;
  /** Current run status. Polling stops when this is a terminal status. */
  status?: string;
}

export function RunLogViewer({
  runId,
  pollingInterval = 3000,
  status,
}: RunLogViewerProps) {
  const classes = useStyles();
  const api = useRegistryApi();

  const [logEntries, setLogEntries] = useState<RunLogEntry[]>([]);
  const [isPolling, setIsPolling] = useState(true);

  // Track the highest sequence number we have received so far.
  const sequenceRef = useRef(0);
  // Reference to the scrollable viewport element.
  const viewportRef = useRef<HTMLDivElement | null>(null);
  // Whether the user has manually scrolled away from the bottom.
  const userScrolledRef = useRef(false);
  // Guard against concurrent fetches.
  const fetchingRef = useRef(false);

  // ── Determine whether polling should be active ──────────────────────
  const isTerminal = status ? TERMINAL_STATUSES.includes(status) : false;

  // ── Scroll helpers ──────────────────────────────────────────────────
  const isAtBottom = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return true;
    // Allow a small threshold (24px) to account for rounding.
    return el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = viewportRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    userScrolledRef.current = !isAtBottom();
  }, [isAtBottom]);

  // ── Fetch logs ──────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const data = await api.getModuleRunLogs(runId, sequenceRef.current);
      if (data.logs.length > 0) {
        setLogEntries(prev => [...prev, ...data.logs]);
        sequenceRef.current = Math.max(
          ...data.logs.map((l: RunLogEntry) => l.sequence),
        );
      }
    } catch {
      // Silently ignore fetch errors; will retry on next poll.
    } finally {
      fetchingRef.current = false;
    }
  }, [api, runId]);

  // ── Auto-scroll after new entries are rendered ──────────────────────
  useEffect(() => {
    if (!userScrolledRef.current) {
      scrollToBottom();
    }
  }, [logEntries, scrollToBottom]);

  // ── Initial fetch ───────────────────────────────────────────────────
  useEffect(() => {
    sequenceRef.current = 0;
    setLogEntries([]);
    userScrolledRef.current = false;
    setIsPolling(true);
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // ── Polling interval ────────────────────────────────────────────────
  useEffect(() => {
    if (!isPolling || isTerminal) {
      setIsPolling(false);
      // Do one final fetch to pick up any remaining logs.
      fetchLogs();
      return undefined;
    }

    const timer = setInterval(() => {
      fetchLogs();
    }, pollingInterval);

    return () => clearInterval(timer);
  }, [isPolling, isTerminal, pollingInterval, fetchLogs]);

  // ── Stop polling when status becomes terminal ───────────────────────
  useEffect(() => {
    if (isTerminal) {
      setIsPolling(false);
    }
  }, [isTerminal]);

  // ── Render ──────────────────────────────────────────────────────────
  if (logEntries.length === 0) {
    return (
      <Box className={classes.waiting}>
        <Typography className={classes.waitingText}>
          Waiting for logs...
        </Typography>
      </Box>
    );
  }

  return (
    <Box className={classes.root}>
      <div
        ref={viewportRef}
        className={classes.viewport}
        onScroll={handleScroll}
      >
        {logEntries.map((entry, index) => (
          <Box key={entry.id ?? index} className={classes.line}>
            <Box component="span" className={classes.lineNumber}>
              {index + 1}
            </Box>
            <Box
              component="span"
              className={`${classes.lineContent} ${
                entry.stream === 'stderr' ? classes.stderr : classes.stdout
              }`}
            >
              {stripAnsi(entry.content)}
            </Box>
          </Box>
        ))}
      </div>
      {userScrolledRef.current && (
        <Box
          className={classes.scrollIndicator}
          onClick={() => {
            userScrolledRef.current = false;
            scrollToBottom();
          }}
        >
          Scroll to bottom
        </Box>
      )}
    </Box>
  );
}
