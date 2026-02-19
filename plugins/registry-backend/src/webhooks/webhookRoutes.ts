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

import { Router } from 'express';
import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import { RegistryDatabase } from '../database/RegistryDatabase';
import { parseSemver, isPatchBump } from '../util/validation';
import {
  verifyWebhookSignature,
  VcsProvider,
  WebhookTagEvent,
  parseGitHubPushEvent,
  parseGitLabPushEvent,
  parseBitbucketPushEvent,
} from './signatureVerifier';
import { CascadeManager } from '../orchestration/cascadeManager';

interface WebhookRoutesOptions {
  config: Config;
  logger: LoggerService;
  db: RegistryDatabase;
  cascadeManager?: CascadeManager;
}

export function createWebhookRoutes(options: WebhookRoutesOptions): Router {
  const { config, logger, db, cascadeManager } = options;
  const router = Router();

  // GitHub webhook
  router.post('/github', async (req, res) => {
    const secret = config.getOptionalString('registry.webhooks.github.secret');
    if (!secret) {
      logger.warn('GitHub webhook received but no secret configured');
      res.status(200).json({ message: 'Webhook not configured' });
      return;
    }

    if (!verifyWebhookSignature(req, 'github', secret)) {
      logger.warn('GitHub webhook signature verification failed');
      res.status(200).json({ message: 'Invalid signature' });
      return;
    }

    const event = parseGitHubPushEvent(req.body);
    await handleTagEvent(event, 'github', db, logger, cascadeManager);
    res.status(200).json({ message: 'Processed' });
  });

  // GitLab webhook
  router.post('/gitlab', async (req, res) => {
    const secret = config.getOptionalString('registry.webhooks.gitlab.token');
    if (!secret) {
      logger.warn('GitLab webhook received but no token configured');
      res.status(200).json({ message: 'Webhook not configured' });
      return;
    }

    if (!verifyWebhookSignature(req, 'gitlab', secret)) {
      logger.warn('GitLab webhook token verification failed');
      res.status(200).json({ message: 'Invalid token' });
      return;
    }

    const event = parseGitLabPushEvent(req.body);
    await handleTagEvent(event, 'gitlab', db, logger, cascadeManager);
    res.status(200).json({ message: 'Processed' });
  });

  // Bitbucket webhook
  router.post('/bitbucket', async (req, res) => {
    const secret = config.getOptionalString('registry.webhooks.bitbucket.secret');
    if (!secret) {
      logger.warn('Bitbucket webhook received but no secret configured');
      res.status(200).json({ message: 'Webhook not configured' });
      return;
    }

    if (!verifyWebhookSignature(req, 'bitbucket', secret)) {
      logger.warn('Bitbucket webhook signature verification failed');
      res.status(200).json({ message: 'Invalid signature' });
      return;
    }

    const event = parseBitbucketPushEvent(req.body);
    await handleTagEvent(event, 'bitbucket', db, logger, cascadeManager);
    res.status(200).json({ message: 'Processed' });
  });

  return router;
}

/**
 * Handle a tag push event by:
 * 1. Finding matching artifacts by repository URL
 * 2. Creating a version record for each match
 * 3. Evaluating auto-approval policy
 */
