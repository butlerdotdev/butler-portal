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
import type { LoggerService } from '@backstage/backend-plugin-api';
import { badRequest, serviceUnavailable } from '../util/errors';

const MAX_CONCURRENT = 4;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_EVENTS = 100;
const MAX_VRL_SIZE = 64 * 1024; // 64KB
const MAX_EVENT_SIZE = 1024 * 1024; // 1MB

export interface VrlExecutorOptions {
  vectorBinaryPath?: string;
  timeoutMs?: number;
  maxConcurrentExecutions?: number;
}

export interface VrlExecuteResult {
  success: boolean;
  output: Record<string, unknown>[];
  errors: string[];
}

export class VrlExecutor {
  private readonly vectorPath: string;
  private readonly timeoutMs: number;
  private readonly maxConcurrent: number;
  private available: boolean = false;
  private activeCount: number = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(
    options: VrlExecutorOptions,
    private readonly logger: LoggerService,
  ) {
    this.vectorPath = options.vectorBinaryPath ?? 'vector';
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxConcurrent = options.maxConcurrentExecutions ?? MAX_CONCURRENT;
  }

  async initialize(): Promise<void> {
    try {
      await this.execVector(['--version']);
      this.available = true;
      this.logger.info('Vector binary found, VRL execution available');
    } catch {
      this.available = false;
      this.logger.warn(
        'Vector binary not found on PATH. VRL execution and config validation will be unavailable.',
      );
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async execute(
    program: string,
    events: Record<string, unknown>[],
  ): Promise<VrlExecuteResult> {
    this.assertAvailable();
    this.validateInputs(program, events);

    const release = await this.acquireSemaphore();
    let tempDir: string | undefined;

    try {
      tempDir = await mkdtemp(join(tmpdir(), 'butler-vrl-'));
      const programFile = join(tempDir, 'program.vrl');
      const inputFile = join(tempDir, 'events.jsonl');

      await writeFile(programFile, program, 'utf8');
      await writeFile(
        inputFile,
        events.map(e => JSON.stringify(e)).join('\n'),
        'utf8',
      );

      const { stdout, stderr } = await this.execVector([
        'vrl',
        '--input',
        inputFile,
        '--program',
        programFile,
        '--print-object',
      ]);

      const output: Record<string, unknown>[] = [];
      const errors: string[] = [];

      if (stdout.trim()) {
        for (const line of stdout.trim().split('\n')) {
          try {
            output.push(JSON.parse(line));
          } catch {
            errors.push(`Failed to parse output line: ${line}`);
          }
        }
      }

      if (stderr.trim()) {
        for (const line of stderr.trim().split('\n')) {
          if (line.trim()) {
            errors.push(line.trim());
          }
        }
      }

      return { success: errors.length === 0, output, errors };
    } finally {
      release();
      if (tempDir) {
        this.cleanupTempDir(tempDir).catch(() => {});
      }
    }
  }

  async validate(program: string): Promise<{ valid: boolean; errors: string[] }> {
    this.assertAvailable();

    if (program.length > MAX_VRL_SIZE) {
      throw badRequest(`VRL program exceeds maximum size of ${MAX_VRL_SIZE} bytes`);
    }

    const release = await this.acquireSemaphore();
    let tempDir: string | undefined;

    try {
      tempDir = await mkdtemp(join(tmpdir(), 'butler-vrl-'));

      // Build a minimal Vector config that wraps the VRL in a remap transform
      const configContent = JSON.stringify({
        sources: {
          _butler_validate_src: { type: 'demo_logs', format: 'json', count: 1 },
        },
        transforms: {
          _butler_validate_transform: {
            type: 'remap',
            inputs: ['_butler_validate_src'],
            source: program,
          },
        },
        sinks: {
          _butler_validate_sink: {
            type: 'blackhole',
            inputs: ['_butler_validate_transform'],
          },
        },
      });

      const configFile = join(tempDir, 'validate.json');
      await writeFile(configFile, configContent, 'utf8');

      try {
        await this.execVector(['validate', '--no-environment', configFile]);
        return { valid: true, errors: [] };
      } catch (err: any) {
        const stderr = err.stderr ?? err.message ?? String(err);
        const errors = stderr
          .split('\n')
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0);
        return { valid: false, errors };
      }
    } finally {
      release();
      if (tempDir) {
        this.cleanupTempDir(tempDir).catch(() => {});
      }
    }
  }

  private assertAvailable(): void {
    if (!this.available) {
      throw serviceUnavailable(
        'VRL_UNAVAILABLE',
        'Vector binary not available. VRL execution is disabled.',
      );
    }
  }

  private validateInputs(
    program: string,
    events: Record<string, unknown>[],
  ): void {
    if (program.length > MAX_VRL_SIZE) {
      throw badRequest(
        `VRL program exceeds maximum size of ${MAX_VRL_SIZE} bytes`,
      );
    }
    if (events.length > MAX_EVENTS) {
      throw badRequest(`Maximum ${MAX_EVENTS} events allowed`);
    }
    for (const event of events) {
      const size = JSON.stringify(event).length;
      if (size > MAX_EVENT_SIZE) {
        throw badRequest(
          `Event exceeds maximum size of ${MAX_EVENT_SIZE} bytes`,
        );
      }
    }
  }

  private execVector(
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = execFile(
        this.vectorPath,
        args,
        { timeout: this.timeoutMs, maxBuffer: 10 * 1024 * 1024 },
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

      // Hard kill on timeout
      setTimeout(() => {
        proc.kill('SIGKILL');
      }, this.timeoutMs + 1000);
    });
  }

  // ── Semaphore ─────────────────────────────────────────────────────

  private acquireSemaphore(): Promise<() => void> {
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount++;
      return Promise.resolve(() => this.releaseSemaphore());
    }

    return new Promise(resolve => {
      this.waitQueue.push(() => {
        this.activeCount++;
        resolve(() => this.releaseSemaphore());
      });
    });
  }

  private releaseSemaphore(): void {
    this.activeCount--;
    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }

  private async cleanupTempDir(dir: string): Promise<void> {
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
}
