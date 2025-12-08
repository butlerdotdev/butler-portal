// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useNavigate, useLocation } from 'react-router-dom';
import { Progress } from '@backstage/core-components';
import { butlerApiRef } from '../api/ButlerApi';
import { TeamContext } from './TeamContext';
import type { TeamContextValue, ViewMode } from './TeamContext';
import type { TeamInfo } from '../api/types/teams';

const TEAM_STORAGE_KEY = 'butler-active-team';
const MODE_STORAGE_KEY = 'butler-view-mode';

export const TeamProvider = ({ children }: { children: React.ReactNode }) => {
  const api = useApi(butlerApiRef);
  const navigate = useNavigate();
  const location = useLocation();

  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [activeTeam, setActiveTeam] = useState<string | null>(
    () => localStorage.getItem(TEAM_STORAGE_KEY),
  );
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Derive mode from the current URL path
  const mode: ViewMode = location.pathname.includes('/butler/admin')
    ? 'admin'
    : 'team';

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // Use the /_identity endpoint to get the Backstage user's
        // Butler identity — their teams, admin status, etc.
        // This bridges Backstage SSO with butler-server permissions.
        const identity = await api.getIdentity();

        if (cancelled) return;

        setIsAdmin(identity.isPlatformAdmin);

        const fetchedTeams = identity.teams ?? [];

        if (cancelled) return;
        setTeams(fetchedTeams);

        // Restore active team from localStorage or default to the first team
        const stored = localStorage.getItem(TEAM_STORAGE_KEY);
        const validStored =
          stored && fetchedTeams.some(t => t.name === stored);

        if (validStored) {
          api.setTeamContext(stored);
          setActiveTeam(stored);
        } else if (fetchedTeams.length > 0) {
          const defaultTeam = fetchedTeams[0].name;
          api.setTeamContext(defaultTeam);
          setActiveTeam(defaultTeam);
          localStorage.setItem(TEAM_STORAGE_KEY, defaultTeam);
        } else {
          // No teams — clear stale localStorage
          localStorage.removeItem(TEAM_STORAGE_KEY);
          setActiveTeam(null);
        }
      } catch (err) {
        if (!cancelled) {
          setTeams([]);
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [api]);

  const switchTeam = useCallback(
    (teamName: string) => {
      api.setTeamContext(teamName);
      setActiveTeam(teamName);
      localStorage.setItem(TEAM_STORAGE_KEY, teamName);
      localStorage.setItem(MODE_STORAGE_KEY, 'team');
      navigate(`/butler/t/${teamName}`);
    },
    [api, navigate],
  );

  const switchToAdmin = useCallback(() => {
    localStorage.setItem(MODE_STORAGE_KEY, 'admin');
    navigate('/butler/admin');
  }, [navigate]);

  const activeTeamInfo = useMemo(() => {
    if (!activeTeam) return null;
    return teams.find(t => t.name === activeTeam) ?? null;
  }, [activeTeam, teams]);

  const activeTeamDisplayName = useMemo(() => {
    if (!activeTeamInfo) return activeTeam;
    return activeTeamInfo.displayName ?? activeTeam;
  }, [activeTeam, activeTeamInfo]);

  const activeTeamRole = useMemo(() => {
    return activeTeamInfo?.role ?? null;
  }, [activeTeamInfo]);

  const isTeamAdmin = useMemo(() => {
    return activeTeamRole === 'admin';
  }, [activeTeamRole]);

  const value: TeamContextValue = useMemo(
    () => ({
      teams,
      activeTeam,
      activeTeamDisplayName,
      activeTeamRole,
      isTeamAdmin,
      switchTeam,
      switchToAdmin,
      loading,
      isAdmin,
      mode,
    }),
    [teams, activeTeam, activeTeamDisplayName, activeTeamRole, isTeamAdmin, switchTeam, switchToAdmin, loading, isAdmin, mode],
  );

  if (loading) {
    return <Progress />;
  }

  return (
    <TeamContext.Provider value={value}>{children}</TeamContext.Provider>
  );
};
