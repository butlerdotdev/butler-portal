// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { ButlerApiError } from '../../api/ButlerApiError';
import type {
  AuditEntry,
  AuditListResponse,
  AuditQuery,
} from '../../api/types/audit';
import { formatAge } from '../../utils/formatAge';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  describeEntry,
  outcomeOf,
  redactSummary,
} from '../../utils/auditPresentation';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerButton,
  ButlerCallout,
  ButlerCard,
  ButlerChip,
  ButlerDialog,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerInput,
  ButlerKeyValueList,
  ButlerKeyValueRow,
  ButlerLoading,
  ButlerSelect,
  ButlerTable,
  type ButlerColumn,
} from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    filters: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 12,
      padding: 16,
    },
    pager: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '12px 16px',
      borderTop: `1px solid ${t.border}`,
      flexWrap: 'wrap',
    },
    pagerRight: { display: 'flex', alignItems: 'center', gap: 8 },
    muted: { color: t.text.subtle, fontSize: 13 },
    what: { color: rgb(t.palette.neutral[200]) },
    target: { color: t.text.subtle, fontSize: 12, display: 'block' },
    raw: { fontFamily: t.fontMono, fontSize: 12 },
    pre: {
      margin: 0,
      fontFamily: t.fontMono,
      fontSize: 12,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      color: rgb(t.palette.neutral[300]),
      background: t.inset,
      padding: 12,
      borderRadius: t.radius.md,
      maxHeight: 240,
      overflow: 'auto',
    },
  };
});

const PAGE_SIZES = [25, 50, 100] as const;

export interface AuditLogTableProps {
  /** The read to run; the server decides who may call it. */
  load: (query: AuditQuery) => Promise<AuditListResponse>;
  /** Shown when the server refuses the read. */
  refusedMessage: string;
  /** Column shown only on the platform log: the acting team. */
  showTeam?: boolean;
  'aria-label': string;
}

type Filters = {
  user: string;
  action: string;
  resourceType: string;
  success: '' | 'true' | 'false';
  from: string;
  to: string;
};

const EMPTY: Filters = {
  user: '',
  action: '',
  resourceType: '',
  success: '',
  from: '',
  to: '',
};

/**
 * One table for both audit logs. Filtering and paging are the server's
 * (`user`, `action`, `resourceType`, `success`, `from`, `to`, `limit`,
 * `offset`); the page draws what the server returns and nothing else.
 * A row is one event: what happened, to what, by whom, when, and how the
 * server answered. The detail dialog shows the request the server kept,
 * after redaction.
 */
