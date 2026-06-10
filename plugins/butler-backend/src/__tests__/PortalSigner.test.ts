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

import {
  generateKeyPairSync,
  KeyObject,
  verify as cryptoVerify,
} from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  loadPortalSigner,
  PortalSigner,
  PORTAL_JWT_AUDIENCE,
  PORTAL_JWT_ISSUER,
  PORTAL_JWT_TTL_SECONDS,
} from '../service/PortalSigner';

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
} as any;

function generateTestKeyPair(): { privateKey: KeyObject; publicKey: KeyObject } {
  return generateKeyPairSync('ed25519');
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

function decodeJwt(jwt: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  headerB64: string;
  payloadB64: string;
  signatureB64: string;
} {
  const [headerB64, payloadB64, signatureB64] = jwt.split('.');
  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  return { header, payload, headerB64, payloadB64, signatureB64 };
}

describe('PortalSigner', () => {
  describe('cross-repo contract: minted proofs match what butler-server portal_jwt.go verifies', () => {
    // Load-bearing test for the Stage 2 design. butler-server's
    // PortalJWTVerifier (Stage 1) checks: alg=EdDSA (jwt.WithValidMethods),
    // kid header present and matched to a configured public key,
    // iss=butler-portal, aud=butler-server, exp <= iat + 60s + 5s slop,
    // signature verified against the kid-resolved public key, sub set.
    // This test mints a proof and asserts every one of those properties
    // against the same shape the Go verifier would check.

    it('header has alg=EdDSA, typ=JWT, and the configured kid', () => {
      const { privateKey } = generateTestKeyPair();
      const signer = new PortalSigner({ privateKey, kid: 'test-deployment-1' });
      const proof = signer.sign('user@example.com');
      const { header } = decodeJwt(proof);

      expect(header.alg).toBe('EdDSA');
      expect(header.typ).toBe('JWT');
      expect(header.kid).toBe('test-deployment-1');
    });

    it('payload has iss=butler-portal, aud=butler-server, the supplied sub, iat/exp/nbf/jti', () => {
      const { privateKey } = generateTestKeyPair();
      const signer = new PortalSigner({ privateKey, kid: 'test-kid' });
      const before = Math.floor(Date.now() / 1000);
      const proof = signer.sign('abagan@butlerlabs.dev');
      const after = Math.floor(Date.now() / 1000);
      const { payload } = decodeJwt(proof);

      expect(payload.iss).toBe(PORTAL_JWT_ISSUER);
      expect(payload.iss).toBe('butler-portal');
      expect(payload.aud).toBe(PORTAL_JWT_AUDIENCE);
      expect(payload.aud).toBe('butler-server');
      expect(payload.sub).toBe('abagan@butlerlabs.dev');
      expect(typeof payload.iat).toBe('number');
      expect(typeof payload.exp).toBe('number');
      expect(typeof payload.nbf).toBe('number');
      expect(typeof payload.jti).toBe('string');
      expect((payload.jti as string).length).toBeGreaterThan(0);
      // iat is set to "now" at sign time
      expect(payload.iat).toBeGreaterThanOrEqual(before);
      expect(payload.iat).toBeLessThanOrEqual(after);
      // exp = iat + 60s (the Stage 1 verifier accepts up to iat + 65s)
      expect((payload.exp as number) - (payload.iat as number)).toBe(PORTAL_JWT_TTL_SECONDS);
      // nbf = iat - 5s (clock-skew slop on validity start; the verifier
      // tolerates this because Stage 1's nbf check uses the server's clock)
      expect((payload.iat as number) - (payload.nbf as number)).toBe(5);
    });

    it('signature verifies against the matching public key (Ed25519 detached signature over header.payload)', () => {
      const { privateKey, publicKey } = generateTestKeyPair();
      const signer = new PortalSigner({ privateKey, kid: 'test-kid' });
      const proof = signer.sign('user@example.com');
      const { headerB64, payloadB64, signatureB64 } = decodeJwt(proof);

      const signingInput = `${headerB64}.${payloadB64}`;
      const signatureBytes = base64UrlDecode(signatureB64);
      const ok = cryptoVerify(null, Buffer.from(signingInput), publicKey, signatureBytes);

      expect(ok).toBe(true);
    });

    it('TTL bound: exp - iat is exactly 60 seconds, within the Stage 1 verifier 60s + 5s slop cap', () => {
      const { privateKey } = generateTestKeyPair();
      const signer = new PortalSigner({ privateKey, kid: 'test-kid' });
      const proof = signer.sign('user@example.com');
      const { payload } = decodeJwt(proof);
      const ttl = (payload.exp as number) - (payload.iat as number);
      expect(ttl).toBeLessThanOrEqual(60 + 5);
    });

    it('jti is unique across calls (each proof gets a fresh UUID for anti-replay)', () => {
      const { privateKey } = generateTestKeyPair();
      const signer = new PortalSigner({ privateKey, kid: 'test-kid' });
      const seen = new Set<string>();
      for (let i = 0; i < 32; i++) {
        const proof = signer.sign(`user${i}@example.com`);
        const { payload } = decodeJwt(proof);
        seen.add(payload.jti as string);
      }
      expect(seen.size).toBe(32);
    });

    it('signature does not verify under a different public key (signature is bound to the signing private key)', () => {
      const { privateKey } = generateTestKeyPair();
      const { publicKey: otherPublic } = generateTestKeyPair();
      const signer = new PortalSigner({ privateKey, kid: 'test-kid' });
      const proof = signer.sign('user@example.com');
      const { headerB64, payloadB64, signatureB64 } = decodeJwt(proof);

      const signingInput = `${headerB64}.${payloadB64}`;
      const signatureBytes = base64UrlDecode(signatureB64);
      const ok = cryptoVerify(null, Buffer.from(signingInput), otherPublic, signatureBytes);

      expect(ok).toBe(false);
    });
  });

  describe('sign() input validation', () => {
    it('throws on empty sub', () => {
      const { privateKey } = generateTestKeyPair();
      const signer = new PortalSigner({ privateKey, kid: 'test-kid' });
      expect(() => signer.sign('')).toThrow();
    });
  });

  describe('loadPortalSigner', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'portal-signer-test-'));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns null when keyPath is undefined', () => {
      const result = loadPortalSigner({
        keyPath: undefined,
        kid: 'test-kid',
        logger: silentLogger,
      });
      expect(result).toBeNull();
    });

    it('returns null when kid is undefined', () => {
      const result = loadPortalSigner({
        keyPath: '/some/path',
        kid: undefined,
        logger: silentLogger,
      });
      expect(result).toBeNull();
    });

    it('returns null when the key file is absent (ENOENT)', () => {
      const result = loadPortalSigner({
        keyPath: join(tmpDir, 'absent-key.pem'),
        kid: 'test-kid',
        logger: silentLogger,
      });
      expect(result).toBeNull();
    });

    it('throws on a present-but-malformed key file', () => {
      const malformed = join(tmpDir, 'malformed.pem');
      writeFileSync(malformed, 'not a pem');
      expect(() =>
        loadPortalSigner({ keyPath: malformed, kid: 'test-kid', logger: silentLogger }),
      ).toThrow();
    });

    it('throws when the key is not Ed25519', () => {
      // Generate an RSA key and write it to a file; loadPortalSigner should reject.
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
      const rsaPath = join(tmpDir, 'rsa.pem');
      writeFileSync(rsaPath, pem);
      expect(() =>
        loadPortalSigner({ keyPath: rsaPath, kid: 'test-kid', logger: silentLogger }),
      ).toThrow(/not Ed25519/);
    });

    it('returns a working signer when given a valid Ed25519 key file', () => {
      const { privateKey, publicKey } = generateTestKeyPair();
      const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
      const keyPath = join(tmpDir, 'signing.pem');
      writeFileSync(keyPath, pem);

      const signer = loadPortalSigner({
        keyPath,
        kid: 'butlerlabs-portal-2026-06-10',
        logger: silentLogger,
      });
      expect(signer).not.toBeNull();

      const proof = signer!.sign('user@example.com');
      const { header, payload, headerB64, payloadB64, signatureB64 } = decodeJwt(proof);
      expect(header.kid).toBe('butlerlabs-portal-2026-06-10');
      expect(payload.sub).toBe('user@example.com');

      const ok = cryptoVerify(
        null,
        Buffer.from(`${headerB64}.${payloadB64}`),
        publicKey,
        base64UrlDecode(signatureB64),
      );
      expect(ok).toBe(true);
    });
  });
});
