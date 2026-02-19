// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Grid,
  Paper,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormGroup,
  FormControlLabel,
  Checkbox,
  MenuItem,
  makeStyles,
} from '@material-ui/core';
import SearchIcon from '@material-ui/icons/Search';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import AddIcon from '@material-ui/icons/Add';
import PublicIcon from '@material-ui/icons/Public';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import { Progress, EmptyState } from '@backstage/core-components';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import { TeamTokenCard } from './TeamTokenCard';
import type { TeamTokenSummary } from './TeamTokenCard';
import type { RegistryToken, TokenScope } from '../../api/types/tokens';

const PLATFORM_KEY = '__platform__';

const useStyles = makeStyles(theme => ({
  platformSection: {
    padding: theme.spacing(2.5, 3),
    marginBottom: theme.spacing(3),
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(3),
    cursor: 'pointer',
    transition: 'box-shadow 0.2s ease',
    '&:hover': {
      boxShadow: theme.shadows[3],
    },
  },
  platformIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  platformStats: {
    display: 'flex',
    gap: theme.spacing(2),
    marginLeft: 'auto',
    alignItems: 'center',
  },
  statChip: {
    fontVariantNumeric: 'tabular-nums',
  },
  sectionTitle: {
    fontWeight: 600,
    marginBottom: theme.spacing(1.5),
    marginTop: theme.spacing(1),
  },
  toolbar: {
    display: 'flex',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    alignItems: 'center',
  },
  searchField: {
    minWidth: 260,
  },
  drillHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  noResults: {
    textAlign: 'center' as const,
    padding: theme.spacing(6),
    color: theme.palette.text.secondary,
  },
  tokenDisplay: {
    backgroundColor: theme.palette.background.default,
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    fontFamily: 'monospace',
    wordBreak: 'break-all' as const,
    marginTop: theme.spacing(1),
  },
}));

