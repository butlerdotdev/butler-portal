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

import {
  AuthService,
  DiscoveryService,
  LoggerService,
  SchedulerService,
} from '@backstage/backend-plugin-api';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { Entity } from '@backstage/catalog-model';

interface RegistryArtifact {
  id: string;
  namespace: string;
  name: string;
  type: string;
  description: string | null;
  team: string | null;
  status: string;
  tags: string[];
  category: string | null;
  download_count: number;
}

export class RegistryEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;
  private readonly logger: LoggerService;
  private readonly discovery: DiscoveryService;
  private readonly auth: AuthService;
  private readonly scheduler: SchedulerService;

  constructor(options: {
    logger: LoggerService;
    discovery: DiscoveryService;
    auth: AuthService;
    scheduler: SchedulerService;
  }) {
    this.logger = options.logger;
    this.discovery = options.discovery;
    this.auth = options.auth;
    this.scheduler = options.scheduler;
  }

  getProviderName(): string {
    return 'butler-registry';
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;

    const taskRunner = this.scheduler.createScheduledTaskRunner({
      frequency: { minutes: 5 },
      timeout: { minutes: 3 },
      initialDelay: { seconds: 30 },
    });

    await taskRunner.run({
      id: 'butler-registry-entity-provider',
      fn: async () => {
        await this.refresh();
      },
    });
  }

  private async refresh(): Promise<void> {
    if (!this.connection) {
      return;
    }

    try {
      const entities = await this.fetchEntities();

      await this.connection.applyMutation({
        type: 'full',
        entities: entities.map(entity => ({
          entity,
          locationKey: 'butler-registry',
        })),
      });

      this.logger.info(`Synced ${entities.length} registry artifacts to catalog`);
    } catch (err) {
      this.logger.error('Failed to sync registry entities', { error: String(err) });
    }
  }

  private async fetchEntities(): Promise<Entity[]> {
    const baseUrl = await this.discovery.getBaseUrl('registry');
    const { token } = await this.auth.getPluginRequestToken({
      onBehalfOf: await this.auth.getOwnServiceCredentials(),
      targetPluginId: 'registry',
    });

    const entities: Entity[] = [];
    let cursor: string | undefined;

    // Paginate through all active artifacts
    do {
      const params = new URLSearchParams({ status: 'active', limit: '200' });
      if (cursor) params.set('cursor', cursor);

      const response = await fetch(`${baseUrl}/v1/artifacts?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Registry API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as {
        items: RegistryArtifact[];
        nextCursor: string | null;
      };

      for (const artifact of data.items) {
        entities.push(this.artifactToEntity(artifact));
      }

      cursor = data.nextCursor ?? undefined;
    } while (cursor);

    // Also include deprecated artifacts (they appear in catalog with lifecycle: deprecated)
    cursor = undefined;
    do {
      const params = new URLSearchParams({ status: 'deprecated', limit: '200' });
      if (cursor) params.set('cursor', cursor);

      const response = await fetch(`${baseUrl}/v1/artifacts?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) break; // Don't fail the whole sync for deprecated artifacts

      const data = await response.json() as {
        items: RegistryArtifact[];
        nextCursor: string | null;
      };

      for (const artifact of data.items) {
        entities.push(this.artifactToEntity(artifact));
      }

      cursor = data.nextCursor ?? undefined;
    } while (cursor);

    return entities;
  }

  private artifactToEntity(artifact: RegistryArtifact): Entity {
    const annotations: Record<string, string> = {
      'butler.butlerlabs.dev/registry-namespace': artifact.namespace,
      'butler.butlerlabs.dev/registry-name': artifact.name,
      'butler.butlerlabs.dev/registry-type': artifact.type,
      'backstage.io/managed-by-location': `butler-registry:${artifact.namespace}/${artifact.name}`,
      'backstage.io/managed-by-origin-location': `butler-registry:${artifact.namespace}/${artifact.name}`,
    };

    if (artifact.category) {
      annotations['butler.butlerlabs.dev/registry-category'] = artifact.category;
    }

    return {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: `${artifact.namespace}-${artifact.name}`,
        title: `${artifact.namespace}/${artifact.name}`,
        description: artifact.description ?? undefined,
        tags: artifact.tags.length > 0 ? artifact.tags : undefined,
        annotations,
        links: [
          {
            url: `/registry/artifact/${artifact.namespace}/${artifact.name}`,
            title: 'Registry Detail',
          },
        ],
      },
      spec: {
        type: artifact.type,
        lifecycle: artifact.status,
        owner: artifact.team
          ? `group:default/${artifact.team}`
          : 'group:default/platform-team',
        system: 'butler-registry',
      },
    };
  }
}
