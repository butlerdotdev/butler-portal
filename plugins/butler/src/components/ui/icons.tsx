// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { SVGProps } from 'react';

// Console uses inline Heroicons (outline, 24 viewBox, stroke 2). These are
// the subset the plugin surfaces need, at the console's 16px / 20px / 24px
// sizes. One definition per icon; pass `size` where a surface needs a
// different box than the default.

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

export const ChevronLeftIcon = ({ size = 20, ...props }: IconProps) => (
  <svg {...base(size, props)}>{path('M15 19l-7-7 7-7')}</svg>
);

export const ChevronRightIcon = ({ size = 20, ...props }: IconProps) => (
  <svg {...base(size, props)}>{path('M9 5l7 7-7 7')}</svg>
);

export const ChevronDownIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>{path('M19 9l-7 7-7-7')}</svg>
);

export const PlusIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>{path('M12 4v16m8-8H4')}</svg>
);

export const SearchIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path('M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z')}
  </svg>
);

export const ServerIcon = ({ size = 20, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01',
    )}
  </svg>
);

export const DownloadIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    )}
  </svg>
);

export const WarningIcon = ({ size = 20, ...props }: IconProps) => (
  <svg {...base(size, props)} strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
    />
  </svg>
);

export const AlertTriangleIcon = ({ size = 20, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    )}
  </svg>
);

export const SpinnerIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)} stroke="none">
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
      style={{ opacity: 0.25 }}
    />
    <path
      fill="currentColor"
      style={{ opacity: 0.75 }}
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

export const TerminalIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    )}
  </svg>
);

export const TrashIcon = ({ size = 20, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    )}
  </svg>
);

export const EditIcon = ({ size = 20, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    )}
  </svg>
);

export const CheckIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>{path('M5 13l4 4L19 7')}</svg>
);

export const XIcon = ({ size = 20, ...props }: IconProps) => (
  <svg {...base(size, props)}>{path('M6 18L18 6M6 6l12 12')}</svg>
);

export const KeyIcon = ({ size = 24, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
    )}
  </svg>
);

export const ArchiveIcon = ({ size = 20, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
    )}
  </svg>
);

export const TeamsIcon = ({ size = 24, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    )}
  </svg>
);

export const UsersIcon = ({ size = 24, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    )}
  </svg>
);

/** Same glyph as `UsersIcon`, at the 16px size the admin rows use. */
export const UserGroupIcon = ({ size = 16, ...props }: IconProps) => (
  <UsersIcon size={size} {...props} />
);

export const UserAddIcon = ({ size = 20, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
    )}
  </svg>
);

export const ShieldCheckIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    )}
  </svg>
);

export const BuildingIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    )}
  </svg>
);

export const BellIcon = ({ size = 20, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
      props.strokeWidth ? Number(props.strokeWidth) : 2,
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
  <svg {...base(size, props)}>{path('M10 19l-7-7m0 0l7-7m-7 7h18')}</svg>
);

export const RefreshIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    )}
  </svg>
);
