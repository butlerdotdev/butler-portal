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

import { generateKeyPairSync } from 'crypto';
import { applyPortalCarrierSwap } from '../router';
import { PortalSigner } from '../service/PortalSigner';

function newSigner(kid: string = 'test-kid'): PortalSigner {
  const { privateKey } = generateKeyPairSync('ed25519');
  return new PortalSigner({ privateKey, kid });
}

// applyPortalCarrierSwap is the Stage 2 load-bearing per-request switch.
// The legacy-byte-identical-when-null property is what makes Stage 2's
// deploy a no-op until the chart mounts a signing key Secret. The proof-
// replacement-when-active property is what makes the activated path send
// the carrier butler-server's portal-JWT verifier accepts.

describe('applyPortalCarrierSwap', () => {
  describe('signer=null: legacy carrier byte-identical (no-op)', () => {
    it('leaves HTTP-shape forwardHeaders unchanged when signer is null and email is present', () => {
      const forwardHeaders: Record<string, string> = {
        Authorization: 'Bearer legacy-admin-token',
        'X-Butler-User-Email': 'user@example.com',
        'Content-Type': 'application/json',
        'X-Butler-Team': 'acme',
      };
      const snapshot = { ...forwardHeaders };

      applyPortalCarrierSwap({
        forwardHeaders,
        portalSigner: null,
        subEmail: 'user@example.com',
      });

      expect(forwardHeaders).toEqual(snapshot);
    });

    it('leaves HTTP-shape forwardHeaders unchanged when signer is null and email is absent', () => {
      const forwardHeaders: Record<string, string> = {
        Authorization: 'Bearer legacy-admin-token',
        'Content-Type': 'application/json',
      };
      const snapshot = { ...forwardHeaders };

      applyPortalCarrierSwap({
        forwardHeaders,
        portalSigner: null,
        subEmail: undefined,
      });

      expect(forwardHeaders).toEqual(snapshot);
    });

    it('leaves WS-shape forwardHeaders unchanged when signer is null', () => {
      const wsHeaders: Record<string, string> = {
        Authorization: 'Bearer legacy-admin-token',
      };
      const snapshot = { ...wsHeaders };

      applyPortalCarrierSwap({
        forwardHeaders: wsHeaders,
        portalSigner: null,
        subEmail: 'user@example.com',
      });

      expect(wsHeaders).toEqual(snapshot);
    });
  });

  describe('signer=present + subEmail=present: proof replaces Authorization AND X-Butler-User-Email is dropped', () => {
    it('replaces Authorization with a proof Bearer and removes X-Butler-User-Email on HTTP-shape headers', () => {
      const signer = newSigner();
      const forwardHeaders: Record<string, string> = {
        Authorization: 'Bearer legacy-admin-token',
        'X-Butler-User-Email': 'user@example.com',
        'Content-Type': 'application/json',
        'X-Butler-Team': 'acme',
      };

      applyPortalCarrierSwap({
        forwardHeaders,
        portalSigner: signer,
        subEmail: 'user@example.com',
      });

      expect(forwardHeaders.Authorization).not.toBe('Bearer legacy-admin-token');
      expect(forwardHeaders.Authorization).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      expect(forwardHeaders).not.toHaveProperty('X-Butler-User-Email');
      // Non-auth headers untouched.
      expect(forwardHeaders['Content-Type']).toBe('application/json');
      expect(forwardHeaders['X-Butler-Team']).toBe('acme');
    });

    it('replaces Authorization with a proof on WS-shape headers (no X-Butler-User-Email present to delete)', () => {
      const signer = newSigner();
      const wsHeaders: Record<string, string> = {
        Authorization: 'Bearer legacy-admin-token',
      };

      applyPortalCarrierSwap({
        forwardHeaders: wsHeaders,
        portalSigner: signer,
        subEmail: 'user@example.com',
      });

      expect(wsHeaders.Authorization).not.toBe('Bearer legacy-admin-token');
      expect(wsHeaders.Authorization).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    });

    it('produces a proof whose sub claim is the supplied subEmail', () => {
      const signer = newSigner();
      const forwardHeaders: Record<string, string> = {
        Authorization: 'Bearer legacy-admin-token',
        'X-Butler-User-Email': 'pre-swap@example.com',
      };

      applyPortalCarrierSwap({
        forwardHeaders,
        portalSigner: signer,
        subEmail: 'abagan@butlerlabs.dev',
      });

      const token = forwardHeaders.Authorization.replace(/^Bearer /, '');
      const payloadB64 = token.split('.')[1];
      const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((payloadB64.length + 3) % 4);
      const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));

      expect(payload.sub).toBe('abagan@butlerlabs.dev');
      expect(payload.iss).toBe('butler-portal');
      expect(payload.aud).toBe('butler-server');
    });
  });

  describe('signer=present + subEmail=absent: legacy carrier preserved (cannot mint proof without a sub)', () => {
    it('leaves HTTP-shape forwardHeaders unchanged when signer is present but no user identity', () => {
      const signer = newSigner();
      const forwardHeaders: Record<string, string> = {
        Authorization: 'Bearer legacy-admin-token',
        'Content-Type': 'application/json',
      };
      const snapshot = { ...forwardHeaders };

      applyPortalCarrierSwap({
        forwardHeaders,
        portalSigner: signer,
        subEmail: undefined,
      });

      expect(forwardHeaders).toEqual(snapshot);
    });

    it('leaves WS-shape forwardHeaders unchanged when signer is present but no user identity', () => {
      const signer = newSigner();
      const wsHeaders: Record<string, string> = {
        Authorization: 'Bearer legacy-admin-token',
      };
      const snapshot = { ...wsHeaders };

      applyPortalCarrierSwap({
        forwardHeaders: wsHeaders,
        portalSigner: signer,
        subEmail: undefined,
      });

      expect(wsHeaders).toEqual(snapshot);
    });
  });
});
