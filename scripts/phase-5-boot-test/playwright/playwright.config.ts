/*
 * Copyright 2026 The Butler Authors.
 * Apache 2.0 license.
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: process.env.PORTAL_URL ?? 'http://localhost:7007',
    headless: true,
    ignoreHTTPSErrors: true,
  },
});
