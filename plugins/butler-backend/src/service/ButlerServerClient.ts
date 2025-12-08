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

import fetch, { Response, RequestInit, HeadersInit } from 'node-fetch';
import { LoggerService } from '@backstage/backend-plugin-api';
import { AuthManager } from './AuthManager';

/**
 * ButlerServerClient is an HTTP client for butler-server.
 *
 * It uses the AuthManager for authentication and proxies requests
 * to the configured butler-server base URL.
 */
export class ButlerServerClient {
  private readonly baseUrl: string;
  private readonly authManager: AuthManager;
  private readonly logger: LoggerService;

  constructor(options: {
    baseUrl: string;
    authManager: AuthManager;
    logger: LoggerService;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.authManager = options.authManager;
    this.logger = options.logger;
  }

  /**
   * Sends a request to butler-server.
   *
   * @param method - HTTP method (GET, POST, PUT, PATCH, DELETE)
   * @param path - API path (e.g., /api/clusters). Must start with /.
   * @param body - Optional request body (will be serialized as-is if a string, or JSON.stringify'd otherwise)
   * @param headers - Optional additional headers to forward (e.g., X-Butler-Team)
   */
  async request(
    method: string,
    path: string,
    body?: string | Buffer | undefined,
    headers?: Record<string, string>,
  ): Promise<Response> {
    const token = await this.authManager.getToken();
    const url = `${this.baseUrl}${path}`;

    const requestHeaders: HeadersInit = {
      Authorization: `Bearer ${token}`,
      ...headers,
    };

    const init: RequestInit = {
      method,
      headers: requestHeaders,
    };

    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      init.body = body;
    }

    this.logger.debug('Proxying request to butler-server', {
      method,
      path,
      url,
    });

    const response = await fetch(url, init);

    this.logger.debug('butler-server response', {
      method,
      path,
      status: response.status,
    });

    return response;
  }
}
