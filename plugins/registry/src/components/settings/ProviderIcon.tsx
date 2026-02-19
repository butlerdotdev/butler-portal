// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { Chip } from '@material-ui/core';
import CloudIcon from '@material-ui/icons/Cloud';
import type { CloudProvider } from '../../api/types/cloudIntegrations';

const PROVIDER_LABELS: Record<CloudProvider, string> = {
  aws: 'AWS',
  gcp: 'GCP',
  azure: 'Azure',
  custom: 'Custom',
};

const PROVIDER_COLORS: Record<CloudProvider, string> = {
  aws: '#FF9900',
  gcp: '#4285F4',
  azure: '#0089D6',
  custom: '#757575',
};

export function ProviderIcon({
  provider,
  size = 'small',
}: {
  provider: CloudProvider;
  size?: 'small' | 'medium';
}) {
  return (
    <Chip
      icon={<CloudIcon style={{ color: PROVIDER_COLORS[provider] }} />}
      label={PROVIDER_LABELS[provider]}
      size={size}
      variant="outlined"
      style={{ borderColor: PROVIDER_COLORS[provider] }}
    />
  );
}
