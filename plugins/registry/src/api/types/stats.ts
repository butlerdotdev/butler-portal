// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

export interface DownloadDataPoint {
  date: string;
  count: number;
}

export interface DownloadStats {
  totalDownloads: number;
  last30Days: number;
  dataPoints: DownloadDataPoint[];
}
