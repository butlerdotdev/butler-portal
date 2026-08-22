// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { makeStyles } from '@material-ui/core/styles';
import { butlerTokens, rgb } from '../../theme';
import { KeyIcon } from '../ui';

// Port of the inline icons in butler-console `IdentityProvidersPage.tsx`.
// Brand fills are the vendors' colors and do not change with theme.

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    keyNeutral: { color: t.text.muted },
    keyBlue: { color: rgb(t.palette.blue[400]) },
  };
});

export const GoogleIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export const MicrosoftIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 21 21" aria-hidden>
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

export const OktaIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path
      d="M12 0C5.389 0 0 5.389 0 12s5.389 12 12 12 12-5.389 12-12S18.611 0 12 0zm0 18c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z"
      fill="#007DC1"
    />
  </svg>
);

/** Generic OIDC key icon: blue when an issuer is known, muted otherwise. */
export const OidcKeyIcon = ({
  size = 24,
  tone = 'blue',
}: {
  size?: number;
  tone?: 'blue' | 'neutral';
}) => {
  const classes = useStyles();
  return (
    <KeyIcon
      size={size}
      className={tone === 'blue' ? classes.keyBlue : classes.keyNeutral}
    />
  );
};

export function getIdentityProviderType(issuerURL?: string): string {
  if (!issuerURL) return 'OIDC';
  const url = issuerURL.toLowerCase();
  if (url.includes('google')) return 'Google';
  if (url.includes('microsoft') || url.includes('login.microsoftonline')) {
    return 'Microsoft';
  }
  if (url.includes('okta')) return 'Okta';
  if (url.includes('auth0')) return 'Auth0';
  if (url.includes('keycloak')) return 'Keycloak';
  return 'OIDC';
}

export const IdentityProviderIcon = ({
  issuerURL,
  size = 24,
}: {
  issuerURL?: string;
  size?: number;
}) => {
  if (!issuerURL) return <OidcKeyIcon size={size} tone="neutral" />;
  const url = issuerURL.toLowerCase();
  if (url.includes('google')) return <GoogleIcon size={size} />;
  if (url.includes('microsoft') || url.includes('login.microsoftonline')) {
    return <MicrosoftIcon size={size} />;
  }
  if (url.includes('okta')) return <OktaIcon size={size} />;
  return <OidcKeyIcon size={size} />;
};

export function formatIdentityProviderAge(timestamp?: string): string {
  if (!timestamp) return '-';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}
