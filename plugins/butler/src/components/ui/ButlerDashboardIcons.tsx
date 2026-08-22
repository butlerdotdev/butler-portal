// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { SVGProps } from 'react';

// Heroicon outlines used by the dashboards and header controls, matching
// the inline SVGs in the console's DashboardPage, AdminDashboard, Header,
// TeamSwitcher and NotificationBell.

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

export const ChevronRightIcon = ({ size = 20, ...props }: IconProps) => (
  <svg {...base(size, props)}>{path('M9 5l7 7-7 7')}</svg>
);

export const ChevronDownIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>{path('M19 9l-7 7-7-7')}</svg>
);

export const CheckIcon = ({ size = 16, ...props }: IconProps) => (
  <svg {...base(size, props)}>{path('M5 13l4 4L19 7')}</svg>
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

export const UserAddIcon = ({ size = 20, ...props }: IconProps) => (
  <svg {...base(size, props)}>
    {path(
      'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
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
