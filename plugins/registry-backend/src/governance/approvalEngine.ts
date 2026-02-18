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

import { LoggerService } from '@backstage/backend-plugin-api';
import { RegistryDatabase } from '../database/RegistryDatabase';
import { ApprovalPolicy } from '../database/types';
import { conflict, badRequest } from '../util/errors';

export interface ApprovalResult {
  approved: boolean;
  versionId: string;
  artifactId: string;
  approvedBy: string;
}

export interface RejectionResult {
  rejected: boolean;
  versionId: string;
  artifactId: string;
  rejectedBy: string;
}

/**
 * Governance approval engine.
 *
 * Handles approval/rejection state transitions with transactional
 * is_latest management. The RegistryDatabase.approveVersion method
 * uses SELECT FOR UPDATE to prevent concurrent double-approval.
 */
export class ApprovalEngine {
  constructor(
    private readonly db: RegistryDatabase,
    private readonly logger: LoggerService,
  ) {}

  async approveVersion(
    versionId: string,
    artifactId: string,
    approvedBy: string,
    comment?: string,
  ): Promise<ApprovalResult> {
    const version = await this.db.getVersionById(versionId);
    if (!version) {
      throw badRequest('Version not found', { versionId });
    }

    if (version.approval_status === 'approved') {
      throw conflict('VERSION_ALREADY_EXISTS', 'Version is already approved');
    }

    if (version.approval_status === 'rejected') {
      throw conflict('APPROVAL_DENIED', 'Cannot approve a rejected version');
    }

    // The DB method handles: SELECT FOR UPDATE, clear old is_latest,
    // set new is_latest + approved status atomically in one transaction
    await this.db.approveVersion(versionId, approvedBy, comment);

    this.logger.info('Version approved', {
      versionId,
      artifactId,
      approvedBy,
      version: version.version,
    });

    return {
      approved: true,
      versionId,
      artifactId,
      approvedBy,
    };
  }

  async rejectVersion(
    versionId: string,
    artifactId: string,
    rejectedBy: string,
    comment?: string,
  ): Promise<RejectionResult> {
    const version = await this.db.getVersionById(versionId);
    if (!version) {
      throw badRequest('Version not found', { versionId });
    }

    if (version.approval_status !== 'pending') {
      throw conflict('APPROVAL_DENIED', `Cannot reject a version with status: ${version.approval_status}`);
    }

    await this.db.rejectVersion(versionId, rejectedBy, comment);

    this.logger.info('Version rejected', {
      versionId,
      artifactId,
      rejectedBy,
      version: version.version,
    });

    return {
      rejected: true,
      versionId,
      artifactId,
      rejectedBy,
    };
  }

  /**
   * Evaluate whether a version qualifies for auto-approval based on policy.
   */
  evaluateAutoApproval(
    policy: ApprovalPolicy | null,
    _versionMajor: number,
    _versionMinor: number,
    _versionPatch: number,
    _prerelease: string | null,
  ): boolean {
    if (!policy) return false;
    // Auto-approve patches handled by webhook route (has access to previous version)
    // This method is for policy extension point
    return false;
  }
}
