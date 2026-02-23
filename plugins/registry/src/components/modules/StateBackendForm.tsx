// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Chip,
  Collapse,
  makeStyles,
} from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import StorageIcon from '@material-ui/icons/Storage';
import type { StateBackendConfig } from '../../api/types/environments';
import { useRegistryApi } from '../../hooks/useRegistryApi';

const useStyles = makeStyles(theme => ({
  fieldRow: {
    display: 'flex',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap',
  },
  field: {
    minWidth: 200,
  },
  jsonField: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
  },
  saveRow: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'center',
    marginTop: theme.spacing(2),
  },
  managedBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    border: '1px solid rgba(34, 197, 94, 0.2)',
  },
  managedIcon: {
    color: '#4ade80',
    fontSize: 28,
  },
  overrideLink: {
    cursor: 'pointer',
    textDecoration: 'underline',
    color: theme.palette.text.secondary,
    fontSize: '0.75rem',
    '&:hover': {
      color: theme.palette.text.primary,
    },
  },
  testResult: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    marginTop: theme.spacing(1),
  },
  testOk: {
    color: '#4caf50',
    fontSize: 16,
  },
  testFail: {
    color: theme.palette.error.main,
    fontSize: 16,
  },
}));

const BACKEND_TYPES = [
  { value: '', label: 'None' },
  { value: 's3', label: 'S3' },
  { value: 'gcs', label: 'GCS (Google Cloud Storage)' },
  { value: 'azurerm', label: 'Azure RM' },
  { value: 'consul', label: 'Consul' },
  { value: 'http', label: 'HTTP' },
];

interface S3Fields {
  bucket: string;
  key: string;
  region: string;
  endpoint: string;
  access_key: string;
  secret_key: string;
}

interface GcsFields {
  bucket: string;
  prefix: string;
  project: string;
}

interface AzurermFields {
  resource_group_name: string;
  storage_account_name: string;
  container_name: string;
  key: string;
}

interface StateBackendFormProps {
  value: StateBackendConfig | null;
  saving?: boolean;
  onSave?: (backend: StateBackendConfig | null) => void;
  readOnly?: boolean;
  /** Project execution mode — controls whether state is managed or user-configured */
  executionMode?: 'byoc' | 'peaas';
}

