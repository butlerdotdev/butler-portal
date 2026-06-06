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
 * @throws Error with actionable message when validation fails.
 */
export function validateButlerAuth(username: string, password: string): void {
  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();
  if (!trimmedUsername || !trimmedPassword) {
    throw new Error(
      'butler.auth.username and butler.auth.password must be set in app-config (typically via BUTLER_SERVICE_ACCOUNT_USER and BUTLER_SERVICE_ACCOUNT_PASSWORD sourced from a Secret). The portal cannot start without service-account credentials for butler-server.',
    );
  }
  if (trimmedUsername === 'admin' || trimmedPassword === 'admin') {
    throw new Error(
      'butler.auth.username or butler.auth.password is set to the string "admin". This is the prior insecure default. Set both to real service-account credentials before starting the portal.',
    );
  }
}
