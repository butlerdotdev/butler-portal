/*
 * Copyright 2026 The Butler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ArtifactRow, VersionRow, StorageConfig } from '../database/types';
import { StorageBackend, DownloadResolution } from './StorageBackend';

/**
 * Git-based storage backend.
 *
 * Resolves X-Terraform-Get URLs from the artifact's Git repository URL
 * and version tag. For Helm charts over Git, generates archive URLs
 * (e.g., GitHub release asset URLs).
 */
export class GitStorageBackend implements StorageBackend {
  readonly type = 'git' as const;

  async resolveDownload(
    artifact: ArtifactRow,
    version: VersionRow,
  ): Promise<DownloadResolution> {
    const config = artifact.storage_config as StorageConfig;
    const gitConfig = config.git;

    if (!gitConfig?.repositoryUrl) {
      throw new Error('Git storage config missing repositoryUrl');
    }

    const repoUrl = gitConfig.repositoryUrl.replace(/\.git$/, '');
    const tag = `v${version.version}`;
    const path = gitConfig.path || '';

    // For GitHub-hosted repos, construct a direct archive URL
    if (repoUrl.includes('github.com')) {
      const archiveUrl = `${repoUrl}//` +
        (path ? `${path}` : '') +
        `?ref=${tag}`;

      if (artifact.type === 'terraform-module') {
        return { type: 'terraform-get', url: archiveUrl };
      }

      // For Helm charts, use the tarball release asset
      return { type: 'redirect', url: `${repoUrl}/archive/refs/tags/${tag}.tar.gz` };
    }

    // Generic Git hosting: construct Terraform-style double-slash URL
    const downloadUrl = `${repoUrl}//` +
      (path ? `${path}` : '') +
      `?ref=${tag}`;

    if (artifact.type === 'terraform-module') {
      return { type: 'terraform-get', url: downloadUrl };
    }

    return { type: 'redirect', url: downloadUrl };
  }

  async validateConfig(
    config: StorageConfig,
  ): Promise<{ valid: boolean; error?: string }> {
    if (!config.git?.repositoryUrl) {
      return { valid: false, error: 'Git storage requires repositoryUrl' };
    }

    const url = config.git.repositoryUrl;
    // Basic URL format validation
    if (!url.startsWith('https://') && !url.startsWith('git@') && !url.startsWith('ssh://')) {
      return {
        valid: false,
        error: 'repositoryUrl must start with https://, git@, or ssh://',
      };
    }

    return { valid: true };
  }
}