async function handleTagEvent(
  event: WebhookTagEvent | null,
  provider: VcsProvider,
  db: RegistryDatabase,
  logger: LoggerService,
  cascadeManager?: CascadeManager,
): Promise<void> {
  if (!event) {
    logger.debug('Webhook payload could not be parsed as push event');
    return;
  }

  if (!event.tag) {
    logger.debug('Push event is not a tag — ignoring', { ref: event.ref });
    return;
  }

  // Parse tag as semver
  let parsed;
  try {
    parsed = parseSemver(event.tag);
  } catch {
    logger.debug('Tag is not valid semver — ignoring', { tag: event.tag });
    return;
  }

  // Find artifacts whose source_config matches this repository
  const artifacts = await db.findArtifactsBySourceRepo(event.repositoryUrl);

  if (artifacts.length === 0) {
    logger.debug('No artifacts match repository', {
      repo: event.repositoryUrl,
    });
    return;
  }

  for (const artifact of artifacts) {
    logger.info('Creating version from webhook', {
      artifact: `${artifact.namespace}/${artifact.name}`,
      version: parsed.raw,
      provider,
    });

    // Idempotent upsert — ON CONFLICT updates timestamp
    const version = await db.upsertVersion({
      artifact_id: artifact.id,
      version: parsed.raw,
      version_major: parsed.major,
      version_minor: parsed.minor,
      version_patch: parsed.patch,
      version_pre: parsed.prerelease ?? undefined,
      published_by: `webhook:${provider}`,
      storage_ref: {
        source: provider,
        tag: event.tag,
        ref: event.ref,
        repositoryUrl: event.repositoryUrl,
      },
    });

    // Evaluate auto-approval policy
    const policy = artifact.approval_policy as { autoApprovePatches?: boolean; requirePassingTests?: boolean; requirePassingValidate?: boolean } | null;
    if (policy?.autoApprovePatches && version.approval_status === 'pending') {
      // Find the current latest version to check if this is a patch bump
      const latest = await db.getLatestVersion(artifact.id);
      if (latest) {
        const latestParsed = {
          major: latest.version_major,
          minor: latest.version_minor,
          patch: latest.version_patch,
          prerelease: latest.version_pre,
          raw: latest.version,
        };
        if (isPatchBump(latestParsed, parsed)) {
          // Skip auto-approve if policy requires passing runs (runs don't exist yet for new versions)
          if (policy.requirePassingTests || policy.requirePassingValidate) {
            logger.info('Skipping auto-approve: policy requires IaC run results', {
              artifact: `${artifact.namespace}/${artifact.name}`,
              version: parsed.raw,
            });
          } else {
            logger.info('Auto-approving patch version', {
              artifact: `${artifact.namespace}/${artifact.name}`,
              version: parsed.raw,
            });
            await db.approveVersion(version.id, 'system:auto-approve');

            await db.writeAuditLog({
              actor: 'system:auto-approve',
              action: 'version.approved',
              resource_type: 'version',
              resource_id: version.id,
              resource_name: artifact.name,
              resource_namespace: artifact.namespace,
              version: parsed.raw,
              details: { reason: 'patch-auto-approve', provider },
            });

            // Trigger cascade speculative plans
            cascadeManager?.triggerCascade(artifact.id, parsed.raw).catch((err: unknown) => {
              logger.error('Failed to trigger cascade', { error: String(err) });
            });
          }
        }
      } else {
        // No previous version — auto-approve the first version too
        // Skip auto-approve if policy requires passing runs (runs don't exist yet for new versions)
        if (policy.requirePassingTests || policy.requirePassingValidate) {
          logger.info('Skipping auto-approve: policy requires IaC run results', {
            artifact: `${artifact.namespace}/${artifact.name}`,
            version: parsed.raw,
          });
        } else {
          logger.info('Auto-approving first version', {
            artifact: `${artifact.namespace}/${artifact.name}`,
            version: parsed.raw,
          });
          await db.approveVersion(version.id, 'system:auto-approve');

          await db.writeAuditLog({
            actor: 'system:auto-approve',
            action: 'version.approved',
            resource_type: 'version',
            resource_id: version.id,
            resource_name: artifact.name,
            resource_namespace: artifact.namespace,
            version: parsed.raw,
            details: { reason: 'first-version-auto-approve', provider },
          });

          // Trigger cascade speculative plans
          cascadeManager?.triggerCascade(artifact.id, parsed.raw).catch(err => {
            logger.error('Failed to trigger cascade', { error: String(err) });
          });
        }
      }
    }

    // Audit the version creation
    await db.writeAuditLog({
      actor: `webhook:${provider}`,
      action: 'version.published',
      resource_type: 'version',
      resource_id: version.id,
      resource_name: artifact.name,
      resource_namespace: artifact.namespace,
      version: parsed.raw,
      details: { tag: event.tag, repositoryUrl: event.repositoryUrl },
    });
  }
}
