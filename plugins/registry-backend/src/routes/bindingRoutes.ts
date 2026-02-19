// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import Router from 'express-promise-router';
import { sendError, notFound, badRequest, assertTeamAccess } from '../util/errors';
import type { RouterOptions } from '../router';

export function createBindingRouter(options: RouterOptions) {
  const { db } = options;
  const router = Router();

  // ── Environment Cloud Integration Bindings ──────────────────────────

  // List env cloud integrations
  router.get(
    '/v1/environments/:envId/cloud-integrations',
    async (req, res) => {
      try {
        const env = await db.getEnvironment(req.params.envId);
        if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
        assertTeamAccess(env, req.activeTeam);

        const rows = await db.listEnvCloudIntegrations(req.params.envId);
        const bindings = rows.map(r => ({
          id: r.binding_id,
          cloud_integration_id: r.id,
          integration_name: r.name,
          provider: r.provider,
          auth_method: r.auth_method,
          priority: r.priority,
        }));
        res.json({ bindings });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // Bind cloud integration to env
  router.post(
    '/v1/environments/:envId/cloud-integrations',
    async (req, res) => {
      try {
        const env = await db.getEnvironment(req.params.envId);
        if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
        assertTeamAccess(env, req.activeTeam);

        const { cloud_integration_id, priority } = req.body;
        if (!cloud_integration_id) {
          throw badRequest('cloud_integration_id is required');
        }

        const integration = await db.getCloudIntegration(cloud_integration_id);
        if (!integration) {
          throw notFound(
            'INTEGRATION_NOT_FOUND',
            'Cloud integration not found',
          );
        }

        const binding = await db.bindCloudIntegrationToEnv(
          req.params.envId,
          cloud_integration_id,
          priority,
        );

        await db.writeAuditLog({
          actor: req.registryUser?.email ?? 'unknown',
          action: 'cloud_integration.bound_to_env',
          resource_type: 'cloud_integration_binding',
          resource_id: binding.id,
          resource_name: integration.name,
          details: { environment_id: req.params.envId, priority },
        });

        res.status(201).json(binding);
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // Unbind cloud integration from env
  router.delete(
    '/v1/environments/:envId/cloud-integrations/:bindingId',
    async (req, res) => {
      try {
        const env = await db.getEnvironment(req.params.envId);
        if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
        assertTeamAccess(env, req.activeTeam);

        await db.unbindCloudIntegrationFromEnv(req.params.bindingId);

        await db.writeAuditLog({
          actor: req.registryUser?.email ?? 'unknown',
          action: 'cloud_integration.unbound_from_env',
          resource_type: 'cloud_integration_binding',
          resource_id: req.params.bindingId,
          details: { environment_id: req.params.envId },
        });

        res.status(204).end();
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // ── Environment Variable Set Bindings ───────────────────────────────

  // List env variable sets
  router.get('/v1/environments/:envId/variable-sets', async (req, res) => {
    try {
      const env = await db.getEnvironment(req.params.envId);
      if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
      assertTeamAccess(env, req.activeTeam);

      const rows = await db.listEnvVariableSets(req.params.envId);
      const bindings = rows.map(r => ({
        id: r.binding_id,
        variable_set_id: r.id,
        set_name: r.name,
        priority: r.priority,
      }));
      res.json({ bindings });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Bind variable set to env
  router.post('/v1/environments/:envId/variable-sets', async (req, res) => {
    try {
      const env = await db.getEnvironment(req.params.envId);
      if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
      assertTeamAccess(env, req.activeTeam);

      const { variable_set_id, priority } = req.body;
      if (!variable_set_id) {
        throw badRequest('variable_set_id is required');
      }

      const variableSet = await db.getVariableSet(variable_set_id);
      if (!variableSet) {
        throw notFound('VARIABLE_SET_NOT_FOUND', 'Variable set not found');
      }

      const binding = await db.bindVariableSetToEnv(
        req.params.envId,
        variable_set_id,
        priority,
      );

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'variable_set.bound_to_env',
        resource_type: 'variable_set_binding',
        resource_id: binding.id,
        resource_name: variableSet.name,
        details: { environment_id: req.params.envId, priority },
      });

      res.status(201).json(binding);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Unbind variable set from env
  router.delete(
    '/v1/environments/:envId/variable-sets/:bindingId',
    async (req, res) => {
      try {
        const env = await db.getEnvironment(req.params.envId);
        if (!env) throw notFound('ARTIFACT_NOT_FOUND', 'Environment not found');
        assertTeamAccess(env, req.activeTeam);

        await db.unbindVariableSetFromEnv(req.params.bindingId);

        await db.writeAuditLog({
          actor: req.registryUser?.email ?? 'unknown',
          action: 'variable_set.unbound_from_env',
          resource_type: 'variable_set_binding',
          resource_id: req.params.bindingId,
          details: { environment_id: req.params.envId },
        });

        res.status(204).end();
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // ── Module Cloud Integration Bindings ───────────────────────────────

  // List module cloud integrations
  router.get(
    '/v1/environments/:envId/modules/:moduleId/cloud-integrations',
    async (req, res) => {
      try {
        const mod = await db.getModule(req.params.moduleId);
        if (!mod || mod.environment_id !== req.params.envId) {
          throw notFound('RUN_NOT_FOUND', 'Module not found');
        }
        const env = await db.getEnvironment(req.params.envId);
        assertTeamAccess(env, req.activeTeam);

        const rows = await db.listModuleCloudIntegrations(
          req.params.moduleId,
        );
        const bindings = rows.map(r => ({
          id: r.binding_id,
          cloud_integration_id: r.id,
          integration_name: r.name,
          provider: r.provider,
          auth_method: r.auth_method,
          priority: r.priority,
        }));
        res.json({ bindings });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // Bind cloud integration to module
  router.post(
    '/v1/environments/:envId/modules/:moduleId/cloud-integrations',
    async (req, res) => {
      try {
        const mod = await db.getModule(req.params.moduleId);
        if (!mod || mod.environment_id !== req.params.envId) {
          throw notFound('RUN_NOT_FOUND', 'Module not found');
        }
        const env = await db.getEnvironment(req.params.envId);
        assertTeamAccess(env, req.activeTeam);

        const { cloud_integration_id, priority } = req.body;
        if (!cloud_integration_id) {
          throw badRequest('cloud_integration_id is required');
        }

        const integration = await db.getCloudIntegration(cloud_integration_id);
        if (!integration) {
          throw notFound(
            'INTEGRATION_NOT_FOUND',
            'Cloud integration not found',
          );
        }

        const binding = await db.bindCloudIntegrationToModule(
          req.params.moduleId,
          cloud_integration_id,
          priority,
        );

        await db.writeAuditLog({
          actor: req.registryUser?.email ?? 'unknown',
          action: 'cloud_integration.bound_to_module',
          resource_type: 'cloud_integration_binding',
          resource_id: binding.id,
          resource_name: integration.name,
          details: {
            module_id: req.params.moduleId,
            environment_id: req.params.envId,
            priority,
          },
        });

        res.status(201).json(binding);
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // Unbind cloud integration from module
  router.delete(
    '/v1/environments/:envId/modules/:moduleId/cloud-integrations/:bindingId',
    async (req, res) => {
      try {
        const mod = await db.getModule(req.params.moduleId);
        if (!mod || mod.environment_id !== req.params.envId) {
          throw notFound('RUN_NOT_FOUND', 'Module not found');
        }
        const env = await db.getEnvironment(req.params.envId);
        assertTeamAccess(env, req.activeTeam);

        await db.unbindCloudIntegrationFromModule(req.params.bindingId);

        await db.writeAuditLog({
          actor: req.registryUser?.email ?? 'unknown',
          action: 'cloud_integration.unbound_from_module',
          resource_type: 'cloud_integration_binding',
          resource_id: req.params.bindingId,
          details: {
            module_id: req.params.moduleId,
            environment_id: req.params.envId,
          },
        });

        res.status(204).end();
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // ── Module Variable Set Bindings ────────────────────────────────────

  // List module variable sets
  router.get(
    '/v1/environments/:envId/modules/:moduleId/variable-sets',
    async (req, res) => {
      try {
        const mod = await db.getModule(req.params.moduleId);
        if (!mod || mod.environment_id !== req.params.envId) {
          throw notFound('RUN_NOT_FOUND', 'Module not found');
        }
        const env = await db.getEnvironment(req.params.envId);
        assertTeamAccess(env, req.activeTeam);

        const rows = await db.listModuleVariableSets(req.params.moduleId);
        const bindings = rows.map(r => ({
          id: r.binding_id,
          variable_set_id: r.id,
          set_name: r.name,
          priority: r.priority,
        }));
        res.json({ bindings });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // Bind variable set to module
  router.post(
    '/v1/environments/:envId/modules/:moduleId/variable-sets',
    async (req, res) => {
      try {
        const mod = await db.getModule(req.params.moduleId);
        if (!mod || mod.environment_id !== req.params.envId) {
          throw notFound('RUN_NOT_FOUND', 'Module not found');
        }
        const env = await db.getEnvironment(req.params.envId);
        assertTeamAccess(env, req.activeTeam);

        const { variable_set_id, priority } = req.body;
        if (!variable_set_id) {
          throw badRequest('variable_set_id is required');
        }

        const variableSet = await db.getVariableSet(variable_set_id);
        if (!variableSet) {
          throw notFound('VARIABLE_SET_NOT_FOUND', 'Variable set not found');
        }

        const binding = await db.bindVariableSetToModule(
          req.params.moduleId,
          variable_set_id,
          priority,
        );

        await db.writeAuditLog({
          actor: req.registryUser?.email ?? 'unknown',
          action: 'variable_set.bound_to_module',
          resource_type: 'variable_set_binding',
          resource_id: binding.id,
          resource_name: variableSet.name,
          details: {
            module_id: req.params.moduleId,
            environment_id: req.params.envId,
            priority,
          },
        });

        res.status(201).json(binding);
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // Unbind variable set from module
  router.delete(
    '/v1/environments/:envId/modules/:moduleId/variable-sets/:bindingId',
    async (req, res) => {
      try {
        const mod = await db.getModule(req.params.moduleId);
        if (!mod || mod.environment_id !== req.params.envId) {
          throw notFound('RUN_NOT_FOUND', 'Module not found');
        }
        const env = await db.getEnvironment(req.params.envId);
        assertTeamAccess(env, req.activeTeam);

        await db.unbindVariableSetFromModule(req.params.bindingId);

        await db.writeAuditLog({
          actor: req.registryUser?.email ?? 'unknown',
          action: 'variable_set.unbound_from_module',
          resource_type: 'variable_set_binding',
          resource_id: req.params.bindingId,
          details: {
            module_id: req.params.moduleId,
            environment_id: req.params.envId,
          },
        });

        res.status(204).end();
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  // ── Resolved Variables Preview ──────────────────────────────────────

  // Preview merged variables for a module (cloud integration env vars +
  // variable set entries + module variables), with sensitive masking.
  router.get(
    '/v1/environments/:envId/modules/:moduleId/resolved-vars',
    async (req, res) => {
      try {
        const mod = await db.getModule(req.params.moduleId);
        if (!mod || mod.environment_id !== req.params.envId) {
          throw notFound('RUN_NOT_FOUND', 'Module not found');
        }
        const env = await db.getEnvironment(req.params.envId);
        assertTeamAccess(env, req.activeTeam);

        // Gather all three layers
        const [effectiveIntegrations, effectiveVarSets, moduleVariables] =
          await Promise.all([
            db.getEffectiveCloudIntegrations(
              req.params.moduleId,
              req.params.envId,
            ),
            db.getEffectiveVariableSets(
              req.params.moduleId,
              req.params.envId,
            ),
            db.listModuleVariables(req.params.moduleId),
          ]);

        // Build merged map: later layers override earlier ones.
        // Layer 1: cloud integration env vars (lowest priority)
        const merged = new Map<
          string,
          {
            key: string;
            value: string | null;
            source: string;
            sensitive: boolean;
            category: 'terraform' | 'env';
          }
        >();

        for (const integration of effectiveIntegrations) {
          const envVars =
            integration.credential_config?.envVars ??
            integration.credential_config?.env_vars ??
            {};
          for (const [key, value] of Object.entries(envVars)) {
            merged.set(key, {
              key,
              value: value as string,
              source: `cloud-integration:${integration.name ?? integration.id}`,
              sensitive: true,
              category: 'env',
            });
          }
        }

        // Layer 2: variable set entries (override cloud integrations)
        for (const varSet of effectiveVarSets) {
          const entries = await db.listVariableSetEntries(varSet.id);
          for (const entry of entries) {
            merged.set(entry.key, {
              key: entry.key,
              value: entry.value,
              source: `variable-set:${varSet.name ?? varSet.id}`,
              sensitive: entry.sensitive ?? false,
              category: entry.category ?? 'terraform',
            });
          }
        }

        // Layer 3: module variables (highest priority)
        for (const variable of moduleVariables) {
          merged.set(variable.key, {
            key: variable.key,
            value: variable.value,
            source: 'module',
            sensitive: variable.sensitive ?? false,
            category: variable.category ?? 'terraform',
          });
        }

        // Mask sensitive values
        const resolved = Array.from(merged.values()).map(v => ({
          ...v,
          value: v.sensitive ? null : v.value,
        }));

        res.json({ variables: resolved });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  return router;
}
