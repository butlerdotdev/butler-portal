// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

/** A per-field validation failure, as butler-server reports it. */
export interface ButlerFieldError {
  field: string;
  reason: string;
  current?: string;
}

/**
 * An error carrying what the server actually said.
 *
 * The plain Error the client used to throw flattened everything into a
 * message, which is enough to show a toast and not enough to put a
 * validation failure next to the field that caused it, or to tell a
 * conflict apart from a refusal.
 */
export class ButlerApiError extends Error {
  readonly status: number;
  readonly fieldErrors: ButlerFieldError[];
  readonly body: unknown;

  constructor(opts: {
    status: number;
    message: string;
    fieldErrors?: ButlerFieldError[];
    body?: unknown;
  }) {
    super(opts.message);
    this.name = 'ButlerApiError';
    this.status = opts.status;
    this.fieldErrors = opts.fieldErrors ?? [];
    this.body = opts.body;
  }

  /** The caller may not perform this operation. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** The resource moved under us, or is not in a state that allows this. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /** The request was understood and rejected on its contents. */
  get isValidation(): boolean {
    return this.status === 400 || this.fieldErrors.length > 0;
  }

  errorFor(field: string): ButlerFieldError | undefined {
    return this.fieldErrors.find(e => e.field === field);
  }
}

/**
 * An admission webhook denial reads as a wall of Kubernetes prose. Pull out
 * the part a person needs, and fall back to the whole message.
 */
export function extractWebhookDenial(message: string): string {
  const denied = /denied the request:?\s*(.+)$/is.exec(message);
  if (denied?.[1]) return denied[1].trim();
  const admission = /admission webhook [^:]+ (denied[^:]*:?\s*.+)$/is.exec(
    message,
  );
  if (admission?.[1]) return admission[1].trim();
  return message;
}
