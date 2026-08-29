// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerTokens, rgb, rgba } from '../../theme';
import { ButlerCard } from './ButlerCard';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    wrapper: {
      overflowX: 'auto',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: t.fontSans,
    },
    head: {
      backgroundColor: t.inset,
    },
    th: {
      padding: '12px 16px',
      textAlign: 'left',
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      textTransform: 'uppercase',
      color: t.text.muted,
      whiteSpace: 'nowrap',
    },
    right: { textAlign: 'right' },
    tr: {
      borderTop: `1px solid ${t.border}`,
      '&:hover': { backgroundColor: rgba(t.palette.neutral[800], 0.3) },
    },
    clickable: { cursor: 'pointer' },
    td: {
      padding: '12px 16px',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.muted,
      verticalAlign: 'middle',
    },
    primary: { color: rgb(t.palette.neutral[200]) },
    mono: { fontFamily: t.fontMono },
  };
});

export interface ButlerColumn<Row> {
  id: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  /** Primary column: rendered in the stronger text shade. */
  primary?: boolean;
  mono?: boolean;
  align?: 'left' | 'right';
  width?: number | string;
}

export interface ButlerTableProps<Row> {
  columns: ReadonlyArray<ButlerColumn<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  /** Omit the card wrapper (when the table already sits inside a card). */
  bare?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Console table: uppercase muted header on an inset band, divided rows,
 * subtle hover, wrapped in a flush card.
 */
export function ButlerTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  bare = false,
  className,
  'aria-label': ariaLabel,
}: ButlerTableProps<Row>) {
  const classes = useStyles();
  const table = (
    <div className={classes.wrapper}>
      <table className={classes.table} aria-label={ariaLabel}>
        <thead className={classes.head}>
          <tr>
            {columns.map(col => (
              <th
                key={col.id}
                className={clsx(
                  classes.th,
                  col.align === 'right' && classes.right,
                )}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={rowKey(row)}
              className={clsx(classes.tr, onRowClick && classes.clickable)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map(col => (
                <td
                  key={col.id}
                  className={clsx(
                    classes.td,
                    col.primary && classes.primary,
                    col.mono && classes.mono,
                    col.align === 'right' && classes.right,
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  if (bare) return table;
  return (
    <ButlerCard flush className={className} style={{ overflow: 'hidden' }}>
      {table}
    </ButlerCard>
  );
}
