// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { IdentityProvider } from '../api/types/identity-providers';
import {
  buildIdentityProviderUpdate,
  describeDiscovery,
  identityProviderReadiness,
  identityProviderToForm,
  uncleatableEmptied,
  validateIdentityProviderForm,
} from './identityProviderRequest';

const live: IdentityProvider = {
  metadata: { name: 'butlerlabs' },
  spec: {
    type: 'oidc',
    displayName: 'butlerlabs',
    oidc: {
      issuerURL: 'https://accounts.google.com',
      clientID: 'client.apps.googleusercontent.com',
      clientSecretRef: {
        name: 'butlerlabs-oidc-secret',
        namespace: 'butler-system',
        key: 'client-secret',
      },
      redirectURL: 'http://localhost:3000/api/auth/callback',
      scopes: ['openid', 'email', 'profile'],
      hostedDomain: 'butlerlabs.dev',
      groupsClaim: 'groups',
      emailClaim: 'email',
      insecureSkipVerify: false,
    },
  },
};

describe('identityProviderToForm', () => {
  it('loads every non-secret value and never the secret', () => {
    const f = identityProviderToForm(live);
    expect(f.issuerURL).toBe('https://accounts.google.com');
    expect(f.scopes).toBe('openid, email, profile');
    expect(f.clientSecret).toBe('');
    expect(f.insecureSkipVerify).toBe(false);
  });
});

describe('buildIdentityProviderUpdate', () => {
  it('sends nothing for an unchanged form', () => {
    expect(
      buildIdentityProviderUpdate(identityProviderToForm(live), live),
    ).toEqual({});
  });

  it('sends only the changed field, plus the TLS flag the server always writes', () => {
    const f = { ...identityProviderToForm(live), displayName: 'Butler Labs' };
    expect(buildIdentityProviderUpdate(f, live)).toEqual({
      displayName: 'Butler Labs',
      insecureSkipVerify: false,
    });
  });

  it('sends the secret only when typed, and never name or type', () => {
    const f = { ...identityProviderToForm(live), clientSecret: 'new-secret' };
    const req = buildIdentityProviderUpdate(f, live);
    expect(req).toEqual({
      clientSecret: 'new-secret',
      insecureSkipVerify: false,
    });
    expect(req).not.toHaveProperty('name');
    expect(req).not.toHaveProperty('type');
  });

  it('sends a TLS change on its own', () => {
    const f = { ...identityProviderToForm(live), insecureSkipVerify: true };
    expect(buildIdentityProviderUpdate(f, live)).toEqual({
      insecureSkipVerify: true,
    });
  });

  it('sends scopes as a list only when they differ', () => {
    const same = {
      ...identityProviderToForm(live),
      scopes: 'openid,email , profile',
    };
    expect(buildIdentityProviderUpdate(same, live)).toEqual({});
    const more = {
      ...identityProviderToForm(live),
      scopes: 'openid, email, profile, groups',
    };
    expect(buildIdentityProviderUpdate(more, live).scopes).toEqual([
      'openid',
      'email',
      'profile',
      'groups',
    ]);
  });

  it('does not turn an emptied optional field into a request the server would ignore', () => {
    const f = { ...identityProviderToForm(live), hostedDomain: '' };
    expect(buildIdentityProviderUpdate(f, live)).toEqual({});
    expect(uncleatableEmptied(f, live)).toEqual(['hosted domain']);
  });
});

describe('validateIdentityProviderForm', () => {
  it('refuses emptied required fields and non-https issuers', () => {
    expect(
      validateIdentityProviderForm({
        ...identityProviderToForm(live),
        issuerURL: '',
      }).issuerURL,
    ).toMatch(/cannot be emptied/);
    expect(
      validateIdentityProviderForm({
        ...identityProviderToForm(live),
        issuerURL: 'http://x',
      }).issuerURL,
    ).toMatch(/https/);
    expect(
      validateIdentityProviderForm({
        ...identityProviderToForm(live),
        redirectURL: 'nope',
      }).redirectURL,
    ).toMatch(/full URL/);
    expect(validateIdentityProviderForm(identityProviderToForm(live))).toEqual(
      {},
    );
  });
});

describe('describeDiscovery', () => {
  it('says what discovery does and does not prove', () => {
    const ok = describeDiscovery({
      valid: true,
      message: 'OIDC discovery successful',
      authorizationEndpoint: 'https://a',
    });
    expect(ok.headline).toBe('Issuer discovered');
    expect(ok.detail).toMatch(/not exercised/);
    expect(
      describeDiscovery({ valid: false, message: 'OIDC discovery failed: x' })
        .headline,
    ).toBe('Discovery failed');
  });
});

describe('identityProviderReadiness', () => {
  it('does not invent a health when no controller reported one', () => {
    expect(identityProviderReadiness(live).headline).toBe('No status reported');
    expect(
      identityProviderReadiness({
        ...live,
        status: { phase: 'Ready', message: 'Discovery succeeded' },
      }).headline,
    ).toBe('Ready');
  });
});
