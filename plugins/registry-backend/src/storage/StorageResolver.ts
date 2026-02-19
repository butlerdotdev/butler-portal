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

import { Config } from '@backstage/config';
import { ArtifactRow, VersionRow, StorageConfig } from '../database/types';
import { StorageBackend, DownloadResolution } from './StorageBackend';
import { GitStorageBackend } from './GitStorageBackend';
import { OCIStorageBackend } from './OCIStorageBackend';

/**
 * Reads artifact storage_config, delegates to the correct StorageBackend.
 */
export class StorageResolver {
  private readonly gitBackend: GitStorageBackend;
  private readonly ociBackend: OCIStorageBackend;

  constructor(config: Config) {
    this.gitBackend = new GitStorageBackend();
    this.ociBackend = new OCIStorageBackend(config);
  }

  async resolveDownload(
    artifact: ArtifactRow,
    version: VersionRow,
  ): Promise<DownloadResolution> {
    const backend = this.getBackend(artifact);
    return backend.resolveDownload(artifact, version);
  }

  async validateConfig(
    config: StorageConfig,
  ): Promise<{ valid: boolean; error?: string }> {
    const backendType = config.backend;
    if (backendType === 'git') {
      return this.gitBackend.validateConfig(config);
    }
    if (backendType === 'oci') {
      return this.ociBackend.validateConfig(config);
    }
    return { valid: false, error: `Unknown storage backend: ${backendType}` };
  }

  private getBackend(artifact: ArtifactRow): StorageBackend {
    const config = artifact.storage_config as StorageConfig;
    switch (config.backend) {
      case 'git':
        return this.gitBackend;
      case 'oci':
        return this.ociBackend;
      default:
        throw new Error(`Unknown storage backend: ${config.backend}`);
    }
  }
}
