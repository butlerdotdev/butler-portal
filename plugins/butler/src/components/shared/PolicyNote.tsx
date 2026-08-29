// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { Link } from 'react-router-dom';
import type { PolicyMetadata } from '../../api/types/providers';
import { describeRuleMode } from '../../api/types/policies';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { ButlerCallout } from '../ui';

export interface PolicyNoteProps {
  policy: PolicyMetadata;
  /** The kind of option the list holds, e.g. "image". */
  noun: string;
}

/**
 * What a ClusterCreationPolicy did to a list of options.
 *
 * The server has already applied the rule before answering, so this
 * explains a list that is already shorter or already reordered rather
 * than offering a choice. Saying nothing would leave a filtered list
 * looking like the provider simply has less to offer. A platform role
 * can follow the link to the policy itself; a team role cannot read
 * policies and is told only what the effect is.
 */
export const PolicyNote = ({ policy, noun }: PolicyNoteProps) => {
  const routes = useButlerRoutes();
  const { canAccessAdmin } = useTeamContext();
  const parts = [describeRuleMode(policy.mode, noun)];
  if (policy.mode === 'default' && policy.default) {
    parts.push(`Suggested: ${policy.default}.`);
  }
  if (policy.mode === 'recommended' && policy.recommendedReason) {
    parts.push(policy.recommendedReason);
  }
  return (
    <ButlerCallout tone="violet" compact title={`Policy: ${policy.name}`}>
      {parts.join(' ')}{' '}
      {canAccessAdmin && (
        <Link to={routes.adminPolicy({ name: policy.name })}>View policy</Link>
      )}
    </ButlerCallout>
  );
};
