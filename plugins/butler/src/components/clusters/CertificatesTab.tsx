// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerApiRef } from '../../api/ButlerApi';
import type {
  ClusterCertificates,
  CertHealthStatus,
  CertificateInfo,
  CertificateCategory,
  RotationType,
  RotationEvent,
} from '../../api/types/certificates';
import {
  CERTIFICATE_CATEGORIES,
  ROTATION_TYPE_CONFIG,
  getSortedCategories,
  formatDaysUntilExpiry,
  formatCertDate,
  getHealthCounts,
  getCategoryHealth,
} from '../../api/types/certificates';
import { useTeamContext } from '../../hooks/useTeamContext';
import { butlerTokens, rgb, rgba } from '../../theme';
import {
  AlertTriangleIcon,
  ButlerButton,
  ButlerCard,
  ButlerChip,
  ButlerDialog,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerInput,
  ButlerSpinner,
  ButlerStack,
} from '../ui';
import {
  ButlerCallout,
  ButlerCheckbox,
  ButlerDisclosure,
  ButlerLinkButton,
  ButlerMenu,
  ButlerMenuItem,
  ButlerStatGrid,
  ButlerStatTile,
} from '../ui/extras';

interface CertificatesTabProps {
  clusterNamespace: string;
  clusterName: string;
}

export const CERTIFICATES_EMPTY_TITLE = 'No certificates found';

type HealthTone = 'green' | 'yellow' | 'red';

// Console HEALTH_STATUS_CONFIG maps to untokenized light tints; the intent
// (green / yellow / red, expired darker red) is carried by tokens here.
const HEALTH_TONE: Record<CertHealthStatus, HealthTone> = {
  Healthy: 'green',
  Warning: 'yellow',
  Critical: 'red',
  Expired: 'red',
};

