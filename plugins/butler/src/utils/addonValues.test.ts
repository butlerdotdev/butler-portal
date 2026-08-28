// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  addonVersionState,
  formatValuesYaml,
  parseValuesYaml,
  valuesEqual,
} from './addonValues';

describe('parseValuesYaml', () => {
  it('treats an empty editor as no overrides', () => {
    expect(parseValuesYaml('')).toEqual({ ok: true, values: undefined });
    expect(parseValuesYaml('  \n# only a comment\n')).toEqual({
      ok: true,
      values: undefined,
    });
  });

  it('keeps lists, quoted strings and numeric strings intact', () => {
    const r = parseValuesYaml(
      [
        'replicas: 3',
        'enabled: true',
        'version: "1.10"',
        'tags:',
        '  - a',
        '  - b',
        'nested:',
        '  deep:',
        '    port: 8080',
        '    name: prom',
      ].join('\n'),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toEqual({
      replicas: 3,
      enabled: true,
      version: '1.10',
      tags: ['a', 'b'],
      nested: { deep: { port: 8080, name: 'prom' } },
    });
  });

  it('reports the line of a syntax error instead of dropping values', () => {
    const r = parseValuesYaml('a: 1\nb: [unclosed\nc: 2');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/flow sequence|expected|Flow/i);
    expect(r.line).toBeGreaterThanOrEqual(2);
  });

  it('refuses a duplicate key rather than silently keeping one', () => {
    const r = parseValuesYaml('a: 1\na: 2');
    expect(r.ok).toBe(false);
  });

  it('refuses a document that is not a mapping', () => {
    expect(parseValuesYaml('- a\n- b').ok).toBe(false);
    expect(parseValuesYaml('just a string').ok).toBe(false);
  });
});

describe('formatValuesYaml round trip', () => {
  it('renders what the server returned and parses back to the same object', () => {
    const original = {
      role: 'Agent',
      customConfig: {
        api: { enabled: true, address: '127.0.0.1:8686', playground: false },
        sources: { kubernetes_logs: { type: 'kubernetes_logs' } },
        transforms: {
          add_cluster: {
            type: 'remap',
            inputs: ['kubernetes_logs'],
            source: '.cluster = "e2e-talos"',
          },
        },
        sinks: {
          aggregator: {
            type: 'http',
            inputs: ['add_cluster'],
            uri: 'http://10.40.2.29:8080',
            encoding: { codec: 'json' },
          },
        },
      },
      retention: '2h',
      storage: '10Gi',
      count: 0,
      ratio: 1.5,
      flag: false,
      unknownFutureKey: { kept: [1, 2, 3] },
    };

    const text = formatValuesYaml(original);
    const back = parseValuesYaml(text);

    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(valuesEqual(back.values, original)).toBe(true);
    // Types survive: numbers stay numbers, booleans stay booleans.
    expect(back.values?.count).toBe(0);
    expect(back.values?.flag).toBe(false);
    expect(back.values?.retention).toBe('2h');
  });

  it('renders nothing for no overrides', () => {
    expect(formatValuesYaml(undefined)).toBe('');
    expect(formatValuesYaml({})).toBe('');
  });
});

describe('valuesEqual', () => {
  it('ignores key order and compares structure', () => {
    expect(
      valuesEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }),
    ).toBe(true);
    expect(valuesEqual({ a: 1 }, { a: '1' })).toBe(false);
    expect(valuesEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
});

describe('addonVersionState', () => {
  it('separates what is asked for from what is installed', () => {
    expect(
      addonVersionState({
        name: 'x',
        status: 'Installed',
        version: '0.108.0',
        installedVersion: '0.104.0',
      }),
    ).toEqual({ desired: '0.108.0', installed: '0.104.0', pending: true });
    expect(
      addonVersionState({
        name: 'x',
        status: 'Installed',
        version: '0.108.0',
        installedVersion: '0.108.0',
      }),
    ).toEqual({ desired: '0.108.0', installed: '0.108.0', pending: false });
    expect(
      addonVersionState({ name: 'x', status: 'Installing', version: '1' })
        .pending,
    ).toBe(false);
  });
});
