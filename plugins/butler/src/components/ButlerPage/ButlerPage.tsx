// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Header, Page, Content, Progress } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core/styles';
import { Typography } from '@material-ui/core';
import SecurityIcon from '@material-ui/icons/Security';
import { CookieAuthRefreshProvider } from '@backstage/plugin-auth-react';
import { TeamProvider } from '../../contexts/TeamProvider';
import { TeamSwitcher } from '../TeamSwitcher/TeamSwitcher';
import {
  teamRouteRef,
  clustersRouteRef,
  createClusterRouteRef,
  clusterDetailRouteRef,
  teamMembersRouteRef,
  teamSettingsRouteRef,
  adminRouteRef,
  adminClustersRouteRef,
  adminManagementRouteRef,
  adminTeamsRouteRef,
  adminTeamDetailRouteRef,
  adminUsersRouteRef,
  adminProvidersRouteRef,
  adminCreateProviderRouteRef,
  adminIdentityProvidersRouteRef,
  adminCreateIdentityProviderRouteRef,
  adminSettingsRouteRef,
} from '../../routes';
import { useIsAdminRoute } from '../../hooks/useButlerRoutes';
import { butlerTokens } from '../../theme';
import { ButlerErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import { ClusterWatchProvider } from '../../contexts/ClusterWatchProvider';
import { NotificationBell } from '../NotificationBell/NotificationBell';

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
const useStyles = makeStyles(theme => ({
  // Console page surface inside the Backstage shell: neutral-950 ground,
  // Inter stack, 24px padding (console `main.p-6`).
  surface: {
    backgroundColor: butlerTokens(theme).page,
    color: butlerTokens(theme).text.primary,
    fontFamily: butlerTokens(theme).fontSans,
    padding: 24,
  },
  adminBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '6px 16px',
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    borderBottom: '1px solid rgba(124, 58, 237, 0.3)',
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
    color: 'rgba(124, 58, 237, 0.4)',
    fontSize: '0.75rem',
  },
  adminBannerSubtext: {
    fontSize: '0.75rem',
    color: 'rgba(167, 139, 250, 0.7)',
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
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
}));

const ButlerContent = () => {
  const classes = useStyles();
  const location = useLocation();
  return (
    <Content className={classes.surface}>
      <div className={classes.watermark} />
      <div className={classes.contentInner}>
      <React.Suspense fallback={<Progress />}>
        {/* Keyed on the path so navigating away clears a previous error. */}
        <ButlerErrorBoundary key={location.pathname}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path={teamRouteRef.path} element={<DashboardPage />} />
          <Route path={clustersRouteRef.path} element={<ClustersPage />} />
          <Route
            path={createClusterRouteRef.path}
            element={<CreateClusterPage />}
          />
          <Route
            path={clusterDetailRouteRef.path}
            element={<ClusterDetailPage />}
          />
          <Route path={teamMembersRouteRef.path} element={<TeamMembersPage />} />
          <Route path={teamSettingsRouteRef.path} element={<TeamSettingsPage />} />
          <Route path={adminRouteRef.path} element={<AdminDashboard />} />
          <Route path={adminClustersRouteRef.path} element={<AdminClustersPage />} />
          <Route path={adminManagementRouteRef.path} element={<ManagementPage />} />
          <Route path={adminTeamsRouteRef.path} element={<AdminTeamsPage />} />
          <Route
            path={adminTeamDetailRouteRef.path}
            element={<AdminTeamDetailPage />}
          />
          <Route path={adminUsersRouteRef.path} element={<UsersPage />} />
          <Route path={adminProvidersRouteRef.path} element={<ProvidersPage />} />
          <Route
            path={adminCreateProviderRouteRef.path}
            element={<CreateProviderPage />}
          />
          <Route
            path={adminIdentityProvidersRouteRef.path}
            element={<IdentityProvidersPage />}
          />
          <Route
            path={adminCreateIdentityProviderRouteRef.path}
            element={<CreateIdentityProviderPage />}
          />
          <Route path={adminSettingsRouteRef.path} element={<SettingsPage />} />
        </Routes>
        </ButlerErrorBoundary>
      </React.Suspense>
      </div>
    </Content>
  );
};

const ButlerPageInner = () => {
  const classes = useStyles();
  const isAdminRoute = useIsAdminRoute();

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
          <div className={classes.headerActions}>
            <NotificationBell />
            <TeamSwitcher />
          </div>
        </Header>
        <ButlerContent />
      </Page>
    </>
  );
};

// Browsers cannot attach the Backstage bearer token to a WebSocket
// upgrade, so the terminal and cluster relays authenticate with the
// framework's limited-access cookie instead. The provider obtains and
// renews that cookie for this plugin's backend before the page renders.
export const ButlerPage = () => (
  <CookieAuthRefreshProvider pluginId="butler">
    <TeamProvider>
      <ClusterWatchProvider>
        <ButlerPageInner />
      </ClusterWatchProvider>
    </TeamProvider>
  </CookieAuthRefreshProvider>
);
