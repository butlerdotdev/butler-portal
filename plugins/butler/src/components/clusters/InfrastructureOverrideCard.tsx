// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { Cluster } from '../../api/types/clusters';
import { ButlerCard, ButlerKeyValueList, ButlerKeyValueRow } from '../ui';

interface InfrastructureOverrideCardProps {
  override: NonNullable<Cluster['spec']['infrastructureOverride']> | undefined;
}

/** Console "Infrastructure Override" card; only the set fields render. */
export const InfrastructureOverrideCard = ({
  override,
}: InfrastructureOverrideCardProps) => {
  if (!override) {
    return null;
  }
  const rows: Array<[string, string | undefined]> = [];
  if (override.harvester) {
    rows.push(['Harvester Namespace', override.harvester.namespace]);
    rows.push(['Network', override.harvester.networkName]);
    rows.push(['Image', override.harvester.imageName]);
  }
  if (override.nutanix) {
    rows.push(['Nutanix Cluster', override.nutanix.clusterUUID]);
    rows.push(['Subnet', override.nutanix.subnetUUID]);
  }
  const present = rows.filter((row): row is [string, string] =>
    Boolean(row[1]),
  );
  if (present.length === 0) {
    return null;
  }
  return (
    <ButlerCard title="Infrastructure Override">
      <ButlerKeyValueList>
        {present.map(([label, value]) => (
          <ButlerKeyValueRow key={label} label={label} mono>
            {value}
          </ButlerKeyValueRow>
        ))}
      </ButlerKeyValueList>
    </ButlerCard>
  );
};
