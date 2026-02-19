// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import crypto from 'crypto';
import {
  verifyWebhookSignature,
  parseGitHubPushEvent,
  parseGitLabPushEvent,
  parseBitbucketPushEvent,
} from '../webhooks/signatureVerifier';
import type { VcsProvider } from '../webhooks/signatureVerifier';

// ─────────────────────────────────────────────────────────────────────────────
// Tests for Webhook Signature Verification & Push Event Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal Express-like request object for signature verification.
 * The source code reads `req.headers[...]` and `JSON.stringify(req.body)`,
 * so we provide both properties.
 */
function buildMockRequest(
  headers: Record<string, string>,
  body: unknown,
): any {
  return { headers, body };
}

/**
 * Compute HMAC-SHA256 hex digest for a given body string and secret.
 */
function hmacSha256(secret: string, bodyString: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(bodyString, 'utf8')
    .digest('hex');
}

describe('Registry Backend - Webhook Signature Verification', () => {
  const secret = 'whsec_test_secret_key_12345';

  // ── GitHub Signature Verification ─────────────────────────────

  describe('verifyWebhookSignature - GitHub', () => {
    const provider: VcsProvider = 'github';

    it('should accept a valid HMAC-SHA256 signature', () => {
      const payload = { action: 'push', ref: 'refs/tags/v1.0.0' };
      const bodyString = JSON.stringify(payload);
      const sig = 'sha256=' + hmacSha256(secret, bodyString);

      const req = buildMockRequest(
        { 'x-hub-signature-256': sig },
        payload,
      );

      expect(verifyWebhookSignature(req, provider, secret)).toBe(true);
    });

    it('should reject an invalid signature', () => {
      const payload = { action: 'push', ref: 'refs/tags/v1.0.0' };
      const req = buildMockRequest(
        { 'x-hub-signature-256': 'sha256=deadbeef0000000000000000000000000000000000000000000000000000dead' },
        payload,
      );

      expect(verifyWebhookSignature(req, provider, secret)).toBe(false);
    });

    it('should reject when x-hub-signature-256 header is missing', () => {
      const payload = { action: 'push' };
      const req = buildMockRequest({}, payload);

      expect(verifyWebhookSignature(req, provider, secret)).toBe(false);
    });

    it('should reject when body is tampered after signing', () => {
      const originalPayload = { action: 'push', ref: 'refs/tags/v1.0.0' };
      const bodyString = JSON.stringify(originalPayload);
      const sig = 'sha256=' + hmacSha256(secret, bodyString);

      const tamperedPayload = { action: 'push', ref: 'refs/tags/v2.0.0' };
      const req = buildMockRequest(
        { 'x-hub-signature-256': sig },
        tamperedPayload,
      );

      expect(verifyWebhookSignature(req, provider, secret)).toBe(false);
    });

    it('should reject when signed with a different secret', () => {
      const payload = { action: 'push' };
      const bodyString = JSON.stringify(payload);
      const wrongSig = 'sha256=' + hmacSha256('wrong_secret', bodyString);

      const req = buildMockRequest(
        { 'x-hub-signature-256': wrongSig },
        payload,
      );

      expect(verifyWebhookSignature(req, provider, secret)).toBe(false);
    });

    it('should handle empty object body', () => {
      const payload = {};
      const bodyString = JSON.stringify(payload);
      const sig = 'sha256=' + hmacSha256(secret, bodyString);

      const req = buildMockRequest(
        { 'x-hub-signature-256': sig },
        payload,
      );

      expect(verifyWebhookSignature(req, provider, secret)).toBe(true);
    });

    it('should handle body with special characters', () => {
      const payload = { message: 'release: v1.0.0 "stable" <final>' };
      const bodyString = JSON.stringify(payload);
      const sig = 'sha256=' + hmacSha256(secret, bodyString);

      const req = buildMockRequest(
        { 'x-hub-signature-256': sig },
        payload,
      );

      expect(verifyWebhookSignature(req, provider, secret)).toBe(true);
    });

    it('should handle body with unicode content', () => {
      const payload = { author: 'Rene' };
      const bodyString = JSON.stringify(payload);
      const sig = 'sha256=' + hmacSha256(secret, bodyString);

      const req = buildMockRequest(
        { 'x-hub-signature-256': sig },
        payload,
      );

      expect(verifyWebhookSignature(req, provider, secret)).toBe(true);
    });
  });

  // ── GitLab Token Verification ──────────────────────────────────

  describe('verifyWebhookSignature - GitLab', () => {
    const provider: VcsProvider = 'gitlab';

    it('should accept when x-gitlab-token matches secret exactly', () => {
      const payload = { ref: 'refs/tags/v1.0.0' };
      const req = buildMockRequest(
        { 'x-gitlab-token': secret },
        payload,
      );

      expect(verifyWebhookSignature(req, provider, secret)).toBe(true);
    });

    it('should throw when x-gitlab-token has different length than secret', () => {
      // timingSafeEqual throws RangeError when buffers differ in length
      const payload = { ref: 'refs/tags/v1.0.0' };
      const req = buildMockRequest(
        { 'x-gitlab-token': 'wrong_token' },
        payload,
      );

      expect(() => verifyWebhookSignature(req, provider, secret)).toThrow(
        /same byte length/,
      );
    });

    it('should reject when x-gitlab-token has same length but wrong content', () => {
      const payload = { ref: 'refs/tags/v1.0.0' };
      // Create a token with the same byte length as the secret but different content
      const wrongToken = 'X'.repeat(Buffer.byteLength(secret));
      const req = buildMockRequest(
        { 'x-gitlab-token': wrongToken },
        payload,
      );

      expect(verifyWebhookSignature(req, provider, secret)).toBe(false);
    });

    it('should reject when x-gitlab-token header is missing', () => {
      const payload = { ref: 'refs/tags/v1.0.0' };
      const req = buildMockRequest({}, payload);

      expect(verifyWebhookSignature(req, provider, secret)).toBe(false);
    });

    it('should reject token that differs by a single character', () => {
      const payload = {};
      const almostRight = secret.slice(0, -1) + 'X';
      const req = buildMockRequest(
        { 'x-gitlab-token': almostRight },
        payload,
      );

      expect(verifyWebhookSignature(req, provider, secret)).toBe(false);
    });

    it('should reject empty token string via falsy check', () => {
      const payload = {};
      // Empty string is falsy, so the guard `if (!token) return false`
      // catches it before timingSafeEqual is reached.
      const req = buildMockRequest(
        { 'x-gitlab-token': '' },
        payload,
      );

      expect(verifyWebhookSignature(req, provider, secret)).toBe(false);
    });
  });

  // ── Bitbucket Signature Verification ───────────────────────────

  describe('verifyWebhookSignature - Bitbucket', () => {
    const provider: VcsProvider = 'bitbucket';

    it('should accept a valid HMAC-SHA256 signature', () => {
      const payload = {
        push: { changes: [{ new: { type: 'tag', name: 'v1.0.0' } }] },
      };
      const bodyString = JSON.stringify(payload);
      const sig = 'sha256=' + hmacSha256(secret, bodyString);

      const req = buildMockRequest(
        { 'x-hub-signature': sig },
        payload,
      );

      expect(verifyWebhookSignature(req, provider, secret)).toBe(true);
    });

    it('should reject an invalid signature', () => {
      const payload = { push: {} };
      const req = buildMockRequest(
        { 'x-hub-signature': 'sha256=0000000000000000000000000000000000000000000000000000000000000000' },
        payload,
      );

      expect(verifyWebhookSignature(req, provider, secret)).toBe(false);
    });

    it('should reject when x-hub-signature header is missing', () => {
      const payload = { push: {} };
      const req = buildMockRequest({}, payload);

      expect(verifyWebhookSignature(req, provider, secret)).toBe(false);
    });

    it('should reject when body is tampered', () => {
      const originalPayload = { event: 'push', data: 'original' };
      const bodyString = JSON.stringify(originalPayload);
      const sig = 'sha256=' + hmacSha256(secret, bodyString);

      const tamperedPayload = { event: 'push', data: 'tampered' };
      const req = buildMockRequest(
        { 'x-hub-signature': sig },
        tamperedPayload,
      );

      expect(verifyWebhookSignature(req, provider, secret)).toBe(false);
    });
  });

  // ── Unknown Provider ───────────────────────────────────────────

  describe('verifyWebhookSignature - unknown provider', () => {
    it('should return false for an unsupported provider', () => {
      const payload = { ref: 'refs/tags/v1.0.0' };
      const bodyString = JSON.stringify(payload);
      const sig = 'sha256=' + hmacSha256(secret, bodyString);

      const req = buildMockRequest(
        { 'x-hub-signature-256': sig },
        payload,
      );

      expect(
        verifyWebhookSignature(req, 'azure-devops' as VcsProvider, secret),
      ).toBe(false);
    });
  });
});

