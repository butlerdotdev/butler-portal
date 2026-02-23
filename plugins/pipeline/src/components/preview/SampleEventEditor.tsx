// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  Box,
  TextField,
  Button,
  Typography,
  Menu,
  MenuItem,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import { useState } from 'react';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1),
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    textarea: {
      fontFamily: '"Roboto Mono", "Fira Code", monospace',
      fontSize: '0.85rem',
    },
  }),
);

const PRESET_TEMPLATES: Record<string, string> = {
  syslog: JSON.stringify(
    [
      {
        message:
          '<34>1 2026-01-15T12:00:00Z myhost su - ID47 - BOM\'su root\' failed for user on /dev/pts/8',
        timestamp: '2026-01-15T12:00:00Z',
        source_type: 'syslog',
        facility: 'auth',
        severity: 'critical',
      },
    ],
    null,
    2,
  ),
  nginx: JSON.stringify(
    [
      {
        message:
          '192.168.1.1 - - [15/Jan/2026:12:00:00 +0000] "GET /api/health HTTP/1.1" 200 15 "-" "curl/7.88.1"',
        timestamp: '2026-01-15T12:00:00Z',
        source_type: 'nginx',
        host: 'web-01',
      },
    ],
    null,
    2,
  ),
  k8s: JSON.stringify(
    [
      {
        message: 'Successfully pulled image "nginx:latest"',
        timestamp: '2026-01-15T12:00:00Z',
        source_type: 'kubernetes_logs',
        kubernetes: {
          pod_name: 'nginx-7fb96c846b-abc12',
          pod_namespace: 'default',
          container_name: 'nginx',
          node_name: 'worker-01',
        },
        stream: 'stderr',
      },
    ],
    null,
    2,
  ),
};

interface SampleEventEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function SampleEventEditor({ value, onChange }: SampleEventEditorProps) {
  const classes = useStyles();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handlePresetSelect = (key: string) => {
    onChange(PRESET_TEMPLATES[key]);
    setAnchorEl(null);
  };

  return (
    <div className={classes.root}>
      <Box className={classes.header}>
        <Typography variant="subtitle2">Sample Events (JSON)</Typography>
        <Button
          size="small"
          variant="outlined"
          onClick={e => setAnchorEl(e.currentTarget)}
        >
          Presets
        </Button>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
        >
          <MenuItem onClick={() => handlePresetSelect('syslog')}>
            Syslog
          </MenuItem>
          <MenuItem onClick={() => handlePresetSelect('nginx')}>
            Nginx Access Log
          </MenuItem>
          <MenuItem onClick={() => handlePresetSelect('k8s')}>
            Kubernetes Log
          </MenuItem>
        </Menu>
      </Box>
      <TextField
        fullWidth
        multiline
        rows={8}
        variant="outlined"
        size="small"
        value={value}
        onChange={e => onChange(e.target.value)}
        InputProps={{
          classes: { input: classes.textarea },
        }}
        placeholder='[\n  { "message": "your event here" }\n]'
      />
    </div>
  );
}
