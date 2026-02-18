// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import Router from 'express-promise-router';
import { sendError, notFound, badRequest, assertTeamAccess, forbidden, requireMinRole } from '../util/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  registryVariableSetCreatePermission,
  registryVariableSetUpdatePermission,
  registryVariableSetDeletePermission,
} from '@internal/plugin-registry-common';
import type { RouterOptions } from '../router';

export function createVariableSetRouter(options: RouterOptions) {
  const { db, httpAuth, permissions } = options;
  const router = Router();

  // ── Variable Set CRUD ───────────────────────────────────────────────

  // List variable sets
  router.get('/v1/variable-sets', async (req, res) => {
    try {
      const team = req.activeTeam;
      const result = await db.listVariableSets({ team });
      res.json({ variableSets: result });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Create variable set
  router.post('/v1/variable-sets', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryVariableSetCreatePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'operator');

      const { name, description, auto_attach } = req.body;
      if (!name) throw badRequest('name is required');

      const variableSet = await db.createVariableSet({
        name,
        description,
        auto_attach,
        created_by: req.registryUser?.email,
        team: req.activeTeam,
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'variable_set.created',
        resource_type: 'variable_set',
        resource_id: variableSet.id,
        resource_name: variableSet.name,
      });

      res.status(201).json(variableSet);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Get variable set detail
  router.get('/v1/variable-sets/:id', async (req, res) => {
    try {
      const variableSet = await db.getVariableSet(req.params.id);
      if (!variableSet) {
        throw notFound('VARIABLE_SET_NOT_FOUND', 'Variable set not found');
      }
      assertTeamAccess(variableSet, req.activeTeam);
      res.json(variableSet);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Update variable set metadata
  router.patch('/v1/variable-sets/:id', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryVariableSetUpdatePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'operator');

      const variableSet = await db.getVariableSet(req.params.id);
      if (!variableSet) {
        throw notFound('VARIABLE_SET_NOT_FOUND', 'Variable set not found');
      }
      assertTeamAccess(variableSet, req.activeTeam);

      const { name, description, auto_attach } = req.body;
      const updated = await db.updateVariableSet(req.params.id, {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(auto_attach !== undefined ? { auto_attach } : {}),
      });

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'variable_set.updated',
        resource_type: 'variable_set',
        resource_id: variableSet.id,
        resource_name: variableSet.name,
        details: { fields: Object.keys(req.body) },
      });

      res.json(updated);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Delete variable set
  router.delete('/v1/variable-sets/:id', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryVariableSetDeletePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'admin');

      const variableSet = await db.getVariableSet(req.params.id);
      if (!variableSet) {
        throw notFound('VARIABLE_SET_NOT_FOUND', 'Variable set not found');
      }
      assertTeamAccess(variableSet, req.activeTeam);

      await db.deleteVariableSet(req.params.id);

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'variable_set.deleted',
        resource_type: 'variable_set',
        resource_id: variableSet.id,
        resource_name: variableSet.name,
      });

      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── Variable Set Entries ────────────────────────────────────────────

  // List entries (mask sensitive values)
  router.get('/v1/variable-sets/:id/entries', async (req, res) => {
    try {
      const variableSet = await db.getVariableSet(req.params.id);
      if (!variableSet) {
        throw notFound('VARIABLE_SET_NOT_FOUND', 'Variable set not found');
      }
      assertTeamAccess(variableSet, req.activeTeam);

      const entries = await db.listVariableSetEntries(req.params.id);
      const masked = entries.map(e => ({
        ...e,
        value: e.sensitive ? null : e.value,
      }));
      res.json({ entries: masked });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Bulk upsert entries
  router.put('/v1/variable-sets/:id/entries', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryVariableSetUpdatePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'operator');

      const variableSet = await db.getVariableSet(req.params.id);
      if (!variableSet) {
        throw notFound('VARIABLE_SET_NOT_FOUND', 'Variable set not found');
      }
      assertTeamAccess(variableSet, req.activeTeam);

      const { entries } = req.body;
      if (!Array.isArray(entries)) {
        throw badRequest('entries array is required');
      }

      const result = await db.upsertVariableSetEntries(req.params.id, entries);
      const masked = result.map(e => ({
        ...e,
        value: e.sensitive ? null : e.value,
      }));

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'variable_set.entries_updated',
        resource_type: 'variable_set',
        resource_id: variableSet.id,
        resource_name: variableSet.name,
        details: { entry_count: entries.length },
      });

      res.json({ entries: masked });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Delete entry
  router.delete('/v1/variable-sets/:id/entries/:key', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const [decision] = await permissions.authorize([{ permission: registryVariableSetDeletePermission }], { credentials });
      if (decision.result !== AuthorizeResult.ALLOW) throw forbidden('Permission denied');
      requireMinRole(req, 'admin');

      const variableSet = await db.getVariableSet(req.params.id);
      if (!variableSet) {
        throw notFound('VARIABLE_SET_NOT_FOUND', 'Variable set not found');
      }
      assertTeamAccess(variableSet, req.activeTeam);

      const category = ((req.query.category as string) ?? 'terraform') as 'terraform' | 'env';
      await db.deleteVariableSetEntry(req.params.id, req.params.key, category);

      await db.writeAuditLog({
        actor: req.registryUser?.email ?? 'unknown',
        action: 'variable_set.entry_deleted',
        resource_type: 'variable_set',
        resource_id: variableSet.id,
        resource_name: variableSet.name,
        details: { key: req.params.key, category },
      });

      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
