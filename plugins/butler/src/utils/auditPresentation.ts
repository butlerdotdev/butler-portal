// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type { AuditEntry } from '../api/types/audit';

export type OutcomeTone = 'green' | 'yellow' | 'red' | 'neutral';

export interface Outcome {
  label: 'Succeeded' | 'Refused' | 'Rejected' | 'Failed' | 'Recorded';
  tone: OutcomeTone;
  detail: string;
}

/**
 * What the status code means for the person reading the log: a refusal
 * (the server said no to this caller) is not a failure (the server could
 * not do it), and neither is a rejection (the request was malformed or
 * in conflict).
 */
export function outcomeOf(entry: AuditEntry): Outcome {
  const code = entry.statusCode ?? (entry.success ? 200 : 0);
  if (entry.success) {
    return { label: 'Succeeded', tone: 'green', detail: `HTTP ${code}` };
  }
  if (code === 401 || code === 403) {
    return {
      label: 'Refused',
      tone: 'yellow',
      detail: `HTTP ${code}: the server refused this caller`,
    };
  }
  if (code >= 400 && code < 500) {
    return {
      label: 'Rejected',
      tone: 'yellow',
      detail: `HTTP ${code}${
        entry.errorMessage ? `: ${entry.errorMessage}` : ''
      }`,
    };
  }
  if (code >= 500) {
    return {
      label: 'Failed',
      tone: 'red',
      detail: `HTTP ${code}${
        entry.errorMessage ? `: ${entry.errorMessage}` : ''
      }`,
    };
  }
  return {
    label: 'Recorded',
    tone: 'neutral',
    detail: entry.errorMessage ?? '',
  };
}

export interface Described {
  /** Short verb phrase: "Added member", "Scaled cluster". */
  what: string;
  /** What it acted on: "nobody@example.com in platform-engineering", "ready-delta". */
  target: string;
  /** The server's resource type, humanised where the path says more than "Unknown". */
  kind: string;
  /** True when the sentence came from the bounded path table, false when it is the raw method and path. */
  humanised: boolean;
}

const VERB: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  scale: 'Scaled',
  export: 'Exported',
  'download-kubeconfig': 'Downloaded kubeconfig for',
  login: 'Signed in',
  logout: 'Signed out',
  'group-sync': 'Synchronised groups for',
  get: 'Read',
};

const KIND_LABEL: Record<string, string> = {
  TenantCluster: 'cluster',
  Team: 'team',
  User: 'user',
  ProviderConfig: 'provider',
  IdentityProvider: 'identity provider',
  NetworkPool: 'network pool',
  ManagementAddon: 'management addon',
  ImageSync: 'image sync',
  ButlerConfig: 'platform configuration',
  Observability: 'observability pipeline',
  GitOps: 'GitOps configuration',
  AddonDefinition: 'addon definition',
  IPAllocation: 'IP allocation',
  TenantAddon: 'addon',
  Workspace: 'workspace',
  Certificate: 'certificate',
};

/**
 * The bounded set of butler-server routes whose meaning the method alone
 * does not say. Each pattern is anchored to the router's real shape; a
 * path that matches none falls back to the server's own action and
 * resource type, and the raw method and path stay in the detail view.
 */
