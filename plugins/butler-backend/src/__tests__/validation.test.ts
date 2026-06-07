/*
 * Copyright 2026 The Butler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { validateButlerAuth } from '../validation';

describe('validateButlerAuth', () => {
  const mustBeSetMessage =
    /butler\.auth\.username and butler\.auth\.password must be set/;
  const priorDefaultMessage =
    /butler\.auth\.password is set to the string "admin"\. This is the prior insecure default/;
  const optOutHintMessage = /BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS=true/;

  // Each test starts with the opt-out env var unset to prevent state leakage.
  beforeEach(() => {
    delete process.env.BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS;
  });

  afterEach(() => {
    delete process.env.BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS;
  });

  it('throws "must be set" when both username and password are empty', () => {
    expect(() => validateButlerAuth('', '')).toThrow(mustBeSetMessage);
  });

  it('throws "must be set" when username is empty and password is valid', () => {
    expect(() => validateButlerAuth('', 'real-password')).toThrow(
      mustBeSetMessage,
    );
  });

  it('throws "must be set" when username is valid and password is empty', () => {
    expect(() => validateButlerAuth('svc-portal', '')).toThrow(mustBeSetMessage);
  });

  it('throws "prior insecure default" when password is "admin" (any username)', () => {
    expect(() => validateButlerAuth('svc-portal', 'admin')).toThrow(
      priorDefaultMessage,
    );
    expect(() => validateButlerAuth('admin', 'admin')).toThrow(
      priorDefaultMessage,
    );
  });

  it('allows username "admin" with a valid non-admin password (real-world production case)', () => {
    // butler-server's admin user is legitimately named "admin"; pairing that
    // username with a real, non-default password is the canonical production
    // case. v0.2.1 incorrectly rejected this; v0.2.2 accepts it.
    expect(() =>
      validateButlerAuth('admin', 'real-service-account-password'),
    ).not.toThrow();
  });

  it('allows username "admin " with leading or trailing whitespace and a valid password', () => {
    expect(() => validateButlerAuth('admin ', 'real-password')).not.toThrow();
    expect(() => validateButlerAuth(' admin', 'real-password')).not.toThrow();
  });

  it('returns void cleanly when both values are valid non-admin', () => {
    expect(() =>
      validateButlerAuth('svc-portal', 'hunter2'),
    ).not.toThrow();
  });

  it('treats "admin" password comparison as case-sensitive ("Admin" passes)', () => {
    expect(() => validateButlerAuth('svc-portal', 'Admin')).not.toThrow();
  });

  it('throws "must be set" when both username and password are whitespace-only', () => {
    expect(() => validateButlerAuth('   ', '\t')).toThrow(mustBeSetMessage);
  });

  it('throws "prior insecure default" when password is "admin " with trailing whitespace', () => {
    expect(() => validateButlerAuth('svc-portal', 'admin ')).toThrow(
      priorDefaultMessage,
    );
  });

  it('throws "prior insecure default" when password is " admin" with leading whitespace', () => {
    expect(() => validateButlerAuth('svc-portal', ' admin')).toThrow(
      priorDefaultMessage,
    );
  });

  it('error message includes the opt-out hint when admin password triggers the throw', () => {
    expect(() => validateButlerAuth('svc-portal', 'admin')).toThrow(
      optOutHintMessage,
    );
  });

  it('allows admin password with opt-out env set to "true" and warns through the provided logger', () => {
    process.env.BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS = 'true';
    const logger = { warn: jest.fn() };
    expect(() =>
      validateButlerAuth('svc-portal', 'admin', logger),
    ).not.toThrow();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('butler.auth.password'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS=true'),
    );
  });

  it.each(['yes', 'TRUE', '1', 'True', ''])(
    'throws when opt-out env is set to %p (not literal "true")',
    value => {
      process.env.BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS = value;
      expect(() => validateButlerAuth('admin', 'admin')).toThrow(
        priorDefaultMessage,
      );
    },
  );

  it('throws when opt-out env is unset (default behaviour unchanged for password=admin)', () => {
    expect(process.env.BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS).toBeUndefined();
    expect(() => validateButlerAuth('admin', 'admin')).toThrow(
      priorDefaultMessage,
    );
  });
});
