// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type {
  IdentityProvider,
  UpdateIdentityProviderRequest,
} from '../../api/types/identity-providers';
import {
  buildIdentityProviderUpdate,
  identityProviderToForm,
  uncleatableEmptied,
  validateIdentityProviderForm,
  type IdentityProviderForm,
} from '../../utils/identityProviderRequest';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerButton,
  ButlerCallout,
  ButlerCheckbox,
  ButlerDialog,
  ButlerField,
  ButlerFormSection,
  ButlerInput,
  ButlerKeyValueList,
  ButlerKeyValueRow,
} from '../ui';

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    lead: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(t.palette.neutral[300]),
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 12,
    },
    note: { margin: 0, fontSize: 12, color: t.text.subtle },
  };
});

export interface EditIdentityProviderDialogProps {
  open: boolean;
  provider: IdentityProvider;
  onClose: () => void;
  onSave: (
    name: string,
    request: UpdateIdentityProviderRequest,
  ) => Promise<unknown>;
  onSaved: () => void | Promise<void>;
}

/**
 * Edits an identity provider the way butler-server updates one. The
 * form starts from the current values so the administrator sees what is
 * configured; the request carries only what changed. The client secret
 * is never shown and is replaced only when a new one is typed. Name and
 * type cannot change. Saving does not test the issuer; that is the
 * separate Test Connection action, and it tests the saved provider.
 */
export const EditIdentityProviderDialog = ({
  open,
  provider,
  onClose,
  onSave,
  onSaved,
}: EditIdentityProviderDialogProps) => {
  const classes = useStyles();
  const [form, setForm] = useState<IdentityProviderForm>(() =>
    identityProviderToForm(provider),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nothingChanged, setNothingChanged] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(identityProviderToForm(provider));
    setErrors({});
    setError(null);
    setSaving(false);
    setNothingChanged(false);
  }, [open, provider]);

  const set = <K extends keyof IdentityProviderForm>(
    key: K,
    value: IdentityProviderForm[K],
  ) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setNothingChanged(false);
  };

  const text = (
    key: Exclude<keyof IdentityProviderForm, 'insecureSkipVerify'>,
    label: string,
    opts?: {
      mono?: boolean;
      secret?: boolean;
      help?: string;
      placeholder?: string;
    },
  ) => (
    <ButlerField
      label={label}
      htmlFor={`edit-idp-${key}`}
      error={errors[key]}
      help={opts?.help}
    >
      <ButlerInput
        id={`edit-idp-${key}`}
        type={opts?.secret ? 'password' : 'text'}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        disabled={saving}
        mono={opts?.mono}
        placeholder={opts?.placeholder}
        autoComplete={opts?.secret ? 'new-password' : undefined}
      />
    </ButlerField>
  );

  const emptied = uncleatableEmptied(form, provider);

  const handleSave = async () => {
    const problems = validateIdentityProviderForm(form);
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      return;
    }
    const request = buildIdentityProviderUpdate(form, provider);
    if (Object.keys(request).length === 0) {
      setNothingChanged(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(provider.metadata.name, request);
      await onSaved();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update identity provider',
      );
      setSaving(false);
    }
  };

  const secretRef = provider.spec.oidc?.clientSecretRef;

  return (
    <ButlerDialog
      open={open}
      onClose={saving ? () => {} : onClose}
      title={`Edit ${provider.spec.displayName || provider.metadata.name}`}
      subtitle={`@${provider.metadata.name}`}
      width={560}
      busy={saving}
      footer={
        <>
          <ButlerButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </ButlerButton>
          <ButlerButton onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </ButlerButton>
        </>
      }
    >
      <p className={classes.lead}>
        These are the current values. Only what you change is sent. The client
        secret is never shown; leave it blank to keep it or enter a new one to
        replace it. Saving does not test the issuer.
      </p>

      <ButlerKeyValueList>
        <ButlerKeyValueRow label="Name" dense mono>
          {provider.metadata.name}
        </ButlerKeyValueRow>
        <ButlerKeyValueRow label="Type" dense>
          OpenID Connect
        </ButlerKeyValueRow>
        {secretRef && (
          <ButlerKeyValueRow label="Client secret" dense mono>
            {`configured in secret ${secretRef.name}`}
          </ButlerKeyValueRow>
        )}
      </ButlerKeyValueList>
      <p className={classes.note}>
        The name and type are fixed once a provider exists.
      </p>

      <ButlerFormSection title="Identity">
        {text('displayName', 'Display name', {
          help: 'Shown on the login page.',
        })}
      </ButlerFormSection>

      <ButlerFormSection title="Connection">
        {text('issuerURL', 'Issuer URL', {
          mono: true,
          help: 'Must be https. Discovery is read from /.well-known/openid-configuration.',
        })}
        {text('redirectURL', 'Redirect URL', {
          mono: true,
          help: 'Must match the callback registered at the identity provider.',
        })}
      </ButlerFormSection>

      <ButlerFormSection title="Credentials">
        {text('clientID', 'Client ID', { mono: true })}
        {text('clientSecret', 'New client secret', {
          secret: true,
          help: 'Leave blank to keep the current secret.',
        })}
      </ButlerFormSection>

      <ButlerFormSection title="Claims and scopes">
        {text('scopes', 'Scopes', {
          mono: true,
          help: 'Comma separated. Defaults to openid, email, profile when unset.',
        })}
        <div className={classes.grid}>
          {text('emailClaim', 'Email claim', { mono: true })}
          {text('groupsClaim', 'Groups claim', { mono: true })}
        </div>
        {text('hostedDomain', 'Hosted domain', {
          help: 'Google Workspace only: restricts sign-in to this domain.',
        })}
      </ButlerFormSection>

      <ButlerFormSection title="TLS">
        <ButlerCheckbox
          label="Skip TLS certificate verification"
          description="For development issuers with self-signed certificates only."
          checked={form.insecureSkipVerify}
          onChange={e => set('insecureSkipVerify', e.target.checked)}
          disabled={saving}
        />
      </ButlerFormSection>

      {emptied.length > 0 && (
        <ButlerCallout tone="warning" compact>
          {`The server cannot clear ${emptied.join(
            ', ',
          )}; an emptied field keeps its current value.`}
        </ButlerCallout>
      )}
      {nothingChanged && (
        <ButlerCallout tone="info" compact>
          Nothing has changed, so there is nothing to save.
        </ButlerCallout>
      )}
      {error && (
        <ButlerCallout tone="danger" title="Could not update">
          {error}
        </ButlerCallout>
      )}
    </ButlerDialog>
  );
};
