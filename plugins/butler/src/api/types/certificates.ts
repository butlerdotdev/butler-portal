/*
 * Copyright 2026 The Butler Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Certificate health status based on expiry timeline.
 */
export type CertHealthStatus = 'Healthy' | 'Warning' | 'Critical' | 'Expired';

/**
 * Certificate category grouping.
 */
export type CertificateCategory =
  | 'api-server'
  | 'kubeconfig'
  | 'ca'
  | 'front-proxy'
  | 'service-account'
  | 'datastore'
  | 'konnectivity';

/**
 * Rotation scope type.
 */
export type RotationType = 'all' | 'kubeconfigs' | 'ca';

/**
 * Rotation operation status.
 */
export type RotationStatus =
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'unknown';

/**
 * Individual certificate information.
 */
export interface CertificateInfo {
  /** Kubernetes secret name containing this certificate */
  secretName: string;

  /** Key within the secret (e.g., "tls.crt") */
  secretKey: string;

  /** Certificate category */
  category: CertificateCategory;

  /** Certificate subject (CN, O, etc.) */
  subject: string;

  /** Certificate issuer */
  issuer: string;

  /** When the certificate becomes valid (ISO 8601) */
  notBefore: string;

  /** When the certificate expires (ISO 8601) */
  notAfter: string;

  /** Certificate serial number */
  serialNumber: string;

  /** Whether this is a CA certificate */
  isCA: boolean;

  /** DNS Subject Alternative Names */
  dnsNames?: string[];

  /** IP Subject Alternative Names */
  ipAddresses?: string[];

  /** Days until expiration (negative if expired) */
  daysUntilExpiry: number;

  /** Computed health status */
  healthStatus: CertHealthStatus;

  /** Days since certificate was issued */
  ageInDays: number;
}

/**
 * Certificate rotation event.
 */
export interface RotationEvent {
  /** Rotation scope */
  type: RotationType;

  /** User who initiated the rotation */
  initiatedBy: string;

  /** When rotation was triggered (ISO 8601) */
  initiatedAt: string;

  /** When rotation completed (ISO 8601), null if in progress */
  completedAt?: string;

  /** Current status */
  status: RotationStatus;

  /** List of affected secret names */
  affectedSecrets: string[];

  /** Additional context message */
  message?: string;
}

/**
 * Complete certificate information for a cluster.
 */
export interface ClusterCertificates {
  /** TenantCluster name */
  clusterName: string;

  /** TenantCluster namespace */
  namespace: string;

  /** Namespace containing Steward TCP resources */
  tcpNamespace?: string;

  /** Certificates grouped by category */
  categories: Record<CertificateCategory, CertificateInfo[]>;

  /** Worst health status across all certificates */
  overallHealth: CertHealthStatus;

  /** Earliest expiring certificate's expiration (ISO 8601) */
  earliestExpiry?: string;

  /** Whether a rotation is currently in progress */
  rotationInProgress: boolean;

  /** Most recent rotation event */
  lastRotation?: RotationEvent;

  /** Total number of certificates */
  certificateCount: number;
}

/**
 * Request body for certificate rotation.
 */
export interface RotateCertificatesRequest {
  /** Rotation scope */
  type: RotationType;

  /** Required for CA rotation - explicit acknowledgment of impact */
  acknowledge?: boolean;
}

/**
 * Category display labels and metadata.
 */
export const CERTIFICATE_CATEGORIES: Record<
  CertificateCategory,
  { label: string; description: string; order: number }
> = {
  'api-server': {
    label: 'API Server Certificates',
    description: 'TLS certificates for the Kubernetes API server',
    order: 1,
  },
  kubeconfig: {
    label: 'Kubeconfig Certificates',
    description: 'Client certificates embedded in kubeconfigs',
    order: 2,
  },
  ca: {
    label: 'Certificate Authority',
    description: 'Cluster CA used to sign other certificates',
    order: 3,
  },
  'front-proxy': {
    label: 'Front Proxy Certificates',
    description: 'Front proxy CA and client certificates',
    order: 4,
  },
  'service-account': {
    label: 'Service Account',
    description: 'ServiceAccount token signing key',
    order: 5,
  },
  datastore: {
    label: 'Datastore Certificates',
    description: 'etcd/datastore TLS certificates',
    order: 6,
  },
  konnectivity: {
    label: 'Konnectivity Certificates',
    description: 'Konnectivity server and client certificates',
    order: 7,
  },
};

/**
 * Health status display configuration.
 */
export const HEALTH_STATUS_CONFIG: Record<
  CertHealthStatus,
  { color: string; bgColor: string; icon: string; label: string }
> = {
  Healthy: {
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: '\u25CF',
    label: 'Healthy',
  },
  Warning: {
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    icon: '\u26A0',
    label: 'Warning',
  },
  Critical: {
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: '\u{1F534}',
    label: 'Critical',
  },
  Expired: {
    color: 'text-red-900',
    bgColor: 'bg-red-200',
    icon: '\u26D4',
    label: 'Expired',
  },
};

/**
 * Rotation type display configuration.
 */
export const ROTATION_TYPE_CONFIG: Record<
  RotationType,
  { label: string; description: string; warning: boolean }
> = {
  all: {
    label: 'Rotate All Certificates',
    description:
      'Rotates all non-CA certificates (API server, kubeconfigs, etc.)',
    warning: false,
  },
  kubeconfigs: {
    label: 'Rotate Kubeconfigs Only',
    description: 'Rotates only kubeconfig client certificates',
    warning: false,
  },
  ca: {
    label: 'Rotate Certificate Authority',
    description:
      'Rotates the cluster CA. This is a HIGH-IMPACT operation that invalidates all certificates.',
    warning: true,
  },
};

/**
 * Get sorted categories for display.
 */
export function getSortedCategories(): CertificateCategory[] {
  return (
    Object.entries(CERTIFICATE_CATEGORIES) as [
      CertificateCategory,
      { order: number },
    ][]
  )
    .sort((a, b) => a[1].order - b[1].order)
    .map(([category]) => category);
}

/**
 * Format days until expiry for display.
 */
export function formatDaysUntilExpiry(days: number): string {
  if (days < 0) {
    const absDays = Math.abs(days);
    return absDays === 1 ? 'Expired 1 day ago' : `Expired ${absDays} days ago`;
  }
  if (days === 0) {
    return 'Expires today';
  }
  if (days === 1) {
    return 'Expires tomorrow';
  }
  return `${days} days`;
}

/**
 * Format date for display.
 */
export function formatCertDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get health status counts from certificates.
 */
export function getHealthCounts(
  categories: Record<CertificateCategory, CertificateInfo[]>,
): Record<CertHealthStatus, number> {
  const counts: Record<CertHealthStatus, number> = {
    Healthy: 0,
    Warning: 0,
    Critical: 0,
    Expired: 0,
  };

  for (const certs of Object.values(categories)) {
    for (const cert of certs) {
      counts[cert.healthStatus]++;
    }
  }

  return counts;
}

/**
 * Get the worst health status for a category.
 */
export function getCategoryHealth(certs: CertificateInfo[]): CertHealthStatus {
  const order: CertHealthStatus[] = [
    'Healthy',
    'Warning',
    'Critical',
    'Expired',
  ];
  let worst: CertHealthStatus = 'Healthy';

  for (const cert of certs) {
    if (order.indexOf(cert.healthStatus) > order.indexOf(worst)) {
      worst = cert.healthStatus;
    }
  }

  return worst;
}