export function AdminTokensView() {
  const classes = useStyles();
  const api = useRegistryApi();
  const { teams } = useRegistryTeam();

  const [allTokens, setAllTokens] = useState<RegistryToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null = overview, PLATFORM_KEY = platform drill-down, string = team drill-down
  const [selectedView, setSelectedView] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState('');
  const [scopes, setScopes] = useState<Set<TokenScope>>(new Set(['read']));
  const [tokenTeam, setTokenTeam] = useState(PLATFORM_KEY);

  const fetchAllTokens = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listTokens();
      setAllTokens(data.tokens);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchAllTokens();
  }, [fetchAllTokens]);

  const handleCreate = async () => {
    try {
      const result = await api.createToken({
        name: tokenName,
        scopes: Array.from(scopes),
        ...(tokenTeam !== PLATFORM_KEY ? { team: tokenTeam } : {}),
      });
      setNewToken(result.secretValue);
      setTokenName('');
      setScopes(new Set(['read']));
      setTokenTeam(PLATFORM_KEY);
      fetchAllTokens();
    } catch (_err) {
      // Keep dialog open on error
    }
  };

  const toggleScope = (scope: TokenScope) => {
    setScopes(prev => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  };

  // Separate platform vs team tokens
  const platformTokens = useMemo(
    () => allTokens.filter(t => !t.team),
    [allTokens],
  );

  const teamTokens = useMemo(
    () => allTokens.filter(t => !!t.team),
    [allTokens],
  );

  // Group team tokens
  const teamGroups = useMemo(() => {
    const groups = new Map<string, RegistryToken[]>();
    for (const token of teamTokens) {
      const list = groups.get(token.team!);
      if (list) {
        list.push(token);
      } else {
        groups.set(token.team!, [token]);
      }
    }
    return groups;
  }, [teamTokens]);

  // Build team summaries — include ALL known teams
  const teamSummaries = useMemo<TeamTokenSummary[]>(() => {
    const allTeamNames = new Set<string>();
    for (const team of teamGroups.keys()) allTeamNames.add(team);
    for (const t of teams) allTeamNames.add(t);

    return Array.from(allTeamNames)
      .map(team => {
        const tokens = teamGroups.get(team) ?? [];
        const creators = new Set(tokens.map(t => t.created_by));
        return {
          team,
          tokenCount: tokens.length,
          readCount: tokens.filter(t => t.scopes.includes('read')).length,
          writeCount: tokens.filter(t => t.scopes.includes('write')).length,
          adminCount: tokens.filter(t => t.scopes.includes('admin')).length,
          creatorCount: creators.size,
        };
      })
      .sort((a, b) => a.team.localeCompare(b.team));
  }, [teamGroups, teams]);

  // Filter teams by search
  const filteredTeams = useMemo(() => {
    if (!searchTerm) return teamSummaries;
    const term = searchTerm.toLowerCase();
    return teamSummaries.filter(t => t.team.toLowerCase().includes(term));
  }, [teamSummaries, searchTerm]);

  if (loading) return <Progress />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load tokens"
        description={error}
        missing="data"
        action={
          <Button variant="outlined" onClick={fetchAllTokens}>
            Retry
          </Button>
        }
      />
    );
  }

  // Shared create dialog
  const createDialog = (
    <Dialog
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        {newToken ? 'Token Created' : 'Create Registry Token'}
      </DialogTitle>
      <DialogContent>
        {newToken ? (
          <>
            <Typography gutterBottom>
              Copy this token now. It will not be shown again.
            </Typography>
            <Box className={classes.tokenDisplay}>{newToken}</Box>
            <Button
              size="small"
              startIcon={<FileCopyIcon />}
              onClick={() => navigator.clipboard.writeText(newToken)}
              style={{ marginTop: 8 }}
            >
              Copy to Clipboard
            </Button>
          </>
        ) : (
          <>
            <TextField
              fullWidth
              variant="outlined"
              label="Token Name"
              value={tokenName}
              onChange={e => setTokenName(e.target.value)}
              margin="normal"
              placeholder="e.g. CI Pipeline Token"
            />
            <TextField
              fullWidth
              select
              variant="outlined"
              label="Scope"
              value={tokenTeam}
              onChange={e => setTokenTeam(e.target.value)}
              margin="normal"
              helperText="Platform tokens are not tied to any team"
            >
              <MenuItem value={PLATFORM_KEY}>Platform (org-wide)</MenuItem>
              {teams.map(t => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </TextField>
            <Typography
              variant="subtitle2"
              style={{ marginTop: 16, marginBottom: 8 }}
            >
              Permissions
            </Typography>
            <FormGroup row>
              {(['read', 'write', 'admin'] as TokenScope[]).map(scope => (
                <FormControlLabel
                  key={scope}
                  control={
                    <Checkbox
                      checked={scopes.has(scope)}
                      onChange={() => toggleScope(scope)}
                    />
                  }
                  label={scope}
                />
              ))}
            </FormGroup>
          </>
        )}
      </DialogContent>
      <DialogActions>
        {newToken ? (
          <Button onClick={() => setCreateOpen(false)}>Done</Button>
        ) : (
          <>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleCreate}
              disabled={!tokenName || scopes.size === 0}
            >
              Create
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );

  // Shared token table renderer
  const renderTokenTable = (tokens: RegistryToken[]) => (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Prefix</TableCell>
            <TableCell>Scopes</TableCell>
            <TableCell>Created By</TableCell>
            <TableCell>Created</TableCell>
            <TableCell>Last Used</TableCell>
            <TableCell>Expires</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tokens.map(token => (
            <TableRow key={token.id}>
              <TableCell>{token.name}</TableCell>
              <TableCell>
                <code>{token.token_prefix}...</code>
              </TableCell>
              <TableCell>
                {token.scopes.map(s => (
                  <Chip key={s} label={s} size="small" style={{ marginRight: 4 }} />
                ))}
              </TableCell>
              <TableCell>{token.created_by}</TableCell>
              <TableCell>
                {new Date(token.created_at).toLocaleDateString()}
              </TableCell>
              <TableCell>
                {token.last_used_at
                  ? new Date(token.last_used_at).toLocaleDateString()
                  : 'Never'}
              </TableCell>
              <TableCell>
                {token.expires_at
                  ? new Date(token.expires_at).toLocaleDateString()
                  : 'Never'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  // ── Drill-down: platform tokens ──
  if (selectedView === PLATFORM_KEY) {
    return (
      <>
        <Box className={classes.drillHeader}>
          <IconButton size="small" onClick={() => setSelectedView(null)}>
            <ArrowBackIcon />
          </IconButton>
          <PublicIcon style={{ color: '#2563eb' }} />
          <Typography variant="h6">Platform Tokens</Typography>
          <Chip
            label={`${platformTokens.length} token${platformTokens.length !== 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
          />
          <Box style={{ flex: 1 }} />
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => {
              setNewToken(null);
              setTokenTeam(PLATFORM_KEY);
              setCreateOpen(true);
            }}
          >
            Create Token
          </Button>
        </Box>

        {platformTokens.length === 0 ? (
          <EmptyState
            title="No platform tokens"
            description="Create org-wide tokens for CI pipelines and shared tooling."
            missing="data"
            action={
              <Button
                variant="contained"
                color="primary"
                onClick={() => {
                  setNewToken(null);
                  setTokenTeam(PLATFORM_KEY);
                  setCreateOpen(true);
                }}
              >
                Create Token
              </Button>
            }
          />
        ) : (
          renderTokenTable(platformTokens)
        )}
        {createDialog}
      </>
    );
  }

  // ── Drill-down: team tokens ──
  if (selectedView) {
    const tokens = teamGroups.get(selectedView) ?? [];

    return (
      <>
        <Box className={classes.drillHeader}>
          <IconButton size="small" onClick={() => setSelectedView(null)}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6">{selectedView}</Typography>
          <Chip
            label={`${tokens.length} token${tokens.length !== 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
          />
          <Box style={{ flex: 1 }} />
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => {
              setNewToken(null);
              setTokenTeam(selectedView);
              setCreateOpen(true);
            }}
          >
            Create Token
          </Button>
        </Box>

        {tokens.length === 0 ? (
          <EmptyState
            title="No tokens"
            description={`No registry tokens for ${selectedView} yet.`}
            missing="data"
            action={
              <Button
                variant="contained"
                color="primary"
                onClick={() => {
                  setNewToken(null);
                  setTokenTeam(selectedView);
                  setCreateOpen(true);
                }}
              >
                Create Token
              </Button>
            }
          />
        ) : (
          renderTokenTable(tokens)
        )}
        {createDialog}
      </>
    );
  }

  // ── Overview: Platform banner + Team cards ──
  return (
    <>
      {/* Platform Tokens banner */}
      <Paper
        variant="outlined"
        className={classes.platformSection}
        onClick={() => setSelectedView(PLATFORM_KEY)}
      >
        <Box className={classes.platformIcon}>
          <PublicIcon style={{ color: '#2563eb', fontSize: 28 }} />
        </Box>
        <Box>
          <Typography variant="subtitle1" style={{ fontWeight: 600, lineHeight: 1.2 }}>
            Platform Tokens
          </Typography>
          <Typography variant="caption" color="textSecondary">
            Org-wide tokens not tied to any team
          </Typography>
        </Box>
        <Box className={classes.platformStats}>
          <Chip
            label={`${platformTokens.length} tokens`}
            size="small"
            variant="outlined"
            className={classes.statChip}
          />
        </Box>
      </Paper>

      {/* Team Tokens section */}
      <Typography variant="subtitle1" className={classes.sectionTitle}>
        Team Tokens
      </Typography>

      <Box className={classes.toolbar}>
        <TextField
          className={classes.searchField}
          variant="outlined"
          size="small"
          placeholder="Search teams..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="disabled" />
              </InputAdornment>
            ),
          }}
        />
        <Box style={{ flex: 1 }} />
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => {
            setNewToken(null);
            setCreateOpen(true);
          }}
        >
          Create Token
        </Button>
      </Box>

      {teamSummaries.length === 0 ? (
        <EmptyState
          title="No teams"
          description="No teams have been configured yet."
          missing="data"
        />
      ) : filteredTeams.length === 0 ? (
        <Typography className={classes.noResults}>
          No teams matching &quot;{searchTerm}&quot;
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {filteredTeams.map(summary => (
            <Grid item xs={12} sm={6} md={4} key={summary.team}>
              <TeamTokenCard
                summary={summary}
                onClick={() => setSelectedView(summary.team)}
              />
            </Grid>
          ))}
        </Grid>
      )}
      {createDialog}
    </>
  );
}
