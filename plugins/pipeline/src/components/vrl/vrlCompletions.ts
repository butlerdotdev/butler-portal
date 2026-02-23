// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  type CompletionContext,
  type CompletionResult,
  autocompletion,
  type Extension,
} from '@codemirror/autocomplete';

const VRL_FUNCTIONS = [
  { label: 'upcase', type: 'function', detail: 'Convert string to uppercase' },
  { label: 'downcase', type: 'function', detail: 'Convert string to lowercase' },
  { label: 'parse_json', type: 'function', detail: 'Parse a JSON string into a value' },
  { label: 'to_string', type: 'function', detail: 'Convert a value to string' },
  { label: 'to_int', type: 'function', detail: 'Convert a value to integer' },
  { label: 'exists', type: 'function', detail: 'Check if a field path exists' },
  { label: 'del', type: 'function', detail: 'Delete a field' },
  { label: 'set', type: 'function', detail: 'Set a field value' },
  { label: 'get', type: 'function', detail: 'Get a field value by path' },
  { label: 'contains', type: 'function', detail: 'Check if string contains substring' },
  { label: 'starts_with', type: 'function', detail: 'Check if string starts with prefix' },
  { label: 'ends_with', type: 'function', detail: 'Check if string ends with suffix' },
  { label: 'replace', type: 'function', detail: 'Replace occurrences in a string' },
  { label: 'split', type: 'function', detail: 'Split a string by delimiter' },
  { label: 'join', type: 'function', detail: 'Join array elements into a string' },
  { label: 'format_timestamp', type: 'function', detail: 'Format a timestamp value' },
  { label: 'now', type: 'function', detail: 'Get current timestamp' },
  { label: 'uuid_v4', type: 'function', detail: 'Generate a UUID v4' },
  { label: 'encode_base64', type: 'function', detail: 'Encode a value as base64' },
  { label: 'decode_base64', type: 'function', detail: 'Decode a base64-encoded string' },
];

function vrlCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) {
    return null;
  }

  return {
    from: word.from,
    options: VRL_FUNCTIONS,
  };
}

/**
 * Returns a CodeMirror extension providing VRL function autocompletion.
 */
export function vrlCompletions(): Extension {
  return autocompletion({
    override: [vrlCompletionSource],
  });
}
