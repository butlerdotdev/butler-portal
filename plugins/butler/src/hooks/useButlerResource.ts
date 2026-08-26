// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useReducer, useRef } from 'react';

export type PollInterval<T> = number | ((data: T | undefined) => number | null);

export interface UseButlerResourceOptions<T> {
  deps: unknown[];
  pollIntervalMs?: PollInterval<T>;
  enabled?: boolean;
}

export type ButlerResourceState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T; stale: boolean }
  | { status: 'error'; error: Error; data?: T };

export type UseButlerResourceResult<T> = ButlerResourceState<T> & {
  refresh: (silent?: boolean) => Promise<void>;
};

type Action<T> =
  | { type: 'start'; silent: boolean }
  | { type: 'success'; data: T }
  | { type: 'failure'; error: Error }
  | { type: 'reset' };

function reducer<T>(
  state: ButlerResourceState<T>,
  action: Action<T>,
): ButlerResourceState<T> {
  switch (action.type) {
    case 'reset':
      return { status: 'loading' };
    case 'start':
      if (action.silent && state.status === 'ready') {
        return { ...state, stale: true };
      }
      if (action.silent && state.status === 'error') {
        return state;
      }
      return { status: 'loading' };
    case 'success':
      return { status: 'ready', data: action.data, stale: false };
    case 'failure':
      return {
        status: 'error',
        error: action.error,
        data: state.status === 'loading' ? undefined : state.data,
      };
    default:
      return state;
  }
}

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

function resolveInterval<T>(
  interval: PollInterval<T> | undefined,
  data: T | undefined,
): number | null {
  if (interval === undefined) return null;
  const value = typeof interval === 'function' ? interval(data) : interval;
  return value !== null && value > 0 ? value : null;
}

/**
 * Loads a resource from the Butler API with cancellation, optional polling
 * and explicit error state. Errors are never swallowed: they are surfaced in
 * the returned state so the caller decides how to render them.
 */
export function useButlerResource<T>(
  fetcher: () => Promise<T>,
  opts: UseButlerResourceOptions<T>,
): UseButlerResourceResult<T> {
  const { deps, pollIntervalMs, enabled = true } = opts;
  const [state, dispatch] = useReducer(reducer<T>, { status: 'loading' });

  // Refs keep the latest callbacks without retriggering the effect below.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const intervalRef = useRef(pollIntervalMs);
  intervalRef.current = pollIntervalMs;

  // Incremented on deps change and unmount so in-flight fetches from a
  // previous generation are ignored when they resolve.
  const generationRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastDataRef = useRef<T | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const run = useCallback(async (silent: boolean): Promise<void> => {
    if (inFlightRef.current) {
      return inFlightRef.current;
    }
    const generation = generationRef.current;
    clearTimer();
    dispatch({ type: 'start', silent });

    const promise = (async () => {
      try {
        const data = await fetcherRef.current();
        if (generation !== generationRef.current) return;
        dispatch({ type: 'success', data });
        lastDataRef.current = data;
        const next = resolveInterval(intervalRef.current, data);
        if (next !== null) {
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            void run(true);
          }, next);
        }
      } catch (e) {
        if (generation !== generationRef.current) return;
        dispatch({ type: 'failure', error: toError(e) });
        // A failed silent poll re-arms on the last known data so a
        // transient error does not freeze the page on a stale state.
        if (silent) {
          const next = resolveInterval(
            intervalRef.current,
            lastDataRef.current,
          );
          if (next !== null) {
            timerRef.current = setTimeout(() => {
              timerRef.current = null;
              void run(true);
            }, next);
          }
        }
      } finally {
        if (generation === generationRef.current) {
          inFlightRef.current = null;
        }
      }
    })();
    inFlightRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    inFlightRef.current = null;
    clearTimer();
    if (!enabled) {
      return undefined;
    }
    dispatch({ type: 'reset' });
    void run(false);
    return () => {
      generationRef.current += 1;
      inFlightRef.current = null;
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  const refresh = useCallback((silent: boolean = false) => run(silent), [run]);

  return { ...state, refresh };
}
