// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  IconButton,
  Tooltip,
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TableContainer,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import RefreshIcon from '@material-ui/icons/Refresh';
import { Progress, WarningPanel, InfoCard } from '@backstage/core-components';
import { useNavigate } from 'react-router-dom';
import { usePipelineApi } from '../../hooks/usePipelineApi';
import { usePipelineTeam } from '../../hooks/usePipelineTeam';
import type { FleetAgent, AgentStatus } from '../../api/types/fleet';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    toolbar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing(2),
    },
    filters: {
      display: 'flex',
      gap: theme.spacing(2),
      alignItems: 'center',
    },
    statusSelect: {
      minWidth: 120,
    },
    online: {
      backgroundColor: theme.palette.success?.main ?? '#4caf50',
      color: '#fff',
    },
    offline: {
      backgroundColor: theme.palette.error?.main ?? '#f44336',
      color: '#fff',
    },
    pending: {
      backgroundColor: theme.palette.warning?.main ?? '#ff9800',
      color: '#fff',
    },
    stale: {
      backgroundColor: theme.palette.grey[500],
      color: '#fff',
    },
    hashCode: {
      fontFamily: 'monospace',
      fontSize: '0.8rem',
    },
    syncApplied: { color: theme.palette.success?.main ?? '#4caf50' },
    syncRejected: { color: theme.palette.error?.main ?? '#f44336' },
    syncUnchanged: { color: theme.palette.text.secondary },
  }),
);

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AgentList() {
  const classes = useStyles();
  const api = usePipelineApi();
  const navigate = useNavigate();
  const { activeTeam, isPlatformAdmin } = usePipelineTeam();
  const isAdminMode = isPlatformAdmin && !activeTeam;
  const [agents, setAgents] = useState<FleetAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [statusFilter, setStatusFilter] = useState<AgentStatus | ''>('');

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listFleetAgents(
        statusFilter ? { status: statusFilter } : undefined,
      );
      setAgents(result.items);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const getStatusClass = (status: AgentStatus) => {
    switch (status) {
      case 'online': return classes.online;
      case 'offline': return classes.offline;
      case 'pending': return classes.pending;
      case 'stale': return classes.stale;
      default: return '';
    }
  };

  const getSyncStatusDisplay = (agent: FleetAgent) => {
    if (!agent.config_sync_result) return <Typography variant="body2" color="textSecondary">--</Typography>;
    const { status, error: syncError } = agent.config_sync_result;
    const className = status === 'applied' ? classes.syncApplied
      : status === 'rejected' ? classes.syncRejected
      : classes.syncUnchanged;
    return (
      <Tooltip title={syncError || ''}>
        <Typography variant="body2" className={className}>
          {status}
        </Typography>
      </Tooltip>
    );
  };

  if (error) {
    return <WarningPanel title="Failed to load agents" message={error.message} />;
  }

  return (
    <InfoCard title="Fleet Agents">
      <Box className={classes.toolbar}>
        <Box className={classes.filters}>
          <FormControl variant="outlined" size="small" className={classes.statusSelect}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as AgentStatus | '')}
              label="Status"
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="online">Online</MenuItem>
              <MenuItem value="offline">Offline</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="stale">Stale</MenuItem>
            </Select>
          </FormControl>
          <Typography variant="body2" color="textSecondary">
            {agents.length} agent{agents.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={loadAgents} size="small">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>
      {loading ? (
        <Progress />
      ) : agents.length === 0 ? (
        <Typography color="textSecondary" align="center">
          No agents registered. Deploy the fleet agent to get started.
        </Typography>
      ) : (
        <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Agent ID</TableCell>
              {isAdminMode && <TableCell>Team</TableCell>}
              <TableCell>Hostname</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>OS / Arch</TableCell>
              <TableCell>Vector</TableCell>
              <TableCell>Config Hash</TableCell>
              <TableCell>Sync</TableCell>
              <TableCell>Last Heartbeat</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {agents.map(agent => (
              <TableRow
                key={agent.id}
                hover
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`agents/${agent.id}`)}
              >
                <TableCell>{agent.agent_id}</TableCell>
                {isAdminMode && <TableCell>{agent.team}</TableCell>}
                <TableCell>{agent.hostname || '--'}</TableCell>
                <TableCell>
                  <Chip label={agent.status} size="small" className={getStatusClass(agent.status)} />
                </TableCell>
                <TableCell>
                  {agent.os && agent.arch ? `${agent.os}/${agent.arch}` : '--'}
                </TableCell>
                <TableCell>{agent.vector_version || '--'}</TableCell>
                <TableCell>
                  <code className={classes.hashCode}>
                    {agent.current_config_hash ? agent.current_config_hash.slice(0, 12) : '--'}
                  </code>
                </TableCell>
                <TableCell>{getSyncStatusDisplay(agent)}</TableCell>
                <TableCell>{formatTimeAgo(agent.last_heartbeat_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </TableContainer>
      )}
    </InfoCard>
  );
}
