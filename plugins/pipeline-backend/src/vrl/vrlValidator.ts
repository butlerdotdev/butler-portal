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

import { execFile } from 'child_process';
import { writeFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export interface ValidateConfigResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a compiled Vector configuration YAML using the `vector validate` command.
 * If the vector binary is not available, returns a warning instead of failing.
 */
export async function validateVectorConfig(
  yamlContent: string,
  vectorBinaryPath?: string,
): Promise<ValidateConfigResult> {
  const vectorPath = vectorBinaryPath ?? 'vector';

  // Check if vector is available
  const available = await checkVectorAvailable(vectorPath);
  if (!available) {
    return {
      valid: true,
      errors: [],
      warnings: ['Validation skipped: vector binary not found'],
    };
  }

  let tempDir: string | undefined;
  try {
    tempDir = await mkdtemp(join(tmpdir(), 'butler-validate-'));
    const configFile = join(tempDir, 'config.yaml');
    await writeFile(configFile, yamlContent, 'utf8');

    const { stderr } = await execVector(vectorPath, [
      'validate',
      '--no-environment',
      configFile,
    ]);

    const warnings = stderr
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && l.toLowerCase().includes('warn'));

    return { valid: true, errors: [], warnings };
  } catch (err: any) {
    const stderr: string = err.stderr ?? err.message ?? String(err);
    const lines = stderr.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const errors: string[] = [];
    const warnings: string[] = [];
    for (const line of lines) {
      if (line.toLowerCase().includes('warn')) {
        warnings.push(line);
      } else {
        errors.push(line);
      }
    }

    return { valid: false, errors, warnings };
  } finally {
    if (tempDir) {
      cleanupTempDir(tempDir).catch(() => {});
    }
  }
}

async function checkVectorAvailable(vectorPath: string): Promise<boolean> {
  try {
    await execVector(vectorPath, ['--version']);
    return true;
  } catch {
    return false;
  }
}

function execVector(
  vectorPath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      vectorPath,
      args,
      { timeout: 15000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as any;
          err.stdout = stdout;
          err.stderr = stderr;
          reject(err);
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
  });
}

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    const { readdir } = await import('fs/promises');
    const files = await readdir(dir);
    for (const file of files) {
      await unlink(join(dir, file)).catch(() => {});
    }
    const { rmdir } = await import('fs/promises');
    await rmdir(dir).catch(() => {});
  } catch {
    // Best-effort cleanup
  }
}
