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

import crypto from 'crypto';
import { Request } from 'express';

export type VcsProvider = 'github' | 'gitlab' | 'bitbucket';

/**
 * Verify webhook signature based on VCS provider.
 *
 * - GitHub: HMAC-SHA256 via X-Hub-Signature-256
 * - GitLab: Shared secret via X-Gitlab-Token
 * - Bitbucket: HMAC-SHA256 via X-Hub-Signature
 */
export function verifyWebhookSignature(
  req: Request,
  provider: VcsProvider,
  secret: string,
): boolean {
  switch (provider) {
    case 'github':
      return verifyGitHubSignature(req, secret);
    case 'gitlab':
      return verifyGitLabToken(req, secret);
    case 'bitbucket':
      return verifyBitbucketSignature(req, secret);
    default:
      return false;
  }
}

function verifyGitHubSignature(req: Request, secret: string): boolean {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!signature) return false;

  const body = JSON.stringify(req.body);
  const expected = 'sha256=' +
    crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}

function verifyGitLabToken(req: Request, secret: string): boolean {
  const token = req.headers['x-gitlab-token'] as string | undefined;
  if (!token) return false;

  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(secret),
  );
}

function verifyBitbucketSignature(req: Request, secret: string): boolean {
  const signature = req.headers['x-hub-signature'] as string | undefined;
  if (!signature) return false;

  const body = JSON.stringify(req.body);
  const expected = 'sha256=' +
    crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}

/**
 * Extract push/tag event data from VCS webhook payload.
 */
export interface WebhookTagEvent {
  repositoryUrl: string;
  repositoryFullName: string;
  ref: string;
  tag: string | null;
}

export function parseGitHubPushEvent(payload: any): WebhookTagEvent | null {
  if (!payload?.ref || !payload?.repository) return null;

  const ref = payload.ref as string;
  const tag = ref.startsWith('refs/tags/') ? ref.replace('refs/tags/', '') : null;

  return {
    repositoryUrl: payload.repository.clone_url || payload.repository.html_url,
    repositoryFullName: payload.repository.full_name,
    ref,
    tag,
  };
}

export function parseGitLabPushEvent(payload: any): WebhookTagEvent | null {
  if (!payload?.ref || !payload?.project) return null;

  const ref = payload.ref as string;
  const tag = ref.startsWith('refs/tags/') ? ref.replace('refs/tags/', '') : null;

  return {
    repositoryUrl: payload.project.http_url || payload.project.web_url,
    repositoryFullName: payload.project.path_with_namespace,
    ref,
    tag,
  };
}

export function parseBitbucketPushEvent(payload: any): WebhookTagEvent | null {
  const changes = payload?.push?.changes;
  if (!Array.isArray(changes) || changes.length === 0) return null;

  const change = changes[0];
  const newTarget = change?.new;
  if (!newTarget) return null;

  const isTag = newTarget.type === 'tag';
  return {
    repositoryUrl: payload.repository?.links?.html?.href || '',
    repositoryFullName: payload.repository?.full_name || '',
    ref: `refs/${isTag ? 'tags' : 'heads'}/${newTarget.name}`,
    tag: isTag ? newTarget.name : null,
  };
}
