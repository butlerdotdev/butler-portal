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

import { createPrivateKey, KeyObject, randomUUID, sign as cryptoSign } from 'crypto';
import { readFileSync } from 'fs';
import { LoggerService } from '@backstage/backend-plugin-api';

// Issuer, audience, and TTL must match the contract butler-server's
// PortalJWTVerifier validates (see butler-server internal/auth/portal_jwt.go
// PortalJWTIssuer, PortalJWTAudience, PortalJWTMaxTTL). Any mismatch here
// produces proofs the server rejects.
export const PORTAL_JWT_ISSUER = 'butler-portal';
export const PORTAL_JWT_AUDIENCE = 'butler-server';
export const PORTAL_JWT_TTL_SECONDS = 60;

/**
 * Mints short-lived Ed25519 JWTs that butler-server's portal-JWT verifier
 * accepts. Each proof carries:
 *
 *   - alg=EdDSA, kid=<configured kid>, typ=JWT in the header
 *   - iss=butler-portal, aud=butler-server
 *   - sub=<acting user identity> (the proxy resolves this per request)
 *   - iat=now, exp=now+60s, nbf=now-5s (clock-skew slop on validity start)
 *   - jti=<UUIDv4> for the server-side anti-replay cache
 *
 * The private key is loaded once at construction and held only in process
 * memory as a KeyObject. The PEM bytes are not retained after parsing; the
 * KeyObject does not expose the raw key bytes to JavaScript callers.
 */
export class PortalSigner {
  private readonly privateKey: KeyObject;
  private readonly kid: string;

  constructor(opts: { privateKey: KeyObject; kid: string }) {
    this.privateKey = opts.privateKey;
    this.kid = opts.kid;
  }

  /**
   * Mints a proof asserting the given identity. Caller is responsible for
   * resolving the identity from the Backstage credentials; the signer does
   * not look at the request, it just signs the claim.
   *
   * Throws if signing fails (e.g., the key was somehow released). Returns
   * the compact-encoded JWT on success.
   */
  sign(subEmail: string): string {
    if (!subEmail) {
      throw new Error('PortalSigner.sign requires a non-empty subject');
    }
    const header = {
      alg: 'EdDSA',
      typ: 'JWT',
      kid: this.kid,
    };
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload = {
      iss: PORTAL_JWT_ISSUER,
      aud: PORTAL_JWT_AUDIENCE,
      sub: subEmail,
      iat: nowSeconds,
      exp: nowSeconds + PORTAL_JWT_TTL_SECONDS,
      nbf: nowSeconds - 5,
      jti: randomUUID(),
    };
    const headerB64 = base64UrlEncodeJson(header);
    const payloadB64 = base64UrlEncodeJson(payload);
    const signingInput = `${headerB64}.${payloadB64}`;
    const signatureBytes = cryptoSign(null, Buffer.from(signingInput), this.privateKey);
    const signatureB64 = base64UrlEncodeBuffer(signatureBytes);
    return `${signingInput}.${signatureB64}`;
  }
}

/**
 * Loads the Ed25519 private key from disk and constructs a PortalSigner.
 *
 * Returns null and logs a single info-level message if the key file is
 * absent or the contents do not parse as an Ed25519 PKCS#8 private key.
 * The caller (plugin init) then falls back to the legacy AuthManager
 * carrier; this is the Stage 2 dormant-until-key-mounted behavior that
 * keeps the portal compatible with both the pre-Stage-3 cluster state
 * (no SealedSecret yet, key absent) and the post-Stage-3 cluster state
 * (SealedSecret unsealed, key mounted, PortalSigner activates).
 *
 * Errors other than "file not found" do throw, because a key that is
 * present-but-malformed is an operator error worth surfacing rather
 * than silently degrading to legacy.
 */
export function loadPortalSigner(opts: {
  keyPath: string | undefined;
  kid: string | undefined;
  logger: LoggerService;
}): PortalSigner | null {
  const { keyPath, kid, logger } = opts;
  if (!keyPath || !kid) {
    logger.info('PortalSigner not configured; using legacy carrier', {
      reason: !keyPath ? 'butler.signing.keyPath is unset' : 'butler.signing.kid is unset',
    });
    return null;
  }
  let pem: Buffer;
  try {
    pem = readFileSync(keyPath);
  } catch (err: any) {
    if (err && err.code === 'ENOENT') {
      logger.info('PortalSigner key file absent; using legacy carrier', {
        keyPath,
      });
      return null;
    }
    throw err;
  }
  const privateKey = createPrivateKey({ key: pem, format: 'pem' });
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error(
      `PortalSigner key at ${keyPath} is not Ed25519 (got asymmetricKeyType=${privateKey.asymmetricKeyType})`,
    );
  }
  logger.info('PortalSigner activated', { kid, keyPath });
  return new PortalSigner({ privateKey, kid });
}

function base64UrlEncodeJson(obj: unknown): string {
  return base64UrlEncodeBuffer(Buffer.from(JSON.stringify(obj)));
}

function base64UrlEncodeBuffer(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
