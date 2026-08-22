// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { SVGProps } from 'react';

// Heroicon outlines used by the platform admin surfaces (24 viewBox,
// stroke 2), matching the inline SVGs in the console admin pages.

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number, props: IconProps) => ({
  width: size,
  height: size,
  fill: 'none',
  stroke: 'currentColor',
  viewBox: '0 0 24 24',
  'aria-hidden': true,
  ...props,
});

const path = (d: string, strokeWidth = 2) => (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={strokeWidth}
    d={d}
  />
);

export const UserGroupIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    )}
  </svg>
);

export const EyeIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path('M15 12a3 3 0 11-6 0 3 3 0 016 0z')}
    {path(
      'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
    )}
  </svg>
);

export const LockIcon = ({ size = 32, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    )}
  </svg>
);

export const ArrowLeftIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path('M10 19l-7-7m0 0l7-7m-7 7h18')}
  </svg>
);

export const RefreshIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    )}
  </svg>
);
