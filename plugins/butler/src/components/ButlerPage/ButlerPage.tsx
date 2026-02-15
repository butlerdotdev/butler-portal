// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Header, Page, Content, Progress } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core/styles';
import { Typography } from '@material-ui/core';
import SecurityIcon from '@material-ui/icons/Security';
import { TeamProvider } from '../../contexts/TeamProvider';
import { TeamSwitcher } from '../TeamSwitcher/TeamSwitcher';

// Lazy-load pages
const OverviewPage = React.lazy(() =>
  import('../overview/OverviewPage').then(m => ({ default: m.OverviewPage })),
);
const DashboardPage = React.lazy(() =>
  import('../teams/DashboardPage').then(m => ({ default: m.DashboardPage })),
);
const ClustersPage = React.lazy(() =>
  import('../clusters/ClustersPage').then(m => ({ default: m.ClustersPage })),
);
const ClusterDetailPage = React.lazy(() =>
  import('../clusters/ClusterDetailPage').then(m => ({
    default: m.ClusterDetailPage,
  })),
);
const CreateClusterPage = React.lazy(() =>
  import('../clusters/CreateClusterPage').then(m => ({
    default: m.CreateClusterPage,
  })),
);
const ProvidersPage = React.lazy(() =>
  import('../providers/ProvidersPage').then(m => ({
    default: m.ProvidersPage,
  })),
);
const CreateProviderPage = React.lazy(() =>
  import('../providers/CreateProviderPage').then(m => ({
    default: m.CreateProviderPage,
  })),
);
const TeamMembersPage = React.lazy(() =>
  import('../teams/TeamMembersPage').then(m => ({
    default: m.TeamMembersPage,
  })),
);
const TeamSettingsPage = React.lazy(() =>
  import('../teams/TeamSettingsPage').then(m => ({
    default: m.TeamSettingsPage,
  })),
);
const AdminDashboard = React.lazy(() =>
  import('../admin/AdminDashboard').then(m => ({
    default: m.AdminDashboard,
  })),
);
const AdminClustersPage = React.lazy(() =>
  import('../admin/AdminClustersPage').then(m => ({
    default: m.AdminClustersPage,
  })),
);
const AdminTeamsPage = React.lazy(() =>
  import('../admin/AdminTeamsPage').then(m => ({
    default: m.AdminTeamsPage,
  })),
);
const AdminTeamDetailPage = React.lazy(() =>
  import('../admin/AdminTeamDetailPage').then(m => ({
    default: m.AdminTeamDetailPage,
  })),
);
const ManagementPage = React.lazy(() =>
  import('../admin/ManagementPage').then(m => ({
    default: m.ManagementPage,
  })),
);
const UsersPage = React.lazy(() =>
  import('../admin/UsersPage').then(m => ({ default: m.UsersPage })),
);
const SettingsPage = React.lazy(() =>
  import('../admin/SettingsPage').then(m => ({ default: m.SettingsPage })),
);
const IdentityProvidersPage = React.lazy(() =>
  import('../admin/IdentityProvidersPage').then(m => ({
    default: m.IdentityProvidersPage,
  })),
);
const CreateIdentityProviderPage = React.lazy(() =>
  import('../admin/CreateIdentityProviderPage').then(m => ({
    default: m.CreateIdentityProviderPage,
  })),
);
const useStyles = makeStyles(() => ({
  adminBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '6px 16px',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderBottom: '1px solid rgba(139, 92, 246, 0.25)',
  },
  adminBannerIcon: {
    fontSize: 14,
    color: '#a78bfa',
  },
  adminBannerText: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#c4b5fd',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  adminBannerSeparator: {
    color: 'rgba(167, 139, 250, 0.4)',
    fontSize: '0.75rem',
  },
  adminBannerSubtext: {
    fontSize: '0.75rem',
    color: 'rgba(196, 181, 253, 0.7)',
  },
  contentWrapper: {
    position: 'relative' as const,
  },
  watermark: {
    position: 'fixed' as const,
    inset: 0,
    pointerEvents: 'none' as const,
    zIndex: 0,
    backgroundImage: 'url(/butlergopher.png)',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center center',
    backgroundSize: '50%',
    opacity: 0.03,
  },
  contentInner: {
    position: 'relative' as const,
    zIndex: 1,
  },
}));

const ButlerContent = () => {
  const classes = useStyles();
  return (
    <Content>
      <div className={classes.watermark} />
      <div className={classes.contentInner}>
      <React.Suspense fallback={<Progress />}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/t/:team" element={<DashboardPage />} />
          <Route path="/t/:team/clusters" element={<ClustersPage />} />
          <Route
            path="/t/:team/clusters/new"
            element={<CreateClusterPage />}
          />
          <Route
            path="/t/:team/clusters/:namespace/:name"
            element={<ClusterDetailPage />}
          />
          <Route path="/t/:team/members" element={<TeamMembersPage />} />
          <Route path="/t/:team/settings" element={<TeamSettingsPage />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/clusters" element={<AdminClustersPage />} />
          <Route path="/admin/management" element={<ManagementPage />} />
          <Route path="/admin/teams" element={<AdminTeamsPage />} />
          <Route
            path="/admin/teams/:teamName"
            element={<AdminTeamDetailPage />}
          />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/providers" element={<ProvidersPage />} />
          <Route
            path="/admin/providers/create"
            element={<CreateProviderPage />}
          />
          <Route
            path="/admin/identity-providers"
            element={<IdentityProvidersPage />}
          />
          <Route
            path="/admin/identity-providers/create"
            element={<CreateIdentityProviderPage />}
          />
          <Route path="/admin/settings" element={<SettingsPage />} />
        </Routes>
      </React.Suspense>
      </div>
    </Content>
  );
};

const ButlerPageInner = () => {
  const classes = useStyles();
  const location = useLocation();
  const isAdminRoute = location.pathname.includes('/butler/admin');

  return (
    <>
      {isAdminRoute && (
        <div className={classes.adminBanner}>
          <SecurityIcon className={classes.adminBannerIcon} />
          <Typography className={classes.adminBannerText}>
            Admin Mode
          </Typography>
          <Typography className={classes.adminBannerSeparator}>
            &mdash;
          </Typography>
          <Typography className={classes.adminBannerSubtext}>
            Actions affect the entire platform
          </Typography>
        </div>
      )}
      <Page themeId="tool">
        <Header title="Butler" subtitle="Kubernetes-as-a-Service Platform">
          <TeamSwitcher />
        </Header>
        <ButlerContent />
      </Page>
    </>
  );
};

export const ButlerPage = () => (
  <TeamProvider>
    <ButlerPageInner />
  </TeamProvider>
);