const TEXT_TONE: Record<HealthTone, 'textGreen' | 'textYellow' | 'textRed'> = {
  green: 'textGreen',
  yellow: 'textYellow',
  red: 'textRed',
};

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    loading: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 48,
      gap: 12,
      color: t.text.muted,
      fontFamily: t.fontSans,
    },
    overview: { padding: 24 },
    overviewHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    overviewTitle: {
      margin: 0,
      fontSize: 18,
      lineHeight: '28px',
      fontWeight: 600,
      color: t.text.strong,
    },
    overallPill: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 12px',
      borderRadius: t.radius.pill,
      fontSize: 14,
      lineHeight: '20px',
      fontWeight: 500,
    },
    pillDot: { width: 8, height: 8, borderRadius: '50%', backgroundColor: 'currentColor' },
    green: { backgroundColor: rgba(p.green[500], 0.1), color: rgb(p.green[400]) },
    yellow: { backgroundColor: rgba(p.yellow[500], 0.1), color: rgb(p.yellow[400]) },
    red: { backgroundColor: rgba(p.red[500], 0.1), color: rgb(p.red[400]) },
    textGreen: { color: rgb(p.green[400]) },
    textYellow: { color: rgb(p.yellow[400]) },
    textRed: { color: rgb(p.red[400]) },
    metrics: { marginBottom: 24 },
    lastRotation: {
      margin: '0 0 16px',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    inProgress: { marginLeft: 8, color: rgb(p.yellow[400]) },
    rotateButton: { position: 'relative' },
    chevron: { transition: 'transform 150ms' },
    chevronOpen: { transform: 'rotate(180deg)' },
    rotationBanner: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderRadius: t.radius.lg,
      border: `1px solid ${rgba(p.amber[500], 0.5)}`,
      backgroundColor: rgba(p.amber[500], 0.1),
      fontFamily: t.fontSans,
    },
    rotationSuccess: {
      borderColor: rgba(p.green[500], 0.5),
      backgroundColor: rgba(p.green[500], 0.1),
    },
    bannerTitle: {
      margin: 0,
      fontSize: 16,
      lineHeight: '24px',
      fontWeight: 500,
      color: rgb(p.amber[200]),
    },
    bannerTitleSuccess: { color: rgb(p.green[200]) },
    bannerBody: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: rgba(p.amber[300], 0.7),
    },
    bannerBodySuccess: { color: rgba(p.green[300], 0.7) },
    checkIcon: { color: rgb(p.green[400]), flexShrink: 0 },
    lastRotationFooter: {
      margin: 0,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
      textAlign: 'right',
    },
    certList: { display: 'flex', flexDirection: 'column', gap: 12 },
    cert: {
      border: `1px solid ${t.border}`,
      borderRadius: t.radius.lg,
      padding: 16,
      transition: 'border-color 150ms',
      '&:hover': { borderColor: rgb(p.neutral[700]) },
    },
    certTop: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
    },
    certNameRow: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
    healthDot: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      flexShrink: 0,
      backgroundColor: 'currentColor',
    },
    certName: {
      fontWeight: 500,
      color: t.text.strong,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    certMeta: {
      margin: '4px 0 0',
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    certExpiry: { textAlign: 'right', flexShrink: 0 },
    certDays: { margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 500 },
    certDaysHint: { margin: 0, fontSize: 12, lineHeight: '16px', color: t.text.subtle },
    certDates: {
      marginTop: 12,
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      fontSize: 14,
      lineHeight: '20px',
      color: t.text.subtle,
    },
    certDetails: {
      marginTop: 12,
      paddingTop: 12,
      borderTop: `1px solid ${t.border}`,
      fontSize: 14,
      lineHeight: '20px',
    },
    detailRow: { display: 'flex', padding: '4px 0', gap: 8 },
    detailLabel: { width: 96, flexShrink: 0, color: t.text.subtle },
    detailValue: { color: t.text.primary, overflowWrap: 'anywhere' },
    mono: { fontFamily: t.fontMono, fontSize: 12 },
    sans: { marginTop: 8 },
    sanList: { marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 },
    san: {
      padding: '2px 8px',
      borderRadius: t.radius.sm,
      backgroundColor: rgb(p.neutral[800]),
      fontFamily: t.fontMono,
      fontSize: 12,
      lineHeight: '16px',
      color: rgb(p.neutral[300]),
    },
    dialogText: { margin: 0, color: rgb(p.neutral[300]) },
    secretsLabel: { margin: '0 0 8px', fontSize: 14, color: t.text.muted },
    secrets: {
      margin: 0,
      padding: 12,
      maxHeight: 128,
      overflowY: 'auto',
      borderRadius: t.radius.lg,
      backgroundColor: t.surface,
      listStyle: 'none',
      fontFamily: t.fontMono,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.muted,
      '& li + li': { marginTop: 4 },
    },
    clusterLine: { margin: 0, fontSize: 14, color: t.text.subtle },
    clusterName: { color: rgb(p.neutral[300]), fontWeight: 500 },
    steps: {
      margin: 0,
      paddingLeft: 20,
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.neutral[300]),
      '& li + li': { marginTop: 8 },
    },
    emphasis: { color: rgb(p.amber[300]), fontWeight: 500 },
    recovery: {
      marginTop: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    recoveryBlock: {
      padding: 12,
      borderRadius: t.radius.sm,
      backgroundColor: rgba(p.neutral[950], 0.5),
    },
    recoveryTitle: { margin: 0, fontWeight: 500, color: rgb(p.neutral[200]) },
    recoveryCode: {
      display: 'block',
      margin: '4px 0 0',
      fontFamily: t.fontMono,
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.muted,
      whiteSpace: 'pre-wrap',
    },
    recoveryHint: { margin: '4px 0 0', fontSize: 12, color: t.text.subtle },
    confirmName: { fontFamily: t.fontMono, color: rgb(p.red[400]) },
    dialogError: {
      margin: 0,
      padding: 12,
      borderRadius: t.radius.lg,
      border: `1px solid ${rgba(p.red[500], 0.2)}`,
      backgroundColor: rgba(p.red[500], 0.1),
      fontSize: 14,
      color: rgb(p.red[400]),
    },
  };
});

