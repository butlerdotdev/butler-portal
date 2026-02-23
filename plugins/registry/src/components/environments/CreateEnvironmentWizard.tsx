// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

// This component is deprecated. Environment creation now happens through
// the project detail page via CreateProjectWizard.
// Kept as a redirect for backwards compatibility.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function CreateEnvironmentWizard() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('../projects', { replace: true });
  }, [navigate]);

  return null;
}
