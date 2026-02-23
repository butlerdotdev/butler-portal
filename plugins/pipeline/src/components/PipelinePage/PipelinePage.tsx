// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Header, HeaderTabs, Page, Content, Progress } from '@backstage/core-components';
import { Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import SecurityIcon from '@material-ui/icons/Security';
import SupervisorAccountIcon from '@material-ui/icons/SupervisorAccount';
import { PipelineTeamProvider } from '../../contexts/PipelineTeamProvider';
import { usePipelineTeam } from '../../hooks/usePipelineTeam';
import { TeamPicker } from './TeamPicker';

const PipelineList = lazy(() =>
  import('../PipelineList/PipelineList').then(m => ({
    default: m.PipelineList,
  })),
);
const PipelineDetail = lazy(() =>
  import('../PipelineDetail/PipelineDetail').then(m => ({
    default: m.PipelineDetail,
  })),
);
const PipelineBuilder = lazy(() =>
  import('../builder/PipelineBuilder').then(m => ({
    default: m.PipelineBuilder,
  })),
);
const FleetPage = lazy(() =>
  import('../fleet/FleetPage').then(m => ({
    default: m.FleetPage,
  })),
);
const AgentDetailPage = lazy(() =>
  import('../fleet/AgentDetailPage').then(m => ({
    default: m.AgentDetailPage,
  })),
);
const GroupDetailPage = lazy(() =>
  import('../fleet/GroupDetailPage').then(m => ({
    default: m.GroupDetailPage,
  })),
);

const tabs = [
  { id: 'pipelines', label: 'Pipelines' },
  { id: 'fleet', label: 'Fleet' },
];

const useStyles = makeStyles(() => ({
  // Platform admin banner — violet
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
  // Team admin banner — teal/green
  teamAdminBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '6px 16px',
    backgroundColor: 'rgba(20, 184, 166, 0.15)',
    borderBottom: '1px solid rgba(20, 184, 166, 0.25)',
  },
  teamAdminBannerIcon: {
    fontSize: 14,
    color: '#2dd4bf',
  },
  teamAdminBannerText: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#5eead4',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  teamAdminBannerSeparator: {
    color: 'rgba(45, 212, 191, 0.4)',
    fontSize: '0.75rem',
  },
  teamAdminBannerSubtext: {
    fontSize: '0.75rem',
    color: 'rgba(94, 234, 212, 0.7)',
  },
}));

export function PipelinePage() {
  return (
    <PipelineTeamProvider>
      <PipelinePageContent />
    </PipelineTeamProvider>
  );
}

function PipelinePageContent() {
  const classes = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeTeam, activeRole, isPlatformAdmin } = usePipelineTeam();

  const isAdminMode = isPlatformAdmin && !activeTeam;
  const isTeamAdmin = !!activeTeam && activeRole === 'admin';
  const isFleetPath = location.pathname.includes('/fleet');
  const selectedTab = isFleetPath ? 1 : 0;

  const handleTabChange = (index: number) => {
    if (index === 1) {
      navigate('fleet');
    } else {
      navigate('.', { replace: true });
    }
  };

  return (
    <>
      {isAdminMode && (
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
      {isTeamAdmin && (
        <div className={classes.teamAdminBanner}>
          <SupervisorAccountIcon className={classes.teamAdminBannerIcon} />
          <Typography className={classes.teamAdminBannerText}>
            Team Admin
          </Typography>
          <Typography className={classes.teamAdminBannerSeparator}>
            &mdash;
          </Typography>
          <Typography className={classes.teamAdminBannerSubtext}>
            Managing {activeTeam}
          </Typography>
        </div>
      )}
      <Page themeId="tool">
        <Header title="Pipelines" subtitle="Observability pipeline builder">
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
              <Route path="/" element={<PipelineList />} />
              <Route path="/create" element={<PipelineBuilder />} />
              <Route path="/:id" element={<PipelineDetail />} />
              <Route path="/:id/edit" element={<PipelineBuilder />} />
              <Route path="/:id/versions/:v" element={<PipelineDetail />} />
              <Route path="/fleet" element={<FleetPage />} />
              <Route path="/fleet/agents/:id" element={<AgentDetailPage />} />
              <Route path="/fleet/groups/:id" element={<GroupDetailPage />} />
            </Routes>
          </Suspense>
        </Content>
      </Page>
    </>
  );
}
