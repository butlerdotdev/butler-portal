// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Collapse,
  makeStyles,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import RefreshIcon from '@material-ui/icons/Refresh';
import { useRegistryApi } from '../../hooks/useRegistryApi';
import type { ResolvedVariable } from '../../api/types/variableSets';

const useStyles = makeStyles(theme => ({
  section: {
    marginBottom: theme.spacing(3),
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
    cursor: 'pointer',
  },
  sectionTitle: {
    fontWeight: 600,
  },
  sensitiveValue: {
    fontStyle: 'italic',
    color: theme.palette.text.secondary,
  },
  sourceChip: {
    maxWidth: 200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
}));

function sourceColor(source: string): 'default' | 'primary' | 'secondary' {
  if (source.startsWith('cloud-integration')) return 'secondary';
  if (source.startsWith('variable-set')) return 'primary';
  return 'default';
}

interface ResolvedVariablesViewerProps {
  envId: string;
  moduleId: string;
}

export function ResolvedVariablesViewer({
  envId,
  moduleId,
}: ResolvedVariablesViewerProps) {
  const classes = useStyles();
  const api = useRegistryApi();

  const [variables, setVariables] = useState<ResolvedVariable[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchResolved = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getResolvedVariables(envId, moduleId);
      setVariables(data.variables);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [api, envId, moduleId]);

  useEffect(() => {
    if (expanded && variables.length === 0) {
      fetchResolved();
    }
  }, [expanded, variables.length, fetchResolved]);

  return (
    <Box className={classes.section}>
      <Box
        className={classes.sectionHeader}
        onClick={() => setExpanded(!expanded)}
      >
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          <Typography variant="subtitle1" className={classes.sectionTitle}>
            Resolved Variables Preview
          </Typography>
          {variables.length > 0 && (
            <Chip label={`${variables.length} vars`} size="small" />
          )}
        </Box>
        {expanded && (
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={e => {
              e.stopPropagation();
              fetchResolved();
            }}
            disabled={loading}
          >
            Refresh
          </Button>
        )}
      </Box>

      <Collapse in={expanded}>
        {loading ? (
          <Typography variant="body2" color="textSecondary">
            Loading...
          </Typography>
        ) : variables.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            No resolved variables. Bind cloud integrations or variable sets, or add module variables.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Variable</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Category</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {variables.map(v => (
                  <TableRow key={v.key}>
                    <TableCell>
                      <code>{v.key}</code>
                    </TableCell>
                    <TableCell>
                      {v.sensitive ? (
                        <Typography
                          variant="body2"
                          className={classes.sensitiveValue}
                        >
                          (sensitive)
                        </Typography>
                      ) : (
                        <code>{v.value ?? ''}</code>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={v.source}
                        size="small"
                        color={sourceColor(v.source)}
                        variant="outlined"
                        className={classes.sourceChip}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip label={v.category} size="small" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {!loading && variables.length > 0 && (
          <Typography
            variant="caption"
            color="textSecondary"
            style={{ marginTop: 4, display: 'block' }}
          >
            Precedence: module variables &gt; variable sets &gt; cloud integrations.
            Higher priority values override lower within each layer.
          </Typography>
        )}
      </Collapse>
    </Box>
  );
}
