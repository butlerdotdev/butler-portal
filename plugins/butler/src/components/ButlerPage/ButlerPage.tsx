// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Header, Page, Content, Progress } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core/styles';
import { CookieAuthRefreshProvider } from '@backstage/plugin-auth-react';
import { TeamProvider } from '../../contexts/TeamProvider';
import { TeamSwitcher } from '../TeamSwitcher/TeamSwitcher';
import {
  teamRouteRef,
  clustersRouteRef,
  createClusterRouteRef,
  clusterDetailRouteRef,
  teamEnvironmentsRouteRef,
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
  adminNetworksRouteRef,
  adminNetworkPoolRouteRef,
} from '../../routes';
import { butlerTokens } from '../../theme';
import { ButlerNav, ButlerRoleBanner } from '../ButlerNav';
import { NotFoundPage } from './NotFoundPage';
import { useTeamContext } from '../../hooks/useTeamContext';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
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
const TeamEnvironmentsPage = React.lazy(() =>
  import('../environments/TeamEnvironmentsPage').then(m => ({
    default: m.TeamEnvironmentsPage,
  })),
);
const NetworkPoolsPage = React.lazy(() =>
  import('../admin/NetworkPoolsPage').then(m => ({
    default: m.NetworkPoolsPage,
  })),
);
const NetworkPoolDetailPage = React.lazy(() =>
  import('../admin/NetworkPoolDetailPage').then(m => ({
    default: m.NetworkPoolDetailPage,
  })),
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
    display: 'flex',
    alignItems: 'stretch',
    minHeight: 'calc(100vh - 160px)',
  },
  main: {
    flex: 1,
    minWidth: 0,
    padding: 24,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
}));

// Console sends callers without a platform role back to their team
// dashboard instead of rendering admin pages that fail later with 403s.
// A platform viewer keeps the read-only estate the server grants them.
const AdminRouteGuard = ({ children }: { children: React.ReactElement }) => {
  const routes = useButlerRoutes();
  const { canAccessAdmin, loading, teams } = useTeamContext();
  if (loading) return <Progress />;
  if (canAccessAdmin) return children;
  const team = teams[0]?.name;
  return <Navigate to={team ? routes.team({ team }) : routes.root()} replace />;
};

const ButlerContent = () => {
  const classes = useStyles();
  const location = useLocation();
  return (
    <Content className={classes.surface} noPadding>
      <div className={classes.watermark} />
      <div className={classes.contentInner}>
        <ButlerNav />
        <div className={classes.main}>
          <React.Suspense fallback={<Progress />}>
            {/* Keyed on the path so navigating away clears a previous error. */}
            <ButlerErrorBoundary key={location.pathname}>
              <Routes>
                <Route path="/" element={<OverviewPage />} />
                <Route path={teamRouteRef.path} element={<DashboardPage />} />
                <Route
                  path={clustersRouteRef.path}
                  element={<ClustersPage />}
                />
                <Route
                  path={createClusterRouteRef.path}
                  element={<CreateClusterPage />}
                />
                <Route
                  path={clusterDetailRouteRef.path}
                  element={<ClusterDetailPage />}
                />
                <Route
                  path={teamEnvironmentsRouteRef.path}
                  element={<TeamEnvironmentsPage />}
                />
                <Route
                  path={teamMembersRouteRef.path}
                  element={<TeamMembersPage />}
                />
                <Route
                  path={teamSettingsRouteRef.path}
                  element={<TeamSettingsPage />}
                />
                <Route
                  path={adminRouteRef.path}
                  element={
                    <AdminRouteGuard>
                      <AdminDashboard />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path={adminClustersRouteRef.path}
                  element={
                    <AdminRouteGuard>
                      <AdminClustersPage />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path={adminManagementRouteRef.path}
                  element={
                    <AdminRouteGuard>
                      <ManagementPage />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path={adminTeamsRouteRef.path}
                  element={
                    <AdminRouteGuard>
                      <AdminTeamsPage />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path={adminTeamDetailRouteRef.path}
                  element={
                    <AdminRouteGuard>
                      <AdminTeamDetailPage />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path={adminUsersRouteRef.path}
                  element={
                    <AdminRouteGuard>
                      <UsersPage />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path={adminProvidersRouteRef.path}
                  element={
                    <AdminRouteGuard>
                      <ProvidersPage />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path={adminCreateProviderRouteRef.path}
                  element={
                    <AdminRouteGuard>
                      <CreateProviderPage />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path={adminIdentityProvidersRouteRef.path}
                  element={
                    <AdminRouteGuard>
                      <IdentityProvidersPage />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path={adminCreateIdentityProviderRouteRef.path}
                  element={
                    <AdminRouteGuard>
                      <CreateIdentityProviderPage />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path={adminSettingsRouteRef.path}
                  element={
                    <AdminRouteGuard>
                      <SettingsPage />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path={adminNetworksRouteRef.path}
                  element={
                    <AdminRouteGuard>
                      <NetworkPoolsPage />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path={adminNetworkPoolRouteRef.path}
                  element={
                    <AdminRouteGuard>
                      <NetworkPoolDetailPage />
                    </AdminRouteGuard>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </ButlerErrorBoundary>
          </React.Suspense>
        </div>
      </div>
    </Content>
  );
};

const ButlerPageInner = () => {
  const classes = useStyles();

  return (
    <>
      <ButlerRoleBanner />
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
