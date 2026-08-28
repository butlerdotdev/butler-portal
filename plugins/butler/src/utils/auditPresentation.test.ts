// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { fixtureAuditEntries } from '../api/fixtures/clusters';
import { describeEntry, outcomeOf, redactSummary } from './auditPresentation';

const by = (path: string, method?: string) =>
  fixtureAuditEntries.find(
    e => e.path === path && (!method || e.httpMethod === method),
  )!;

describe('describeEntry', () => {
  it('turns the bounded router shapes into sentences', () => {
    expect(
      describeEntry(by('/api/admin/teams/platform/members', 'POST')),
    ).toMatchObject({
      what: 'Added member',
      target: 'nobody@example.com to platform',
      humanised: true,
    });
    expect(
      describeEntry(by('/api/admin/teams/platform/groups/e2e-parity-nogroup')),
    ).toMatchObject({
      what: 'Removed group mapping',
      target: 'e2e-parity-nogroup on platform',
    });
    expect(
      describeEntry(by('/api/clusters/team-platform/ready-delta/scale')),
    ).toMatchObject({
      what: 'Scaled workers',
      target: 'ready-delta to 4',
    });
    expect(
      describeEntry(
        by('/api/clusters/team-platform/ready-delta/addons/vector-agent'),
      ),
    ).toMatchObject({
      what: 'Removed addon',
      target: 'vector-agent on ready-delta',
    });
    expect(describeEntry(by('/api/teams/platform'))).toMatchObject({
      what: 'Updated team',
      target: 'platform',
    });
    expect(
      describeEntry(fixtureAuditEntries.find(e => e.action === 'login')!),
    ).toMatchObject({
      what: 'Signed in',
      target: 'via butlerlabs',
    });
  });

  it('falls back to the server vocabulary, and to the raw request when the server has none', () => {
    expect(
      describeEntry({
        timestamp: 't',
        user: 'u',
        action: 'update',
        resourceType: 'NetworkPool',
        resourceName: 'vlan40',
        resourceNamespace: 'butler-system',
        httpMethod: 'PUT',
        path: '/api/admin/networks/butler-system/vlan40/something-new',
        success: true,
      }),
    ).toMatchObject({
      what: 'Updated network pool',
      target: 'butler-system/vlan40',
      humanised: true,
    });
    expect(
      describeEntry({
        timestamp: 't',
        user: 'u',
        action: 'create',
        resourceType: 'Unknown',
        httpMethod: 'POST',
        path: '/api/something/odd',
        success: true,
      }),
    ).toMatchObject({ what: 'POST /something/odd', humanised: false });
  });
});

describe('outcomeOf', () => {
  it('separates refused from rejected from failed', () => {
    expect(outcomeOf(by('/api/teams/platform')).label).toBe('Refused');
    expect(
      outcomeOf(by('/api/clusters/team-platform/ready-delta/scale')).label,
    ).toBe('Failed');
    expect(
      outcomeOf({
        timestamp: 't',
        user: 'u',
        action: 'create',
        statusCode: 409,
        success: false,
      }).label,
    ).toBe('Rejected');
    expect(
      outcomeOf(by('/api/admin/teams/platform/members', 'POST')).label,
    ).toBe('Succeeded');
  });
});

describe('redactSummary', () => {
  it('redacts prefixed credential keys the server scrubber misses', () => {
    const out = redactSummary(by('/api/providers', 'POST').requestSummary)!;
    expect(out).toContain('"harvesterKubeconfig": "[REDACTED]"');
    expect(out).not.toContain('apiVersion: v1');
    expect(out).toContain('"name": "e2e-provider-probe"');
  });

  it('never renders a non-JSON body', () => {
    expect(redactSummary('raw text with secret=abc')).toBe(
      '[not shown: request body was not JSON]',
    );
    expect(redactSummary(undefined)).toBeUndefined();
  });
});