describe('Registry Backend - Webhook Push Event Parsing', () => {
  // ── GitHub Push Event ──────────────────────────────────────────

  describe('parseGitHubPushEvent', () => {
    it('should parse a tag push event', () => {
      const payload = {
        ref: 'refs/tags/v1.0.0',
        repository: {
          clone_url: 'https://github.com/butlerdotdev/butler-api.git',
          html_url: 'https://github.com/butlerdotdev/butler-api',
          full_name: 'butlerdotdev/butler-api',
        },
      };

      const result = parseGitHubPushEvent(payload);
      expect(result).not.toBeNull();
      expect(result!.repositoryUrl).toBe(
        'https://github.com/butlerdotdev/butler-api.git',
      );
      expect(result!.repositoryFullName).toBe('butlerdotdev/butler-api');
      expect(result!.ref).toBe('refs/tags/v1.0.0');
      expect(result!.tag).toBe('v1.0.0');
    });

    it('should return null tag for branch push events', () => {
      const payload = {
        ref: 'refs/heads/main',
        repository: {
          clone_url: 'https://github.com/butlerdotdev/butler-api.git',
          full_name: 'butlerdotdev/butler-api',
        },
      };

      const result = parseGitHubPushEvent(payload);
      expect(result).not.toBeNull();
      expect(result!.ref).toBe('refs/heads/main');
      expect(result!.tag).toBeNull();
    });

    it('should return null for missing ref', () => {
      const payload = {
        repository: {
          clone_url: 'https://github.com/butlerdotdev/butler-api.git',
          full_name: 'butlerdotdev/butler-api',
        },
      };

      expect(parseGitHubPushEvent(payload)).toBeNull();
    });

    it('should return null for missing repository', () => {
      const payload = {
        ref: 'refs/tags/v1.0.0',
      };

      expect(parseGitHubPushEvent(payload)).toBeNull();
    });

    it('should return null for null payload', () => {
      expect(parseGitHubPushEvent(null)).toBeNull();
    });

    it('should return null for undefined payload', () => {
      expect(parseGitHubPushEvent(undefined)).toBeNull();
    });

    it('should return null for empty object', () => {
      expect(parseGitHubPushEvent({})).toBeNull();
    });

    it('should fall back to html_url when clone_url is absent', () => {
      const payload = {
        ref: 'refs/tags/v2.0.0',
        repository: {
          html_url: 'https://github.com/butlerdotdev/butler-controller',
          full_name: 'butlerdotdev/butler-controller',
        },
      };

      const result = parseGitHubPushEvent(payload);
      expect(result).not.toBeNull();
      expect(result!.repositoryUrl).toBe(
        'https://github.com/butlerdotdev/butler-controller',
      );
    });

    it('should parse tag without v prefix', () => {
      const payload = {
        ref: 'refs/tags/1.0.0',
        repository: {
          clone_url: 'https://github.com/org/repo.git',
          full_name: 'org/repo',
        },
      };

      const result = parseGitHubPushEvent(payload);
      expect(result!.tag).toBe('1.0.0');
    });

    it('should parse tag with complex name', () => {
      const payload = {
        ref: 'refs/tags/chart-v0.3.0-rc.1',
        repository: {
          clone_url: 'https://github.com/org/repo.git',
          full_name: 'org/repo',
        },
      };

      const result = parseGitHubPushEvent(payload);
      expect(result!.tag).toBe('chart-v0.3.0-rc.1');
    });

    it('should handle feature branch refs', () => {
      const payload = {
        ref: 'refs/heads/feature/add-webhooks',
        repository: {
          clone_url: 'https://github.com/org/repo.git',
          full_name: 'org/repo',
        },
      };

      const result = parseGitHubPushEvent(payload);
      expect(result!.tag).toBeNull();
      expect(result!.ref).toBe('refs/heads/feature/add-webhooks');
    });
  });

  // ── GitLab Push Event ──────────────────────────────────────────

  describe('parseGitLabPushEvent', () => {
    it('should parse a tag push event', () => {
      const payload = {
        ref: 'refs/tags/v1.0.0',
        project: {
          http_url: 'https://gitlab.com/butlerdotdev/butler-api.git',
          web_url: 'https://gitlab.com/butlerdotdev/butler-api',
          path_with_namespace: 'butlerdotdev/butler-api',
        },
      };

      const result = parseGitLabPushEvent(payload);
      expect(result).not.toBeNull();
      expect(result!.repositoryUrl).toBe(
        'https://gitlab.com/butlerdotdev/butler-api.git',
      );
      expect(result!.repositoryFullName).toBe('butlerdotdev/butler-api');
      expect(result!.ref).toBe('refs/tags/v1.0.0');
      expect(result!.tag).toBe('v1.0.0');
    });

    it('should return null tag for branch push events', () => {
      const payload = {
        ref: 'refs/heads/main',
        project: {
          http_url: 'https://gitlab.com/butlerdotdev/butler-api.git',
          web_url: 'https://gitlab.com/butlerdotdev/butler-api',
          path_with_namespace: 'butlerdotdev/butler-api',
        },
      };

      const result = parseGitLabPushEvent(payload);
      expect(result).not.toBeNull();
      expect(result!.tag).toBeNull();
    });

    it('should return null for missing ref', () => {
      const payload = {
        project: {
          web_url: 'https://gitlab.com/butlerdotdev/butler-api',
          path_with_namespace: 'butlerdotdev/butler-api',
        },
      };

      expect(parseGitLabPushEvent(payload)).toBeNull();
    });

    it('should return null for missing project', () => {
      const payload = {
        ref: 'refs/tags/v1.0.0',
      };

      expect(parseGitLabPushEvent(payload)).toBeNull();
    });

    it('should return null for null payload', () => {
      expect(parseGitLabPushEvent(null)).toBeNull();
    });

    it('should return null for undefined payload', () => {
      expect(parseGitLabPushEvent(undefined)).toBeNull();
    });

    it('should fall back to web_url when http_url is absent', () => {
      const payload = {
        ref: 'refs/tags/v3.0.0',
        project: {
          web_url: 'https://gitlab.com/butlerdotdev/butler-server',
          path_with_namespace: 'butlerdotdev/butler-server',
        },
      };

      const result = parseGitLabPushEvent(payload);
      expect(result).not.toBeNull();
      expect(result!.repositoryUrl).toBe(
        'https://gitlab.com/butlerdotdev/butler-server',
      );
    });

    it('should handle nested group paths', () => {
      const payload = {
        ref: 'refs/tags/v1.0.0',
        project: {
          http_url: 'https://gitlab.com/org/sub-group/repo.git',
          web_url: 'https://gitlab.com/org/sub-group/repo',
          path_with_namespace: 'org/sub-group/repo',
        },
      };

      const result = parseGitLabPushEvent(payload);
      expect(result!.repositoryFullName).toBe('org/sub-group/repo');
    });
  });

  // ── Bitbucket Push Event ───────────────────────────────────────

  describe('parseBitbucketPushEvent', () => {
    it('should parse a tag push event', () => {
      const payload = {
        push: {
          changes: [
            {
              new: {
                type: 'tag',
                name: 'v1.0.0',
              },
            },
          ],
        },
        repository: {
          links: {
            html: {
              href: 'https://bitbucket.org/butlerdotdev/butler-api',
            },
          },
          full_name: 'butlerdotdev/butler-api',
        },
      };

      const result = parseBitbucketPushEvent(payload);
      expect(result).not.toBeNull();
      expect(result!.repositoryUrl).toBe(
        'https://bitbucket.org/butlerdotdev/butler-api',
      );
      expect(result!.repositoryFullName).toBe('butlerdotdev/butler-api');
      expect(result!.ref).toBe('refs/tags/v1.0.0');
      expect(result!.tag).toBe('v1.0.0');
    });

    it('should return null tag for branch push events', () => {
      const payload = {
        push: {
          changes: [
            {
              new: {
                type: 'branch',
                name: 'main',
              },
            },
          ],
        },
        repository: {
          links: {
            html: {
              href: 'https://bitbucket.org/org/repo',
            },
          },
          full_name: 'org/repo',
        },
      };

      const result = parseBitbucketPushEvent(payload);
      expect(result).not.toBeNull();
      expect(result!.tag).toBeNull();
      expect(result!.ref).toBe('refs/heads/main');
    });

    it('should return null when push.changes is empty array', () => {
      const payload = {
        push: { changes: [] },
        repository: {
          links: { html: { href: 'https://bitbucket.org/org/repo' } },
          full_name: 'org/repo',
        },
      };

      expect(parseBitbucketPushEvent(payload)).toBeNull();
    });

    it('should return null when push.changes is missing', () => {
      const payload = {
        push: {},
        repository: {
          full_name: 'org/repo',
        },
      };

      expect(parseBitbucketPushEvent(payload)).toBeNull();
    });

    it('should return null when push is missing', () => {
      const payload = {
        repository: { full_name: 'org/repo' },
      };

      expect(parseBitbucketPushEvent(payload)).toBeNull();
    });

    it('should return null for null payload', () => {
      expect(parseBitbucketPushEvent(null)).toBeNull();
    });

    it('should return null for undefined payload', () => {
      expect(parseBitbucketPushEvent(undefined)).toBeNull();
    });

    it('should return null when changes[0].new is null (deletion event)', () => {
      const payload = {
        push: {
          changes: [{ new: null, old: { type: 'tag', name: 'v0.9.0' } }],
        },
        repository: {
          links: { html: { href: 'https://bitbucket.org/org/repo' } },
          full_name: 'org/repo',
        },
      };

      expect(parseBitbucketPushEvent(payload)).toBeNull();
    });

    it('should default to empty string when repository info is missing', () => {
      const payload = {
        push: {
          changes: [
            {
              new: {
                type: 'tag',
                name: 'v1.0.0',
              },
            },
          ],
        },
      };

      const result = parseBitbucketPushEvent(payload);
      expect(result).not.toBeNull();
      expect(result!.repositoryUrl).toBe('');
      expect(result!.repositoryFullName).toBe('');
      expect(result!.tag).toBe('v1.0.0');
    });

    it('should construct refs/tags/ ref for tag type', () => {
      const payload = {
        push: {
          changes: [{ new: { type: 'tag', name: 'release-2.1.0' } }],
        },
        repository: {
          links: { html: { href: 'https://bitbucket.org/org/repo' } },
          full_name: 'org/repo',
        },
      };

      const result = parseBitbucketPushEvent(payload);
      expect(result!.ref).toBe('refs/tags/release-2.1.0');
      expect(result!.tag).toBe('release-2.1.0');
    });

    it('should construct refs/heads/ ref for branch type', () => {
      const payload = {
        push: {
          changes: [{ new: { type: 'branch', name: 'feature/ipam' } }],
        },
        repository: {
          links: { html: { href: 'https://bitbucket.org/org/repo' } },
          full_name: 'org/repo',
        },
      };

      const result = parseBitbucketPushEvent(payload);
      expect(result!.ref).toBe('refs/heads/feature/ipam');
      expect(result!.tag).toBeNull();
    });

    it('should use the first change entry only', () => {
      const payload = {
        push: {
          changes: [
            { new: { type: 'tag', name: 'v1.0.0' } },
            { new: { type: 'tag', name: 'v2.0.0' } },
          ],
        },
        repository: {
          links: { html: { href: 'https://bitbucket.org/org/repo' } },
          full_name: 'org/repo',
        },
      };

      const result = parseBitbucketPushEvent(payload);
      expect(result!.tag).toBe('v1.0.0');
    });
  });

  // ── Cross-Provider Consistency ─────────────────────────────────

  describe('cross-provider tag event consistency', () => {
    it('should produce the same tag value across all providers for the same release', () => {
      const tagName = 'v1.5.0';

      const github = parseGitHubPushEvent({
        ref: `refs/tags/${tagName}`,
        repository: {
          clone_url: 'https://github.com/org/repo.git',
          full_name: 'org/repo',
        },
      });

      const gitlab = parseGitLabPushEvent({
        ref: `refs/tags/${tagName}`,
        project: {
          http_url: 'https://gitlab.com/org/repo.git',
          path_with_namespace: 'org/repo',
        },
      });

      const bitbucket = parseBitbucketPushEvent({
        push: {
          changes: [{ new: { type: 'tag', name: tagName } }],
        },
        repository: {
          links: { html: { href: 'https://bitbucket.org/org/repo' } },
          full_name: 'org/repo',
        },
      });

      expect(github!.tag).toBe(tagName);
      expect(gitlab!.tag).toBe(tagName);
      expect(bitbucket!.tag).toBe(tagName);
    });

    it('should produce the same ref format for tag events across GitHub and GitLab', () => {
      const gitHubResult = parseGitHubPushEvent({
        ref: 'refs/tags/v2.0.0',
        repository: {
          clone_url: 'https://github.com/org/repo.git',
          full_name: 'org/repo',
        },
      });

      const gitLabResult = parseGitLabPushEvent({
        ref: 'refs/tags/v2.0.0',
        project: {
          http_url: 'https://gitlab.com/org/repo.git',
          path_with_namespace: 'org/repo',
        },
      });

      const bitbucketResult = parseBitbucketPushEvent({
        push: {
          changes: [{ new: { type: 'tag', name: 'v2.0.0' } }],
        },
        repository: {
          links: { html: { href: 'https://bitbucket.org/org/repo' } },
          full_name: 'org/repo',
        },
      });

      // All three should produce refs/tags/v2.0.0
      expect(gitHubResult!.ref).toBe('refs/tags/v2.0.0');
      expect(gitLabResult!.ref).toBe('refs/tags/v2.0.0');
      expect(bitbucketResult!.ref).toBe('refs/tags/v2.0.0');
    });

    it('should return null tag for branch events across all providers', () => {
      const github = parseGitHubPushEvent({
        ref: 'refs/heads/main',
        repository: {
          clone_url: 'https://github.com/org/repo.git',
          full_name: 'org/repo',
        },
      });

      const gitlab = parseGitLabPushEvent({
        ref: 'refs/heads/main',
        project: {
          http_url: 'https://gitlab.com/org/repo.git',
          path_with_namespace: 'org/repo',
        },
      });

      const bitbucket = parseBitbucketPushEvent({
        push: {
          changes: [{ new: { type: 'branch', name: 'main' } }],
        },
        repository: {
          links: { html: { href: 'https://bitbucket.org/org/repo' } },
          full_name: 'org/repo',
        },
      });

      expect(github!.tag).toBeNull();
      expect(gitlab!.tag).toBeNull();
      expect(bitbucket!.tag).toBeNull();
    });
  });
});
