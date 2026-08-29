// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { makeStyles } from '@material-ui/core/styles';
import type { Cluster } from '../../api/types/clusters';
import { butlerTokens } from '../../theme';
import {
  ButlerCard,
  ButlerGrid,
  ButlerKeyValueList,
  ButlerKeyValueRow,
} from '../ui';

const COMPONENTS = [
  ['apiServer', 'API Server'],
  ['controllerManager', 'Controller Manager'],
  ['scheduler', 'Scheduler'],
] as const;

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  return {
    tile: {
      padding: 12,
      borderRadius: t.radius.lg,
      backgroundColor: t.inset,
    },
    tileTitle: {
      margin: '0 0 8px',
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      textTransform: 'uppercase',
      color: t.text.muted,
    },
  };
});

interface ControlPlaneResourcesCardProps {
  resources: NonNullable<Cluster['spec']['controlPlane']>['resources'];
}

/** Console "Control Plane Resources" tiles, one per component. */
export const ControlPlaneResourcesCard = ({
  resources,
}: ControlPlaneResourcesCardProps) => {
  const classes = useStyles();
  if (!resources) return null;
  const present = COMPONENTS.filter(([key]) => resources[key]);
  if (present.length === 0) return null;
  return (
    <ButlerCard title="Control Plane Resources">
      <ButlerGrid columns={3} gap={16}>
        {present.map(([key, label]) => {
          const res = resources[key]!;
          return (
            <div key={key} className={classes.tile}>
              <p className={classes.tileTitle}>{label}</p>
              <ButlerKeyValueList dense>
                {res.requests?.cpu && (
                  <ButlerKeyValueRow label="CPU Request" mono dense>
                    {res.requests.cpu}
                  </ButlerKeyValueRow>
                )}
                {res.limits?.cpu && (
                  <ButlerKeyValueRow label="CPU Limit" mono dense>
                    {res.limits.cpu}
                  </ButlerKeyValueRow>
                )}
                {res.requests?.memory && (
                  <ButlerKeyValueRow label="Mem Request" mono dense>
                    {res.requests.memory}
                  </ButlerKeyValueRow>
                )}
                {res.limits?.memory && (
                  <ButlerKeyValueRow label="Mem Limit" mono dense>
                    {res.limits.memory}
                  </ButlerKeyValueRow>
                )}
              </ButlerKeyValueList>
            </div>
          );
        })}
      </ButlerGrid>
    </ButlerCard>
  );
};
