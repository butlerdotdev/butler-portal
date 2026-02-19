// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { Box, Tabs, Tab, makeStyles } from '@material-ui/core';
import { CloudIntegrationsList } from './CloudIntegrationsList';
import { VariableSetsList } from './VariableSetsList';

const useStyles = makeStyles(theme => ({
  tabs: {
    marginBottom: theme.spacing(2),
  },
}));

export function SettingsPage() {
  const classes = useStyles();
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        className={classes.tabs}
        indicatorColor="primary"
        textColor="primary"
      >
        <Tab label="Cloud Integrations" />
        <Tab label="Variable Sets" />
      </Tabs>
      {tab === 0 && <CloudIntegrationsList />}
      {tab === 1 && <VariableSetsList />}
    </Box>
  );
}
