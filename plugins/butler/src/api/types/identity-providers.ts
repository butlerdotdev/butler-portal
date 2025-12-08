// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/**
 * IdentityProvider represents an SSO/OIDC identity provider configuration.
 */
export interface IdentityProvider {
  metadata: {
    name: string;
    uid?: string;
    creationTimestamp?: string;
  };
  spec: {
    type: 'oidc';
    displayName?: string;
    oidc?: OIDCConfig;
  };
  status?: IdentityProviderStatus;
}

export interface OIDCConfig {
  issuerURL: string;
  clientID: string;
  clientSecretRef: {
    name: string;
    namespace?: string;
    key?: string;
  };
  redirectURL: string;
  scopes?: string[];
  hostedDomain?: string;
  groupsClaim?: string;
  emailClaim?: string;
  insecureSkipVerify?: boolean;
}

export interface IdentityProviderStatus {
  phase: 'Pending' | 'Ready' | 'Failed';
  message?: string;
  observedGeneration?: number;
  lastValidatedTime?: string;
  discoveredEndpoints?: {
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    userInfoEndpoint?: string;
    jwksURI?: string;
  };
  conditions?: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
    lastTransitionTime?: string;
  }>;
}

export interface IdentityProviderListResponse {
  identityProviders: IdentityProvider[];
}

export interface CreateIdentityProviderRequest {
  name: string;
  displayName?: string;
  issuerURL: string;
  clientID: string;
  clientSecret: string;
  redirectURL: string;
  scopes?: string[];
  hostedDomain?: string;
  groupsClaim?: string;
  emailClaim?: string;
  insecureSkipVerify?: boolean;
}

export interface TestDiscoveryRequest {
  issuerURL: string;
}

export interface TestDiscoveryResponse {
  valid: boolean;
  message: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userInfoEndpoint?: string;
  jwksURI?: string;
}

/**
 * Provider presets for common OIDC providers.
 */
export const PROVIDER_PRESETS = {
  google: {
    name: 'Google Workspace',
    issuerURL: 'https://accounts.google.com',
    scopes: ['openid', 'email', 'profile'],
    groupsClaim: '', // Google doesn't include groups by default
    emailClaim: 'email',
  },
  microsoft: {
    name: 'Microsoft Entra ID',
    issuerURL: 'https://login.microsoftonline.com/{tenant}/v2.0',
    scopes: ['openid', 'email', 'profile'],
    groupsClaim: 'groups',
    emailClaim: 'email',
  },
  okta: {
    name: 'Okta',
    issuerURL: 'https://{domain}.okta.com',
    scopes: ['openid', 'email', 'profile', 'groups'],
    groupsClaim: 'groups',
    emailClaim: 'email',
  },
  auth0: {
    name: 'Auth0',
    issuerURL: 'https://{domain}.auth0.com/',
    scopes: ['openid', 'email', 'profile'],
    groupsClaim: 'groups',
    emailClaim: 'email',
  },
  keycloak: {
    name: 'Keycloak',
    issuerURL: 'https://{host}/realms/{realm}',
    scopes: ['openid', 'email', 'profile'],
    groupsClaim: 'groups',
    emailClaim: 'email',
  },
} as const;

export type ProviderPresetKey = keyof typeof PROVIDER_PRESETS;
