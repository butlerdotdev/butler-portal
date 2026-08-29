// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type {
  IdentityProvider,
  TestDiscoveryResponse,
  UpdateIdentityProviderRequest,
} from '../api/types/identity-providers';

/**
 * The editable half of an identity provider, as text. Every value is
 * what the object holds today except the client secret, which the
 * server never returns and the form therefore never shows.
 */
export interface IdentityProviderForm {
  displayName: string;
  issuerURL: string;
  clientID: string;
  clientSecret: string;
  redirectURL: string;
  scopes: string;
  hostedDomain: string;
  groupsClaim: string;
  emailClaim: string;
  insecureSkipVerify: boolean;
}

const list = (text: string): string[] =>
  text
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

export function identityProviderToForm(
  idp: IdentityProvider,
): IdentityProviderForm {
  const o = idp.spec.oidc;
  return {
    displayName: idp.spec.displayName ?? '',
    issuerURL: o?.issuerURL ?? '',
    clientID: o?.clientID ?? '',
    clientSecret: '',
    redirectURL: o?.redirectURL ?? '',
    scopes: (o?.scopes ?? []).join(', '),
    hostedDomain: o?.hostedDomain ?? '',
    groupsClaim: o?.groupsClaim ?? '',
    emailClaim: o?.emailClaim ?? '',
    insecureSkipVerify: Boolean(o?.insecureSkipVerify),
  };
}

/**
 * What the server would refuse or silently mishandle. The server keeps
 * any field sent empty, so a required field cleared here is not "clear
 * it" but "keep the old value"; the form says so instead of pretending.
 */
export function validateIdentityProviderForm(
  form: IdentityProviderForm,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const url = (value: string, https: boolean): string | undefined => {
    const v = value.trim();
    if (!v) return undefined;
    try {
      const u = new URL(v);
      if (https && u.protocol !== 'https:') return 'Must start with https://';
      if (!/^https?:$/.test(u.protocol))
        return 'Must start with http:// or https://';
      return undefined;
    } catch {
      return 'Must be a full URL';
    }
  };
  if (!form.issuerURL.trim())
    errors.issuerURL =
      'Issuer URL cannot be emptied; the server keeps the current value';
  else {
    const e = url(form.issuerURL, true);
    if (e) errors.issuerURL = e;
  }
  if (!form.clientID.trim())
    errors.clientID =
      'Client ID cannot be emptied; the server keeps the current value';
  if (!form.redirectURL.trim())
    errors.redirectURL =
      'Redirect URL cannot be emptied; the server keeps the current value';
  else {
    const e = url(form.redirectURL, false);
    if (e) errors.redirectURL = e;
  }
  return errors;
}

/**
 * The update the server understands. It merges every non-empty string it
 * receives and replaces the client secret only when one is sent, so the
 * request carries only fields that differ from the loaded provider and
 * a secret only when one was typed. One field is not a merge:
 * `insecureSkipVerify` is written from the request on every update,
 * empty or not, so it is always sent with its current or edited value.
 * Optional text (hosted domain, claims, scopes) cannot be cleared by
 * this contract; a value emptied here is left out, and the server keeps
 * what it had. Name and type are not part of the request at all.
 */
export function buildIdentityProviderUpdate(
  form: IdentityProviderForm,
  existing: IdentityProvider,
): UpdateIdentityProviderRequest {
  const current = identityProviderToForm(existing);
  const req: UpdateIdentityProviderRequest = {};
  const text = (
    key: Exclude<
      keyof IdentityProviderForm,
      'insecureSkipVerify' | 'clientSecret' | 'scopes'
    >,
  ) => {
    const next = form[key].trim();
    if (next && next !== current[key]) req[key] = next;
  };
  text('displayName');
  text('issuerURL');
  text('clientID');
  text('redirectURL');
  text('hostedDomain');
  text('groupsClaim');
  text('emailClaim');
  const scopes = list(form.scopes);
  if (
    scopes.length > 0 &&
    scopes.join(',') !== list(current.scopes).join(',')
  ) {
    req.scopes = scopes;
  }
  if (form.clientSecret) req.clientSecret = form.clientSecret;
  const changed = Object.keys(req).length > 0;
  const tlsChanged = form.insecureSkipVerify !== current.insecureSkipVerify;
  if (changed || tlsChanged) {
    // Sent whenever a request goes out at all, because the server would
    // otherwise reset it to false.
    req.insecureSkipVerify = form.insecureSkipVerify;
  }
  return req;
}

/** Fields the form shows but the server cannot clear once set. */
export function uncleatableEmptied(
  form: IdentityProviderForm,
  existing: IdentityProvider,
): string[] {
  const current = identityProviderToForm(existing);
  const out: string[] = [];
  const check = (
    key:
      | 'hostedDomain'
      | 'groupsClaim'
      | 'emailClaim'
      | 'scopes'
      | 'displayName',
    label: string,
  ) => {
    if (current[key].trim() && !form[key].trim()) out.push(label);
  };
  check('displayName', 'display name');
  check('hostedDomain', 'hosted domain');
  check('groupsClaim', 'groups claim');
  check('emailClaim', 'email claim');
  check('scopes', 'scopes');
  return out;
}

/**
 * What the server's discovery result proves: only that the issuer's
 * OIDC discovery document was fetched and parsed. It does not exercise
 * the client credentials or a login.
 */
export function describeDiscovery(result: TestDiscoveryResponse): {
  headline: string;
  detail: string;
} {
  if (result.valid) {
    return {
      headline: 'Issuer discovered',
      detail: result.authorizationEndpoint
        ? `${result.message}. Authorization at ${result.authorizationEndpoint}. Client credentials and login are not exercised by this check.`
        : `${result.message}. Client credentials and login are not exercised by this check.`,
    };
  }
  return { headline: 'Discovery failed', detail: result.message };
}

/**
 * Three separate facts about a provider: the object exists, the
 * controller (if one runs) reported a phase, and the last validation.
 * With no controller on the estate there is no status at all, which is
 * shown as such rather than as a health.
 */
export function identityProviderReadiness(idp: IdentityProvider): {
  headline: string;
  detail: string;
} {
  const st = idp.status;
  if (!st || !st.phase) {
    return {
      headline: 'No status reported',
      detail:
        'No controller has recorded a phase for this provider. Use Test Connection to check the issuer now.',
    };
  }
  const when = st.lastValidatedTime
    ? ` Last validated ${new Date(st.lastValidatedTime).toLocaleString()}.`
    : '';
  return { headline: st.phase, detail: `${st.message ?? ''}${when}`.trim() };
}