const PATTERNS: Array<{
  re: RegExp;
  what: Record<string, string>;
  target: (m: RegExpMatchArray, e: AuditEntry) => string;
  kind: string;
}> = [
  {
    re: /^\/api\/admin\/teams\/([^/]+)\/members\/([^/]+)$/,
    what: { PATCH: 'Changed member role', DELETE: 'Removed member' },
    target: m => `${decodeURIComponent(m[2])} in ${m[1]}`,
    kind: 'team member',
  },
  {
    re: /^\/api\/admin\/teams\/([^/]+)\/members$/,
    what: { POST: 'Added member' },
    target: (m, e) => `${summaryField(e, 'email') ?? 'a user'} to ${m[1]}`,
    kind: 'team member',
  },
  {
    re: /^\/api\/admin\/teams\/([^/]+)\/groups\/([^/]+)$/,
    what: { PATCH: 'Changed group role', DELETE: 'Removed group mapping' },
    target: m => `${decodeURIComponent(m[2])} on ${m[1]}`,
    kind: 'group mapping',
  },
  {
    re: /^\/api\/admin\/teams\/([^/]+)\/groups$/,
    what: { POST: 'Mapped group' },
    target: (m, e) => `${summaryField(e, 'name') ?? 'a group'} to ${m[1]}`,
    kind: 'group mapping',
  },
  {
    re: /^\/api\/admin\/teams\/([^/]+)$/,
    what: { DELETE: 'Deleted team' },
    target: m => m[1],
    kind: 'team',
  },
  {
    re: /^\/api\/admin\/teams$/,
    what: { POST: 'Created team' },
    target: (_m, e) => summaryField(e, 'name') ?? 'a team',
    kind: 'team',
  },
  {
    re: /^\/api\/teams\/([^/]+)\/environments\/([^/]+)$/,
    what: { PUT: 'Updated environment', DELETE: 'Deleted environment' },
    target: m => `${m[2]} in ${m[1]}`,
    kind: 'environment',
  },
  {
    re: /^\/api\/teams\/([^/]+)\/environments$/,
    what: { POST: 'Added environment' },
    target: (m, e) =>
      `${summaryField(e, 'name') ?? 'an environment'} to ${m[1]}`,
    kind: 'environment',
  },
  {
    re: /^\/api\/teams\/([^/]+)\/providers\/([^/]+)\/([^/]+)$/,
    what: { DELETE: 'Removed team provider' },
    target: m => `${m[3]} from ${m[1]}`,
    kind: 'provider',
  },
  {
    re: /^\/api\/teams\/([^/]+)\/providers$/,
    what: { POST: 'Connected team provider' },
    target: (m, e) => `${summaryField(e, 'name') ?? 'a provider'} to ${m[1]}`,
    kind: 'provider',
  },
  {
    re: /^\/api\/teams\/([^/]+)$/,
    what: { PUT: 'Updated team', DELETE: 'Deleted team' },
    target: m => m[1],
    kind: 'team',
  },
  {
    re: /^\/api\/clusters\/([^/]+)\/([^/]+)\/addons\/([^/]+)$/,
    what: { PUT: 'Updated addon', DELETE: 'Removed addon' },
    target: m => `${m[3]} on ${m[2]}`,
    kind: 'addon',
  },
  {
    re: /^\/api\/clusters\/([^/]+)\/([^/]+)\/addons$/,
    what: { POST: 'Installed addon' },
    target: (m, e) =>
      `${
        summaryField(e, 'addon') ?? summaryField(e, 'name') ?? 'an addon'
      } on ${m[2]}`,
    kind: 'addon',
  },
  {
    re: /^\/api\/clusters\/([^/]+)\/([^/]+)\/scale$/,
    what: { PATCH: 'Scaled workers' },
    target: (m, e) => {
      const n = summaryField(e, 'replicas');
      return n ? `${m[2]} to ${n}` : m[2];
    },
    kind: 'cluster',
  },
  {
    re: /^\/api\/clusters\/([^/]+)\/([^/]+)\/environment$/,
    what: { PUT: 'Moved cluster environment' },
    target: (m, e) => {
      const env = summaryField(e, 'environment');
      return env ? `${m[2]} to ${env}` : `${m[2]} (environment cleared)`;
    },
    kind: 'cluster',
  },
  {
    re: /^\/api\/clusters\/([^/]+)\/([^/]+)\/kubeconfig$/,
    what: { GET: 'Downloaded kubeconfig' },
    target: m => m[2],
    kind: 'cluster',
  },
  {
    re: /^\/api\/clusters\/([^/]+)\/([^/]+)\/export$/,
    what: { GET: 'Exported cluster YAML' },
    target: m => m[2],
    kind: 'cluster',
  },
  {
    re: /^\/api\/clusters\/([^/]+)\/([^/]+)$/,
    what: { PUT: 'Edited cluster', DELETE: 'Deleted cluster' },
    target: m => m[2],
    kind: 'cluster',
  },
  {
    re: /^\/api\/clusters$/,
    what: { POST: 'Created cluster' },
    target: (_m, e) => summaryField(e, 'name') ?? 'a cluster',
    kind: 'cluster',
  },
  {
    re: /^\/api\/providers\/([^/]+)\/([^/]+)\/validate$/,
    what: { POST: 'Validated provider' },
    target: m => m[2],
    kind: 'provider',
  },
  {
    re: /^\/api\/providers\/test$/,
    what: { POST: 'Tested provider credentials' },
    target: (_m, e) =>
      summaryField(e, 'name') ?? summaryField(e, 'provider') ?? '',
    kind: 'provider',
  },
  {
    re: /^\/api\/providers\/([^/]+)\/([^/]+)$/,
    what: { PUT: 'Updated provider', DELETE: 'Deleted provider' },
    target: m => m[2],
    kind: 'provider',
  },
  {
    re: /^\/api\/providers$/,
    what: { POST: 'Created provider' },
    target: (_m, e) => summaryField(e, 'name') ?? 'a provider',
    kind: 'provider',
  },
  {
    re: /^\/api\/admin\/identity-providers\/([^/]+)\/validate$/,
    what: { POST: 'Validated identity provider' },
    target: m => m[1],
    kind: 'identity provider',
  },
  {
    re: /^\/api\/admin\/identity-providers\/test$/,
    what: { POST: 'Tested identity provider discovery' },
    target: (_m, e) => summaryField(e, 'issuerURL') ?? '',
    kind: 'identity provider',
  },
  {
    re: /^\/api\/admin\/identity-providers\/([^/]+)$/,
    what: {
      PUT: 'Updated identity provider',
      DELETE: 'Deleted identity provider',
    },
    target: m => m[1],
    kind: 'identity provider',
  },
  {
    re: /^\/api\/admin\/identity-providers$/,
    what: { POST: 'Created identity provider' },
    target: (_m, e) => summaryField(e, 'name') ?? 'an identity provider',
    kind: 'identity provider',
  },
  {
    re: /^\/api\/admin\/users\/([^/]+)\/(disable|enable|invite)$/,
    what: { POST: '' },
    target: m => m[1],
    kind: 'user',
  },
  {
    re: /^\/api\/admin\/users\/([^/]+)$/,
    what: { DELETE: 'Deleted user' },
    target: m => m[1],
    kind: 'user',
  },
  {
    re: /^\/api\/admin\/users$/,
    what: { POST: 'Invited user' },
    target: (_m, e) => summaryField(e, 'email') ?? 'a user',
    kind: 'user',
  },
  {
    re: /^\/api\/admin\/observability\/pipeline\/setup$/,
    what: { POST: 'Registered observability pipeline' },
    target: (_m, e) => summaryField(e, 'clusterName') ?? '',
    kind: 'observability pipeline',
  },
  {
    re: /^\/api\/admin\/observability\/pipeline$/,
    what: { DELETE: 'Deregistered observability pipeline' },
    target: () => '',
    kind: 'observability pipeline',
  },
  {
    re: /^\/api\/admin\/observability\/config$/,
    what: { PUT: 'Updated observability configuration' },
    target: () => '',
    kind: 'observability pipeline',
  },
];

