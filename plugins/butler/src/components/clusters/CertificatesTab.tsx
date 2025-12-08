// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  Table,
  TableColumn,
  InfoCard,
  Progress,
  EmptyState,
  StatusOK,
  StatusWarning,
  StatusError,
} from '@backstage/core-components';
import {
  Grid,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Box,
  LinearProgress,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import RefreshIcon from '@material-ui/icons/Refresh';
import RotateLeftIcon from '@material-ui/icons/RotateLeft';
import { butlerApiRef } from '../../api/ButlerApi';
import type {
  ClusterCertificates,
  CertHealthStatus,
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
import { StatusBadge } from '../StatusBadge/StatusBadge';

interface CertificatesTabProps {
  clusterNamespace: string;
  clusterName: string;
}

const useStyles = makeStyles(theme => ({
  healthOverview: {
    display: 'flex',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(3),
  },
  healthCard: {
    flex: 1,
    textAlign: 'center',
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
  },
  healthCount: {
    fontSize: '2rem',
    fontWeight: 700,
  },
  healthyCount: {
    color: theme.palette.success.main,
  },
  warningCount: {
    color: theme.palette.warning.main,
  },
  criticalCount: {
    color: theme.palette.error.main,
  },
  expiredCount: {
    color: theme.palette.error.dark,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
  },
  categorySection: {
    marginBottom: theme.spacing(3),
  },
  categoryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
  },
  rotationWarning: {
    color: theme.palette.error.main,
    fontWeight: 600,
    marginTop: theme.spacing(1),
  },
  rotationProgress: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(2),
    border: `1px solid ${theme.palette.warning.light}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.warning.light + '10',
  },
}));

function HealthStatusDisplay({ status }: { status: CertHealthStatus }) {
  switch (status) {
    case 'Healthy':
      return <StatusOK>Healthy</StatusOK>;
    case 'Warning':
      return <StatusWarning>Warning</StatusWarning>;
    case 'Critical':
      return <StatusError>Critical</StatusError>;
    case 'Expired':
      return <StatusError>Expired</StatusError>;
    default:
      return <StatusBadge status={status} />;
  }
}

type CertificateRow = {
  id: string;
  secretName: string;
  subject: string;
  issuer: string;
  notAfter: string;
  daysUntilExpiry: number;
  healthStatus: CertHealthStatus;
  isCA: boolean;
};

export const CertificatesTab = ({
  clusterNamespace,
  clusterName,
}: CertificatesTabProps) => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);

  const [certificates, setCertificates] =
    useState<ClusterCertificates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  // Rotation dialog state
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotationType, setRotationType] = useState<RotationType>('all');
  const [caAcknowledged, setCaAcknowledged] = useState(false);
  const [rotating, setRotating] = useState(false);

  // Rotation status
  const [rotationStatus, setRotationStatus] =
    useState<RotationEvent | null>(null);
  const [rotationPolling, setRotationPolling] = useState(false);

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
    if (!rotationPolling) return;

    const interval = setInterval(async () => {
      try {
        const status = await api.getRotationStatus(
          clusterNamespace,
          clusterName,
        );
        setRotationStatus(status);

        if (
          status.status === 'completed' ||
          status.status === 'failed'
        ) {
          setRotationPolling(false);
          fetchCertificates();
        }
      } catch {
        setRotationPolling(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [
    rotationPolling,
    api,
    clusterNamespace,
    clusterName,
    fetchCertificates,
  ]);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const handleRotate = async () => {
    setRotating(true);
    try {
      const acknowledge = rotationType === 'ca' ? caAcknowledged : undefined;
      const result = await api.rotateCertificates(
        clusterNamespace,
        clusterName,
        rotationType,
        acknowledge,
      );
      setRotationStatus(result);
      setRotateOpen(false);
      setRotationPolling(true);
      setCaAcknowledged(false);
    } catch {
      // Error handled silently
    } finally {
      setRotating(false);
    }
  };

  if (loading) {
    return <Progress />;
  }

  if (error || !certificates) {
    return (
      <EmptyState
        title="Failed to load certificates"
        description={error?.message || 'Certificate information unavailable.'}
        missing="info"
      />
    );
  }

  const healthCounts = getHealthCounts(certificates.categories);
  const sortedCategories = getSortedCategories();

  const certColumns: TableColumn<CertificateRow>[] = [
    { title: 'Secret', field: 'secretName' },
    { title: 'Subject', field: 'subject' },
    { title: 'Issuer', field: 'issuer' },
    {
      title: 'Expires',
      field: 'notAfter',
      render: (row: CertificateRow) => formatCertDate(row.notAfter),
    },
    {
      title: 'Days Left',
      field: 'daysUntilExpiry',
      render: (row: CertificateRow) =>
        formatDaysUntilExpiry(row.daysUntilExpiry),
    },
    {
      title: 'Health',
      field: 'healthStatus',
      render: (row: CertificateRow) => (
        <HealthStatusDisplay status={row.healthStatus} />
      ),
    },
    {
      title: 'CA',
      field: 'isCA',
      render: (row: CertificateRow) =>
        row.isCA ? (
          <Chip label="CA" size="small" color="primary" variant="outlined" />
        ) : null,
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className={classes.headerRow}>
        <Typography variant="h6">Certificates</Typography>
        <div className={classes.actions}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchCertificates}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            size="small"
            color="primary"
            startIcon={<RotateLeftIcon />}
            onClick={() => setRotateOpen(true)}
            disabled={certificates.rotationInProgress}
          >
            Rotate Certificates
          </Button>
        </div>
      </div>

      {/* Rotation in Progress Banner */}
      {(certificates.rotationInProgress || rotationPolling) && (
        <Box className={classes.rotationProgress}>
          <Typography variant="subtitle2">
            Certificate rotation in progress...
          </Typography>
          <LinearProgress color="primary" style={{ marginTop: 8 }} />
          {rotationStatus && (
            <Typography variant="body2" color="textSecondary">
              Status: {rotationStatus.status} | Type: {rotationStatus.type}
              {rotationStatus.message && ` | ${rotationStatus.message}`}
            </Typography>
          )}
        </Box>
      )}

      {/* Health Overview */}
      <Box mt={2}>
        <InfoCard title="Certificate Health Overview">
          <div className={classes.healthOverview}>
            <div className={classes.healthCard}>
              <Typography
                className={`${classes.healthCount} ${classes.healthyCount}`}
              >
                {healthCounts.Healthy}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Healthy
              </Typography>
            </div>
            <div className={classes.healthCard}>
              <Typography
                className={`${classes.healthCount} ${classes.warningCount}`}
              >
                {healthCounts.Warning}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Warning
              </Typography>
            </div>
            <div className={classes.healthCard}>
              <Typography
                className={`${classes.healthCount} ${classes.criticalCount}`}
              >
                {healthCounts.Critical}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Critical
              </Typography>
            </div>
            <div className={classes.healthCard}>
              <Typography
                className={`${classes.healthCount} ${classes.expiredCount}`}
              >
                {healthCounts.Expired}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Expired
              </Typography>
            </div>
          </div>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Typography variant="body2" color="textSecondary">
                Overall Health
              </Typography>
              <HealthStatusDisplay status={certificates.overallHealth} />
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="textSecondary">
                Total Certificates
              </Typography>
              <Typography variant="h6">
                {certificates.certificateCount}
              </Typography>
            </Grid>
            {certificates.earliestExpiry && (
              <Grid item xs={6}>
                <Typography variant="body2" color="textSecondary">
                  Earliest Expiry
                </Typography>
                <Typography variant="body1">
                  {formatCertDate(certificates.earliestExpiry)}
                </Typography>
              </Grid>
            )}
            {certificates.lastRotation && (
              <Grid item xs={6}>
                <Typography variant="body2" color="textSecondary">
                  Last Rotation
                </Typography>
                <Typography variant="body1">
                  {formatCertDate(certificates.lastRotation.initiatedAt)} (
                  {certificates.lastRotation.status})
                </Typography>
              </Grid>
            )}
          </Grid>
        </InfoCard>
      </Box>

      {/* Certificate Categories */}
      {sortedCategories.map(category => {
        const certs = certificates.categories[category];
        if (!certs || certs.length === 0) return null;

        const categoryInfo = CERTIFICATE_CATEGORIES[category];
        const categoryHealth = getCategoryHealth(certs);

        const data: CertificateRow[] = certs.map(cert => ({
          id: `${cert.secretName}-${cert.secretKey}`,
          secretName: cert.secretName,
          subject: cert.subject,
          issuer: cert.issuer,
          notAfter: cert.notAfter,
          daysUntilExpiry: cert.daysUntilExpiry,
          healthStatus: cert.healthStatus,
          isCA: cert.isCA,
        }));

        return (
          <Box key={category} className={classes.categorySection} mt={2}>
            <div className={classes.categoryHeader}>
              <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                <Typography variant="subtitle1">
                  {categoryInfo.label}
                </Typography>
                <HealthStatusDisplay status={categoryHealth} />
              </Box>
              <Typography variant="caption" color="textSecondary">
                {categoryInfo.description}
              </Typography>
            </div>
            <Table<CertificateRow>
              options={{
                search: false,
                paging: false,
                padding: 'dense',
                toolbar: false,
              }}
              columns={certColumns}
              data={data}
            />
          </Box>
        );
      })}

      {/* Rotate Certificates Dialog */}
      <Dialog
        open={rotateOpen}
        onClose={() => setRotateOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rotate Certificates</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Select the scope of certificate rotation for this cluster.
          </Typography>
          <Box mt={2}>
            <TextField
              select
              label="Rotation Type"
              value={rotationType}
              onChange={e => {
                setRotationType(e.target.value as RotationType);
                setCaAcknowledged(false);
              }}
              fullWidth
              variant="outlined"
              size="small"
            >
              {(Object.entries(ROTATION_TYPE_CONFIG) as [RotationType, typeof ROTATION_TYPE_CONFIG['all']][]).map(
                ([key, config]) => (
                  <MenuItem key={key} value={key}>
                    {config.label}
                  </MenuItem>
                ),
              )}
            </TextField>
          </Box>
          <Box mt={2}>
            <Typography variant="body2" color="textSecondary">
              {ROTATION_TYPE_CONFIG[rotationType].description}
            </Typography>
          </Box>
          {rotationType === 'ca' && (
            <Box mt={2}>
              <Typography className={classes.rotationWarning}>
                WARNING: CA rotation is a high-impact operation. All existing
                certificates signed by the current CA will be invalidated. This
                will cause temporary disruption to the cluster.
              </Typography>
              <Box mt={1}>
                <Button
                  variant={caAcknowledged ? 'contained' : 'outlined'}
                  color={caAcknowledged ? 'primary' : 'default'}
                  size="small"
                  onClick={() => setCaAcknowledged(!caAcknowledged)}
                >
                  {caAcknowledged
                    ? 'Acknowledged'
                    : 'I understand the impact'}
                </Button>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRotateOpen(false)} disabled={rotating}>
            Cancel
          </Button>
          <Button
            onClick={handleRotate}
            color="primary"
            variant="contained"
            disabled={rotating || (rotationType === 'ca' && !caAcknowledged)}
          >
            {rotating ? 'Rotating...' : 'Rotate'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