const ChevronDown = ({ className }: { className?: string }) => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className={className}
    aria-hidden
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className={className}
    aria-hidden
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

function extractCN(subject: string): string | null {
  const match = subject.match(/CN=([^,]+)/);
  return match ? match[1] : null;
}

export const CertificatesTab = ({
  clusterNamespace,
  clusterName,
}: CertificatesTabProps) => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const { isAdmin } = useTeamContext();

  // Console gates rotation on canMutate (platform admin, not viewer).
  const canRotate = isAdmin;
  const canRotateCA = isAdmin;

  const [certificates, setCertificates] =
    useState<ClusterCertificates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  // Rotation dialog state
  const [rotateOpen, setRotateOpen] = useState(false);
  const [caOpen, setCaOpen] = useState(false);
  const [rotationType, setRotationType] = useState<RotationType>('all');
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  // Rotation status
  const [rotationStatus, setRotationStatus] =
    useState<RotationEvent | null>(null);
  const [rotationPolling, setRotationPolling] = useState(false);
  const [showRotationSuccess, setShowRotationSuccess] = useState(false);

  const fetchCertificates = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await api.getClusterCertificates(
        clusterNamespace,
        clusterName,
      );
      setCertificates(result);

      if (result.rotationInProgress) {
        setRotationPolling(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [api, clusterNamespace, clusterName]);

  // Poll rotation status when in progress
  useEffect(() => {
    if (!rotationPolling) return undefined;

    const interval = setInterval(async () => {
      try {
        const status = await api.getRotationStatus(
          clusterNamespace,
          clusterName,
        );
        setRotationStatus(status);

        if (status.status === 'completed' || status.status === 'failed') {
          setRotationPolling(false);
          if (status.status === 'completed') {
            setShowRotationSuccess(true);
            setTimeout(() => setShowRotationSuccess(false), 2000);
          }
          fetchCertificates();
        }
      } catch {
        setRotationPolling(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [rotationPolling, api, clusterNamespace, clusterName, fetchCertificates]);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const handleRotate = async () => {
    setRotating(true);
    setRotateError(null);
    try {
      const acknowledge = rotationType === 'ca' ? true : undefined;
      const result = await api.rotateCertificates(
        clusterNamespace,
        clusterName,
        rotationType,
        acknowledge,
      );
      setRotationStatus(result);
      setRotateOpen(false);
      setCaOpen(false);
      setRotationPolling(true);
    } catch (e) {
      setRotateError(
        e instanceof Error ? e.message : 'Failed to initiate rotation',
      );
    } finally {
      setRotating(false);
    }
  };

  const openRotation = (type: RotationType) => {
    setMenuAnchor(null);
    setRotationType(type);
    setRotateError(null);
    if (type === 'ca') {
      setCaOpen(true);
    } else {
      setRotateOpen(true);
    }
  };

  if (loading && !certificates) {
    return (
      <div className={classes.loading} role="progressbar" aria-busy>
        <ButlerSpinner />
        <span>Loading certificates...</span>
      </div>
    );
  }

  if (error && !certificates) {
    return (
      <ButlerErrorState
        message="Failed to load certificates"
        detail={error.message}
        onRetry={fetchCertificates}
      />
    );
  }

  if (!certificates || certificates.certificateCount === 0) {
    return (
      <ButlerEmptyState
        title={CERTIFICATES_EMPTY_TITLE}
        description="Certificate information is not available for this cluster. The cluster may still be provisioning, or Steward may not be managing its certificates."
      />
    );
  }

  const healthCounts = getHealthCounts(certificates.categories);
  const sortedCategories = getSortedCategories();
  const overallTone = HEALTH_TONE[certificates.overallHealth];
  const isRotationActive = certificates.rotationInProgress || rotationPolling;
  const showRotationBanner = isRotationActive || showRotationSuccess;
  const daysUntilEarliest = certificates.earliestExpiry
    ? Math.floor(
        (new Date(certificates.earliestExpiry).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  const affectedSecrets = (type: RotationType): string[] => {
    const secrets = new Set<string>();
    for (const [category, certList] of Object.entries(
      certificates.categories,
    )) {
      const include =
        (type === 'all' && category !== 'ca') ||
        (type === 'kubeconfigs' && category === 'kubeconfig') ||
        (type === 'ca' && category === 'ca');
      if (include) certList.forEach(c => secrets.add(c.secretName));
    }
    return Array.from(secrets);
  };

  return (
    <ButlerStack>
      {showRotationBanner && (
        <div
          className={clsx(
            classes.rotationBanner,
            showRotationSuccess && classes.rotationSuccess,
          )}
          role="status"
        >
          {showRotationSuccess ? (
            <CheckIcon className={classes.checkIcon} />
          ) : (
            <ButlerSpinner small />
          )}
          <div>
            <p
              className={clsx(
                classes.bannerTitle,
                showRotationSuccess && classes.bannerTitleSuccess,
              )}
            >
              {showRotationSuccess
                ? 'Certificate rotation complete'
                : 'Certificate rotation in progress'}
            </p>
            <p
              className={clsx(
                classes.bannerBody,
                showRotationSuccess && classes.bannerBodySuccess,
              )}
            >
              {showRotationSuccess
                ? 'New certificates have been generated successfully.'
                : 'This may take a few moments. The page will automatically refresh when complete.'}
              {!showRotationSuccess && rotationStatus?.initiatedBy && (
                <> Initiated by {rotationStatus.initiatedBy}.</>
              )}
              {!showRotationSuccess && rotationStatus?.message && (
                <> {rotationStatus.message}</>
              )}
            </p>
          </div>
        </div>
      )}

      <ButlerCard flush className={classes.overview}>
        <div className={classes.overviewHeader}>
          <h3 className={classes.overviewTitle}>Certificate Health</h3>
          <span className={clsx(classes.overallPill, classes[overallTone])}>
            <span className={classes.pillDot} aria-hidden />
            {certificates.overallHealth}
          </span>
        </div>

        <ButlerStatGrid className={classes.metrics}>
          <ButlerStatTile
            label="Healthy"
            value={healthCounts.Healthy}
            tone="green"
          />
          <ButlerStatTile
            label="Warning"
            value={healthCounts.Warning}
            tone="yellow"
          />
          <ButlerStatTile
            label="Critical"
            value={healthCounts.Critical + healthCounts.Expired}
            tone="red"
          />
          <ButlerStatTile
            label="Earliest Expiry"
            small
            value={
              certificates.earliestExpiry
                ? formatCertDate(certificates.earliestExpiry)
                : 'N/A'
            }
            detail={
              daysUntilEarliest !== null
                ? `(${formatDaysUntilExpiry(daysUntilEarliest)})`
                : undefined
            }
          />
        </ButlerStatGrid>

        {certificates.lastRotation && (
          <p className={classes.lastRotation}>
            Last Rotation: {formatCertDate(certificates.lastRotation.initiatedAt)}
            {certificates.lastRotation.initiatedBy && (
              <> by {certificates.lastRotation.initiatedBy}</>
            )}
            {certificates.lastRotation.status === 'in_progress' && (
              <span className={classes.inProgress}>(in progress)</span>
            )}
          </p>
        )}

        {canRotate && !isRotationActive && (
          <div className={classes.rotateButton}>
            <ButlerButton
              variant="secondary"
              onClick={e => setMenuAnchor(e.currentTarget)}
              aria-haspopup="menu"
              aria-expanded={Boolean(menuAnchor)}
            >
              Rotate Certificates
              <ChevronDown
                className={clsx(
                  classes.chevron,
                  menuAnchor && classes.chevronOpen,
                )}
              />
            </ButlerButton>
            <ButlerMenu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
              align="left"
            >
              {(['all', 'kubeconfigs', 'ca'] as RotationType[]).map(type => {
                const config = ROTATION_TYPE_CONFIG[type];
                const disabled = type === 'ca' && !canRotateCA;
                return (
                  <ButlerMenuItem
                    key={type}
                    label={config.label}
                    description={config.description}
                    warning={config.warning}
                    divided={config.warning}
                    disabled={disabled}
                    note={disabled ? 'Requires admin role' : undefined}
                    onClick={() => openRotation(type)}
                  />
                );
              })}
            </ButlerMenu>
          </div>
        )}
      </ButlerCard>

      <ButlerStack gap={16}>
        {sortedCategories.map(category => {
          const certs = certificates.categories[category];
          if (!certs || certs.length === 0) return null;
          return (
            <CertificateCategorySection
              key={category}
              category={category}
              certificates={certs}
            />
          );
        })}
      </ButlerStack>

      {certificates.lastRotation && !isRotationActive && (
        <p className={classes.lastRotationFooter}>
          Last rotation:{' '}
          {new Date(certificates.lastRotation.initiatedAt).toLocaleString()}
          {certificates.lastRotation.initiatedBy && (
            <> by {certificates.lastRotation.initiatedBy}</>
          )}
        </p>
      )}

      <RotationDialog
        open={rotateOpen}
        onClose={() => setRotateOpen(false)}
        clusterName={clusterName}
        rotationType={rotationType}
        affectedSecrets={rotateOpen ? affectedSecrets(rotationType) : []}
        onConfirm={handleRotate}
        loading={rotating}
        error={rotateError}
      />

      <CARotationDialog
        open={caOpen}
        onClose={() => setCaOpen(false)}
        clusterName={clusterName}
        onConfirm={handleRotate}
        loading={rotating}
        error={rotateError}
      />
    </ButlerStack>
  );
};

// ---------------------------------------------------------------------------
// Category section and certificate card (console CertificateCategory.tsx,
// with the gray-* leak replaced by neutral tokens)
// ---------------------------------------------------------------------------

function CertificateCategorySection({
  category,
  certificates,
}: {
  category: CertificateCategory;
  certificates: CertificateInfo[];
}) {
  const classes = useStyles();
  const config = CERTIFICATE_CATEGORIES[category];
  const health = getCategoryHealth(certificates);
  return (
    <ButlerDisclosure
      title={config.label}
      count={certificates.length}
      defaultOpen={category === 'apiserver' || category === 'kubeconfig'}
      adornment={<ButlerChip tone={HEALTH_TONE[health]}>{health}</ButlerChip>}
    >
      <div className={classes.certList}>
        {certificates.map((cert, idx) => (
          <CertificateCard
            key={`${cert.secretName}-${cert.secretKey}-${idx}`}
            cert={cert}
          />
        ))}
      </div>
    </ButlerDisclosure>
  );
}

function CertificateCard({ cert }: { cert: CertificateInfo }) {
  const classes = useStyles();
  const [showDetails, setShowDetails] = useState(false);
  const textTone = TEXT_TONE[HEALTH_TONE[cert.healthStatus]];
  const cn = extractCN(cert.subject);

  return (
    <div className={classes.cert}>
      <div className={classes.certTop}>
        <div style={{ minWidth: 0 }}>
          <div className={classes.certNameRow}>
            <span
              className={clsx(classes.healthDot, classes[textTone])}
              aria-hidden
            />
            <span className={classes.certName}>{cn || cert.subject}</span>
          </div>
          <p className={classes.certMeta}>Secret: {cert.secretName}</p>
        </div>
        <div className={classes.certExpiry}>
          <p className={clsx(classes.certDays, classes[textTone])}>
            {formatDaysUntilExpiry(cert.daysUntilExpiry)}
          </p>
          <p className={classes.certDaysHint}>until expiry</p>
        </div>
      </div>

      <div className={classes.certDates}>
        <span>Issued: {formatCertDate(cert.notBefore)}</span>
        <span aria-hidden>&rarr;</span>
        <span>Expires: {formatCertDate(cert.notAfter)}</span>
        {cert.isCA && <ButlerChip tone="blue">CA</ButlerChip>}
      </div>

      <div style={{ marginTop: 8 }}>
        <ButlerLinkButton
          tone="blue"
          onClick={() => setShowDetails(v => !v)}
          aria-expanded={showDetails}
        >
          {showDetails ? 'Hide details' : 'Show details'}
        </ButlerLinkButton>
      </div>

      {showDetails && (
        <div className={classes.certDetails}>
          <DetailRow label="Subject" value={cert.subject} />
          <DetailRow label="Issuer" value={cert.issuer} />
          <DetailRow label="Serial" value={cert.serialNumber} mono />
          <DetailRow label="Secret Key" value={cert.secretKey} mono />
          <DetailRow label="Age" value={`${cert.ageInDays} days`} />
          {cert.dnsNames && cert.dnsNames.length > 0 && (
            <div className={classes.sans}>
              <span className={classes.detailLabel}>DNS SANs:</span>
              <div className={classes.sanList}>
                {cert.dnsNames.map(dns => (
                  <span key={dns} className={classes.san}>
                    {dns}
                  </span>
                ))}
              </div>
            </div>
          )}
          {cert.ipAddresses && cert.ipAddresses.length > 0 && (
            <div className={classes.sans}>
              <span className={classes.detailLabel}>IP SANs:</span>
              <div className={classes.sanList}>
                {cert.ipAddresses.map(ip => (
                  <span key={ip} className={classes.san}>
                    {ip}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const classes = useStyles();
  return (
    <div className={classes.detailRow}>
      <span className={classes.detailLabel}>{label}:</span>
      <span className={clsx(classes.detailValue, mono && classes.mono)}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rotation dialogs (console RotationModals.tsx)
// ---------------------------------------------------------------------------

function RotationDialog({
  open,
  onClose,
  clusterName,
  rotationType,
  affectedSecrets,
  onConfirm,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  clusterName: string;
  rotationType: RotationType;
  affectedSecrets: string[];
  onConfirm: () => void;
  loading: boolean;
  error: string | null;
}) {
  const classes = useStyles();
  const title =
    rotationType === 'kubeconfigs'
      ? 'Rotate Kubeconfig Certificates'
      : 'Rotate All Certificates';
  const description =
    rotationType === 'kubeconfigs'
      ? 'This will regenerate all kubeconfig certificates. Existing kubeconfig files will become invalid and need to be re-downloaded.'
      : 'This will regenerate all cluster certificates except the Certificate Authority. The cluster will remain operational during rotation.';

  return (
    <ButlerDialog
      open={open}
      onClose={onClose}
      busy={loading}
      title={title}
      footer={
        <>
          <ButlerButton variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </ButlerButton>
          <ButlerButton onClick={onConfirm} disabled={loading}>
            {loading ? 'Rotating...' : 'Rotate Certificates'}
          </ButlerButton>
        </>
      }
    >
      <p className={classes.dialogText}>{description}</p>
      <ButlerCallout tone="amber" title="Impact Warning">
        <p>
          Users with downloaded kubeconfigs will need to re-download them after
          rotation completes.
        </p>
      </ButlerCallout>
      {affectedSecrets.length > 0 && (
        <div>
          <p className={classes.secretsLabel}>
            The following {affectedSecrets.length} secret(s) will be rotated:
          </p>
          <ul className={classes.secrets}>
            {affectedSecrets.map(secret => (
              <li key={secret}>{secret}</li>
            ))}
          </ul>
        </div>
      )}
      <p className={classes.clusterLine}>
        Cluster: <span className={classes.clusterName}>{clusterName}</span>
      </p>
      {error && (
        <p className={classes.dialogError} role="alert">
          {error}
        </p>
      )}
    </ButlerDialog>
  );
}

function CARotationDialog({
  open,
  onClose,
  clusterName,
  onConfirm,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  clusterName: string;
  onConfirm: () => void;
  loading: boolean;
  error: string | null;
}) {
  const classes = useStyles();
  const [confirmText, setConfirmText] = useState('');
  const [understandsImpact, setUnderstandsImpact] = useState(false);
  const canConfirm = confirmText === clusterName && understandsImpact;

  const close = () => {
    setConfirmText('');
    setUnderstandsImpact(false);
    onClose();
  };

  return (
    <ButlerDialog
      open={open}
      onClose={close}
      busy={loading}
      width={512}
      title="Rotate Certificate Authority"
      subtitle="Disruptive operation with cluster downtime"
      icon={<AlertTriangleIcon />}
      iconTone="danger"
      footer={
        <>
          <ButlerButton variant="secondary" onClick={close} disabled={loading}>
            Cancel
          </ButlerButton>
          <ButlerButton
            variant="danger"
            onClick={onConfirm}
            disabled={!canConfirm || loading}
          >
            {loading ? 'Rotating CA...' : 'Rotate Certificate Authority'}
          </ButlerButton>
        </>
      }
    >
      <ButlerCallout tone="danger" title="CRITICAL OPERATION">
        <p>
          This will rotate the root Certificate Authority and ALL dependent
          certificates. This is a disruptive operation that will temporarily
          break cluster connectivity.
        </p>
      </ButlerCallout>

      <ButlerCallout tone="neutral" title="What will happen:">
        <ol className={classes.steps}>
          <li>The CA certificate and all leaf certificates will be deleted</li>
          <li>
            Steward will regenerate new CA and all certificates signed by it
          </li>
          <li>
            The control plane API server will restart with new certificates
          </li>
          <li>
            <span className={classes.emphasis}>
              Worker nodes will go NotReady
            </span>{' '}
            until they receive the new CA trust bundle
          </li>
        </ol>
      </ButlerCallout>

      <ButlerCallout tone="amber" title="Worker Node Recovery Required">
        <p>
          After CA rotation, worker nodes must be updated with the new CA trust
          bundle. The recovery process depends on your node type:
        </p>
        <div className={classes.recovery}>
          <div className={classes.recoveryBlock}>
            <p className={classes.recoveryTitle}>Talos Linux Workers:</p>
            <code className={classes.recoveryCode}>
              talosctl -n &lt;worker-ip&gt; reboot
            </code>
            <p className={classes.recoveryHint}>
              Or restart the VM to trigger re-bootstrap with new CA.
            </p>
          </div>
          <div className={classes.recoveryBlock}>
            <p className={classes.recoveryTitle}>
              Kubeadm/Rocky Linux Workers:
            </p>
            <code className={classes.recoveryCode}>
              {'# Update /etc/kubernetes/pki/ca.crt with new CA\nsystemctl restart kubelet'}
            </code>
            <p className={classes.recoveryHint}>
              Copy the new CA certificate to each worker node and restart
              kubelet.
            </p>
          </div>
        </div>
      </ButlerCallout>

      <ButlerCheckbox
        checked={understandsImpact}
        onChange={e => setUnderstandsImpact(e.target.checked)}
        label="I understand that this operation will cause temporary cluster downtime and that I will need to manually recover worker nodes after the CA rotation completes."
      />

      <ButlerInput
        id="rotate-ca-confirm"
        label={
          <>
            Type <span className={classes.confirmName}>{clusterName}</span> to
            confirm
          </>
        }
        tone="danger"
        mono
        value={confirmText}
        onChange={e => setConfirmText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && canConfirm && !loading) onConfirm();
        }}
        placeholder={clusterName}
        disabled={loading}
        autoComplete="off"
      />
      {error && (
        <p className={classes.dialogError} role="alert">
          {error}
        </p>
      )}
    </ButlerDialog>
  );
}
