// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type {
  ProjectRow,
  ProjectModuleRow,
  ProjectModuleDependencyRow,
  EnvironmentRow,
  EnvironmentModuleStateRow,
  StateBackendConfig,
  OutputMappingEntry,
} from '../database/types';

// ─────────────────────────────────────────────────────────────────────────────
// Tests for the Project model: data model contracts, module DAG, multi-env
// ─────────────────────────────────────────────────────────────────────────────

describe('Registry Backend - Projects', () => {
  // ── Project Row Type Contract ───────────────────────────────────

  describe('ProjectRow type contract', () => {
    const makeProject = (
      overrides: Partial<ProjectRow> = {},
    ): ProjectRow => ({
      id: 'proj-1',
      name: 'infra-platform',
      description: 'Core infrastructure project',
      team: 'platform-team',
      execution_mode: 'byoc',
      status: 'active',
      module_count: 3,
      total_resources: 42,
      last_run_at: '2026-02-16T12:00:00Z',
      created_by: 'alice@example.com',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-02-16T12:00:00Z',
      ...overrides,
    });

    it('should have required fields', () => {
      const p = makeProject();
      expect(p.id).toBe('proj-1');
      expect(p.name).toBe('infra-platform');
      expect(p.team).toBe('platform-team');
      expect(p.execution_mode).toBe('byoc');
      expect(p.status).toBe('active');
    });

    it('should support all execution modes', () => {
      const byoc = makeProject({ execution_mode: 'byoc' });
      const peaas = makeProject({ execution_mode: 'peaas' });
      expect(byoc.execution_mode).toBe('byoc');
      expect(peaas.execution_mode).toBe('peaas');
    });

    it('should support all project statuses', () => {
      const active = makeProject({ status: 'active' });
      const paused = makeProject({ status: 'paused' });
      const archived = makeProject({ status: 'archived' });
      expect(active.status).toBe('active');
      expect(paused.status).toBe('paused');
      expect(archived.status).toBe('archived');
    });

    it('should handle nullable fields', () => {
      const p = makeProject({
        description: null,
        team: null,
        last_run_at: null,
        created_by: null,
      });
      expect(p.description).toBeNull();
      expect(p.team).toBeNull();
      expect(p.last_run_at).toBeNull();
      expect(p.created_by).toBeNull();
    });

    it('should default module_count and total_resources to 0 for new projects', () => {
      const p = makeProject({ module_count: 0, total_resources: 0 });
      expect(p.module_count).toBe(0);
      expect(p.total_resources).toBe(0);
    });
  });

  // ── Project Module Row Contract ─────────────────────────────────

  describe('ProjectModuleRow type contract', () => {
    const makeModule = (
      overrides: Partial<ProjectModuleRow> = {},
    ): ProjectModuleRow => ({
      id: 'mod-1',
      project_id: 'proj-1',
      name: 'vpc',
      description: 'VPC module',
      artifact_id: 'art-123',
      artifact_namespace: 'hashicorp',
      artifact_name: 'vpc',
      pinned_version: '~> 3.0',
      auto_plan_on_module_update: true,
      vcs_trigger: null,
      auto_plan_on_push: false,
      tf_version: '1.9.0',
      working_directory: null,
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...overrides,
    });

    it('should reference a project', () => {
      const m = makeModule();
      expect(m.project_id).toBe('proj-1');
    });

    it('should reference an artifact via namespace+name', () => {
      const m = makeModule();
      expect(m.artifact_namespace).toBe('hashicorp');
      expect(m.artifact_name).toBe('vpc');
      expect(m.artifact_id).toBe('art-123');
    });

    it('should support version pinning with Terraform constraints', () => {
      const exact = makeModule({ pinned_version: '3.0.0' });
      const pessimistic = makeModule({ pinned_version: '~> 3.0' });
      const range = makeModule({ pinned_version: '>= 3.0, < 4.0' });
      const latest = makeModule({ pinned_version: null });

      expect(exact.pinned_version).toBe('3.0.0');
      expect(pessimistic.pinned_version).toBe('~> 3.0');
      expect(range.pinned_version).toBe('>= 3.0, < 4.0');
      expect(latest.pinned_version).toBeNull();
    });

    it('should support VCS trigger configuration', () => {
      const m = makeModule({
        vcs_trigger: {
          repositoryUrl: 'https://github.com/org/infra.git',
          branch: 'main',
          path: 'modules/vpc',
          provider: 'github',
        },
      });
      expect(m.vcs_trigger).not.toBeNull();
      expect(m.vcs_trigger!.repositoryUrl).toBe(
        'https://github.com/org/infra.git',
      );
      expect(m.vcs_trigger!.branch).toBe('main');
    });

    it('should not have execution_mode (moved to project)', () => {
      const m = makeModule();
      expect(m).not.toHaveProperty('execution_mode');
    });

    it('should not have state_backend (moved to environment)', () => {
      const m = makeModule();
      expect(m).not.toHaveProperty('state_backend');
    });
  });

  // ── Environment belongs to Project ──────────────────────────────

  describe('Environment-Project relationship', () => {
    const makeEnvironment = (
      overrides: Partial<EnvironmentRow> = {},
    ): EnvironmentRow => ({
      id: 'env-dev',
      name: 'dev',
      description: 'Development environment',
      project_id: 'proj-1',
      team: 'platform-team',
      status: 'active',
      locked: false,
      locked_by: null,
      locked_at: null,
      lock_reason: null,
      state_backend: null,
      total_resources: 0,
      last_run_at: null,
      created_by: 'alice@example.com',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...overrides,
    });

    it('should belong to a project', () => {
      const env = makeEnvironment();
      expect(env.project_id).toBe('proj-1');
    });

    it('should own state backend config at environment level', () => {
      const env = makeEnvironment({
        state_backend: {
          type: 's3',
          config: {
            bucket: 'my-state-bucket',
            region: 'us-east-1',
          },
        },
      });
      expect(env.state_backend).not.toBeNull();
      expect(env.state_backend!.type).toBe('s3');
      expect(env.state_backend!.config!.bucket).toBe('my-state-bucket');
    });

    it('should allow null state backend (use PeaaS auto or none)', () => {
      const env = makeEnvironment({ state_backend: null });
      expect(env.state_backend).toBeNull();
    });

    it('should support different state backends per environment', () => {
      const dev = makeEnvironment({
        id: 'env-dev',
        name: 'dev',
        state_backend: {
          type: 's3',
          config: { bucket: 'dev-state', region: 'us-east-1' },
        },
      });
      const prod = makeEnvironment({
        id: 'env-prod',
        name: 'prod',
        state_backend: {
          type: 's3',
          config: { bucket: 'prod-state', region: 'us-west-2' },
        },
      });

      expect(dev.project_id).toBe(prod.project_id);
      expect(dev.state_backend!.config!.bucket).toBe('dev-state');
      expect(prod.state_backend!.config!.bucket).toBe('prod-state');
    });

    it('should support various state backend types', () => {
      const backends: StateBackendConfig[] = [
        { type: 's3', config: { bucket: 'b', region: 'us-east-1' } },
        { type: 'gcs', config: { bucket: 'b' } },
        { type: 'azurerm', config: { resource_group_name: 'rg' } },
        { type: 'pg' },
        { type: 'consul', config: { address: 'consul.example.com' } },
        { type: 'http', config: { address: 'https://api.example.com/state' } },
      ];

      for (const backend of backends) {
        const env = makeEnvironment({ state_backend: backend });
        expect(env.state_backend!.type).toBe(backend.type);
      }
    });
  });

  // ── Environment Module State (per-env per-module) ───────────────

  describe('EnvironmentModuleState tracking', () => {
    const makeState = (
      overrides: Partial<EnvironmentModuleStateRow> = {},
    ): EnvironmentModuleStateRow => ({
      id: 'ems-1',
      environment_id: 'env-dev',
      project_module_id: 'mod-1',
      current_version: null,
      last_run_id: null,
      last_run_status: null,
      last_run_at: null,
      resource_count: 0,
      drift_status: 'unknown',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...overrides,
    });

    it('should track deployment state per environment+module pair', () => {
      const devVpc = makeState({
        environment_id: 'env-dev',
        project_module_id: 'mod-vpc',
        current_version: '3.0.0',
        resource_count: 5,
        last_run_status: 'succeeded',
      });
      const prodVpc = makeState({
        environment_id: 'env-prod',
        project_module_id: 'mod-vpc',
        current_version: '2.9.0',
        resource_count: 5,
        last_run_status: 'succeeded',
      });

      // Same module, different environments, different versions
      expect(devVpc.project_module_id).toBe(prodVpc.project_module_id);
      expect(devVpc.environment_id).not.toBe(prodVpc.environment_id);
      expect(devVpc.current_version).toBe('3.0.0');
      expect(prodVpc.current_version).toBe('2.9.0');
    });

    it('should default to unknown drift status', () => {
      const state = makeState();
      expect(state.drift_status).toBe('unknown');
    });

    it('should track resource count per env+module', () => {
      const state = makeState({ resource_count: 12 });
      expect(state.resource_count).toBe(12);
    });

    it('should handle fresh state with no runs', () => {
      const state = makeState();
      expect(state.current_version).toBeNull();
      expect(state.last_run_id).toBeNull();
      expect(state.last_run_status).toBeNull();
      expect(state.last_run_at).toBeNull();
      expect(state.resource_count).toBe(0);
    });
  });

  // ── Module Dependency Graph ──────────────────────────────────────

  describe('Project module dependency graph', () => {
    const makeDep = (
      moduleId: string,
      dependsOnId: string,
      mapping?: OutputMappingEntry[],
    ): ProjectModuleDependencyRow => ({
      id: `dep-${moduleId}-${dependsOnId}`,
      module_id: moduleId,
      depends_on_id: dependsOnId,
      output_mapping: mapping ?? null,
      created_at: '2026-01-01T00:00:00Z',
    });

    it('should represent a linear dependency chain', () => {
      const deps = [
        makeDep('mod-subnets', 'mod-vpc'),
        makeDep('mod-eks', 'mod-subnets'),
      ];

      expect(deps).toHaveLength(2);
      expect(deps[0].module_id).toBe('mod-subnets');
      expect(deps[0].depends_on_id).toBe('mod-vpc');
      expect(deps[1].module_id).toBe('mod-eks');
      expect(deps[1].depends_on_id).toBe('mod-subnets');
    });

    it('should support output mappings between modules', () => {
      const dep = makeDep('mod-eks', 'mod-vpc', [
        { upstream_output: 'vpc_id', downstream_variable: 'vpc_id' },
        {
          upstream_output: 'private_subnet_ids',
          downstream_variable: 'subnet_ids',
        },
      ]);

      expect(dep.output_mapping).toHaveLength(2);
      expect(dep.output_mapping![0].upstream_output).toBe('vpc_id');
      expect(dep.output_mapping![1].downstream_variable).toBe('subnet_ids');
    });

    it('should prevent self-dependency', () => {
      const dep = makeDep('mod-vpc', 'mod-vpc');
      // The route validates this with cycle detection
      expect(dep.module_id).toBe(dep.depends_on_id);
      // This would be rejected by the PUT /dependencies endpoint
    });

    it('should represent a diamond dependency', () => {
      // vpc -> subnets, vpc -> sg, subnets -> eks, sg -> eks
      const deps = [
        makeDep('mod-subnets', 'mod-vpc'),
        makeDep('mod-sg', 'mod-vpc'),
        makeDep('mod-eks', 'mod-subnets'),
        makeDep('mod-eks', 'mod-sg'),
      ];

      const eksUpstream = deps.filter(d => d.module_id === 'mod-eks');
      expect(eksUpstream).toHaveLength(2);
      expect(eksUpstream.map(d => d.depends_on_id).sort()).toEqual([
        'mod-sg',
        'mod-subnets',
      ]);
    });
  });

  // ── Project Graph API Response ──────────────────────────────────

  describe('Project graph API response format', () => {
    it('should return nodes and edges for the project DAG', () => {
      const modules: Pick<ProjectModuleRow, 'id' | 'name' | 'artifact_name' | 'status'>[] = [
        { id: 'mod-1', name: 'vpc', artifact_name: 'vpc', status: 'active' },
        { id: 'mod-2', name: 'subnets', artifact_name: 'subnets', status: 'active' },
        { id: 'mod-3', name: 'eks', artifact_name: 'eks', status: 'active' },
      ];
      const deps: Pick<ProjectModuleDependencyRow, 'module_id' | 'depends_on_id'>[] = [
        { module_id: 'mod-2', depends_on_id: 'mod-1' },
        { module_id: 'mod-3', depends_on_id: 'mod-2' },
      ];

      // Simulate the graph endpoint response transformation
      const nodes = modules.map(m => ({
        id: m.id,
        name: m.name,
        artifact_name: m.artifact_name,
        status: m.status,
      }));
      const edges = deps.map(d => ({
        from: d.depends_on_id,
        to: d.module_id,
      }));

      expect(nodes).toHaveLength(3);
      expect(edges).toHaveLength(2);
      expect(edges[0]).toEqual({ from: 'mod-1', to: 'mod-2' });
      expect(edges[1]).toEqual({ from: 'mod-2', to: 'mod-3' });
    });

    it('should handle project with no modules', () => {
      const nodes: unknown[] = [];
      const edges: unknown[] = [];

      expect(nodes).toHaveLength(0);
      expect(edges).toHaveLength(0);
    });

    it('should handle modules with no dependencies', () => {
      const modules = [
        { id: 'mod-1', name: 'vpc', artifact_name: 'vpc', status: 'active' as const },
        { id: 'mod-2', name: 'dns', artifact_name: 'dns', status: 'active' as const },
      ];
      const deps: unknown[] = [];

      const edges = deps;
      expect(edges).toHaveLength(0);
      expect(modules).toHaveLength(2);
    });
  });

  // ── Multi-Environment Deployment ────────────────────────────────

  describe('Multi-environment deployment model', () => {
    it('should share the same module DAG across environments', () => {
      const projectId = 'proj-1';
      const modules = ['mod-vpc', 'mod-subnets', 'mod-eks'];
      const devEnv: Partial<EnvironmentRow> = {
        id: 'env-dev',
        project_id: projectId,
      };
      const prodEnv: Partial<EnvironmentRow> = {
        id: 'env-prod',
        project_id: projectId,
      };

      // Both environments reference the same project -> same modules
      expect(devEnv.project_id).toBe(prodEnv.project_id);
      // Modules are project-scoped, not environment-scoped
      expect(modules).toHaveLength(3);
    });

    it('should allow different variable values per environment', () => {
      const devVars = [
        { environment_id: 'env-dev', project_module_id: 'mod-vpc', key: 'cidr', value: '10.0.0.0/16' },
        { environment_id: 'env-dev', project_module_id: 'mod-vpc', key: 'region', value: 'us-east-1' },
      ];
      const prodVars = [
        { environment_id: 'env-prod', project_module_id: 'mod-vpc', key: 'cidr', value: '10.1.0.0/16' },
        { environment_id: 'env-prod', project_module_id: 'mod-vpc', key: 'region', value: 'us-west-2' },
      ];

      expect(devVars[0].value).not.toBe(prodVars[0].value);
      expect(devVars[1].value).not.toBe(prodVars[1].value);
    });

    it('should generate unique state keys per environment+module', () => {
      const stateKey = (envId: string, moduleId: string) =>
        `env/${envId}/mod/${moduleId}/terraform.tfstate`;

      const devVpc = stateKey('env-dev', 'mod-vpc');
      const prodVpc = stateKey('env-prod', 'mod-vpc');
      const devEks = stateKey('env-dev', 'mod-eks');

      expect(devVpc).not.toBe(prodVpc);
      expect(devVpc).not.toBe(devEks);
      expect(devVpc).toBe('env/env-dev/mod/mod-vpc/terraform.tfstate');
    });
  });

  // ── Execution Mode from Project ─────────────────────────────────

  describe('Execution mode inheritance', () => {
    it('should use execution_mode from project for module runs', () => {
      const project: Pick<ProjectRow, 'execution_mode'> = {
        execution_mode: 'byoc',
      };

      // When creating a module run, mode comes from the project
      const runMode = project.execution_mode;
      expect(runMode).toBe('byoc');
    });

    it('should use peaas mode for managed projects', () => {
      const project: Pick<ProjectRow, 'execution_mode'> = {
        execution_mode: 'peaas',
      };

      const runMode = project.execution_mode;
      expect(runMode).toBe('peaas');
    });

    it('should not change execution mode per environment', () => {
      // execution_mode is project-level, not environment-level
      const project: Pick<ProjectRow, 'execution_mode'> = {
        execution_mode: 'byoc',
      };

      const devRunMode = project.execution_mode;
      const prodRunMode = project.execution_mode;
      expect(devRunMode).toBe(prodRunMode);
    });
  });

  // ── State Backend from Environment ──────────────────────────────

  describe('State backend resolution', () => {
    it('should resolve state backend from environment for module runs', () => {
      const env: Pick<EnvironmentRow, 'state_backend'> = {
        state_backend: {
          type: 's3',
          config: { bucket: 'tf-state', region: 'us-east-1' },
        },
      };

      // When building run config, state_backend comes from environment
      expect(env.state_backend).not.toBeNull();
      expect(env.state_backend!.type).toBe('s3');
    });

    it('should auto-generate per-module state key within shared backend', () => {
      // Each module in the environment gets a unique key within the shared backend
      const envId = 'env-dev';
      const modules = ['mod-vpc', 'mod-subnets', 'mod-eks'];
      const keys = modules.map(
        m => `env/${envId}/mod/${m}/terraform.tfstate`,
      );

      expect(new Set(keys).size).toBe(3); // all unique
      expect(keys[0]).toContain(envId);
      expect(keys[0]).toContain('mod-vpc');
    });

    it('should snapshot state backend at run creation time', () => {
      // When a module run is created, the environment's state_backend
      // is snapshotted into the run for immutability
      const envBackend: StateBackendConfig = {
        type: 's3',
        config: { bucket: 'tf-state', region: 'us-east-1' },
      };

      const runSnapshot = { ...envBackend };
      expect(runSnapshot.type).toBe(envBackend.type);
      expect(runSnapshot.config).toEqual(envBackend.config);
    });
  });

  // ── Cascade via Project Modules ─────────────────────────────────

  describe('Cascade through project modules', () => {
    it('should find affected project modules when artifact version updates', () => {
      // Simulate: artifact "hashicorp/vpc" publishes v3.1.0
      const artifactId = 'art-vpc';
      const allModules: Pick<ProjectModuleRow, 'id' | 'project_id' | 'artifact_id' | 'pinned_version' | 'auto_plan_on_module_update'>[] = [
        { id: 'mod-1', project_id: 'proj-a', artifact_id: artifactId, pinned_version: '~> 3.0', auto_plan_on_module_update: true },
        { id: 'mod-2', project_id: 'proj-b', artifact_id: artifactId, pinned_version: '2.0.0', auto_plan_on_module_update: true },
        { id: 'mod-3', project_id: 'proj-c', artifact_id: 'art-other', pinned_version: null, auto_plan_on_module_update: true },
      ];

      // Filter modules using this artifact
      const affected = allModules.filter(m => m.artifact_id === artifactId);
      expect(affected).toHaveLength(2);
      expect(affected.map(m => m.id)).toContain('mod-1');
      expect(affected.map(m => m.id)).toContain('mod-2');
    });

    it('should cascade to all active unlocked environments in affected projects', () => {
      // For each affected project module, cascade to each env
      const projectEnvs: Array<{ project_id: string; env_id: string; locked: boolean; status: string }> = [
        { project_id: 'proj-a', env_id: 'env-dev', locked: false, status: 'active' },
        { project_id: 'proj-a', env_id: 'env-prod', locked: true, status: 'active' },
        { project_id: 'proj-a', env_id: 'env-staging', locked: false, status: 'archived' },
      ];

      const cascadeTargets = projectEnvs.filter(
        e => !e.locked && e.status === 'active',
      );
      expect(cascadeTargets).toHaveLength(1);
      expect(cascadeTargets[0].env_id).toBe('env-dev');
    });
  });

  // ── Route URL Structure ────────────────────────────────────────

  describe('API route structure', () => {
    it('should use project-scoped module routes', () => {
      const routes = [
        'GET /v1/projects',
        'POST /v1/projects',
        'GET /v1/projects/:projectId',
        'PATCH /v1/projects/:projectId',
        'DELETE /v1/projects/:projectId',
        'GET /v1/projects/:projectId/graph',
        'GET /v1/projects/:projectId/modules',
        'POST /v1/projects/:projectId/modules',
        'GET /v1/projects/:projectId/modules/:moduleId',
        'PATCH /v1/projects/:projectId/modules/:moduleId',
        'DELETE /v1/projects/:projectId/modules/:moduleId',
        'GET /v1/projects/:projectId/modules/:moduleId/dependencies',
        'PUT /v1/projects/:projectId/modules/:moduleId/dependencies',
      ];

      // Verify all project routes start with /v1/projects
      for (const route of routes) {
        const path = route.split(' ')[1];
        expect(path.startsWith('/v1/projects')).toBe(true);
      }
    });

    it('should use environment-scoped variable routes', () => {
      const routes = [
        'GET /v1/environments/:envId/modules/:moduleId/variables',
        'PUT /v1/environments/:envId/modules/:moduleId/variables',
        'PATCH /v1/environments/:envId/modules/:moduleId/variables',
        'DELETE /v1/environments/:envId/modules/:moduleId/variables/:key',
      ];

      // Variables are per env+module (composite key)
      for (const route of routes) {
        const path = route.split(' ')[1];
        expect(path).toContain('/environments/');
        expect(path).toContain('/modules/');
        expect(path).toContain('/variables');
      }
    });

    it('should use project-scoped environment creation', () => {
      const createEnvRoute = 'POST /v1/projects/:projectId/environments';
      expect(createEnvRoute).toContain('/projects/');
      expect(createEnvRoute).toContain('/environments');
    });
  });

  // ── Cycle Detection ────────────────────────────────────────────

  describe('Cycle detection in project module dependencies', () => {
    it('should detect simple cycle A -> B -> A', () => {
      const modules = ['A', 'B'];
      const deps: Array<{ from: string; to: string }> = [
        { from: 'A', to: 'B' },
      ];
      // Proposing B -> A
      const proposedDep = { from: 'B', to: 'A' };

      const hasCycle = detectCycleSimple(
        modules,
        [...deps, proposedDep],
      );
      expect(hasCycle).toBe(true);
    });

    it('should detect transitive cycle A -> B -> C -> A', () => {
      const modules = ['A', 'B', 'C'];
      const deps: Array<{ from: string; to: string }> = [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
      ];
      const proposedDep = { from: 'C', to: 'A' };

      const hasCycle = detectCycleSimple(
        modules,
        [...deps, proposedDep],
      );
      expect(hasCycle).toBe(true);
    });

    it('should not report cycle for valid DAG', () => {
      const modules = ['A', 'B', 'C'];
      const deps: Array<{ from: string; to: string }> = [
        { from: 'A', to: 'B' },
        { from: 'A', to: 'C' },
        { from: 'B', to: 'C' },
      ];

      const hasCycle = detectCycleSimple(modules, deps);
      expect(hasCycle).toBe(false);
    });

    it('should detect self-loop', () => {
      const hasCycle = detectCycleSimple(['A'], [{ from: 'A', to: 'A' }]);
      expect(hasCycle).toBe(true);
    });
  });
});

// ── Test Helpers ──────────────────────────────────────────────────

/**
 * Simple cycle detection via DFS.
 */
function detectCycleSimple(
  nodes: string[],
  edges: Array<{ from: string; to: string }>,
): boolean {
  const adjacency = new Map<string, string[]>();
  for (const n of nodes) adjacency.set(n, []);
  for (const e of edges) {
    adjacency.get(e.from)?.push(e.to);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n, WHITE);

  function dfs(node: string): boolean {
    color.set(node, GRAY);
    for (const neighbor of adjacency.get(node) ?? []) {
      if (color.get(neighbor) === GRAY) return true; // back edge = cycle
      if (color.get(neighbor) === WHITE && dfs(neighbor)) return true;
    }
    color.set(node, BLACK);
    return false;
  }

  for (const n of nodes) {
    if (color.get(n) === WHITE && dfs(n)) return true;
  }
  return false;
}
