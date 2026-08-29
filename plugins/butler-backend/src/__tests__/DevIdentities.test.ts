// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { ConfigReader } from '@backstage/config';
import type { Request } from 'express';
import { DevIdentities } from '../service/DevIdentities';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
} as any;

const enabled = {
  butler: {
    devAuth: {
      enabled: true,
      identities: [
        { key: 'platform-admin', email: 'padmin@example.com' },
        { key: 'team-viewer', email: 'tviewer@example.com', label: 'Viewer' },
      ],
    },
  },
};

const load = (data: any, nodeEnv?: string) =>
  DevIdentities.load({
    config: new ConfigReader(data),
    logger,
    nodeEnv,
  });

const req = (headers: Record<string, string>) =>
  ({ headers } as unknown as Request);

beforeEach(() => jest.clearAllMocks());

describe('DevIdentities safety', () => {
  it('never loads in production, even when config asks for it', () => {
    expect(load(enabled, 'production')).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('production'),
    );
  });

  it('stays inert unless config opts in', () => {
    expect(load({}, 'development')).toBeNull();
    expect(
      load({ butler: { devAuth: { enabled: false } } }, 'development'),
    ).toBeNull();
  });

  it('does not load when opted in with no identities', () => {
    expect(
      load({ butler: { devAuth: { enabled: true } } }, 'development'),
    ).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('nothing to act as'),
    );
  });

  it('announces itself loudly when it does load', () => {
    expect(load(enabled, 'development')).not.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('LOCAL ROLE HARNESS ACTIVE'),
    );
  });
});

describe('DevIdentities resolution', () => {
  const dev = () => load(enabled, 'development')!;

  it('reads the identity from a cookie', () => {
    expect(
      dev().emailFor(req({ cookie: 'a=1; butler-dev-identity=team-viewer' })),
    ).toBe('tviewer@example.com');
  });

  it('reads the identity from a header for scripted callers', () => {
    expect(
      dev().emailFor(req({ 'x-butler-dev-identity': 'platform-admin' })),
    ).toBe('padmin@example.com');
  });

  it('falls through with no marker, so the real session is used', () => {
    expect(dev().emailFor(req({}))).toBeUndefined();
    expect(dev().emailFor(req({ cookie: 'other=1' }))).toBeUndefined();
  });

  it('falls through on an unknown or stale key rather than locking out', () => {
    expect(
      dev().emailFor(req({ cookie: 'butler-dev-identity=retired-role' })),
    ).toBeUndefined();
  });

  it('only ever returns a configured email', () => {
    expect(
      dev().emailFor(req({ 'x-butler-dev-identity': 'attacker@example.com' })),
    ).toBeUndefined();
    const emails = dev()
      .list()
      .map(i => i.email);
    expect(emails).toEqual(['padmin@example.com', 'tviewer@example.com']);
  });
});
