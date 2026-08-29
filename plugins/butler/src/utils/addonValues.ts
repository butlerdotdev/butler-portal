// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { parse, stringify, YAMLParseError } from 'yaml';
import type { InstalledAddon } from '../api/types/addons';

/**
 * Helm values travel to butler-server as a JSON object in the request
 * body and are stored on the TenantAddon as `spec.values`. The server
 * replaces that object wholesale on update and the controller merges it
 * over the catalog's defaults, so what the user submits is the entire
 * override set, not a patch. Everything here exists to make sure what
 * leaves the editor is exactly what the user wrote, parsed by a real
 * YAML parser rather than a line scanner.
 */
export type ParsedValues =
  | { ok: true; values: Record<string, unknown> | undefined }
  | { ok: false; message: string; line?: number };

/**
 * Parses editor text into the values object the server expects.
 *
 * An empty document means "no overrides" and is reported as undefined so
 * callers can omit the field. Anything that parses but is not a mapping
 * (a bare list, a scalar) is refused: Helm values are a map and the
 * server would store whatever it was given.
 */
export function parseValuesYaml(text: string): ParsedValues {
  if (!text.trim()) return { ok: true, values: undefined };
  let doc: unknown;
  try {
    doc = parse(text, { strict: true, uniqueKeys: true });
  } catch (err) {
    if (err instanceof YAMLParseError) {
      const line = err.linePos?.[0]?.line;
      return { ok: false, message: err.message.split('\n')[0], line };
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Invalid YAML',
    };
  }
  if (doc === null || doc === undefined) return { ok: true, values: undefined };
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    return {
      ok: false,
      message: 'Helm values must be a mapping of keys to values.',
      line: 1,
    };
  }
  return { ok: true, values: doc as Record<string, unknown> };
}

/**
 * Renders a values object for editing. Keys keep the order the server
 * returned them in and nothing is folded or re-quoted beyond what YAML
 * needs, so a save with no edits sends back the same object.
 */
export function formatValuesYaml(
  values: Record<string, unknown> | undefined | null,
): string {
  if (!values || Object.keys(values).length === 0) return '';
  return stringify(values, { lineWidth: 0, sortMapEntries: false });
}

/** Structural equality on plain JSON data, ignoring key order. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, i) => valuesEqual(item, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every(k =>
      valuesEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    );
  }
  return false;
}

export interface AddonVersionState {
  /** What the TenantAddon asks for. */
  desired: string | undefined;
  /** What the controller last reports as installed. */
  installed: string | undefined;
  /** Desired differs from installed: an upgrade or rollback is pending. */
  pending: boolean;
}

/**
 * Desired and installed versions are different facts and the server
 * returns both. They agree once the controller has reconciled; while
 * they differ the addon is between versions, whatever its phase says.
 */
export function addonVersionState(addon: InstalledAddon): AddonVersionState {
  const desired = addon.version || undefined;
  const installed = addon.installedVersion || undefined;
  return {
    desired,
    installed,
    pending: Boolean(desired && installed && desired !== installed),
  };
}
