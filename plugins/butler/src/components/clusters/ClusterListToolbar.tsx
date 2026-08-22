// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';
import { ButlerSearchInput } from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    root: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      fontFamily: t.fontSans,
    },
    bar: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      [theme.breakpoints.up('md')]: { flexDirection: 'row' },
    },
    filters: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    chip: {
      padding: '6px 12px',
      borderRadius: t.radius.lg,
      fontFamily: t.fontSans,
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      border: `1px solid ${t.border}`,
      backgroundColor: t.surface,
      color: t.text.muted,
      cursor: 'pointer',
      transition: 'border-color 150ms, color 150ms, background-color 150ms',
      '&:hover': { borderColor: t.borderStrong },
    },
    chipActive: {
      backgroundColor: rgba(p.blue[500], 0.2),
      color: rgb(p.blue[300]),
      borderColor: rgba(p.blue[500], 0.4),
      '&:hover': { borderColor: rgba(p.blue[500], 0.4) },
    },
    none: {
      fontSize: 14,
      color: t.text.subtle,
    },
    results: {
      fontSize: 12,
      color: t.text.subtle,
    },
  };
});

export interface ClusterListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  phaseFilter: ReadonlySet<string>;
  onPhaseFilterChange: (next: Set<string>) => void;
  availablePhases: readonly string[];
  resultsLabel: string | null;
}

/** Console `ClusterListToolbar`: search box, phase chips, results count. */
export const ClusterListToolbar = ({
  search,
  onSearchChange,
  phaseFilter,
  onPhaseFilterChange,
  availablePhases,
  resultsLabel,
}: ClusterListToolbarProps) => {
  const classes = useStyles();
  const toggle = (phase: string) => {
    const next = new Set(phaseFilter);
    if (next.has(phase)) next.delete(phase);
    else next.add(phase);
    onPhaseFilterChange(next);
  };
  return (
    <div className={classes.root}>
      <div className={classes.bar}>
        <ButlerSearchInput
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search clusters by name or namespace"
          aria-label="Search clusters"
        />
        <div className={classes.filters}>
          {availablePhases.length === 0 ? (
            <span className={classes.none}>No phases to filter</span>
          ) : (
            availablePhases.map(phase => (
              <button
                key={phase}
                type="button"
                aria-pressed={phaseFilter.has(phase)}
                className={clsx(
                  classes.chip,
                  phaseFilter.has(phase) && classes.chipActive,
                )}
                onClick={() => toggle(phase)}
              >
                {phase}
              </button>
            ))
          )}
        </div>
      </div>
      {resultsLabel && <div className={classes.results}>{resultsLabel}</div>}
    </div>
  );
};
