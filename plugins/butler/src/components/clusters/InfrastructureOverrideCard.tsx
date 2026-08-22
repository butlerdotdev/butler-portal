// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { InfoCard } from '@backstage/core-components';
import { Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import type { Cluster } from '../../api/types/clusters';

const useStyles = makeStyles(theme => ({
  row: {
    display: 'flex',
    padding: theme.spacing(1, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  label: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    minWidth: 160,
  },
  value: {
    color: theme.palette.text.primary,
    wordBreak: 'break-all',
  },
}));

interface InfrastructureOverrideCardProps {
  override: NonNullable<Cluster['spec']['infrastructureOverride']> | undefined;
}

export const InfrastructureOverrideCard = ({
  override,
}: InfrastructureOverrideCardProps) => {
  const classes = useStyles();
  if (!override) {
    return null;
  }

  const rows: Array<[string, string | undefined]> = [];
  if (override.harvester) {
    rows.push(['Harvester Namespace', override.harvester.namespace]);
    rows.push(['Harvester Network', override.harvester.networkName]);
    rows.push(['Harvester Image', override.harvester.imageName]);
  }
  if (override.nutanix) {
    rows.push(['Nutanix Cluster UUID', override.nutanix.clusterUUID]);
    rows.push(['Nutanix Subnet UUID', override.nutanix.subnetUUID]);
  }
  const present = rows.filter(([, v]) => Boolean(v));
  if (present.length === 0) {
    return null;
  }

  return (
    <InfoCard title="Infrastructure Override">
      <div>
        {present.map(([label, value]) => (
          <div key={label} className={classes.row}>
            <Typography className={classes.label}>{label}</Typography>
            <Typography className={classes.value}>{value}</Typography>
          </div>
        ))}
      </div>
    </InfoCard>
  );
};
