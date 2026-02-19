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

interface CacheEntry {
  content: string;
  etag: string;
  createdAt: number;
}

const DEFAULT_TTL_MS = 30_000; // 30 seconds safety-net

/**
 * In-memory cache for Helm repository index.yaml responses.
 *
 * Keyed by namespace. Cache invalidation triggered on any version
 * status change for helm-chart artifacts in that namespace.
 * Safety-net TTL of 30 seconds — stale cache auto-expires even
 * without explicit invalidation.
 */
export class HelmIndexCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  get(namespace: string): CacheEntry | null {
    const entry = this.cache.get(namespace);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(namespace);
      return null;
    }

    return entry;
  }

  set(namespace: string, content: string): CacheEntry {
    const etag = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    const entry: CacheEntry = {
      content,
      etag: `"${etag}"`,
      createdAt: Date.now(),
    };
    this.cache.set(namespace, entry);
    return entry;
  }

  /**
   * Invalidate cache for a namespace.
   * Called when a helm-chart version is published, approved, rejected, or yanked.
   */
  invalidate(namespace: string): void {
    this.cache.delete(namespace);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
