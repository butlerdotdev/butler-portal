// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import Router from 'express-promise-router';
import { sendError, badRequest } from '../util/errors';
import type { RouterOptions } from '../router';

/**
 * Temporary admin seed endpoint for creating demo data.
 * Protected by X-Seed-Token header. Remove after use.
 */
export function createSeedRouter(options: RouterOptions) {
  const { db, logger } = options;
  const router = Router();

  router.post('/_admin/seed/landing-zone', async (req, res) => {
    try {
      const token = req.headers['x-seed-token'];
      if (token !== 'butlerlabs-seed-2026') {
        throw badRequest('Invalid seed token');
      }

      const results: Record<string, unknown> = {};

      // ── 1. Create Artifacts ────────────────────────────────────────

      const artifactDefs = [
        {
          namespace: 'butlerlabs',
          name: 'gcp-api-enablement',
          provider: 'google',
          type: 'terraform-module' as const,
          description: 'Enable required GCP APIs for a project. Uses google_project_service resources.',
          storage_config: {
            backend: 'git' as const,
            repositoryUrl: 'https://github.com/terraform-google-modules/terraform-google-project-factory',
            path: 'modules/project_services',
            tagPrefix: 'v',
          },
          category: 'foundation',
          tags: ['gcp', 'foundation', 'api'],
          inputs: [
            { name: 'project_id', type: 'string', description: 'GCP project ID', required: true },
            { name: 'activate_apis', type: 'list(string)', description: 'List of APIs to enable', required: true },
            { name: 'disable_services_on_destroy', type: 'bool', description: 'Whether to disable APIs on destroy', required: false, default: 'false' },
          ],
          outputs: [
            { name: 'project_id', description: 'The project ID' },
            { name: 'enabled_apis', description: 'List of enabled APIs' },
          ],
        },
        {
          namespace: 'butlerlabs',
          name: 'gcp-runner-iam',
          provider: 'google',
          type: 'terraform-module' as const,
          description: 'Grant permanent IAM roles to service accounts. Uses google_project_iam_member resources.',
          storage_config: {
            backend: 'git' as const,
            repositoryUrl: 'https://github.com/terraform-google-modules/terraform-google-iam',
            path: 'modules/projects_iam',
            tagPrefix: 'v',
          },
          category: 'foundation',
          tags: ['gcp', 'foundation', 'iam'],
          inputs: [
            { name: 'project', type: 'string', description: 'GCP project ID', required: true },
            { name: 'bindings', type: 'map(list(string))', description: 'IAM role bindings: role => [members]', required: true },
          ],
          outputs: [
            { name: 'members', description: 'Members that were granted roles' },
            { name: 'roles', description: 'Roles that were granted' },
          ],
        },
        {
          namespace: 'butlerlabs',
          name: 'gcp-state-backend',
          provider: 'google',
          type: 'terraform-module' as const,
          description: 'GCS bucket for Terraform remote state with versioning and lifecycle rules.',
          storage_config: {
            backend: 'git' as const,
            repositoryUrl: 'https://github.com/terraform-google-modules/terraform-google-cloud-storage',
            path: '',
            tagPrefix: 'v',
          },
          category: 'foundation',
          tags: ['gcp', 'foundation', 'state'],
          inputs: [
            { name: 'project_id', type: 'string', description: 'GCP project ID', required: true },
            { name: 'names', type: 'list(string)', description: 'Bucket names', required: true },
            { name: 'location', type: 'string', description: 'GCS bucket location', required: true },
            { name: 'prefix', type: 'string', description: 'Bucket name prefix', required: false, default: '' },
            { name: 'versioning', type: 'map(bool)', description: 'Enable versioning per bucket', required: false },
            { name: 'force_destroy', type: 'map(bool)', description: 'Allow destroying non-empty buckets', required: false },
          ],
          outputs: [
            { name: 'names', description: 'Bucket names' },
            { name: 'urls', description: 'Bucket URLs' },
            { name: 'names_list', description: 'List of bucket names' },
          ],
        },
      ];

      const artifacts: Record<string, { id: string }> = {};

      for (const def of artifactDefs) {
        // Check if artifact already exists
        const existing = await db.getArtifact(def.namespace, def.name);
        if (existing) {
          artifacts[def.name] = { id: existing.id };
          logger.info(`Artifact ${def.namespace}/${def.name} already exists, skipping`);
          continue;
        }

        const artifact = await db.createArtifact({
          namespace: def.namespace,
          name: def.name,
          provider: def.provider,
          type: def.type,
          description: def.description,
          team: 'platform-engineering',
          storage_config: def.storage_config,
          category: def.category,
          tags: def.tags,
          created_by: 'seed@butlerlabs.dev',
        });
        artifacts[def.name] = { id: artifact.id };

        // Publish v1.0.0
        const version = await db.createVersion({
          artifact_id: artifact.id,
          version: '1.0.0',
          version_major: 1,
          version_minor: 0,
          version_patch: 0,
          published_by: 'seed@butlerlabs.dev',
          changelog: 'Initial release',
          terraform_metadata: {
            inputs: def.inputs,
            outputs: def.outputs,
            providers: [{ name: 'google', version_constraint: '>= 5.0' }],
          },
        });

        // Auto-approve
        await db.approveVersion(version.id, 'seed@butlerlabs.dev');

        logger.info(`Created artifact ${def.namespace}/${def.name} with v1.0.0`);
      }

      results.artifacts = Object.keys(artifacts);

      // ── 2. Create Project ──────────────────────────────────────────

      // Check if project already exists
      const existingProjects = await db.listProjects({ team: 'platform-engineering' });
      let project = existingProjects.items.find(p => p.name === 'butlerlabs-landing-zone');

      if (!project) {
        project = await db.createProject({
          name: 'butlerlabs-landing-zone',
          description: 'GCP foundation: API enablement, runner IAM, and state backend. Applied once, rarely changed.',
          team: 'platform-engineering',
          execution_mode: 'byoc',
          created_by: 'seed@butlerlabs.dev',
        });
        logger.info('Created project butlerlabs-landing-zone');
      } else {
        logger.info('Project butlerlabs-landing-zone already exists, skipping');
      }

      results.project = { id: project.id, name: project.name };

      // ── 3. Add Modules ─────────────────────────────────────────────

      const existingModules = await db.listProjectModules(project.id);
      const moduleMap: Record<string, string> = {};

      const moduleDefs = [
        {
          name: 'api-enablement',
          description: 'Enable required GCP APIs (compute, IAM, storage, etc.)',
          artifact_namespace: 'butlerlabs',
          artifact_name: 'gcp-api-enablement',
          tf_version: '>= 1.5.0',
          working_directory: 'modules/api-enablement',
        },
        {
          name: 'runner-iam',
          description: 'Permanent IAM roles for butler-runner service account',
          artifact_namespace: 'butlerlabs',
          artifact_name: 'gcp-runner-iam',
          tf_version: '>= 1.5.0',
          working_directory: 'modules/runner-iam',
        },
        {
          name: 'state-backend',
          description: 'GCS bucket for Terraform remote state with versioning',
          artifact_namespace: 'butlerlabs',
          artifact_name: 'gcp-state-backend',
          tf_version: '>= 1.5.0',
          working_directory: 'modules/state-backend',
        },
      ];

      for (const def of moduleDefs) {
        const existing = existingModules.find(m => m.name === def.name);
        if (existing) {
          moduleMap[def.name] = existing.id;
          logger.info(`Module ${def.name} already exists, skipping`);
          continue;
        }

        const artifact = await db.getArtifact(def.artifact_namespace, def.artifact_name);
        if (!artifact) {
          throw new Error(`Artifact ${def.artifact_namespace}/${def.artifact_name} not found`);
        }

        const mod = await db.addProjectModule(project.id, {
          ...def,
          artifact_id: artifact.id,
        });
        moduleMap[def.name] = mod.id;
        logger.info(`Added module ${def.name} to project`);
      }

      results.modules = moduleMap;

      // ── 4. Set Dependencies ────────────────────────────────────────

      const apiEnablementId = moduleMap['api-enablement'];

      // runner-iam depends on api-enablement
      if (moduleMap['runner-iam'] && apiEnablementId) {
        await db.setProjectModuleDependencies(moduleMap['runner-iam'], [
          {
            depends_on_id: apiEnablementId,
            output_mapping: [
              { upstream_output: 'project_id', downstream_variable: 'project' },
            ],
          },
        ]);
        logger.info('Set dependency: runner-iam → api-enablement');
      }

      // state-backend depends on api-enablement
      if (moduleMap['state-backend'] && apiEnablementId) {
        await db.setProjectModuleDependencies(moduleMap['state-backend'], [
          {
            depends_on_id: apiEnablementId,
            output_mapping: [
              { upstream_output: 'project_id', downstream_variable: 'project_id' },
            ],
          },
        ]);
        logger.info('Set dependency: state-backend → api-enablement');
      }

      results.dependencies = [
        'runner-iam → api-enablement',
        'state-backend → api-enablement',
      ];

      // ── 5. Create Environment ──────────────────────────────────────

      const existingEnvs = await db.listEnvironments({ projectId: project.id });
      let env = existingEnvs.items.find(e => e.name === 'management');

      if (!env) {
        env = await db.createEnvironment(project.id, {
          name: 'management',
          description: 'GCP foundation environment — applied once per project lifecycle',
          team: 'platform-engineering',
          state_backend: {
            type: 'gcs',
            config: {
              bucket: 'butlerlabs-tf-state',
              prefix: 'landing-zone/management',
            },
          },
          created_by: 'seed@butlerlabs.dev',
        });
        logger.info('Created environment: management');
      } else {
        logger.info('Environment management already exists, skipping');
      }

      results.environment = { id: env.id, name: env.name };

      // ── 6. Set Variables ───────────────────────────────────────────

      const gcpProject = 'helical-apricot-484216-b1';
      const runnerSA = `butler-runner@${gcpProject}.iam.gserviceaccount.com`;

      // api-enablement variables
      if (moduleMap['api-enablement']) {
        await db.upsertModuleVariables(env.id, moduleMap['api-enablement'], [
          {
            key: 'project_id',
            value: gcpProject,
            sensitive: false,
            hcl: false,
            category: 'terraform',
            description: 'GCP project ID',
          },
          {
            key: 'activate_apis',
            value: JSON.stringify([
              'compute.googleapis.com',
              'iam.googleapis.com',
              'cloudresourcemanager.googleapis.com',
              'storage.googleapis.com',
              'servicenetworking.googleapis.com',
              'container.googleapis.com',
              'dns.googleapis.com',
              'logging.googleapis.com',
              'monitoring.googleapis.com',
            ]),
            sensitive: false,
            hcl: true,
            category: 'terraform',
            description: 'GCP APIs to enable',
          },
          {
            key: 'disable_services_on_destroy',
            value: 'false',
            sensitive: false,
            hcl: false,
            category: 'terraform',
            description: 'Do not disable APIs on destroy (safety)',
          },
        ]);
        logger.info('Set variables for api-enablement');
      }

      // runner-iam variables
      if (moduleMap['runner-iam']) {
        await db.upsertModuleVariables(env.id, moduleMap['runner-iam'], [
          {
            key: 'project',
            value: gcpProject,
            sensitive: false,
            hcl: false,
            category: 'terraform',
            description: 'GCP project ID',
          },
          {
            key: 'bindings',
            value: JSON.stringify({
              'roles/compute.networkAdmin': [`serviceAccount:${runnerSA}`],
              'roles/resourcemanager.projectIamAdmin': [`serviceAccount:${runnerSA}`],
              'roles/storage.admin': [`serviceAccount:${runnerSA}`],
              'roles/compute.viewer': [`serviceAccount:${runnerSA}`],
              'roles/iam.serviceAccountUser': [`serviceAccount:${runnerSA}`],
            }),
            sensitive: false,
            hcl: true,
            category: 'terraform',
            description: 'IAM bindings: role => [members]',
          },
        ]);
        logger.info('Set variables for runner-iam');
      }

      // state-backend variables
      if (moduleMap['state-backend']) {
        await db.upsertModuleVariables(env.id, moduleMap['state-backend'], [
          {
            key: 'project_id',
            value: gcpProject,
            sensitive: false,
            hcl: false,
            category: 'terraform',
            description: 'GCP project ID',
          },
          {
            key: 'names',
            value: '["butlerlabs-tf-state"]',
            sensitive: false,
            hcl: true,
            category: 'terraform',
            description: 'State bucket name',
          },
          {
            key: 'location',
            value: 'us-central1',
            sensitive: false,
            hcl: false,
            category: 'terraform',
            description: 'GCS bucket location',
          },
          {
            key: 'versioning',
            value: '{"butlerlabs-tf-state" = true}',
            sensitive: false,
            hcl: true,
            category: 'terraform',
            description: 'Enable versioning for state bucket',
          },
          {
            key: 'force_destroy',
            value: '{"butlerlabs-tf-state" = false}',
            sensitive: false,
            hcl: true,
            category: 'terraform',
            description: 'Prevent accidental destruction of state bucket',
          },
        ]);
        logger.info('Set variables for state-backend');
      }

      results.variables = 'set for all modules';

      logger.info('Landing zone seed complete');
      res.status(201).json({ status: 'created', ...results });
    } catch (err) {
      logger.error('Landing zone seed failed', { error: String(err) });
      sendError(res, err);
    }
  });

  return router;
}
