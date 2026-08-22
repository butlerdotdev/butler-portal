// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { act, renderHook } from '@testing-library/react';
import { useButlerResource } from './useButlerResource';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => act(async () => Promise.resolve());

describe('useButlerResource', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts loading and becomes ready with the fetched data', async () => {
    const fetcher = jest.fn().mockResolvedValue('one');
    const { result } = renderHook(() =>
      useButlerResource(fetcher, { deps: [] }),
    );

    expect(result.current.status).toBe('loading');
    await flush();

    expect(result.current).toMatchObject({
      status: 'ready',
      data: 'one',
      stale: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('polls at a fixed interval and marks data stale while refetching', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce('one')
      .mockResolvedValueOnce('two')
      .mockResolvedValue('three');
    const { result } = renderHook(() =>
      useButlerResource(fetcher, { deps: [], pollIntervalMs: 5000 }),
    );
    await flush();
    expect(result.current).toMatchObject({ status: 'ready', data: 'one' });

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({
      status: 'ready',
      data: 'one',
      stale: true,
    });

    await flush();
    expect(result.current).toMatchObject({
      status: 'ready',
      data: 'two',
      stale: false,
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.current).toMatchObject({ status: 'ready', data: 'three' });
  });

  it('stops polling when the interval function returns null', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({ phase: 'Provisioning' })
      .mockResolvedValue({ phase: 'Ready' });
    const interval = jest.fn((data?: { phase: string }) =>
      data?.phase === 'Ready' ? null : 1000,
    );
    const { result } = renderHook(() =>
      useButlerResource(fetcher, { deps: [], pollIntervalMs: interval }),
    );
    await flush();
    expect(result.current).toMatchObject({
      status: 'ready',
      data: { phase: 'Provisioning' },
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ data: { phase: 'Ready' } });

    act(() => {
      jest.advanceTimersByTime(10000);
    });
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ignores a fetch that resolves after unmount', async () => {
    const deferred = defer<string>();
    const fetcher = jest.fn(() => deferred.promise);
    const { result, unmount } = renderHook(() =>
      useButlerResource(fetcher, { deps: [], pollIntervalMs: 1000 }),
    );
    expect(result.current.status).toBe('loading');

    unmount();
    await act(async () => {
      deferred.resolve('late');
      await Promise.resolve();
    });

    expect(result.current.status).toBe('loading');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ignores a stale resolution when deps change mid-flight', async () => {
    const first = defer<string>();
    const second = defer<string>();
    const fetcher = jest
      .fn<Promise<string>, []>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useButlerResource(fetcher, { deps: [key] }),
      { initialProps: { key: 'a' } },
    );

    rerender({ key: 'b' });
    expect(fetcher).toHaveBeenCalledTimes(2);

    await act(async () => {
      first.resolve('from-a');
      await Promise.resolve();
    });
    expect(result.current.status).toBe('loading');

    await act(async () => {
      second.resolve('from-b');
      await Promise.resolve();
    });
    expect(result.current).toMatchObject({ status: 'ready', data: 'from-b' });
  });

  it('does not overlap fetches', async () => {
    const deferred = defer<string>();
    const fetcher = jest.fn(() => deferred.promise);
    const { result } = renderHook(() =>
      useButlerResource(fetcher, { deps: [] }),
    );

    act(() => {
      void result.current.refresh();
      void result.current.refresh(true);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve('done');
      await Promise.resolve();
    });
    expect(result.current).toMatchObject({ status: 'ready', data: 'done' });
  });

  it('keeps the last data in the error state on a failed silent refresh', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce('good')
      .mockRejectedValueOnce(new Error('backend down'));
    const { result } = renderHook(() =>
      useButlerResource(fetcher, { deps: [] }),
    );
    await flush();
    expect(result.current).toMatchObject({ status: 'ready', data: 'good' });

    await act(async () => {
      await result.current.refresh(true);
    });

    expect(result.current).toMatchObject({
      status: 'error',
      data: 'good',
    });
    if (result.current.status === 'error') {
      expect(result.current.error.message).toBe('backend down');
    }
  });

  it('re-arms polling after a failed silent poll', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce('one')
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce('two');
    const { result } = renderHook(() =>
      useButlerResource(fetcher, { deps: [], pollIntervalMs: 1000 }),
    );
    await flush();
    expect(result.current).toMatchObject({ status: 'ready', data: 'one' });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await flush();
    expect(result.current).toMatchObject({ status: 'error', data: 'one' });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await flush();
    expect(result.current).toMatchObject({ status: 'ready', data: 'two' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('surfaces the initial load error without data', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() =>
      useButlerResource(fetcher, { deps: [] }),
    );
    await flush();

    expect(result.current.status).toBe('error');
    if (result.current.status === 'error') {
      expect(result.current.error.message).toBe('nope');
      expect(result.current.data).toBeUndefined();
    }
  });

  it('does not fetch while disabled', async () => {
    const fetcher = jest.fn().mockResolvedValue('x');
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useButlerResource(fetcher, { deps: [], enabled }),
      { initialProps: { enabled: false } },
    );
    await flush();
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.status).toBe('loading');

    rerender({ enabled: true });
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ status: 'ready', data: 'x' });
  });
});
