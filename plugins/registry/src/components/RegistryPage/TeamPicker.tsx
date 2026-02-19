// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  Box,
  TextField,
  MenuItem,
  Chip,
  ListSubheader,
  Divider,
  makeStyles,
} from '@material-ui/core';
import SecurityIcon from '@material-ui/icons/Security';
import type { RegistryRole } from '@internal/plugin-registry-common';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';

// Matches Butler console role color scheme
const ROLE_CONFIG: Record<RegistryRole, { label: string; bg: string; text: string }> = {
  'platform-admin': {
    label: 'Platform Admin',
    bg: 'rgba(139, 92, 246, 0.2)',
    text: '#a78bfa',
  },
  admin: {
    label: 'Admin',
    bg: 'rgba(139, 92, 246, 0.2)',
    text: '#a78bfa',
  },
  operator: {
    label: 'Operator',
    bg: 'rgba(34, 197, 94, 0.2)',
    text: '#4ade80',
  },
  viewer: {
    label: 'Viewer',
    bg: '#404040',
    text: '#d4d4d4',
  },
};

const ADMIN_VALUE = '__admin__';

const useStyles = makeStyles(() => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  adminOption: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#a78bfa',
  },
  adminIcon: {
    fontSize: 16,
    color: '#a78bfa',
  },
}));

export function TeamPicker() {
  const classes = useStyles();
  const { teams, activeTeam, activeRole, isPlatformAdmin, switchTeam } =
    useRegistryTeam();

  const roleConfig = ROLE_CONFIG[activeRole];

  // Determine the select value: null (admin mode) → ADMIN_VALUE sentinel
  const selectValue = activeTeam ?? (isPlatformAdmin ? ADMIN_VALUE : '');

  const handleChange = (value: string) => {
    if (value === ADMIN_VALUE) {
      switchTeam(null); // Admin mode — no team context
    } else {
      switchTeam(value || null);
    }
  };

  return (
    <Box className={classes.root}>
      <TextField
        select
        variant="outlined"
        size="small"
        label={activeTeam ? 'Team' : 'Mode'}
        value={selectValue}
        onChange={e => handleChange(e.target.value)}
        style={{ minWidth: 200 }}
      >
        {isPlatformAdmin && [
          <MenuItem key={ADMIN_VALUE} value={ADMIN_VALUE}>
            <span className={classes.adminOption}>
              <SecurityIcon className={classes.adminIcon} />
              Platform Admin
            </span>
          </MenuItem>,
          teams.length > 0 && (
            <Divider key="__divider__" />
          ),
          teams.length > 0 && (
            <ListSubheader key="__header__">Teams</ListSubheader>
          ),
        ]}
        {teams.map(t => (
          <MenuItem key={t} value={t}>
            {t}
          </MenuItem>
        ))}
      </TextField>
      <Chip
        label={roleConfig.label}
        size="small"
        style={{
          backgroundColor: roleConfig.bg,
          color: roleConfig.text,
          fontWeight: 600,
          border: 'none',
        }}
      />
    </Box>
  );
}
