// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { Routes, Route, useLocation, Link as RouterLink } from 'react-router-dom';
import { Header, Page, Content, Progress } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core/styles';
import {
  Chip,
  Menu,
  MenuItem,
  Typography,
  Box,
  Divider,
  Tabs,
  Tab,
} from '@material-ui/core';
import ArrowDropDownIcon from '@material-ui/icons/ArrowDropDown';
import SupervisorAccountIcon from '@material-ui/icons/SupervisorAccount';
import { WorkspaceTeamProvider } from '../../contexts/WorkspaceTeamProvider';
import { useWorkspaceTeam } from '../../hooks/useWorkspaceTeam';

const WorkspaceDashboard = React.lazy(() =>
  import('../dashboard/WorkspaceDashboard').then(m => ({
    default: m.WorkspaceDashboard,
  })),
);
const SSHKeysSettings = React.lazy(() =>
  import('../settings/SSHKeysSettings').then(m => ({
    default: m.SSHKeysSettings,
  })),
);
const TemplateSettings = React.lazy(() =>
  import('../settings/TemplateSettings').then(m => ({
    default: m.TemplateSettings,
  })),
);
const ServicesPage = React.lazy(() =>
  import('../services/ServicesPage').then(m => ({
    default: m.ServicesPage,
  })),
);
const WorkspaceDetail = React.lazy(() =>
  import('../workspace/WorkspaceDetail').then(m => ({
    default: m.WorkspaceDetail,
  })),
);

const NAV_TABS = [
  { label: 'Dashboard', path: '/workspaces' },
  { label: 'Services', path: '/workspaces/services' },
  { label: 'Templates', path: '/workspaces/settings/templates' },
  { label: 'SSH Keys', path: '/workspaces/settings/ssh-keys' },
];

const useStyles = makeStyles(theme => ({
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
  teamChip: {
    cursor: 'pointer',
  },
  navTabs: {
    marginBottom: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  navTab: {
    textTransform: 'none' as const,
    minWidth: 'auto',
    padding: theme.spacing(1, 2),
    '&:hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
  },
}));

const TeamChip = () => {
  const { teams, activeTeam, switchTeam, isAdmin, adminView, toggleAdminView } =
    useWorkspaceTeam();
  const classes = useStyles();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  if (!activeTeam) return null;

  const displayName = adminView
    ? 'Admin View'
    : teams.find(t => t.name === activeTeam)?.displayName ?? activeTeam;

  const hasDropdown = teams.length > 1 || isAdmin;

  if (!hasDropdown) {
    return <Chip label={displayName} size="small" variant="outlined" />;
  }

  return (
    <>
      <Chip
        label={
          <Box display="flex" alignItems="center" style={{ gap: 2 }}>
            {adminView && (
              <SupervisorAccountIcon style={{ fontSize: 16, marginRight: 2 }} />
            )}
            {displayName}
            <ArrowDropDownIcon fontSize="small" />
          </Box>
        }
        size="small"
        variant="outlined"
        color={adminView ? 'primary' : 'default'}
        onClick={e => setAnchorEl(e.currentTarget)}
        className={classes.teamChip}
        clickable
      />
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        {teams.map(t => (
          <MenuItem
            key={t.name}
            selected={t.name === activeTeam && !adminView}
            onClick={() => {
              switchTeam(t.name);
              setAnchorEl(null);
            }}
          >
            <Typography variant="body2">
              {t.displayName ?? t.name}
            </Typography>
          </MenuItem>
        ))}
        {isAdmin && <Divider />}
        {isAdmin && (
          <MenuItem
            selected={adminView}
            onClick={() => {
              toggleAdminView();
              setAnchorEl(null);
            }}
          >
            <SupervisorAccountIcon
              fontSize="small"
              style={{ marginRight: 8 }}
            />
            <Typography variant="body2">
              {adminView ? 'Exit Admin View' : 'Admin View'}
            </Typography>
          </MenuItem>
        )}
      </Menu>
    </>
  );
};

const NavTabs = () => {
  const classes = useStyles();
  const location = useLocation();

  // Don't show nav tabs on detail pages (workspace detail has its own back button)
  if (location.pathname.match(/\/workspaces\/workspace\//)) {
    return null;
  }

  const currentTab = NAV_TABS.findIndex(tab => {
    if (tab.path === '/workspaces') {
      return location.pathname === '/workspaces' || location.pathname === '/workspaces/';
    }
    return location.pathname.startsWith(tab.path);
  });

  return (
    <Tabs
      value={currentTab === -1 ? false : currentTab}
      indicatorColor="primary"
      textColor="primary"
      className={classes.navTabs}
    >
      {NAV_TABS.map(tab => (
        <Tab
          key={tab.path}
          label={tab.label}
          component={RouterLink}
          to={tab.path}
          className={classes.navTab}
        />
      ))}
    </Tabs>
  );
};

const WorkspacesPluginInner = () => {
  const classes = useStyles();

  return (
    <Page themeId="tool">
      <Header
        title="Workspaces"
        subtitle="Cloud Development Environments"
      >
        <TeamChip />
      </Header>
      <Content>
        <div className={classes.watermark} />
        <div className={classes.contentInner}>
          <NavTabs />
          <React.Suspense fallback={<Progress />}>
            <Routes>
              <Route path="/" element={<WorkspaceDashboard />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route
                path="/workspace/:cluster/:namespace/:name"
                element={<WorkspaceDetail />}
              />
              <Route
                path="/settings/ssh-keys"
                element={<SSHKeysSettings />}
              />
              <Route
                path="/settings/templates"
                element={<TemplateSettings />}
              />
            </Routes>
          </React.Suspense>
        </div>
      </Content>
    </Page>
  );
};

export const WorkspacesPlugin = () => (
  <WorkspaceTeamProvider>
    <WorkspacesPluginInner />
  </WorkspaceTeamProvider>
);
