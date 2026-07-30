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

export interface Config {
  /**
   * Sign-in page options. Butler Portal renders a Guest card by default;
   * identity-provider cards (Google, Microsoft, ...) are opt-in via
   * auth.providers.<key>. See packages/app/src/signInProviders.ts.
   */
  signInPage?: {
    /**
     * Hide the Guest sign-in card -- e.g. an SSO-only production deployment.
     * Must be frontend-visible: the sign-in page reads it in the browser.
     * @visibility frontend
     */
    disableGuest?: boolean;
  };
  plugins?: {
    butler?: {
      /**
       * Whether the Butler plugin (frontend route, sidebar, homepage card)
       * is enabled in this deployment. Default false so external customer
       * deployments fail safe. Butler Labs' own HelmRelease overrides true.
       * @visibility frontend
       */
      enabled?: boolean;
    };
    workspaces?: {
      /**
       * Whether the Chambers (workspaces) plugin is enabled in this
       * deployment. Frontend route + sidebar + homepage card. Default false.
       * @visibility frontend
       */
      enabled?: boolean;
    };
    registry?: {
      /**
       * Whether the Keeper (registry) plugin is enabled in this deployment.
       * Frontend + backend + catalog provider all gate on this. Default false.
       * @visibility frontend
       */
      enabled?: boolean;
    };
    pipeline?: {
      /**
       * Whether the Herald (pipeline) plugin is enabled in this deployment.
       * Frontend + backend gate on this. Default false.
       * @visibility frontend
       */
      enabled?: boolean;
    };
  };
}
