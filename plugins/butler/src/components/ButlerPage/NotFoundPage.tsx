// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { Link as RouterLink } from 'react-router-dom';
import { useTeamContext } from '../../hooks/useTeamContext';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { ButlerButton, ButlerEmptyState, ButlerStack } from '../ui';

/**
 * Butler pages the console has but the plugin does not implement yet are
 * still reachable by URL. Answer them with a Butler page rather than an
 * empty content area.
 */
export const NotFoundPage = () => {
  const routes = useButlerRoutes();
  const { teams, isAdmin } = useTeamContext();
  const team = teams[0]?.name;
  const home = isAdmin
    ? routes.admin()
    : team
    ? routes.team({ team })
    : routes.root();
  return (
    <ButlerStack>
      <ButlerEmptyState
        title="Page not found"
        description="This Butler page does not exist, or is not available in the portal yet."
        action={
          <ButlerButton component={RouterLink} to={home}>
            {isAdmin ? 'Back to Platform Overview' : 'Back to Dashboard'}
          </ButlerButton>
        }
      />
    </ButlerStack>
  );
};
