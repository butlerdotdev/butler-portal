// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { Tab, Tabs } from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import { AgentList } from './AgentList';
import { GroupList } from './GroupList';
import { TokenManagement } from './TokenManagement';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    tabs: {
      marginBottom: theme.spacing(2),
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
    tab: {
      textTransform: 'none' as const,
      minWidth: 'auto',
      padding: theme.spacing(1, 2),
      '&:hover': {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
      },
    },
  }),
);

export function FleetPage() {
  const classes = useStyles();
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div>
      <Tabs
        value={activeTab}
        onChange={(_e, val) => setActiveTab(val)}
        className={classes.tabs}
        indicatorColor="primary"
        textColor="primary"
      >
        <Tab label="Agents" className={classes.tab} />
        <Tab label="Groups" className={classes.tab} />
        <Tab label="Tokens" className={classes.tab} />
      </Tabs>
      {activeTab === 0 && <AgentList />}
      {activeTab === 1 && <GroupList />}
      {activeTab === 2 && <TokenManagement />}
    </div>
  );
}
