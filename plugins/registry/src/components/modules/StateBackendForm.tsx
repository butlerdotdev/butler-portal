// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  makeStyles,
} from '@material-ui/core';
import type { StateBackendConfig } from '../../api/types/environments';

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
  saving: boolean;
  onSave: (backend: StateBackendConfig | null) => void;
}

export function StateBackendForm({
  value,
  saving,
  onSave,
}: StateBackendFormProps) {
  const classes = useStyles();

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
  }, [value]);

  const handleSave = () => {
    if (!backendType) {
      onSave(null);
      return;
    }

    let config: Record<string, unknown> = {};
    switch (backendType) {
      case 's3':
        config = { ...s3 };
        // Remove empty optional fields
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
          return;
        }
        break;
    }

    onSave({ type: backendType, config });
  };

  return (
    <>
      <Box className={classes.fieldRow}>
        <TextField
          select
          variant="outlined"
          label="Backend Type"
          value={backendType}
          onChange={e => setBackendType(e.target.value)}
          size="small"
          className={classes.field}
        >
          {BACKEND_TYPES.map(t => (
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
              onChange={e => setS3(prev => ({ ...prev, bucket: e.target.value }))}
              size="small"
              className={classes.field}
              required
            />
            <TextField
              variant="outlined"
              label="Key"
              value={s3.key}
              onChange={e => setS3(prev => ({ ...prev, key: e.target.value }))}
              size="small"
              className={classes.field}
              placeholder="terraform.tfstate"
              helperText="State file key path"
            />
            <TextField
              variant="outlined"
              label="Region"
              value={s3.region}
              onChange={e => setS3(prev => ({ ...prev, region: e.target.value }))}
              size="small"
              className={classes.field}
            />
          </Box>
          <Box className={classes.fieldRow}>
            <TextField
              variant="outlined"
              label="Endpoint (optional)"
              value={s3.endpoint}
              onChange={e => setS3(prev => ({ ...prev, endpoint: e.target.value }))}
              size="small"
              className={classes.field}
              placeholder="https://s3.amazonaws.com"
              helperText="Custom S3 endpoint"
            />
            <TextField
              variant="outlined"
              label="Access Key (optional)"
              value={s3.access_key}
              onChange={e => setS3(prev => ({ ...prev, access_key: e.target.value }))}
              size="small"
              className={classes.field}
              type="password"
            />
            <TextField
              variant="outlined"
              label="Secret Key (optional)"
              value={s3.secret_key}
              onChange={e => setS3(prev => ({ ...prev, secret_key: e.target.value }))}
              size="small"
              className={classes.field}
              type="password"
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
            onChange={e => setGcs(prev => ({ ...prev, bucket: e.target.value }))}
            size="small"
            className={classes.field}
            required
          />
          <TextField
            variant="outlined"
            label="Prefix (optional)"
            value={gcs.prefix}
            onChange={e => setGcs(prev => ({ ...prev, prefix: e.target.value }))}
            size="small"
            className={classes.field}
            placeholder="terraform/state"
          />
          <TextField
            variant="outlined"
            label="Project (optional)"
            value={gcs.project}
            onChange={e => setGcs(prev => ({ ...prev, project: e.target.value }))}
            size="small"
            className={classes.field}
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
            />
          </Box>
        )}

      <Box className={classes.saveRow}>
        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save State Backend'}
        </Button>
        {!backendType && (
          <Typography variant="caption" color="textSecondary">
            Clearing the backend type will remove the state backend
            configuration.
          </Typography>
        )}
      </Box>
    </>
  );
}
