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

import { Request, Response, NextFunction } from 'express';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimiterOptions {
  requestsPerMinute: number;
  burstSize: number;
}

/**
 * Token-bucket rate limiter middleware.
 *
 * Protocol endpoints: rate limit per API token.
 * Webhook endpoints: rate limit per source IP.
 *
 * Returns 429 Too Many Requests with Retry-After header when exceeded.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const { requestsPerMinute, burstSize } = options;
  const buckets = new Map<string, TokenBucket>();
  const refillRate = requestsPerMinute / 60; // tokens per second

  // Periodic cleanup of stale buckets (every 5 minutes)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      // Remove buckets not accessed in 5 minutes
      if (now - bucket.lastRefill > 300_000) {
        buckets.delete(key);
      }
    }
  }, 300_000);
  cleanupInterval.unref();

  return (keyExtractor: (req: Request) => string) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = keyExtractor(req);
      const now = Date.now();

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { tokens: burstSize, lastRefill: now };
        buckets.set(key, bucket);
      }

      // Refill tokens based on elapsed time
      const elapsed = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(burstSize, bucket.tokens + elapsed * refillRate);
      bucket.lastRefill = now;

      if (bucket.tokens < 1) {
        const retryAfter = Math.ceil((1 - bucket.tokens) / refillRate);
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({
          error: {
            message: 'Too many requests',
            code: 'RATE_LIMITED',
            retryAfter,
          },
        });
        return;
      }

      bucket.tokens -= 1;
      next();
    };
  };
}

/**
 * Extract rate limit key from API token (for protocol endpoints).
 */
export function tokenKey(req: Request): string {
  return (req as any).registryToken?.id ?? `ip:${req.ip}`;
}

/**
 * Extract rate limit key from source IP (for webhook endpoints).
 */
export function ipKey(req: Request): string {
  return `ip:${req.ip}`;
}
