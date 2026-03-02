// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core';
import DeleteIcon from '@material-ui/icons/Delete';
import AddIcon from '@material-ui/icons/Add';
import type { OutputMapping } from '../../api/types/environments';

const useStyles = makeStyles(theme => ({
  description: {
    marginBottom: theme.spacing(2),
    color: theme.palette.text.secondary,
  },
  emptyState: {
    padding: theme.spacing(3),
    textAlign: 'center' as const,
    color: theme.palette.text.secondary,
  },
  addButton: {
    marginTop: theme.spacing(1),
  },
  inputCell: {
    padding: theme.spacing(0.5, 1),
  },
  arrow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.palette.text.secondary,
    fontWeight: 600,
  },
}));

interface OutputMappingDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (mapping: OutputMapping[]) => void;
  upstreamModuleName: string;
  currentModuleName: string;
  initialMapping: OutputMapping[];
}

export function OutputMappingDialog({
  open,
  onClose,
  onSave,
  upstreamModuleName,
  currentModuleName,
  initialMapping,
}: OutputMappingDialogProps) {
  const classes = useStyles();
  const [rows, setRows] = useState<OutputMapping[]>(
    initialMapping.length > 0 ? [...initialMapping] : [],
  );

  const handleAddRow = () => {
    setRows([...rows, { upstream_output: '', downstream_variable: '' }]);
  };

  const handleRemoveRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleChange = (
    index: number,
    field: keyof OutputMapping,
    value: string,
  ) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setRows(updated);
  };

  const handleSave = () => {
    // Filter out incomplete rows
    const valid = rows.filter(
      r => r.upstream_output.trim() && r.downstream_variable.trim(),
    );
    onSave(valid);
  };

  const hasEmptyRows = rows.some(
    r => !r.upstream_output.trim() || !r.downstream_variable.trim(),
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Output Mapping: {upstreamModuleName} &rarr; {currentModuleName}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" className={classes.description}>
          Map outputs from <strong>{upstreamModuleName}</strong> to input
          variables for <strong>{currentModuleName}</strong>. Leave empty if
          this dependency is for execution ordering only.
        </Typography>

        {rows.length > 0 ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Upstream Output</TableCell>
                  <TableCell style={{ width: 40 }} />
                  <TableCell>Downstream Variable</TableCell>
                  <TableCell style={{ width: 48 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className={classes.inputCell}>
                      <TextField
                        fullWidth
                        size="small"
                        variant="outlined"
                        placeholder="e.g. network_name"
                        value={row.upstream_output}
                        onChange={e =>
                          handleChange(i, 'upstream_output', e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell className={classes.arrow}>&rarr;</TableCell>
                    <TableCell className={classes.inputCell}>
                      <TextField
                        fullWidth
                        size="small"
                        variant="outlined"
                        placeholder="e.g. network_name"
                        value={row.downstream_variable}
                        onChange={e =>
                          handleChange(i, 'downstream_variable', e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveRow(i)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box className={classes.emptyState}>
            <Typography variant="body2">
              No output mappings configured. This dependency is for execution
              ordering only.
            </Typography>
          </Box>
        )}

        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={handleAddRow}
          className={classes.addButton}
        >
          Add Mapping
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          color="primary"
          variant="contained"
          disabled={hasEmptyRows}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
