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

/**
 * OCI-based storage backend.
 *
 * Redirects or proxies requests to a configured OCI registry (e.g., Zot).
 * Validates against an allowedRegistries list to prevent SSRF.
 */
export class OCIStorageBackend implements StorageBackend {
  readonly type = 'oci' as const;
  private readonly registryUrl: string;
  private readonly allowedRegistries: string[];

  constructor(config: Config) {
    this.registryUrl = config.getString('registry.storage.oci.registryUrl');
    this.allowedRegistries = config.getOptionalStringArray(
      'registry.storage.oci.allowedRegistries',
    ) ?? [];
  }

  async resolveDownload(
    artifact: ArtifactRow,
    version: VersionRow,
  ): Promise<DownloadResolution> {
    const config = artifact.storage_config as StorageConfig;
    const ociConfig = config.oci;

    const registryUrl = ociConfig?.registryUrl || this.registryUrl;
    const repository = ociConfig?.repository || `${artifact.namespace}/${artifact.name}`;
    const tag = version.version;

    // Redirect to the OCI registry's manifest endpoint
    const manifestUrl = `${registryUrl}/v2/${repository}/manifests/${tag}`;

    return { type: 'redirect', url: manifestUrl };
  }

  async validateConfig(
    config: StorageConfig,
  ): Promise<{ valid: boolean; error?: string }> {
    const ociConfig = config.oci;
    if (!ociConfig) {
      return { valid: false, error: 'OCI storage config is required' };
    }

    // If a custom registry URL is specified, validate against allowlist
    if (ociConfig.registryUrl) {
      const hostname = extractHostname(ociConfig.registryUrl);
      if (
        this.allowedRegistries.length > 0 &&
        !this.allowedRegistries.some(
          allowed => hostname === allowed || hostname.endsWith(`.${allowed}`),
        )
      ) {
        return {
          valid: false,
          error: `Registry '${hostname}' is not in the allowed registries list`,
        };
      }
    }

    return { valid: true };
  }
}

function extractHostname(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return url;
  }
}
