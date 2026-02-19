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

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export interface PaginationParams {
  cursor: string | null;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

/**
 * Parse pagination parameters from query string.
 * Uses cursor-based pagination with configurable sort.
 */
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const cursor = typeof query.cursor === 'string' ? query.cursor : null;

  let limit = DEFAULT_PAGE_SIZE;
  if (typeof query.limit === 'string') {
    const parsed = parseInt(query.limit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_PAGE_SIZE);
    }
  }

  const sortBy = typeof query.sortBy === 'string' ? query.sortBy : 'created_at';
  const sortOrder =
    typeof query.sortOrder === 'string' && query.sortOrder === 'asc'
      ? 'asc'
      : 'desc';

  return { cursor, limit, sortBy, sortOrder };
}

/**
 * Encode a cursor from a row's sort field value + ID.
 * Cursor format: base64(JSON({ value, id }))
 */
export function encodeCursor(sortValue: string | number, id: string): string {
  return Buffer.from(JSON.stringify({ v: sortValue, id })).toString('base64url');
}

/**
 * Decode a cursor back to its sort value and ID.
 */
export function decodeCursor(cursor: string): { value: string; id: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (decoded && typeof decoded.id === 'string') {
      return { value: String(decoded.v), id: decoded.id };
    }
  } catch {
    // Invalid cursor format
  }
  return null;
}
