// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { SVGProps } from 'react';

// Console sidebar heroicons (outline, 24 viewBox, stroke 2).
const base = (props: SVGProps<SVGSVGElement>) => ({
  fill: 'none',
  stroke: 'currentColor',
  viewBox: '0 0 24 24',
  'aria-hidden': true,
  ...props,
});
const P = ({ d }: { d: string }) => (
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
);

export const DashboardNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <P d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
  </svg>
);
export const ClustersNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <P d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
  </svg>
);
export const ManagementNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <P d="M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
  </svg>
);
export const TeamsNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <P d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);
export const UsersNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <P d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);
export const ProvidersNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <P d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
  </svg>
);
export const IdentityNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <P d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
  </svg>
);
export const SettingsNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <P d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <P d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

/** Stacked layers: environments are parallel homes for a team's clusters. */
export const EnvironmentNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <P d="M12 3l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 17l8 4 8-4" />
  </svg>
);

export const NetworkNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <P d="M4 6a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM12 10v4m-4 0h8m-8 0v2m8-2v2M6 20h4m4 0h4" />
  </svg>
);