export function StateBackendForm({
  value,
  saving = false,
  onSave,
  readOnly = false,
  executionMode,
}: StateBackendFormProps) {
  const classes = useStyles();
  const api = useRegistryApi();

  const [backendType, setBackendType] = useState(value?.type ?? '');
  const [s3, setS3] = useState<S3Fields>({
    bucket: '',
    key: '',
    region: 'us-east-1',
    endpoint: '',
    access_key: '',
    secret_key: '',
  });
  const [gcs, setGcs] = useState<GcsFields>({
    bucket: '',
    prefix: '',
    project: '',
  });
  const [azurerm, setAzurerm] = useState<AzurermFields>({
    resource_group_name: '',
    storage_account_name: '',
    container_name: '',
    key: '',
  });
  const [rawJson, setRawJson] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // PEaaS override toggle
  const [showOverride, setShowOverride] = useState(false);

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  // Load initial values from prop
  useEffect(() => {
    if (!value) return;
    setBackendType(value.type);
    const cfg = (value.config ?? {}) as Record<string, string>;
    switch (value.type) {
      case 's3':
        setS3({
          bucket: cfg.bucket ?? '',
          key: cfg.key ?? '',
          region: cfg.region ?? 'us-east-1',
          endpoint: cfg.endpoint ?? '',
          access_key: cfg.access_key ?? '',
          secret_key: cfg.secret_key ?? '',
        });
        break;
      case 'gcs':
        setGcs({
          bucket: cfg.bucket ?? '',
          prefix: cfg.prefix ?? '',
          project: cfg.project ?? '',
        });
        break;
      case 'azurerm':
        setAzurerm({
          resource_group_name: cfg.resource_group_name ?? '',
          storage_account_name: cfg.storage_account_name ?? '',
          container_name: cfg.container_name ?? '',
          key: cfg.key ?? '',
        });
        break;
      default:
        setRawJson(JSON.stringify(value.config ?? {}, null, 2));
        break;
    }
    // If PEaaS project already has an explicit backend, show the override form
    if (executionMode === 'peaas' && value.type) {
      setShowOverride(true);
    }
  }, [value, executionMode]);

  const buildCurrentConfig = (): {
    type: string;
    config: Record<string, unknown>;
  } | null => {
    if (!backendType) return null;

    let config: Record<string, unknown> = {};
    switch (backendType) {
      case 's3':
        config = { ...s3 };
        if (!config.endpoint) delete config.endpoint;
        if (!config.access_key) delete config.access_key;
        if (!config.secret_key) delete config.secret_key;
        break;
      case 'gcs':
        config = { ...gcs };
        if (!config.prefix) delete config.prefix;
        if (!config.project) delete config.project;
        break;
      case 'azurerm':
        config = { ...azurerm };
        break;
      default:
        try {
          config = JSON.parse(rawJson);
          setJsonError(null);
        } catch {
          setJsonError('Invalid JSON');
          return null;
        }
        break;
    }
    return { type: backendType, config };
  };

  const handleSave = () => {
    if (!onSave) return;
    if (!backendType) {
      onSave(null);
      return;
    }
    const current = buildCurrentConfig();
    if (!current) return;
    onSave({ type: current.type, config: current.config });
  };

  const handleTestConnection = async () => {
    const current = buildCurrentConfig();
    if (!current) return;

    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testStateBackend({
        type: current.type,
        config: current.config,
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        message:
          err instanceof Error ? err.message : 'Failed to test connection',
      });
    } finally {
      setTesting(false);
    }
  };

  // PEaaS managed state — show banner instead of form
  const isPeaasManaged = executionMode === 'peaas' && !showOverride;

  if (isPeaasManaged && !readOnly) {
    return (
      <>
        <Box className={classes.managedBanner}>
          <StorageIcon className={classes.managedIcon} />
          <Box>
            <Typography variant="subtitle2">
              Managed by Butler Labs
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Terraform state is automatically stored in Butler Labs'
              platform-managed storage. Each module gets a unique state key
              per environment.
            </Typography>
          </Box>
        </Box>
        <Box mt={1}>
          <Typography
            className={classes.overrideLink}
            onClick={() => setShowOverride(true)}
          >
            Use a custom state backend instead
          </Typography>
        </Box>
      </>
    );
  }

  if (isPeaasManaged && readOnly) {
    return (
      <Box className={classes.managedBanner}>
        <StorageIcon className={classes.managedIcon} />
        <Box>
          <Typography variant="subtitle2">
            Managed by Butler Labs
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Terraform state is automatically stored in platform-managed
            storage.
          </Typography>
        </Box>
      </Box>
    );
  }

  // BYOC required notice
  const showByocRequired =
    executionMode === 'byoc' && !backendType && !readOnly;

  return (
    <>
      {executionMode === 'peaas' && showOverride && !readOnly && (
        <Box mb={1}>
          <Typography
            className={classes.overrideLink}
            onClick={() => {
              setShowOverride(false);
              setBackendType('');
              setTestResult(null);
              if (onSave) onSave(null);
            }}
          >
            Switch back to Butler Labs managed state
          </Typography>
        </Box>
      )}

      <Box className={classes.fieldRow}>
        <TextField
          select
          variant="outlined"
          label="Backend Type"
          value={backendType}
          onChange={e => {
            setBackendType(e.target.value);
            setTestResult(null);
          }}
          size="small"
          className={classes.field}
          disabled={readOnly}
          error={showByocRequired}
          helperText={
            showByocRequired
              ? 'Required for BYOC projects — configure where Terraform state is stored.'
              : undefined
          }
        >
          {BACKEND_TYPES.filter(
            t => executionMode !== 'byoc' || t.value !== '',
          ).map(t => (
            <MenuItem key={t.value} value={t.value}>
              {t.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {backendType === 's3' && (
        <>
          <Box className={classes.fieldRow}>
            <TextField
              variant="outlined"
              label="Bucket"
              value={s3.bucket}
              onChange={e =>
                setS3(prev => ({ ...prev, bucket: e.target.value }))
              }
              size="small"
              className={classes.field}
              required
              disabled={readOnly}
            />
            <TextField
              variant="outlined"
              label="Key"
              value={s3.key}
              onChange={e =>
                setS3(prev => ({ ...prev, key: e.target.value }))
              }
              size="small"
              className={classes.field}
              placeholder="terraform.tfstate"
              helperText="State file key path (auto-generated per module if empty)"
              disabled={readOnly}
            />
            <TextField
              variant="outlined"
              label="Region"
              value={s3.region}
              onChange={e =>
                setS3(prev => ({ ...prev, region: e.target.value }))
              }
              size="small"
              className={classes.field}
              disabled={readOnly}
            />
          </Box>
          <Box className={classes.fieldRow}>
            <TextField
              variant="outlined"
              label="Endpoint (optional)"
              value={s3.endpoint}
              onChange={e =>
                setS3(prev => ({ ...prev, endpoint: e.target.value }))
              }
              size="small"
              className={classes.field}
              placeholder="https://s3.amazonaws.com"
              helperText="Custom S3-compatible endpoint (SeaweedFS, MinIO, etc.)"
              disabled={readOnly}
            />
            <TextField
              variant="outlined"
              label="Access Key (optional)"
              value={s3.access_key}
              onChange={e =>
                setS3(prev => ({ ...prev, access_key: e.target.value }))
              }
              size="small"
              className={classes.field}
              type="password"
              disabled={readOnly}
            />
            <TextField
              variant="outlined"
              label="Secret Key (optional)"
              value={s3.secret_key}
              onChange={e =>
                setS3(prev => ({ ...prev, secret_key: e.target.value }))
              }
              size="small"
              className={classes.field}
              type="password"
              disabled={readOnly}
            />
          </Box>
        </>
      )}

      {backendType === 'gcs' && (
        <Box className={classes.fieldRow}>
          <TextField
            variant="outlined"
            label="Bucket"
            value={gcs.bucket}
            onChange={e =>
              setGcs(prev => ({ ...prev, bucket: e.target.value }))
            }
            size="small"
            className={classes.field}
            required
            disabled={readOnly}
          />
          <TextField
            variant="outlined"
            label="Prefix (optional)"
            value={gcs.prefix}
            onChange={e =>
              setGcs(prev => ({ ...prev, prefix: e.target.value }))
            }
            size="small"
            className={classes.field}
            placeholder="terraform/state"
            disabled={readOnly}
          />
          <TextField
            variant="outlined"
            label="Project (optional)"
            value={gcs.project}
            onChange={e =>
              setGcs(prev => ({ ...prev, project: e.target.value }))
            }
            size="small"
            className={classes.field}
            disabled={readOnly}
          />
        </Box>
      )}

      {backendType === 'azurerm' && (
        <Box className={classes.fieldRow}>
          <TextField
            variant="outlined"
            label="Resource Group"
            value={azurerm.resource_group_name}
            onChange={e =>
              setAzurerm(prev => ({
                ...prev,
                resource_group_name: e.target.value,
              }))
            }
            size="small"
            className={classes.field}
            required
            disabled={readOnly}
          />
          <TextField
            variant="outlined"
            label="Storage Account"
            value={azurerm.storage_account_name}
            onChange={e =>
              setAzurerm(prev => ({
                ...prev,
                storage_account_name: e.target.value,
              }))
            }
            size="small"
            className={classes.field}
            required
            disabled={readOnly}
          />
          <TextField
            variant="outlined"
            label="Container"
            value={azurerm.container_name}
            onChange={e =>
              setAzurerm(prev => ({
                ...prev,
                container_name: e.target.value,
              }))
            }
            size="small"
            className={classes.field}
            required
            disabled={readOnly}
          />
          <TextField
            variant="outlined"
            label="Key"
            value={azurerm.key}
            onChange={e =>
              setAzurerm(prev => ({ ...prev, key: e.target.value }))
            }
            size="small"
            className={classes.field}
            required
            placeholder="terraform.tfstate"
            disabled={readOnly}
          />
        </Box>
      )}

      {backendType !== '' &&
        backendType !== 's3' &&
        backendType !== 'gcs' &&
        backendType !== 'azurerm' && (
          <Box mb={2}>
            <TextField
              variant="outlined"
              label="Configuration (JSON)"
              value={rawJson}
              onChange={e => {
                setRawJson(e.target.value);
                setJsonError(null);
              }}
              size="small"
              fullWidth
              multiline
              minRows={4}
              maxRows={12}
              error={!!jsonError}
              helperText={jsonError ?? 'Raw backend configuration as JSON'}
              InputProps={{ className: classes.jsonField }}
              disabled={readOnly}
            />
          </Box>
        )}

      {/* Test Connection Result */}
      <Collapse in={!!testResult}>
        {testResult && (
          <Box className={classes.testResult}>
            {testResult.ok ? (
              <CheckCircleIcon className={classes.testOk} />
            ) : (
              <ErrorIcon className={classes.testFail} />
            )}
            <Typography
              variant="body2"
              color={testResult.ok ? 'inherit' : 'error'}
            >
              {testResult.message}
            </Typography>
            {testResult.latencyMs !== undefined && (
              <Chip
                label={`${testResult.latencyMs}ms`}
                size="small"
                variant="outlined"
              />
            )}
          </Box>
        )}
      </Collapse>

      {!readOnly && (
        <Box className={classes.saveRow}>
          {backendType && (
            <Button
              variant="outlined"
              size="small"
              onClick={handleTestConnection}
              disabled={testing || !backendType}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
          )}
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save State Backend'}
          </Button>
          {!backendType && executionMode !== 'byoc' && (
            <Typography variant="caption" color="textSecondary">
              Clearing the backend type will remove the state backend
              configuration.
            </Typography>
          )}
        </Box>
      )}
    </>
  );
}
