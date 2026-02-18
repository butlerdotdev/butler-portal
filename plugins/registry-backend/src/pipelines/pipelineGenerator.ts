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

import { generateGitHubActionsWorkflow } from './githubActionsTemplate';
import { generateGitLabCiConfig } from './gitlabCiTemplate';

export interface PipelineConfig {
  runId: string;
  callbackBaseUrl: string;
  operation: string; // plan, apply, validate, test, destroy
  tfVersion: string;
  repositoryUrl: string;
  version: string; // git tag/ref to checkout
  workingDirectory?: string;
  envVars?: Record<string, { source: string; ref?: string; key?: string; value?: string }>;
}

export function generatePipelineConfig(
  ciProvider: string,
  config: PipelineConfig,
): string {
  switch (ciProvider) {
    case 'github-actions':
      return generateGitHubActionsWorkflow(config);
    case 'gitlab-ci':
      return generateGitLabCiConfig(config);
    default:
      throw new Error(`Unsupported CI provider: ${ciProvider}`);
  }
}
