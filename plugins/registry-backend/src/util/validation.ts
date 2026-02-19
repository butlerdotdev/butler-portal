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

import { badRequest } from './errors';

const NAME_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;

const VALID_ARTIFACT_TYPES = [
  'terraform-module',
  'terraform-provider',
  'helm-chart',
  'opa-bundle',
  'oci-artifact',
] as const;

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  raw: string;
}

/**
 * Validate an artifact or namespace name.
 * Lowercase alphanumeric + hyphens, 3-64 chars, must start with a letter.
 */
export function validateName(value: string, field: string): void {
  if (!NAME_PATTERN.test(value)) {
    throw badRequest(
      `Invalid ${field}: must be 3-64 lowercase alphanumeric characters or hyphens, starting with a letter`,
      { field, value },
    );
  }
}

/**
 * Validate artifact type.
 */
export function validateArtifactType(type: string): void {
  if (!VALID_ARTIFACT_TYPES.includes(type as any)) {
    throw badRequest(
      `Invalid artifact type: ${type}. Must be one of: ${VALID_ARTIFACT_TYPES.join(', ')}`,
      { field: 'type', value: type },
    );
  }
}

/**
 * Parse and validate a semver version string.
 * Supports optional 'v' prefix and prerelease tags.
 */
export function parseSemver(version: string): ParsedSemver {
  // Strip optional v prefix
  const cleaned = version.startsWith('v') ? version.slice(1) : version;

  const match = cleaned.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.+-]+))?$/,
  );
  if (!match) {
    throw badRequest(
      `Invalid semver version: ${version}. Expected format: MAJOR.MINOR.PATCH[-PRERELEASE]`,
      { field: 'version', value: version },
    );
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] ?? null,
    raw: cleaned,
  };
}

/**
 * Compare two parsed semver versions. Returns positive if a > b.
 */
export function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  // Prerelease versions have lower precedence than release
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && b.prerelease) {
    return a.prerelease.localeCompare(b.prerelease);
  }
  return 0;
}

/**
 * Check if a version bump is a patch-only change relative to a previous version.
 */
export function isPatchBump(prev: ParsedSemver, next: ParsedSemver): boolean {
  return (
    prev.major === next.major &&
    prev.minor === next.minor &&
    next.patch > prev.patch &&
    next.prerelease === null
  );
}
