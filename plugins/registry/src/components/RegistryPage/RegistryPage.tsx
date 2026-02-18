// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Typography, makeStyles } from '@material-ui/core';
import SecurityIcon from '@material-ui/icons/Security';
import BuildIcon from '@material-ui/icons/Build';
import { Header, HeaderTabs, Page, Content, Progress } from '@backstage/core-components';
import type { RegistryRole } from '@internal/plugin-registry-common';
import { RegistryTeamProvider } from '../../contexts/RegistryTeamProvider';
import { useRegistryTeam } from '../../hooks/useRegistryTeam';
import { TeamPicker } from './TeamPicker';

const CatalogBrowser = lazy(() =>
  import('../catalog/CatalogBrowser').then(m => ({ default: m.CatalogBrowser })),
);
const ArtifactDetail = lazy(() =>
  import('../detail/ArtifactDetail').then(m => ({ default: m.ArtifactDetail })),
);
const RegisterArtifactWizard = lazy(() =>
  import('../register/RegisterArtifactWizard').then(m => ({
    default: m.RegisterArtifactWizard,
  })),
);
const GovernanceDashboard = lazy(() =>
  import('../governance/GovernanceDashboard').then(m => ({
    default: m.GovernanceDashboard,
  })),
);
const PolicyTemplateList = lazy(() =>
  import('../governance/PolicyTemplateList').then(m => ({
    default: m.PolicyTemplateList,
  })),
);
const PolicyTemplateEditor = lazy(() =>
  import('../governance/PolicyTemplateEditor').then(m => ({
    default: m.PolicyTemplateEditor,
  })),
);
const TokenManagement = lazy(() =>
  import('../tokens/TokenManagement').then(m => ({
    default: m.TokenManagement,
  })),
);

// Environment pages
const EnvironmentsList = lazy(() =>
  import('../environments/EnvironmentsList').then(m => ({
    default: m.EnvironmentsList,
  })),
);
const CreateEnvironmentWizard = lazy(() =>
  import('../environments/CreateEnvironmentWizard').then(m => ({
    default: m.CreateEnvironmentWizard,
  })),
);
const EnvironmentDetail = lazy(() =>
  import('../environments/EnvironmentDetail').then(m => ({
    default: m.EnvironmentDetail,
  })),
);

// Module pages
const ModuleDetail = lazy(() =>
  import('../modules/ModuleDetail').then(m => ({
    default: m.ModuleDetail,
  })),
);
const ModuleRunDetail = lazy(() =>
  import('../modules/ModuleRunDetail').then(m => ({
    default: m.ModuleRunDetail,
  })),
);

// Settings pages
const SettingsPage = lazy(() =>
  import('../settings/SettingsPage').then(m => ({
    default: m.SettingsPage,
  })),
);
const CloudIntegrationWizard = lazy(() =>
  import('../settings/CloudIntegrationWizard').then(m => ({
    default: m.CloudIntegrationWizard,
  })),
);
const VariableSetDetail = lazy(() =>
  import('../settings/VariableSetDetail').then(m => ({
    default: m.VariableSetDetail,
  })),
);

// ── Role banner config ──────────────────────────────────────────────
// Matches Butler console color conventions:
//   platform-admin / admin → violet
//   operator → green
//   viewer → neutral (no banner)

interface RoleBannerConfig {
  bg: string;
  border: string;
  iconColor: string;
  textColor: string;
  subtextColor: string;
  separatorColor: string;
  label: string;
  subtitle: string;
  Icon: typeof SecurityIcon;
}

const ROLE_BANNERS: Partial<Record<RegistryRole, RoleBannerConfig>> = {
  'platform-admin': {
    bg: 'rgba(139, 92, 246, 0.15)',
    border: 'rgba(139, 92, 246, 0.25)',
    iconColor: '#a78bfa',
    textColor: '#c4b5fd',
    subtextColor: 'rgba(196, 181, 253, 0.7)',
    separatorColor: 'rgba(167, 139, 250, 0.4)',
    label: 'Platform Admin',
    subtitle: 'Actions affect all teams',
    Icon: SecurityIcon,
  },
  admin: {
    bg: 'rgba(20, 184, 166, 0.12)',
    border: 'rgba(20, 184, 166, 0.2)',
    iconColor: '#2dd4bf',
    textColor: '#5eead4',
    subtextColor: 'rgba(94, 234, 212, 0.7)',
    separatorColor: 'rgba(45, 212, 191, 0.4)',
    label: 'Admin',
    subtitle: 'Full team access',
    Icon: SecurityIcon,
  },
  operator: {
    bg: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.2)',
    iconColor: '#4ade80',
    textColor: '#86efac',
    subtextColor: 'rgba(134, 239, 172, 0.7)',
    separatorColor: 'rgba(74, 222, 128, 0.4)',
    label: 'Operator',
    subtitle: 'Create, update, and run infrastructure',
    Icon: BuildIcon,
  },
};

const useStyles = makeStyles(() => ({
  roleBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '6px 16px',
  },
  bannerIcon: {
    fontSize: 14,
  },
  bannerText: {
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  },
  bannerSeparator: {
    fontSize: '0.75rem',
  },
  bannerSubtext: {
    fontSize: '0.75rem',
  },
}));

