// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import Router from 'express-promise-router';
import {
  sendError,
  notFound,
  badRequest,
  requireMinRole,
} from '../util/errors';
import { resolveEffectivePolicy } from '../governance/policyResolver';
import type { RouterOptions } from '../router';
import type { EnforcementLevel, PolicyScopeType } from '../database/types';

const VALID_ENFORCEMENT_LEVELS = ['block', 'warn', 'audit'];
const VALID_SCOPE_TYPES = ['global', 'team', 'namespace', 'artifact'];

export function createPolicyRouter(options: RouterOptions) {
  const { db } = options;
  const router = Router();

  // ── Policy Template CRUD ──────────────────────────────────────────

  // List policy templates
  router.get('/v1/policies', async (req, res) => {
    try {
      const team = req.activeTeam;
      const templates = await db.listPolicyTemplates({ team: team ?? undefined });
      res.json({ policies: templates });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Create policy template
  router.post('/v1/policies', async (req, res) => {
    try {
      requireMinRole(req, 'admin');

      const { name, description, enforcement_level, rules, team } = req.body;

      if (!name) throw badRequest('name is required');
      if (!rules || typeof rules !== 'object') throw badRequest('rules is required');
      if (enforcement_level && !VALID_ENFORCEMENT_LEVELS.includes(enforcement_level)) {
        throw badRequest(`enforcement_level must be one of: ${VALID_ENFORCEMENT_LEVELS.join(', ')}`);
      }

      const template = await db.createPolicyTemplate({
        name,
        description,
        enforcement_level: (enforcement_level as EnforcementLevel) || 'block',
        rules,
        team: req.activeTeam ?? team,
        created_by: req.registryUser?.email,
      });

      res.status(201).json(template);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Get policy template
  router.get('/v1/policies/:id', async (req, res) => {
    try {
      const template = await db.getPolicyTemplate(req.params.id);
      if (!template) throw notFound('POLICY_NOT_FOUND', 'Policy template not found');
      res.json(template);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Update policy template
  router.put('/v1/policies/:id', async (req, res) => {
    try {
      requireMinRole(req, 'admin');

      const existing = await db.getPolicyTemplate(req.params.id);
      if (!existing) throw notFound('POLICY_NOT_FOUND', 'Policy template not found');

      const { name, description, enforcement_level, rules } = req.body;

      if (enforcement_level && !VALID_ENFORCEMENT_LEVELS.includes(enforcement_level)) {
        throw badRequest(`enforcement_level must be one of: ${VALID_ENFORCEMENT_LEVELS.join(', ')}`);
      }

      const updated = await db.updatePolicyTemplate(req.params.id, {
        name,
        description,
        enforcement_level: enforcement_level as EnforcementLevel | undefined,
        rules,
      });

      res.json(updated);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Delete policy template (cascades to bindings)
  router.delete('/v1/policies/:id', async (req, res) => {
    try {
      requireMinRole(req, 'admin');

      const deleted = await db.deletePolicyTemplate(req.params.id);
      if (!deleted) throw notFound('POLICY_NOT_FOUND', 'Policy template not found');

      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Policy Bindings ───────────────────────────────────────────────

  // List bindings for a policy template
  router.get('/v1/policies/:id/bindings', async (req, res) => {
    try {
      const template = await db.getPolicyTemplate(req.params.id);
      if (!template) throw notFound('POLICY_NOT_FOUND', 'Policy template not found');

      const bindings = await db.listPolicyBindings(req.params.id);
      res.json({ bindings });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Create binding
  router.post('/v1/policies/:id/bindings', async (req, res) => {
    try {
      requireMinRole(req, 'admin');

      const template = await db.getPolicyTemplate(req.params.id);
      if (!template) throw notFound('POLICY_NOT_FOUND', 'Policy template not found');

      const { scope_type, scope_value } = req.body;

      if (!scope_type || !VALID_SCOPE_TYPES.includes(scope_type)) {
        throw badRequest(`scope_type must be one of: ${VALID_SCOPE_TYPES.join(', ')}`);
      }
      if (scope_type !== 'global' && !scope_value) {
        throw badRequest('scope_value is required for non-global scopes');
      }

      const binding = await db.createPolicyBinding({
        policy_template_id: req.params.id,
        scope_type: scope_type as PolicyScopeType,
        scope_value: scope_type === 'global' ? undefined : scope_value,
        created_by: req.registryUser?.email,
      });

      res.status(201).json(binding);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Delete binding
  router.delete('/v1/policies/:id/bindings/:bindingId', async (req, res) => {
    try {
      requireMinRole(req, 'admin');

      const deleted = await db.deletePolicyBinding(req.params.bindingId);
      if (!deleted) throw notFound('BINDING_NOT_FOUND', 'Policy binding not found');

      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Effective Policy ──────────────────────────────────────────────

  // Get resolved effective policy for an artifact
  router.get('/v1/artifacts/:namespace/:name/effective-policy', async (req, res) => {
    try {
      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) throw notFound('ARTIFACT_NOT_FOUND', 'Artifact not found');

      const effective = await resolveEffectivePolicy(db, {
        id: artifact.id,
        namespace: artifact.namespace,
        team: artifact.team,
        approval_policy: artifact.approval_policy,
      });

      res.json(effective);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Policy Evaluations ────────────────────────────────────────────

  // List recent evaluations for an artifact
  router.get('/v1/artifacts/:namespace/:name/evaluations', async (req, res) => {
    try {
      const artifact = await db.getArtifact(req.params.namespace, req.params.name);
      if (!artifact) throw notFound('ARTIFACT_NOT_FOUND', 'Artifact not found');

      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const outcome = req.query.outcome as string | undefined;

      const evaluations = await db.listPolicyEvaluations({
        artifact_id: artifact.id,
        outcome: outcome as any,
        limit,
      });

      res.json({ evaluations });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