const USER_ACTIONS: Record<string, string> = {
  disable: 'Disabled user',
  enable: 'Enabled user',
  invite: 'Regenerated invite for',
};

function summaryField(entry: AuditEntry, key: string): string | undefined {
  if (!entry.requestSummary) return undefined;
  try {
    const parsed = JSON.parse(entry.requestSummary);
    const v = parsed?.[key];
    if (v === undefined || v === null || typeof v === 'object')
      return undefined;
    return String(v);
  } catch {
    return undefined;
  }
}

export function describeEntry(entry: AuditEntry): Described {
  const method = entry.httpMethod ?? '';
  const path = entry.path ?? '';
  if (entry.action === 'login') {
    return {
      what: 'Signed in',
      target: entry.provider ? `via ${entry.provider}` : '',
      kind: 'session',
      humanised: true,
    };
  }
  if (entry.action === 'logout') {
    return { what: 'Signed out', target: '', kind: 'session', humanised: true };
  }
  if (entry.action === 'group-sync') {
    return {
      what: 'Synchronised groups',
      target: '',
      kind: 'session',
      humanised: true,
    };
  }
  for (const p of PATTERNS) {
    const m = path.match(p.re);
    if (!m) continue;
    let what = p.what[method];
    if (p.kind === 'user' && m[2] && USER_ACTIONS[m[2]])
      what = USER_ACTIONS[m[2]];
    if (what === undefined) continue;
    return { what, target: p.target(m, entry), kind: p.kind, humanised: true };
  }
  const kindKey =
    entry.resourceType && entry.resourceType !== 'Unknown'
      ? entry.resourceType
      : '';
  const kind = kindKey ? KIND_LABEL[kindKey] ?? kindKey : 'request';
  const verb = VERB[entry.action] ?? entry.action;
  const target = entry.resourceName
    ? entry.resourceNamespace
      ? `${entry.resourceNamespace}/${entry.resourceName}`
      : entry.resourceName
    : path.replace(/^\/api/, '');
  return {
    what: kindKey
      ? `${verb} ${kind}`
      : `${method} ${path.replace(/^\/api/, '')}`.trim(),
    target: kindKey ? target : '',
    kind,
    humanised: Boolean(kindKey),
  };
}

const SENSITIVE_KEY =
  /(secret|password|passwd|token|kubeconfig|credential|privatekey|apikey|accesskey|serviceaccount|cabundle|certificate)/i;

/**
 * The server scrubs an exact list of keys ("password", "token",
 * "kubeconfig", ...). Butler's own request bodies use prefixed keys such
 * as `harvesterKubeconfig`, `nutanixPassword`, `proxmoxTokenSecret`,
 * `azureClientSecret` and `gcpServiceAccount`, which that list does not
 * match, so a provider creation can leave its credential in the stored
 * summary. That is a server finding; this redaction is the page's own
 * guarantee that no such value is rendered, whatever the server stored.
 */
export function redactSummary(summary: string | undefined): string | undefined {
  if (!summary) return undefined;
  try {
    const parsed = JSON.parse(summary);
    const walk = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : walk(val);
        }
        return out;
      }
      return v;
    };
    return JSON.stringify(walk(parsed), null, 2);
  } catch {
    // Not JSON: the server stored a truncated raw body. Never render it.
    return '[not shown: request body was not JSON]';
  }
}

/** Fixed vocabularies for the filter controls, from the server's resolvers. */
export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'scale',
  'export',
  'download-kubeconfig',
  'login',
  'logout',
  'group-sync',
] as const;

export const AUDIT_RESOURCE_TYPES = [
  'TenantCluster',
  'TenantAddon',
  'Team',
  'User',
  'ProviderConfig',
  'IdentityProvider',
  'NetworkPool',
  'IPAllocation',
  'ManagementAddon',
  'ImageSync',
  'ButlerConfig',
  'Observability',
  'GitOps',
  'AddonDefinition',
  'Workspace',
  'Certificate',
  'Unknown',
] as const;