// ── Admin mode: platform-wide tabs ──────────────────────────────────
const adminTabs = [
  { id: 'catalog', label: 'Catalog' },
  { id: 'environments', label: 'Environments' },
  { id: 'governance', label: 'Governance' },
  { id: 'tokens', label: 'Registry Tokens' },
];
const adminTabPaths = ['', 'environments', 'governance', 'tokens'];

// ── Team mode: team-scoped tabs ─────────────────────────────────────
const teamTabs = [
  { id: 'catalog', label: 'Catalog' },
  { id: 'environments', label: 'Environments' },
  { id: 'tokens', label: 'Registry Tokens' },
  { id: 'settings', label: 'Settings' },
];
const teamTabPaths = ['', 'environments', 'tokens', 'settings'];

function tabIndexFromPath(pathname: string, isAdminMode: boolean): number {
  if (isAdminMode) {
    if (pathname.includes('/environments')) return 1;
    if (pathname.includes('/governance')) return 2;
    if (pathname.includes('/tokens')) return 3;
    return 0;
  }
  if (pathname.includes('/environments')) return 1;
  if (pathname.includes('/tokens')) return 2;
  if (pathname.includes('/settings')) return 3;
  return 0;
}

export function RegistryPage() {
  return (
    <RegistryTeamProvider>
      <RegistryPageContent />
    </RegistryTeamProvider>
  );
}

function RegistryPageContent() {
  const classes = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeTeam, activeRole, isPlatformAdmin } = useRegistryTeam();
  const isAdminMode = !activeTeam && isPlatformAdmin;
  const tabs = isAdminMode ? adminTabs : teamTabs;
  const paths = isAdminMode ? adminTabPaths : teamTabPaths;
  const selectedTab = tabIndexFromPath(location.pathname, isAdminMode);

  // Redirect to catalog when switching to a mode where the current tab doesn't exist
  useEffect(() => {
    const p = location.pathname;
    const inAdminOnlyTab = p.includes('/governance');
    const inTeamOnlyTab = p.includes('/settings');
    if (isAdminMode && inTeamOnlyTab) {
      navigate('.', { replace: true });
    } else if (!isAdminMode && inAdminOnlyTab) {
      navigate('.', { replace: true });
    }
  }, [isAdminMode, location.pathname, navigate]);

  const handleTabChange = (index: number) => {
    const path = paths[index];
    navigate(path ? path : '.', { replace: true });
  };

  const banner = ROLE_BANNERS[activeRole];

  return (
    <>
      {banner && (
        <div
          className={classes.roleBanner}
          style={{
            backgroundColor: banner.bg,
            borderBottom: `1px solid ${banner.border}`,
          }}
        >
          <banner.Icon
            className={classes.bannerIcon}
            style={{ color: banner.iconColor }}
          />
          <Typography
            className={classes.bannerText}
            style={{ color: banner.textColor }}
          >
            {banner.label}
          </Typography>
          <Typography
            className={classes.bannerSeparator}
            style={{ color: banner.separatorColor }}
          >
            &mdash;
          </Typography>
          <Typography
            className={classes.bannerSubtext}
            style={{ color: banner.subtextColor }}
          >
            {banner.subtitle}
          </Typography>
        </div>
      )}
      <Page themeId="tool">
        <Header title="Registry" subtitle="Private IaC artifact registry">
          <TeamPicker />
        </Header>
        <HeaderTabs
          selectedIndex={selectedTab}
          onChange={handleTabChange}
          tabs={tabs}
        />
        <Content key={activeTeam ?? '__none__'}>
          <Suspense fallback={<Progress />}>
            <Routes>
              {/* Catalog */}
              <Route path="/" element={<CatalogBrowser />} />
              <Route path="/register" element={<RegisterArtifactWizard />} />
              <Route
                path="/artifact/:namespace/:name"
                element={<ArtifactDetail />}
              />

              {/* Environments */}
              <Route path="/environments" element={<EnvironmentsList />} />
              <Route
                path="/environments/create"
                element={<CreateEnvironmentWizard />}
              />
              <Route
                path="/environments/:envId"
                element={<EnvironmentDetail />}
              />
              <Route
                path="/environments/:envId/modules/:moduleId"
                element={<ModuleDetail />}
              />
              <Route
                path="/environments/:envId/modules/:moduleId/runs/:runId"
                element={<ModuleRunDetail />}
              />

              {/* Governance */}
              <Route path="/governance" element={<GovernanceDashboard />} />
              <Route path="/governance/policies" element={<PolicyTemplateList />} />
              <Route path="/governance/policies/create" element={<PolicyTemplateEditor />} />
              <Route path="/governance/policies/:id" element={<PolicyTemplateEditor />} />

              {/* Tokens */}
              <Route path="/tokens" element={<TokenManagement />} />

              {/* Settings */}
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/settings/cloud-integrations/create"
                element={<CloudIntegrationWizard />}
              />
              <Route
                path="/settings/cloud-integrations/:id"
                element={<CloudIntegrationWizard />}
              />
              <Route
                path="/settings/variable-sets/:id"
                element={<VariableSetDetail />}
              />
            </Routes>
          </Suspense>
        </Content>
      </Page>
    </>
  );
}
