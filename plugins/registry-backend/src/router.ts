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
import {
  AuthService,
  HttpAuthService,
  LoggerService,
  PermissionsService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type { BasicPermission } from '@backstage/plugin-permission-common';
import express from 'express';
import Router from 'express-promise-router';
import crypto from 'crypto';
import { RegistryDatabase } from './database/RegistryDatabase';
import { resolveIdentity } from './auth/identityResolver';
import { sendError, notFound, badRequest, unauthorized, conflict, forbidden, requireMinRole } from './util/errors';
import { validateName, validateArtifactType, parseSemver } from './util/validation';
import { parsePagination } from './util/pagination';
import { generatePipelineConfig } from './pipelines/pipelineGenerator';
import { ApprovalPolicy } from './database/types';
import {
  registryArtifactCreatePermission,
  registryArtifactUpdatePermission,
  registryVersionPublishPermission,
  registryVersionApprovePermission,
  registryVersionYankPermission,
  registryRunCreatePermission,
  registryRunCancelPermission,
  registryRunConfirmPermission,
  registryTokenCreatePermission,
  registryTokenRevokePermission,
  resolveTeamRole,
} from '@internal/plugin-registry-common';
import type { RegistryRole } from '@internal/plugin-registry-common';
import { createEnvironmentRouter } from './routes/environmentRoutes';
import { createModuleRouter } from './routes/moduleRoutes';
import { createModuleRunRouter } from './routes/moduleRunRoutes';
import { createEnvironmentRunRouter } from './routes/environmentRunRoutes';
import { createModuleRunCallbackRouter } from './routes/moduleRunCallbackRoutes';
import { createCloudIntegrationRouter } from './routes/cloudIntegrationRoutes';
import { createVariableSetRouter } from './routes/variableSetRoutes';
import { createBindingRouter } from './routes/bindingRoutes';
import { createPolicyRouter } from './routes/policyRoutes';
import { DagExecutor } from './orchestration/dagExecutor';
import { evaluateDownloadPolicy } from './governance/downloadPolicyEvaluator';
import { CascadeManager } from './orchestration/cascadeManager';
import { createWebhookRoutes } from './webhooks/webhookRoutes';

declare global {
  namespace Express {
    interface Request {
      registryUser?: { email: string; userRef: string };
      activeTeam?: string;
      activeRole?: RegistryRole;
      ownershipRefs?: string[];
    }
  }
}

export interface RouterOptions {
  config: Config;
  logger: LoggerService;
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  auth: AuthService;
  db: RegistryDatabase;
  permissions: PermissionsService;
  dagExecutor?: DagExecutor;
}

/** Check a Backstage permission. Throws 403 if denied. */
async function requirePermission(
  req: express.Request,
  permission: BasicPermission,
  permissions: PermissionsService,
  httpAuth: HttpAuthService,
): Promise<void> {
  try {
    const credentials = await httpAuth.credentials(req);
    const decision = await permissions.authorize(
      [{ permission }],
      { credentials },
    );
    if (decision[0].result !== AuthorizeResult.ALLOW) {
      throw forbidden('Permission denied');
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'Permission denied') throw err;
    // If credentials resolution fails (unauthenticated), deny
    throw forbidden('Permission denied');
  }
}

export async function createRouter(options: RouterOptions): Promise<express.Router> {
  const { config, logger, httpAuth, userInfo, auth, db, permissions } = options;

  const cascadeManager = new CascadeManager(db, logger);
  const dagExecutor = new DagExecutor(db, logger);
  const routerOptions = { ...options, dagExecutor };

  const router = Router();
  router.use(express.json());

  // Resolve Backstage user identity for all requests (non-blocking).
  // Sets req.registryUser and req.ownershipRefs if a valid Backstage token is present.
  router.use(async (req, _res, next) => {
    try {
      const identity = await resolveIdentity(req, httpAuth, userInfo, auth);
      if (identity) {
        req.registryUser = identity;
        req.ownershipRefs = identity.ownershipRefs;
      }
    } catch {
      // Not authenticated — continue without user context
    }
    next();
  });

  // Extract team context from X-Butler-Team header, validate
  // against the user's ownership entity refs, and resolve role.
  router.use((req, _res, next) => {
    const team = req.headers['x-butler-team'] as string | undefined;
    if (team && req.ownershipRefs) {
      // Validate user belongs to the team
      const teamRef = `group:default/${team}`;
      if (req.ownershipRefs.includes(teamRef)) {
        req.activeTeam = team;
      }
      // Resolve team-scoped role
      req.activeRole = resolveTeamRole(team, req.ownershipRefs);
    } else if (team) {
      // No ownership refs (unauthenticated or service principal) —
      // trust the header for backward compatibility
      req.activeTeam = team;
      req.activeRole = 'viewer';
    } else if (req.ownershipRefs) {
      // No team header — admin mode or standalone mode
      req.activeRole = resolveTeamRole(null, req.ownershipRefs);
    }
    next();
  });

  // ── Health Check ───────────────────────────────────────────────────

  router.get('/health', async (_req, res) => {
    const dbHealthy = await db.healthCheck();
    if (dbHealthy) {
      res.json({ status: 'ok', database: 'connected' });
    } else {
      res.status(503).json({ status: 'error', database: 'disconnected' });
    }
  });

  // Test-only: reset all data (development only)
  router.post('/_test/reset', async (_req, res) => {
    const env = config.getOptionalString('app.baseUrl') ?? '';
    if (!env.includes('localhost')) {
      res.status(403).json({ error: 'Only available in development' });
      return;
    }
    await db.resetAllData();
    logger.info('Test data reset');
    res.json({ status: 'reset' });
  });

  // ── Management API: Artifacts ──────────────────────────────────────

  router.get('/v1/artifacts/facets', async (req, res) => {
    try {
      const facets = await db.getArtifactFacets(req.activeTeam);
      res.json(facets);
    } catch (err) {
      logger.error('Failed to get artifact facets', { error: String(err) });
      sendError(res, err);
    }
  });

  router.get('/v1/artifacts', async (req, res) => {
    try {
      const pagination = parsePagination(req.query as Record<string, unknown>);
      const tagsParam = req.query.tags as string | undefined;
      const tags = tagsParam ? tagsParam.split(',').map(t => t.trim()).filter(Boolean) : undefined;
      const result = await db.listArtifacts({
        cursor: pagination.cursor ?? undefined,
        limit: pagination.limit,
        sortBy: pagination.sortBy,
        sortOrder: pagination.sortOrder,
        type: req.query.type as any,
        status: req.query.status as any,
        team: req.activeTeam,
        search: req.query.search as string,
        tags,
        category: req.query.category as string | undefined,
      });
      res.json(result);
    } catch (err) {
      logger.error('Failed to list artifacts', { error: String(err) });
      sendError(res, err);
    }
  });

  router.post('/v1/artifacts', async (req, res) => {
    try {
      await requirePermission(req, registryArtifactCreatePermission, permissions, httpAuth);
      requireMinRole(req, 'operator');

      const { namespace, name, provider, type, description, storage_config, approval_policy, source_config, tags, category } = req.body;

      validateName(namespace, 'namespace');
      validateName(name, 'name');
      validateArtifactType(type);

      if (!storage_config?.backend) {
        throw badRequest('storage_config.backend is required');
      }

      const artifact = await db.createArtifact({
        namespace,
        name,
        provider: provider ?? undefined,
        type,
        description,
        team: req.activeTeam ?? req.body.team,
        storage_config,
        approval_policy,
        source_config,
        tags,
        category,
        created_by: req.registryUser?.email,
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'artifact.created',
        resource_type: 'artifact',
        resource_id: artifact.id,
        resource_name: artifact.name,
        resource_namespace: artifact.namespace,
      });

      logger.info('Artifact created', { namespace, name, type });
      res.status(201).json(artifact);
    } catch (err) {
      logger.error('Failed to create artifact', { error: String(err) });
      sendError(res, err);
    }
  });

  router.get('/v1/artifacts/:namespace/:name', async (req, res) => {
    try {
      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact ${req.params.namespace}/${req.params.name} not found`);
      }
      res.json(artifact);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/v1/artifacts/:namespace/:name', async (req, res) => {
    try {
      await requirePermission(req, registryArtifactUpdatePermission, permissions, httpAuth);
      requireMinRole(req, 'operator');

      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact ${req.params.namespace}/${req.params.name} not found`);
      }

      const updated = await db.updateArtifact(artifact.id, req.body);
      if (!updated) {
        throw notFound('ARTIFACT_NOT_FOUND', 'Artifact not found after update');
      }

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'artifact.updated',
        resource_type: 'artifact',
        resource_id: artifact.id,
        resource_name: artifact.name,
        resource_namespace: artifact.namespace,
        details: { fields: Object.keys(req.body) },
      });

      res.json(updated);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/v1/artifacts/:namespace/:name', async (req, res) => {
    try {
      await requirePermission(req, registryArtifactUpdatePermission, permissions, httpAuth);
      requireMinRole(req, 'operator');

      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact ${req.params.namespace}/${req.params.name} not found`);
      }

      await db.updateArtifact(artifact.id, { status: 'archived' });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'artifact.archived',
        resource_type: 'artifact',
        resource_id: artifact.id,
        resource_name: artifact.name,
        resource_namespace: artifact.namespace,
      });

      logger.info('Artifact archived', { namespace: req.params.namespace, name: req.params.name });
      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/v1/artifacts/:namespace/:name/deprecate', async (req, res) => {
    try {
      await requirePermission(req, registryArtifactUpdatePermission, permissions, httpAuth);
      requireMinRole(req, 'operator');

      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact ${req.params.namespace}/${req.params.name} not found`);
      }

      const updated = await db.updateArtifact(artifact.id, { status: 'deprecated' });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'artifact.deprecated',
        resource_type: 'artifact',
        resource_id: artifact.id,
        resource_name: artifact.name,
        resource_namespace: artifact.namespace,
      });

      res.json(updated);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Management API: Versions ───────────────────────────────────────

  router.get('/v1/artifacts/:namespace/:name/versions', async (req, res) => {
    try {
      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact ${req.params.namespace}/${req.params.name} not found`);
      }

      const versions = await db.listVersions(artifact.id);
      res.json({ versions });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/v1/artifacts/:namespace/:name/versions', async (req, res) => {
    try {
      await requirePermission(req, registryVersionPublishPermission, permissions, httpAuth);
      requireMinRole(req, 'operator');

      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact ${req.params.namespace}/${req.params.name} not found`);
      }

      const { version: versionStr, changelog, digest, terraform_metadata, helm_metadata, opa_metadata, storage_ref, examples, dependencies, size_bytes } = req.body;
      const semver = parseSemver(versionStr);

      const version = await db.createVersion({
        artifact_id: artifact.id,
        version: semver.raw,
        version_major: semver.major,
        version_minor: semver.minor,
        version_patch: semver.patch,
        version_pre: semver.prerelease ?? undefined,
        published_by: req.registryUser?.email,
        changelog,
        digest,
        terraform_metadata,
        helm_metadata,
        opa_metadata,
        storage_ref,
        examples,
        dependencies,
        size_bytes,
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'version.published',
        resource_type: 'version',
        resource_id: version.id,
        resource_name: artifact.name,
        resource_namespace: artifact.namespace,
        version: version.version,
      });

      logger.info('Version published', {
        artifact: `${artifact.namespace}/${artifact.name}`,
        version: version.version,
      });
      res.status(201).json(version);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/v1/artifacts/:namespace/:name/versions/:version', async (req, res) => {
    try {
      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact ${req.params.namespace}/${req.params.name} not found`);
      }

      const version = await db.getVersion(artifact.id, req.params.version);
      if (!version) {
        throw notFound('VERSION_NOT_FOUND', `Version ${req.params.version} not found`);
      }

      res.json(version);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/v1/artifacts/:namespace/:name/versions/:version/approve', async (req, res) => {
    try {
      await requirePermission(req, registryVersionApprovePermission, permissions, httpAuth);
      requireMinRole(req, 'operator');

      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact ${req.params.namespace}/${req.params.name} not found`);
      }

      const existing = await db.getVersion(artifact.id, req.params.version);
      if (!existing) {
        throw notFound('VERSION_NOT_FOUND', `Version ${req.params.version} not found`);
      }

      // Policy guard: check if required IaC runs have passed
      const policy = artifact.approval_policy as ApprovalPolicy | null;
      if (policy?.requirePassingTests) {
        const runs = await db.listRuns(artifact.id, { status: 'succeeded' });
        const hasPassingTest = runs.items.some(
          r => r.operation === 'test' && r.version === req.params.version && r.status === 'succeeded',
        );
        if (!hasPassingTest) {
          throw badRequest('Approval policy requires passing test run before approval');
        }
      }
      if (policy?.requirePassingValidate) {
        const runs = await db.listRuns(artifact.id, { status: 'succeeded' });
        const hasPassingValidate = runs.items.some(
          r => r.operation === 'validate' && r.version === req.params.version && r.status === 'succeeded',
        );
        if (!hasPassingValidate) {
          throw badRequest('Approval policy requires passing validate run before approval');
        }
      }

      // Enforce requiredScanGrade
      if (policy?.requiredScanGrade) {
        const scanResults = await db.getCiResults(existing.id);
        const scans = scanResults.filter(r => r.result_type === 'security-scan');
        if (scans.length === 0) {
          throw badRequest('Approval policy requires security scan before approval');
        }
        const gradeOrder = ['A', 'B', 'C', 'D', 'F'];
        const requiredIdx = gradeOrder.indexOf(policy.requiredScanGrade);
        const hasPassingGrade = scans.some(s => {
          const idx = gradeOrder.indexOf(s.grade ?? '');
          return idx >= 0 && idx <= requiredIdx;
        });
        if (!hasPassingGrade) {
          throw badRequest(
            `Approval policy requires scan grade ${policy.requiredScanGrade} or better`,
          );
        }
      }

      const actor = req.registryUser?.email ?? 'unknown';

      // Self-approval prevention (default: blocked unless explicitly disabled)
      if (policy?.preventSelfApproval !== false && existing.published_by === actor) {
        throw forbidden('Cannot approve your own version');
      }

      // Enforce minApprovers via version_approvals join table
      if (policy?.minApprovers && policy.minApprovers > 1) {
        await db.addVersionApproval(existing.id, actor, req.body?.comment);
        const approvalCount = await db.getVersionApprovalCount(existing.id);
        if (approvalCount < policy.minApprovers) {
          const approvals = await db.getVersionApprovals(existing.id);
          res.json({
            ...existing,
            approval_count: approvalCount,
            approvals,
            approvals_required: policy.minApprovers,
          });
          return;
        }
      }

      const approved = await db.approveVersion(existing.id, actor, req.body?.comment);

      if (!approved) {
        res.json(existing); // Already processed — return current state
        return;
      }

      await db.writeAuditLog({
        actor,
        action: 'version.approved',
        resource_type: 'version',
        resource_id: existing.id,
        resource_name: artifact.name,
        resource_namespace: artifact.namespace,
        version: existing.version,
        details: req.body?.comment ? { comment: req.body.comment } : undefined,
      });

      logger.info('Version approved', {
        artifact: `${artifact.namespace}/${artifact.name}`,
        version: existing.version,
        approvedBy: actor,
      });

      // Trigger cascade speculative plans on environment modules
      cascadeManager.triggerCascade(artifact.id, existing.version).catch(err => {
        logger.error('Failed to trigger cascade', { error: String(err) });
      });

      res.json(approved);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/v1/artifacts/:namespace/:name/versions/:version/reject', async (req, res) => {
    try {
      await requirePermission(req, registryVersionApprovePermission, permissions, httpAuth);
      requireMinRole(req, 'operator');

      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact ${req.params.namespace}/${req.params.name} not found`);
      }

      const existing = await db.getVersion(artifact.id, req.params.version);
      if (!existing) {
        throw notFound('VERSION_NOT_FOUND', `Version ${req.params.version} not found`);
      }

      const actor = req.registryUser?.email ?? 'unknown';
      const rejected = await db.rejectVersion(existing.id, actor, req.body?.comment);

      if (!rejected) {
        res.json(existing);
        return;
      }

      await db.writeAuditLog({
        actor,
        action: 'version.rejected',
        resource_type: 'version',
        resource_id: existing.id,
        resource_name: artifact.name,
        resource_namespace: artifact.namespace,
        version: existing.version,
        details: req.body?.comment ? { comment: req.body.comment } : undefined,
      });

      res.json(rejected);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/v1/artifacts/:namespace/:name/versions/:version/yank', async (req, res) => {
    try {
      await requirePermission(req, registryVersionYankPermission, permissions, httpAuth);
      requireMinRole(req, 'operator');

      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact ${req.params.namespace}/${req.params.name} not found`);
      }

      const existing = await db.getVersion(artifact.id, req.params.version);
      if (!existing) {
        throw notFound('VERSION_NOT_FOUND', `Version ${req.params.version} not found`);
      }

      const yanked = await db.yankVersion(existing.id, req.body?.reason);

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'version.yanked',
        resource_type: 'version',
        resource_id: existing.id,
        resource_name: artifact.name,
        resource_namespace: artifact.namespace,
        version: existing.version,
        details: req.body?.reason ? { reason: req.body.reason } : undefined,
      });

      res.json(yanked);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Management API: Version Detail Data ────────────────────────────

  router.get('/v1/artifacts/:namespace/:name/versions/:version/readme', async (req, res) => {
    try {
      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact not found`);
      }
      // README stored on artifact row (latest), could be per-version in future
      res.json({ content: artifact.readme ?? '', format: 'markdown' });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/v1/artifacts/:namespace/:name/versions/:version/scan', async (req, res) => {
    try {
      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact not found`);
      }
      const version = await db.getVersion(artifact.id, req.params.version);
      if (!version) {
        throw notFound('VERSION_NOT_FOUND', `Version not found`);
      }
      const results = await db.getCiResults(version.id);
      const scanResults = results.filter(r => r.result_type === 'security-scan');
      res.json({ results: scanResults });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/v1/artifacts/:namespace/:name/versions/:version/cost', async (req, res) => {
    try {
      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact not found`);
      }
      const version = await db.getVersion(artifact.id, req.params.version);
      if (!version) {
        throw notFound('VERSION_NOT_FOUND', `Version not found`);
      }
      const results = await db.getCiResults(version.id);
      const costResults = results.filter(r => r.result_type === 'cost-estimate');
      res.json({ results: costResults });
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Management API: Stats & Audit ──────────────────────────────────

  router.get('/v1/artifacts/:namespace/:name/stats', async (req, res) => {
    try {
      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact not found`);
      }
      const stats = await db.getDownloadStats(artifact.id);
      res.json({
        artifactName: artifact.name,
        totalDownloads: stats.total,
        dataPoints: stats.dataPoints,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/v1/artifacts/:namespace/:name/consumers', async (req, res) => {
    try {
      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact not found`);
      }
      const [tokenConsumers, anonConsumers] = await Promise.all([
        db.getConsumers(artifact.id),
        db.getAnonymousConsumers(artifact.id),
      ]);
      res.json({ consumers: tokenConsumers, anonymous: anonConsumers });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/v1/artifacts/:namespace/:name/audit', async (req, res) => {
    try {
      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact not found`);
      }
      const result = await db.listAuditLogs({
        resource_namespace: artifact.namespace,
        resource_name: artifact.name,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        cursor: req.query.cursor as string,
      });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Management API: Governance ─────────────────────────────────────

  router.get('/v1/governance/summary', async (req, res) => {
    try {
      const summary = await db.getGovernanceSummary(req.activeTeam);
      res.json(summary);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/v1/governance/approvals', async (req, res) => {
    try {
      const approvals = await db.getPendingApprovals(req.activeTeam);
      res.json({ items: approvals, totalCount: approvals.length });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/v1/governance/staleness', async (req, res) => {
    try {
      const alerts = await db.getStalenessAlerts(req.activeTeam);
      res.json({ alerts });
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Management API: Audit Log ──────────────────────────────────────

  router.get('/v1/audit', async (req, res) => {
    try {
      const result = await db.listAuditLogs({
        action: req.query.action as string,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        cursor: req.query.cursor as string,
      });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Management API: Tokens ─────────────────────────────────────────

  router.get('/v1/tokens', async (req, res) => {
    try {
      const email = req.registryUser?.email;
      if (!email) {
        res.status(401).json({ error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
        return;
      }

      // Admin mode (no active team): show all tokens across teams
      // Team mode: show user's tokens scoped to that team
      const tokens = !req.activeTeam
        ? await db.listAllTokens()
        : await db.listTokens(email, req.activeTeam);

      // Never return token_hash to the client
      const sanitized = tokens.map(t => ({
        id: t.id,
        name: t.name,
        token_prefix: t.token_prefix,
        scopes: t.scopes,
        namespace: t.namespace,
        team: t.team,
        created_by: t.created_by,
        expires_at: t.expires_at,
        last_used_at: t.last_used_at,
        created_at: t.created_at,
      }));
      res.json({ tokens: sanitized });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/v1/tokens', async (req, res) => {
    try {
      await requirePermission(req, registryTokenCreatePermission, permissions, httpAuth);
      requireMinRole(req, 'admin');

      const email = req.registryUser?.email;
      if (!email) {
        res.status(401).json({ error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
        return;
      }

      const { name, scopes, namespace, team: bodyTeam, expiresInDays } = req.body;
      if (!name || !scopes || !Array.isArray(scopes) || scopes.length === 0) {
        throw badRequest('name and scopes are required');
      }

      // Use active team from header; fall back to body team for platform admins
      const team = req.activeTeam ?? (bodyTeam as string | undefined);

      // Generate a random token
      const crypto = await import('crypto');
      const rawToken = `breg_${crypto.randomBytes(32).toString('hex')}`;
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const tokenPrefix = rawToken.slice(0, 12);

      const defaultExpiry = config.getOptionalNumber('registry.tokens.defaultExpiryDays') ?? 365;
      const maxExpiry = config.getOptionalNumber('registry.tokens.maxExpiryDays') ?? 730;
      const expiryDays = Math.min(expiresInDays ?? defaultExpiry, maxExpiry);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiryDays);

      const token = await db.createToken({
        name,
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
        scopes,
        namespace,
        team,
        created_by: email,
        expires_at: expiresAt.toISOString(),
      });

      await db.writeAuditLog({
        actor: email,
        action: 'token.created',
        resource_type: 'token',
        resource_id: token.id,
        resource_name: name,
        details: { scopes, namespace, team },
      });

      logger.info('API token created', { name, scopes, createdBy: email });

      // Return the raw token value — only time it's visible
      res.status(201).json({
        token: {
          id: token.id,
          name: token.name,
          token_prefix: token.token_prefix,
          scopes: token.scopes,
          namespace: token.namespace,
          team: token.team,
          created_by: token.created_by,
          expires_at: token.expires_at,
          created_at: token.created_at,
        },
        secretValue: rawToken,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/v1/tokens/:id', async (req, res) => {
    try {
      await requirePermission(req, registryTokenRevokePermission, permissions, httpAuth);
      requireMinRole(req, 'admin');

      const email = req.registryUser?.email;
      if (!email) {
        res.status(401).json({ error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
        return;
      }

      const revoked = await db.revokeToken(req.params.id, email);
      if (!revoked) {
        throw notFound('TOKEN_NOT_FOUND', 'Token not found or already revoked');
      }

      await db.writeAuditLog({
        actor: email,
        action: 'token.revoked',
        resource_type: 'token',
        resource_id: req.params.id,
      });

      logger.info('API token revoked', { tokenId: req.params.id, revokedBy: email });
      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── CI Results Ingestion ───────────────────────────────────────────

  // Post commit status to GitHub when CI results are ingested
  async function postCommitStatus(
    sourceConfig: { vcsProvider?: string; repositoryUrl?: string } | null,
    commitSha: string | undefined,
    grade: string | undefined,
    resultType: string,
    scanner: string | undefined,
  ) {
    if (!commitSha || !sourceConfig?.repositoryUrl) return;
    if (sourceConfig.vcsProvider !== 'github') return;

    const githubToken = config.getOptionalString('registry.storage.git.github.token');
    if (!githubToken) return;

    try {
      // Extract owner/repo from URL like https://github.com/org/repo
      const match = sourceConfig.repositoryUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (!match) return;
      const [, owner, repo] = match;

      const state = grade && ['A', 'B'].includes(grade) ? 'success'
        : grade && ['C'].includes(grade) ? 'pending'
        : grade ? 'failure' : 'pending';

      const context = `butler-registry/${resultType}${scanner ? `/${scanner}` : ''}`;
      const description = grade ? `Grade: ${grade}` : `${resultType} result submitted`;
      const baseUrl = config.getOptionalString('registry.baseUrl') ?? '';

      await fetch(`https://api.github.com/repos/${owner}/${repo}/statuses/${commitSha}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state,
          context,
          description,
          target_url: baseUrl || undefined,
        }),
      });

      logger.info('Posted commit status to GitHub', { owner, repo, commitSha, state, context });
    } catch (err) {
      logger.warn('Failed to post commit status to GitHub', { error: String(err) });
    }
  }

  router.post('/v1/ci/results', async (req, res) => {
    try {
      const { namespace, name, version: versionStr, result_type, scanner, grade, summary, details } = req.body;

      if (!namespace || !name || !versionStr || !result_type || !summary) {
        throw badRequest('namespace, name, version, result_type, and summary are required');
      }

      const artifact = await db.getArtifact(namespace, name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', `Artifact ${namespace}/${name} not found`);
      }

      const version = await db.getVersion(artifact.id, versionStr);
      if (!version) {
        throw notFound('VERSION_NOT_FOUND', `Version ${versionStr} not found`);
      }

      const result = await db.upsertCiResult({
        version_id: version.id,
        result_type,
        scanner,
        grade,
        summary,
        details,
      });

      logger.info('CI result ingested', {
        artifact: `${namespace}/${name}`,
        version: versionStr,
        resultType: result_type,
        scanner,
        grade,
      });

      // Fire-and-forget: post commit status to GitHub
      const commitSha = (version.storage_ref as any)?.commit_sha ?? req.body.commit_sha;
      postCommitStatus(artifact.source_config, commitSha, grade, result_type, scanner).catch(() => {});

      res.status(201).json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Terraform Registry Protocol v1 ─────────────────────────────────

  router.get('/.well-known/terraform.json', (_req, res) => {
    const baseUrl = config.getOptionalString('registry.baseUrl') ?? '';
    res.json({
      'modules.v1': `${baseUrl}/api/registry/v1/modules/`,
      'providers.v1': `${baseUrl}/api/registry/v1/providers/`,
    });
  });

  // OpenTofu uses the same module/provider registry protocol as Terraform
  router.get('/.well-known/opentofu.json', (_req, res) => {
    const baseUrl = config.getOptionalString('registry.baseUrl') ?? '';
    res.json({
      'modules.v1': `${baseUrl}/api/registry/v1/modules/`,
      'providers.v1': `${baseUrl}/api/registry/v1/providers/`,
    });
  });

  router.get('/v1/modules/:namespace/:name/:provider/versions', async (req, res) => {
    try {
      const { namespace, name, provider } = req.params;
      const artifact = await db.getArtifactByProtocol(namespace, name, provider);
      if (!artifact) {
        res.status(404).json({ errors: ['Module not found'] });
        return;
      }

      const versions = await db.listApprovedVersions(artifact.id);

      res.json({
        modules: [
          {
            versions: versions.map(v => ({ version: v.version })),
          },
        ],
      });
    } catch (err) {
      logger.error('Terraform version list failed', { error: String(err) });
      sendError(res, err);
    }
  });

  router.get('/v1/modules/:namespace/:name/:provider/:version/download', async (req, res) => {
    try {
      const { namespace, name, provider, version: versionStr } = req.params;
      const artifact = await db.getArtifactByProtocol(namespace, name, provider);
      if (!artifact) {
        res.status(404).json({ errors: ['Module not found'] });
        return;
      }

      const version = await db.getVersion(artifact.id, versionStr);
      if (!version || version.approval_status !== 'approved' || version.is_bad) {
        res.status(404).json({ errors: ['Version not found or not approved'] });
        return;
      }

      // Download-time policy enforcement
      const policyResult = await evaluateDownloadPolicy(db, artifact, version);
      if (policyResult.outcome === 'fail' && policyResult.enforcementLevel === 'block') {
        res.status(403).json({
          errors: ['Download blocked by policy'],
          policy_violations: policyResult.ruleResults.filter(r => r.result === 'fail'),
        });
        return;
      }
      if (policyResult.warnings.length > 0 && policyResult.enforcementLevel === 'warn') {
        res.setHeader('X-Butler-Policy-Warning', policyResult.warnings.join('; '));
      }

      // Resolve download URL based on storage backend
      const storageConfig = artifact.storage_config;
      if (storageConfig.backend === 'git' && storageConfig.git) {
        const repoUrl = storageConfig.git.repositoryUrl;
        const path = storageConfig.git.path ?? '';
        const tagPrefix = storageConfig.git.tagPrefix ?? 'v';
        const ref = `${tagPrefix}${version.version}`;
        const downloadUrl = path
          ? `git::${repoUrl}///${path}?ref=${ref}`
          : `git::${repoUrl}?ref=${ref}`;

        // Log download async (fire-and-forget)
        db.logDownload({
          artifact_id: artifact.id,
          version_id: version.id,
          version: version.version,
          consumer_type: 'terraform',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'] ?? undefined,
        }).catch(() => {});
        db.incrementDownloadCount(artifact.id).catch(() => {});

        res.setHeader('X-Terraform-Get', downloadUrl);
        res.status(204).end();
      } else if (storageConfig.backend === 'oci' && storageConfig.oci) {
        // For OCI, redirect to the registry
        const ociRef = `${storageConfig.oci.registryUrl}/${storageConfig.oci.repository}:${version.version}`;

        db.logDownload({
          artifact_id: artifact.id,
          version_id: version.id,
          version: version.version,
          consumer_type: 'terraform',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'] ?? undefined,
        }).catch(() => {});
        db.incrementDownloadCount(artifact.id).catch(() => {});

        res.setHeader('X-Terraform-Get', ociRef);
        res.status(204).end();
      } else {
        res.status(500).json({ errors: ['Storage backend not configured'] });
      }
    } catch (err) {
      logger.error('Terraform download failed', { error: String(err) });
      sendError(res, err);
    }
  });

  // ── Terraform Provider Protocol v1 ──────────────────────────────────

  router.get('/v1/providers/:namespace/:type/versions', async (req, res) => {
    try {
      const { namespace, type: providerType } = req.params;
      // Provider artifacts use namespace as org, name as provider type
      const artifact = await db.getArtifactByProtocol(namespace, providerType, undefined);
      if (!artifact || artifact.type !== 'terraform-provider') {
        res.status(404).json({ errors: ['Provider not found'] });
        return;
      }

      const versions = await db.listApprovedVersions(artifact.id);

      res.json({
        versions: versions.map(v => {
          const meta = v.terraform_metadata;
          const platforms = meta?.platforms ?? [
            { os: 'linux', arch: 'amd64' },
            { os: 'darwin', arch: 'amd64' },
            { os: 'darwin', arch: 'arm64' },
          ];
          return {
            version: v.version,
            protocols: ['5.0'],
            platforms: platforms.map(p => ({ os: p.os, arch: p.arch })),
          };
        }),
      });
    } catch (err) {
      logger.error('Provider version list failed', { error: String(err) });
      sendError(res, err);
    }
  });

  router.get('/v1/providers/:namespace/:type/:version/download/:os/:arch', async (req, res) => {
    try {
      const { namespace, type: providerType, version: versionStr, os: targetOs, arch: targetArch } = req.params;
      const artifact = await db.getArtifactByProtocol(namespace, providerType, undefined);
      if (!artifact || artifact.type !== 'terraform-provider') {
        res.status(404).json({ errors: ['Provider not found'] });
        return;
      }

      const version = await db.getVersion(artifact.id, versionStr);
      if (!version || version.approval_status !== 'approved' || version.is_bad) {
        res.status(404).json({ errors: ['Version not found or not approved'] });
        return;
      }

      // Download-time policy enforcement
      const policyResult = await evaluateDownloadPolicy(db, artifact, version);
      if (policyResult.outcome === 'fail' && policyResult.enforcementLevel === 'block') {
        res.status(403).json({
          errors: ['Download blocked by policy'],
          policy_violations: policyResult.ruleResults.filter(r => r.result === 'fail'),
        });
        return;
      }
      if (policyResult.warnings.length > 0 && policyResult.enforcementLevel === 'warn') {
        res.setHeader('X-Butler-Policy-Warning', policyResult.warnings.join('; '));
      }

      const meta = version.terraform_metadata;
      const platforms = meta?.platforms ?? [];
      const platform = platforms.find(
        (p: { os: string; arch: string }) => p.os === targetOs && p.arch === targetArch,
      );

      if (!platform) {
        res.status(404).json({ errors: [`Platform ${targetOs}/${targetArch} not available`] });
        return;
      }

      // Resolve download URL
      let downloadUrl: string;
      if (platform.download_url) {
        downloadUrl = platform.download_url;
      } else if (artifact.storage_config.backend === 'git' && artifact.storage_config.git) {
        const repoUrl = artifact.storage_config.git.repositoryUrl;
        const tagPrefix = artifact.storage_config.git.tagPrefix ?? 'v';
        // Convention: GitHub release asset URL
        const repoPath = repoUrl.replace(/\.git$/, '').replace(/^https?:\/\/github\.com\//, '');
        downloadUrl = `https://github.com/${repoPath}/releases/download/${tagPrefix}${version.version}/${platform.filename}`;
      } else {
        res.status(500).json({ errors: ['Cannot resolve download URL for provider'] });
        return;
      }

      // Log download
      db.logDownload({
        artifact_id: artifact.id,
        version_id: version.id,
        version: version.version,
        consumer_type: 'terraform',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] ?? undefined,
      }).catch(() => {});
      db.incrementDownloadCount(artifact.id).catch(() => {});

      res.json({
        protocols: ['5.0'],
        os: targetOs,
        arch: targetArch,
        filename: platform.filename,
        download_url: downloadUrl,
        shasum: platform.shasum || '',
        shasums_url: '',
        shasums_signature_url: '',
        signing_keys: { gpg_public_keys: [] },
      });
    } catch (err) {
      logger.error('Provider download failed', { error: String(err) });
      sendError(res, err);
    }
  });

  // ── Helm Repository Index ──────────────────────────────────────────

  router.get('/helm/:namespace/index.yaml', async (req, res) => {
    try {
      const { namespace } = req.params;
      const baseUrl = config.getOptionalString('registry.baseUrl') ?? '';

      // Query all active helm-chart artifacts in namespace
      const result = await db.listArtifacts({
        type: 'helm-chart',
        status: 'active',
        search: undefined,
        team: undefined,
        limit: 200,
      });

      // Filter to requested namespace
      const artifacts = result.items.filter(a => a.namespace === namespace);

      const entries: Record<string, any[]> = {};

      for (const artifact of artifacts) {
        const versions = await db.listApprovedVersions(artifact.id);
        entries[artifact.name] = versions.map(v => ({
          name: artifact.name,
          version: v.version,
          description: artifact.description ?? '',
          apiVersion: v.helm_metadata?.apiVersion ?? 'v2',
          appVersion: v.helm_metadata?.appVersion ?? '',
          created: v.created_at,
          digest: v.digest ?? '',
          urls: [`${baseUrl}/api/registry/helm/${namespace}/charts/${artifact.name}-${v.version}.tgz`],
        }));
      }

      const index = {
        apiVersion: 'v1',
        entries,
        generated: new Date().toISOString(),
      };

      // Generate ETag from entries only (exclude generated timestamp)
      const crypto = await import('crypto');
      const etag = crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 16);

      if (req.headers['if-none-match'] === `"${etag}"`) {
        res.status(304).end();
        return;
      }

      res.setHeader('Content-Type', 'application/x-yaml');
      res.setHeader('ETag', `"${etag}"`);
      // Simple YAML-like output (Helm CLI accepts JSON too)
      res.json(index);
    } catch (err) {
      logger.error('Helm index generation failed', { error: String(err) });
      sendError(res, err);
    }
  });

  // ── OCI Distribution Endpoints ─────────────────────────────────────

  router.get('/oci/v2/', (_req, res) => {
    res.setHeader('Docker-Distribution-API-Version', 'registry/2.0');
    res.json({});
  });

  // ── IaC Runs ─────────────────────────────────────────────────────────

  // Create a run
  router.post('/v1/artifacts/:namespace/:name/runs', async (req, res) => {
    try {
      await requirePermission(req, registryRunCreatePermission, permissions, httpAuth);
      requireMinRole(req, 'operator');

      const { namespace, name } = req.params;
      const artifact = await db.getArtifact(namespace, name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', 'Artifact not found');
      }

      const { operation, mode, version, ci_provider, tf_version, variables, env_vars, working_directory } = req.body;

      if (!operation || !mode) {
        throw badRequest('operation and mode are required');
      }

      // Resolve version if specified
      let versionId: string | undefined;
      if (version) {
        const v = await db.getVersion(artifact.id, version);
        if (v) versionId = v.id;
      }

      // For BYOC, generate callback token
      let callbackToken: string | undefined;
      let callbackTokenHash: string | undefined;

      if (mode === 'byoc') {
        if (!ci_provider) {
          throw badRequest('ci_provider is required for BYOC mode');
        }
        // Generate run-scoped callback token with brce_ prefix
        callbackToken = `brce_${crypto.randomBytes(32).toString('hex')}`;
        callbackTokenHash = crypto.createHash('sha256').update(callbackToken).digest('hex');
      }

      const run = await db.createRun({
        artifact_id: artifact.id,
        version_id: versionId,
        artifact_namespace: namespace,
        artifact_name: name,
        version,
        operation,
        mode,
        status: mode === 'byoc' ? 'queued' : 'pending',
        triggered_by: req.registryUser?.email,
        team: artifact.team ?? undefined,
        ci_provider,
        callback_token_hash: callbackTokenHash,
        tf_version,
        variables,
        env_vars,
        working_directory,
      });

      // For BYOC, generate pipeline config
      if (mode === 'byoc' && ci_provider && artifact.source_config?.repositoryUrl) {
        const callbackBaseUrl = config.getOptionalString('registry.iac.byoc.callbackBaseUrl')
          ?? config.getOptionalString('registry.baseUrl')
          ?? `${req.protocol}://${req.get('host')}`;
        const pipelineYaml = generatePipelineConfig(ci_provider, {
          runId: run.id,
          callbackBaseUrl: `${callbackBaseUrl}/api/registry`,
          operation,
          tfVersion: tf_version ?? '1.9.0',
          repositoryUrl: artifact.source_config.repositoryUrl,
          version: version ?? 'main',
          workingDirectory: working_directory,
          envVars: env_vars,
        });

        // Save pipeline config on the run
        await db.updateRunStatus(run.id, run.status as any, {});
        // Store pipeline config directly
        run.pipeline_config = pipelineYaml;
      }

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'run.created',
        resource_type: 'run',
        resource_id: run.id,
        resource_namespace: namespace,
        resource_name: name,
        version,
        details: { operation, mode },
      });

      logger.info('Run created', { runId: run.id, operation, mode, namespace, name });

      // Strip internal fields from response
      const { callback_token_hash: _h, k8s_job_name: _j, k8s_namespace: _n, ...runResponse } = run;
      res.status(201).json({
        run: runResponse,
        ...(callbackToken ? { callbackToken } : {}),
      });
    } catch (err) {
      logger.error('Failed to create run', { error: String(err) });
      sendError(res, err);
    }
  });

  // List runs for an artifact
  router.get('/v1/artifacts/:namespace/:name/runs', async (req, res) => {
    try {
      const { namespace, name } = req.params;
      const artifact = await db.getArtifact(namespace, name);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', 'Artifact not found');
      }

      const result = await db.listRuns(artifact.id, {
        status: req.query.status as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        cursor: req.query.cursor as string | undefined,
      });

      // Strip internal fields
      const items = result.items.map(r => {
        const { callback_token_hash: _h, k8s_job_name: _j, k8s_namespace: _n, ...rest } = r;
        return rest;
      });

      res.json({ items, totalCount: result.totalCount, nextCursor: result.nextCursor });
    } catch (err) {
      logger.error('Failed to list runs', { error: String(err) });
      sendError(res, err);
    }
  });

  // Generate pipeline config (preview without creating a run)
  // MUST be before /v1/runs/:runId to avoid "generate-pipeline" matching as runId
  router.get('/v1/runs/generate-pipeline', async (req, res) => {
    try {
      const ciProvider = req.query.ci_provider as string;
      const operation = req.query.operation as string;
      const ns = req.query.namespace as string;
      const artifactName = req.query.name as string;

      if (!ciProvider || !operation || !ns || !artifactName) {
        throw badRequest('ci_provider, operation, namespace, and name are required');
      }

      const artifact = await db.getArtifact(ns, artifactName);
      if (!artifact) {
        throw notFound('ARTIFACT_NOT_FOUND', 'Artifact not found');
      }

      const callbackBaseUrl = config.getOptionalString('registry.iac.byoc.callbackBaseUrl')
        ?? config.getOptionalString('registry.baseUrl')
        ?? `${req.protocol}://${req.get('host')}`;

      const yaml = generatePipelineConfig(ciProvider, {
        runId: '<RUN_ID>',
        callbackBaseUrl: `${callbackBaseUrl}/api/registry`,
        operation,
        tfVersion: (req.query.tf_version as string) ?? '1.9.0',
        repositoryUrl: artifact.source_config?.repositoryUrl ?? 'https://github.com/org/repo',
        version: (req.query.version as string) ?? 'main',
        workingDirectory: req.query.working_directory as string | undefined,
      });

      res.json({ pipeline_config: yaml, ci_provider: ciProvider });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Get run detail
  router.get('/v1/runs/:runId', async (req, res) => {
    try {
      const run = await db.getRun(req.params.runId);
      if (!run) {
        throw notFound('RUN_NOT_FOUND', 'Run not found');
      }
      const { callback_token_hash: _h, k8s_job_name: _j, k8s_namespace: _n, ...runResponse } = run;
      res.json(runResponse);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Get run logs
  router.get('/v1/runs/:runId/logs', async (req, res) => {
    try {
      const run = await db.getRun(req.params.runId);
      if (!run) {
        throw notFound('RUN_NOT_FOUND', 'Run not found');
      }
      const after = req.query.after ? Number(req.query.after) : undefined;
      const logs = await db.getRunLogs(run.id, after);
      res.json({ logs });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Get run plan output
  router.get('/v1/runs/:runId/plan', async (req, res) => {
    try {
      const run = await db.getRun(req.params.runId);
      if (!run) {
        throw notFound('RUN_NOT_FOUND', 'Run not found');
      }
      // Try plan_text first, then plan_json
      const planText = await db.getRunOutput(run.id, 'plan_text');
      const planJson = await db.getRunOutput(run.id, 'plan_json');
      if (!planText && !planJson) {
        throw notFound('RUN_NOT_FOUND', 'No plan output available');
      }
      res.json({
        plan_text: planText?.content ?? null,
        plan_json: planJson?.content ?? null,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Cancel a run
  router.post('/v1/runs/:runId/cancel', async (req, res) => {
    try {
      await requirePermission(req, registryRunCancelPermission, permissions, httpAuth);
      requireMinRole(req, 'operator');

      const run = await db.getRun(req.params.runId);
      if (!run) {
        throw notFound('RUN_NOT_FOUND', 'Run not found');
      }
      if (['succeeded', 'failed', 'cancelled', 'timed_out', 'expired'].includes(run.status)) {
        throw badRequest(`Cannot cancel a run with status '${run.status}'`);
      }

      const updated = await db.updateRunStatus(run.id, 'cancelled', {
        completed_at: new Date().toISOString(),
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'run.cancelled',
        resource_type: 'run',
        resource_id: run.id,
        resource_namespace: run.artifact_namespace,
        resource_name: run.artifact_name,
      });

      const { callback_token_hash: _h, k8s_job_name: _j, k8s_namespace: _n, ...runResponse } = updated!;
      res.json(runResponse);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Confirm apply after successful plan
  router.post('/v1/runs/:runId/confirm', async (req, res) => {
    try {
      await requirePermission(req, registryRunConfirmPermission, permissions, httpAuth);
      requireMinRole(req, 'operator');

      const run = await db.getRun(req.params.runId);
      if (!run) {
        throw notFound('RUN_NOT_FOUND', 'Run not found');
      }
      if (run.status === 'expired') {
        res.status(410).json({ error: { message: 'Plan has expired', code: 'RUN_EXPIRED' } });
        return;
      }
      if (run.operation !== 'plan' || run.status !== 'succeeded') {
        throw badRequest('Can only confirm a succeeded plan run');
      }

      // Create a new apply run linked to the same artifact
      const applyRun = await db.createRun({
        artifact_id: run.artifact_id,
        version_id: run.version_id ?? undefined,
        artifact_namespace: run.artifact_namespace,
        artifact_name: run.artifact_name,
        version: run.version ?? undefined,
        operation: 'apply',
        mode: run.mode as any,
        triggered_by: req.registryUser?.email,
        team: run.team ?? undefined,
        ci_provider: run.ci_provider ?? undefined,
        tf_version: run.tf_version ?? undefined,
        env_vars: run.env_vars ?? undefined,
        working_directory: run.working_directory ?? undefined,
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'run.confirmed',
        resource_type: 'run',
        resource_id: run.id,
        resource_namespace: run.artifact_namespace,
        details: { applyRunId: applyRun.id },
      });

      const { callback_token_hash: _h, k8s_job_name: _j, k8s_namespace: _n, ...runResponse } = applyRun;
      res.status(201).json(runResponse);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── BYOC Callback Endpoints ─────────────────────────────────────────

  // Verify callback token middleware helper
  const verifyCallbackToken = async (req: express.Request, runId: string) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw unauthorized('Missing callback token');
    }
    const token = authHeader.slice(7);

    // Reject registry API tokens on callback endpoints
    if (token.startsWith('breg_')) {
      throw unauthorized('Registry API tokens cannot be used on callback endpoints');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const run = await db.getRun(runId);
    if (!run) {
      throw notFound('RUN_NOT_FOUND', 'Run not found');
    }
    if (run.callback_token_hash !== tokenHash) {
      throw unauthorized('Invalid callback token');
    }
    if (['cancelled', 'expired', 'timed_out'].includes(run.status)) {
      throw conflict('APPROVAL_DENIED', `Run is ${run.status} — updates rejected`);
    }
    return run;
  };

  // BYOC callback: update run status
  router.post('/v1/ci/runs/:runId/status', async (req, res) => {
    try {
      const run = await verifyCallbackToken(req, req.params.runId);

      const { status, exit_code, resources_to_add, resources_to_change, resources_to_destroy, plan_json, plan_text } = req.body;

      if (!status) {
        throw badRequest('status is required');
      }

      const now = new Date().toISOString();
      const startedAt = run.started_at ?? now;
      const completedAt = ['succeeded', 'failed'].includes(status) ? now : undefined;
      const durationMs = completedAt && run.started_at
        ? Math.round((new Date(completedAt).getTime() - new Date(run.started_at).getTime()) / 1000)
        : undefined;

      await db.updateRunStatus(run.id, status, {
        exit_code,
        resources_to_add,
        resources_to_change,
        resources_to_destroy,
        started_at: startedAt,
        completed_at: completedAt,
        duration_seconds: durationMs,
      });

      // Save outputs if provided
      if (plan_json) {
        await db.saveRunOutput({ run_id: run.id, output_type: 'plan_json', content: plan_json });
      }
      if (plan_text) {
        await db.saveRunOutput({ run_id: run.id, output_type: 'plan_text', content: plan_text });
      }

      logger.info('BYOC run status updated', { runId: run.id, status });
      res.json({ status: 'ok' });
    } catch (err) {
      sendError(res, err);
    }
  });

  // BYOC callback: append logs
  router.post('/v1/ci/runs/:runId/logs', async (req, res) => {
    try {
      await verifyCallbackToken(req, req.params.runId);

      const { logs } = req.body;
      if (!Array.isArray(logs) || logs.length === 0) {
        throw badRequest('logs array is required');
      }

      await db.appendRunLogs(req.params.runId, logs);
      res.json({ status: 'ok', count: logs.length });
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Webhook Sub-Router ───────────────────────────────────────────────

  router.use('/webhooks', createWebhookRoutes({ config, logger, db, cascadeManager }));

  // ── IaC Environment Sub-Routers ──────────────────────────────────────

  router.use(createEnvironmentRouter(options));
  router.use(createModuleRouter(options));
  router.use(createModuleRunRouter(options));
  router.use(createEnvironmentRunRouter(routerOptions));
  router.use(createModuleRunCallbackRouter(routerOptions));
  router.use(createCloudIntegrationRouter(options));
  router.use(createVariableSetRouter(options));
  router.use(createBindingRouter(options));
  router.use(createPolicyRouter(options));

  // Catch-all for unimplemented routes
  router.use((_req, res) => {
    res.status(404).json({
      error: {
        message: 'Not found',
        code: 'NOT_FOUND',
      },
    });
  });

  return router;
}
