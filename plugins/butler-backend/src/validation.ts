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

/**
 * Validates butler-server service-account credentials at plugin init time.
 *
 * Defense-in-depth against the prior admin/admin default. Throws if either
 * value is missing/empty, or matches the literal string "admin" (after
 * whitespace trimming). The trim catches accidental bypass via values like
 * " admin" or "admin\t" that would otherwise pass a strict-equality check.
 *
 * Case-sensitive comparison: "Admin" passes (different value), "admin" fails.
 *
 * Opt-out: if the environment variable BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS
 * is set exactly to the string "true", a literal "admin" value logs a warning
 * and the function returns without throwing. The check is strict equality on
 * the string "true" so that values like "TRUE", "yes", "1", or an unset
 * variable do not accidentally disable the validation. This escape hatch
 * exists for internal deployments where butler-server is reachable only from
 * trusted networks and rotation of the admin credentials is operationally
 * deferred. It is NOT a recommended pattern for any deployment where
 * butler-server is reachable from networks outside the operator's control.
 *
 * The empty-credentials check is not affected by the opt-out: empty values
 * always throw, regardless of BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS.
 *
 * @throws Error with actionable message when validation fails.
 */
export function validateButlerAuth(
  username: string,
  password: string,
  logger?: { warn: (msg: string) => void },
): void {
  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();

  if (!trimmedUsername || !trimmedPassword) {
    throw new Error(
      'butler.auth.username and butler.auth.password must be set in app-config (typically via BUTLER_SERVICE_ACCOUNT_USER and BUTLER_SERVICE_ACCOUNT_PASSWORD sourced from a Secret). The portal cannot start without service-account credentials for butler-server.',
    );
  }

  const usernameIsAdmin = trimmedUsername === 'admin';
  const passwordIsAdmin = trimmedPassword === 'admin';

  if (usernameIsAdmin || passwordIsAdmin) {
    const optOut = process.env.BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS === 'true';

    if (optOut) {
      const fields: string[] = [];
      if (usernameIsAdmin) fields.push('butler.auth.username');
      if (passwordIsAdmin) fields.push('butler.auth.password');
      const verb = fields.length > 1 ? 'are' : 'is';
      const warning = `${fields.join(' and ')} ${verb} set to the insecure default "admin". BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS=true is set; continuing despite the insecure credentials. Rotate the affected field(s) to remove this warning.`;
      if (logger) {
        logger.warn(warning);
      } else {
        // eslint-disable-next-line no-console
        console.warn(warning);
      }
      return;
    }

    throw new Error(
      'butler.auth.username or butler.auth.password is set to the string "admin". This is the prior insecure default. Set both to real service-account credentials before starting the portal, or set BUTLER_ALLOW_INSECURE_ADMIN_CREDENTIALS=true to override (not recommended for production).',
    );
  }
}
