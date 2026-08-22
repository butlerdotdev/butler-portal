// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { buildButlerWsUrl } from './wsUrl';

describe('buildButlerWsUrl', () => {
  it('converts http to ws', () => {
    expect(
      buildButlerWsUrl('http://localhost:7007/api/butler', '/ws/clusters'),
    ).toBe('ws://localhost:7007/api/butler/ws/clusters');
  });

  it('converts https to wss', () => {
    expect(
      buildButlerWsUrl('https://portal.example.com/api/butler', '/ws/clusters'),
    ).toBe('wss://portal.example.com/api/butler/ws/clusters');
  });

  it('strips trailing slashes from the base URL', () => {
    expect(
      buildButlerWsUrl('http://localhost:7007/api/butler/', '/ws/clusters'),
    ).toBe('ws://localhost:7007/api/butler/ws/clusters');
  });

  it('accepts a path without a leading slash', () => {
    expect(
      buildButlerWsUrl(
        'http://localhost:7007/api/butler',
        'ws/terminal/tenant/ns/name',
      ),
    ).toBe('ws://localhost:7007/api/butler/ws/terminal/tenant/ns/name');
  });
});
