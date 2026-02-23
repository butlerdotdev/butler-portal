// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

// TODO: Implement full VRL (Vector Remap Language) syntax highlighting.
// For now, we use the YAML language as a placeholder since VRL shares
// some structural similarities. A proper VRL grammar should handle:
//   - VRL keywords (if, else, for, while, abort, null, true, false)
//   - Function calls (e.g., parse_json, to_string)
//   - Path expressions (e.g., .field, .nested.field)
//   - String interpolation
//   - Comments (# single-line)

import { type LanguageSupport } from '@codemirror/language';
import { yaml } from '@codemirror/lang-yaml';

/**
 * Returns a LanguageSupport instance for VRL editing.
 * Currently returns YAML language as a placeholder.
 */
export function vrlLanguage(): LanguageSupport {
  return yaml();
}