export const AuditLogTable = ({
  load,
  refusedMessage,
  showTeam = false,
  'aria-label': ariaLabel,
}: AuditLogTableProps) => {
  const classes = useStyles();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [pageSize, setPageSize] = useState<number>(25);
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'refused'; message: string }
    | { status: 'error'; message: string }
    | { status: 'ready'; data: AuditListResponse }
  >({ status: 'loading' });
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const query = useMemo<AuditQuery>(
    () => ({
      user: applied.user.trim() || undefined,
      action: applied.action || undefined,
      resourceType: applied.resourceType || undefined,
      success: applied.success || undefined,
      from: applied.from || undefined,
      to: applied.to || undefined,
      limit: pageSize,
      offset,
    }),
    [applied, pageSize, offset],
  );

  const run = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const data = await load(query);
      setState({ status: 'ready', data });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load audit history';
      if (err instanceof ButlerApiError && err.status === 403) {
        setState({ status: 'refused', message });
      } else {
        setState({ status: 'error', message });
      }
    }
  }, [load, query]);

  useEffect(() => {
    run();
  }, [run]);

  const apply = () => {
    setOffset(0);
    setApplied(filters);
  };
  const clear = () => {
    setFilters(EMPTY);
    setApplied(EMPTY);
    setOffset(0);
  };

  const columns = useMemo<ButlerColumn<AuditEntry>[]>(() => {
    const cols: ButlerColumn<AuditEntry>[] = [
      {
        id: 'when',
        header: 'When',
        render: e => (
          <span title={new Date(e.timestamp).toLocaleString()}>
            {formatAge(e.timestamp)}
          </span>
        ),
        width: 90,
      },
      {
        id: 'what',
        header: 'What',
        primary: true,
        render: e => {
          const d = describeEntry(e);
          return (
            <span>
              <span className={d.humanised ? classes.what : classes.raw}>
                {d.what}
              </span>
              {d.target && <span className={classes.target}>{d.target}</span>}
            </span>
          );
        },
      },
      { id: 'who', header: 'Who', mono: true, render: e => e.user },
    ];
    if (showTeam) {
      cols.push({
        id: 'team',
        header: 'Acting as',
        render: e =>
          e.teamRef || <span className={classes.muted}>platform</span>,
      });
    }
    cols.push({
      id: 'outcome',
      header: 'Outcome',
      align: 'right',
      render: e => {
        const o = outcomeOf(e);
        return (
          <span title={o.detail}>
            <ButlerChip tone={o.tone}>{o.label}</ButlerChip>
          </span>
        );
      },
    });
    return cols;
  }, [classes, showTeam]);

  const filterBar = (
    <div className={classes.filters}>
      <ButlerInput
        label="Actor"
        aria-label="Actor"
        placeholder="email"
        value={filters.user}
        onChange={e => setFilters({ ...filters, user: e.target.value })}
      />
      <ButlerSelect
        label="Action"
        aria-label="Action"
        value={filters.action}
        onChange={e => setFilters({ ...filters, action: e.target.value })}
        placeholder="All"
        options={AUDIT_ACTIONS.map(a => ({ value: a, label: a }))}
      />
      <ButlerSelect
        label="Resource"
        aria-label="Resource"
        value={filters.resourceType}
        onChange={e => setFilters({ ...filters, resourceType: e.target.value })}
        placeholder="All"
        options={AUDIT_RESOURCE_TYPES.map(r => ({ value: r, label: r }))}
      />
      <ButlerSelect
        label="Outcome"
        aria-label="Outcome"
        value={filters.success}
        onChange={e =>
          setFilters({
            ...filters,
            success: e.target.value as Filters['success'],
          })
        }
        placeholder="All"
        options={[
          { value: 'true', label: 'Succeeded' },
          { value: 'false', label: 'Not succeeded' },
        ]}
      />
      <ButlerInput
        label="From"
        aria-label="From"
        type="date"
        value={filters.from}
        onChange={e => setFilters({ ...filters, from: e.target.value })}
      />
      <ButlerInput
        label="To"
        aria-label="To"
        type="date"
        value={filters.to}
        onChange={e => setFilters({ ...filters, to: e.target.value })}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <ButlerButton onClick={apply}>Apply</ButlerButton>
        <ButlerButton variant="secondary" onClick={clear}>
          Clear
        </ButlerButton>
      </div>
    </div>
  );

  if (state.status === 'refused') {
    return (
      <ButlerCallout
        tone="neutral"
        title="Audit history is not available to this role"
      >
        {refusedMessage} ({state.message})
      </ButlerCallout>
    );
  }
  if (state.status === 'error') {
    return (
      <ButlerErrorState
        message="Failed to load audit history"
        detail={state.message}
        onRetry={run}
      />
    );
  }

  const data = state.status === 'ready' ? state.data : null;
  const rows = data?.entries ?? [];
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, total);

  return (
    <>
      <ButlerCard flush>
        {filterBar}
        {state.status === 'loading' ? (
          <ButlerLoading />
        ) : rows.length === 0 ? (
          <ButlerEmptyState title="No audit activity found." />
        ) : (
          <ButlerTable
            bare
            aria-label={ariaLabel}
            columns={columns}
            rows={rows}
            rowKey={e => `${e.timestamp}|${e.user}|${e.path ?? e.action}`}
            onRowClick={setSelected}
          />
        )}
        <div className={classes.pager}>
          <span className={classes.muted} aria-live="polite">
            {total === 0
              ? 'No entries'
              : `Showing ${from} to ${to} of ${total}`}
          </span>
          <div className={classes.pagerRight}>
            <ButlerSelect
              aria-label="Page size"
              value={String(pageSize)}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setOffset(0);
              }}
              options={PAGE_SIZES.map(n => ({
                value: String(n),
                label: `${n} per page`,
              }))}
            />
            <ButlerButton
              variant="secondary"
              size="sm"
              disabled={offset === 0 || state.status === 'loading'}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
            >
              Previous
            </ButlerButton>
            <ButlerButton
              variant="secondary"
              size="sm"
              disabled={
                offset + pageSize >= total || state.status === 'loading'
              }
              onClick={() => setOffset(offset + pageSize)}
            >
              Next
            </ButlerButton>
          </div>
        </div>
      </ButlerCard>

      {selected && (
        <ButlerDialog
          open
          onClose={() => setSelected(null)}
          title={describeEntry(selected).what}
          subtitle={describeEntry(selected).target || undefined}
          width={560}
          footer={
            <ButlerButton variant="secondary" onClick={() => setSelected(null)}>
              Close
            </ButlerButton>
          }
        >
          <ButlerKeyValueList>
            <ButlerKeyValueRow label="When" dense mono>
              {new Date(selected.timestamp).toISOString()}
            </ButlerKeyValueRow>
            <ButlerKeyValueRow label="Who" dense mono>
              {selected.user}
            </ButlerKeyValueRow>
            <ButlerKeyValueRow label="Outcome" dense>
              {`${outcomeOf(selected).label}. ${outcomeOf(selected).detail}`}
            </ButlerKeyValueRow>
            {selected.resourceType && (
              <ButlerKeyValueRow label="Resource" dense mono>
                {[
                  selected.resourceType,
                  selected.resourceNamespace,
                  selected.resourceName,
                ]
                  .filter(Boolean)
                  .join(' / ')}
              </ButlerKeyValueRow>
            )}
            {selected.teamRef && (
              <ButlerKeyValueRow label="Acting as team" dense>
                {selected.teamRef}
              </ButlerKeyValueRow>
            )}
            {selected.provider && (
              <ButlerKeyValueRow label="Identity provider" dense>
                {selected.provider}
              </ButlerKeyValueRow>
            )}
            {selected.path && (
              <ButlerKeyValueRow label="Request" dense mono>
                {`${selected.httpMethod ?? ''} ${selected.path}`.trim()}
              </ButlerKeyValueRow>
            )}
            {selected.sourceIP && (
              <ButlerKeyValueRow label="Source" dense mono>
                {selected.sourceIP}
              </ButlerKeyValueRow>
            )}
          </ButlerKeyValueList>
          {selected.requestSummary && (
            <>
              <p className={classes.muted}>
                Request body as the server kept it, with credentials redacted.
              </p>
              <pre className={classes.pre} data-testid="audit-summary">
                {redactSummary(selected.requestSummary)}
              </pre>
            </>
          )}
        </ButlerDialog>
      )}
    </>
  );
};
