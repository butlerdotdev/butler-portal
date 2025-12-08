// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { Progress, EmptyState } from '@backstage/core-components';
import {
  Grid,
  Typography,
  Button,
  TextField,
  MenuItem,
  Stepper,
  Step,
  StepLabel,
  Box,
  Card,
  CardContent,
  Divider,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';
import CheckIcon from '@material-ui/icons/Check';
import { butlerApiRef } from '../../api/ButlerApi';
import type { Provider, ImageInfo, NetworkInfo } from '../../api/types/providers';

interface CreateClusterFormState {
  // Basic Info
  name: string;
  namespace: string;
  kubernetesVersion: string;
  providerConfigRef: string;

  // Workers
  workerReplicas: number;
  workerCPU: number;
  workerMemory: string;
  workerDiskSize: string;

  // Networking
  loadBalancerStart: string;
  loadBalancerEnd: string;

  // Harvester-specific
  harvesterNamespace: string;
  harvesterNetworkName: string;
  harvesterImageName: string;

  // Nutanix-specific
  nutanixClusterUUID: string;
  nutanixSubnetUUID: string;
  nutanixImageUUID: string;
  nutanixStorageContainerUUID: string;

  // Proxmox-specific
  proxmoxNode: string;
  proxmoxStorage: string;
  proxmoxTemplateID: string;
}

const KUBERNETES_VERSIONS = [
  '1.32.0',
  '1.31.4',
  '1.31.3',
  '1.30.8',
  '1.30.7',
  '1.29.12',
];

const STEPS = [
  'Basic Info',
  'Infrastructure',
  'Workers',
  'Networking',
  'Review',
];

const useStyles = makeStyles(theme => ({
  root: {
    maxWidth: 900,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(3),
  },
  stepper: {
    backgroundColor: 'transparent',
    padding: theme.spacing(3, 0),
  },
  stepContent: {
    minHeight: 300,
    padding: theme.spacing(3, 0),
  },
  formField: {
    marginBottom: theme.spacing(2),
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: theme.spacing(3),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  reviewCard: {
    marginBottom: theme.spacing(2),
  },
  reviewRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: theme.spacing(1, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  reviewLabel: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
  },
  reviewValue: {
    color: theme.palette.text.primary,
  },
  errorText: {
    color: theme.palette.error.main,
    marginTop: theme.spacing(1),
  },
}));

const initialFormState: CreateClusterFormState = {
  name: '',
  namespace: '',
  kubernetesVersion: '1.31.4',
  providerConfigRef: '',
  workerReplicas: 3,
  workerCPU: 4,
  workerMemory: '8Gi',
  workerDiskSize: '50Gi',
  loadBalancerStart: '',
  loadBalancerEnd: '',
  harvesterNamespace: 'default',
  harvesterNetworkName: '',
  harvesterImageName: '',
  nutanixClusterUUID: '',
  nutanixSubnetUUID: '',
  nutanixImageUUID: '',
  nutanixStorageContainerUUID: '',
  proxmoxNode: '',
  proxmoxStorage: 'local-lvm',
  proxmoxTemplateID: '',
};

export const CreateClusterPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const navigate = useNavigate();
  const { team } = useParams<{ team: string }>();

  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState<CreateClusterFormState>({
    ...initialFormState,
    namespace: team ? `team-${team}` : '',
  });

  // Providers
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);

  // Provider resources
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  // Fetch providers
  useEffect(() => {
    const fetchProviders = async () => {
      setProvidersLoading(true);
      try {
        const response = await api.listProviders();
        setProviders(response.providers || []);
      } catch {
        setProviders([]);
      } finally {
        setProvidersLoading(false);
      }
    };
    fetchProviders();
  }, [api]);

  // Get selected provider type
  const selectedProvider = providers.find(
    p =>
      p.metadata.name === form.providerConfigRef ||
      `${p.metadata.namespace}/${p.metadata.name}` === form.providerConfigRef,
  );
  const providerType = selectedProvider?.spec.provider || '';

  // Fetch provider images and networks when provider changes
  const fetchProviderResources = useCallback(async () => {
    if (!selectedProvider) {
      setImages([]);
      setNetworks([]);
      return;
    }

    setResourcesLoading(true);
    try {
      const [imagesRes, networksRes] = await Promise.all([
        api.listProviderImages(
          selectedProvider.metadata.namespace,
          selectedProvider.metadata.name,
        ),
        api.listProviderNetworks(
          selectedProvider.metadata.namespace,
          selectedProvider.metadata.name,
        ),
      ]);
      setImages(imagesRes.images || []);
      setNetworks(networksRes.networks || []);
    } catch {
      setImages([]);
      setNetworks([]);
    } finally {
      setResourcesLoading(false);
    }
  }, [api, selectedProvider]);

  useEffect(() => {
    if (selectedProvider) {
      fetchProviderResources();
    }
  }, [selectedProvider, fetchProviderResources]);

  const updateField = (field: keyof CreateClusterFormState, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setValidationErrors(prev => {
      const updated = { ...prev };
      delete updated[field];
      return updated;
    });
  };

  const validateStep = (step: number): boolean => {
    const errors: Record<string, string> = {};

    switch (step) {
      case 0: // Basic Info
        if (!form.name.trim()) {
          errors.name = 'Cluster name is required';
        } else if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(form.name)) {
          errors.name =
            'Must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric';
        }
        if (!form.kubernetesVersion) {
          errors.kubernetesVersion = 'Kubernetes version is required';
        }
        if (!form.providerConfigRef) {
          errors.providerConfigRef = 'Provider is required';
        }
        break;

      case 1: // Infrastructure
        if (providerType === 'harvester') {
          if (!form.harvesterImageName) {
            errors.harvesterImageName = 'Image is required';
          }
          if (!form.harvesterNetworkName) {
            errors.harvesterNetworkName = 'Network is required';
          }
        } else if (providerType === 'nutanix') {
          if (!form.nutanixClusterUUID) {
            errors.nutanixClusterUUID = 'Cluster UUID is required';
          }
          if (!form.nutanixSubnetUUID) {
            errors.nutanixSubnetUUID = 'Subnet UUID is required';
          }
          if (!form.nutanixImageUUID) {
            errors.nutanixImageUUID = 'Image UUID is required';
          }
        } else if (providerType === 'proxmox') {
          if (!form.proxmoxNode) {
            errors.proxmoxNode = 'Node is required';
          }
          if (!form.proxmoxStorage) {
            errors.proxmoxStorage = 'Storage is required';
          }
          if (!form.proxmoxTemplateID) {
            errors.proxmoxTemplateID = 'Template ID is required';
          }
        }
        break;

      case 2: // Workers
        if (form.workerReplicas < 1) {
          errors.workerReplicas = 'At least 1 worker replica is required';
        }
        if (form.workerCPU < 1) {
          errors.workerCPU = 'CPU must be at least 1';
        }
        break;

      case 3: // Networking
        if (!form.loadBalancerStart.trim()) {
          errors.loadBalancerStart = 'Start IP is required';
        }
        if (!form.loadBalancerEnd.trim()) {
          errors.loadBalancerEnd = 'End IP is required';
        }
        break;
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(activeStep)) {
      setActiveStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep(prev => prev - 1);
    setValidationErrors({});
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.createCluster({
        name: form.name,
        namespace: form.namespace || undefined,
        kubernetesVersion: form.kubernetesVersion,
        providerConfigRef: form.providerConfigRef,
        workerReplicas: form.workerReplicas,
        workerCPU: form.workerCPU,
        workerMemory: form.workerMemory,
        workerDiskSize: form.workerDiskSize,
        loadBalancerStart: form.loadBalancerStart,
        loadBalancerEnd: form.loadBalancerEnd,
        teamRef: team || undefined,
        // Harvester
        ...(providerType === 'harvester' && {
          harvesterNamespace: form.harvesterNamespace,
          harvesterNetworkName: form.harvesterNetworkName,
          harvesterImageName: form.harvesterImageName,
        }),
        // Nutanix
        ...(providerType === 'nutanix' && {
          nutanixClusterUUID: form.nutanixClusterUUID,
          nutanixSubnetUUID: form.nutanixSubnetUUID,
          nutanixImageUUID: form.nutanixImageUUID,
          nutanixStorageContainerUUID:
            form.nutanixStorageContainerUUID || undefined,
        }),
        // Proxmox
        ...(providerType === 'proxmox' && {
          proxmoxNode: form.proxmoxNode,
          proxmoxStorage: form.proxmoxStorage,
          proxmoxTemplateID: parseInt(form.proxmoxTemplateID, 10) || undefined,
        }),
      });
      navigate(`/butler/t/${team}/clusters`);
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'Failed to create cluster',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (providersLoading) {
    return <Progress />;
  }

  const renderBasicInfoStep = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} sm={6}>
        <TextField
          className={classes.formField}
          label="Cluster Name"
          value={form.name}
          onChange={e => updateField('name', e.target.value)}
          fullWidth
          variant="outlined"
          required
          error={!!validationErrors.name}
          helperText={
            validationErrors.name ||
            'Lowercase letters, numbers, and hyphens only'
          }
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          className={classes.formField}
          label="Namespace"
          value={form.namespace}
          onChange={e => updateField('namespace', e.target.value)}
          fullWidth
          variant="outlined"
          helperText="Defaults to the team namespace"
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          className={classes.formField}
          select
          label="Kubernetes Version"
          value={form.kubernetesVersion}
          onChange={e => updateField('kubernetesVersion', e.target.value)}
          fullWidth
          variant="outlined"
          required
          error={!!validationErrors.kubernetesVersion}
          helperText={validationErrors.kubernetesVersion}
        >
          {KUBERNETES_VERSIONS.map(version => (
            <MenuItem key={version} value={version}>
              v{version}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          className={classes.formField}
          select
          label="Provider"
          value={form.providerConfigRef}
          onChange={e => updateField('providerConfigRef', e.target.value)}
          fullWidth
          variant="outlined"
          required
          error={!!validationErrors.providerConfigRef}
          helperText={validationErrors.providerConfigRef}
        >
          {providers.length === 0 ? (
            <MenuItem value="" disabled>
              No providers available
            </MenuItem>
          ) : (
            providers.map(provider => (
              <MenuItem
                key={`${provider.metadata.namespace}/${provider.metadata.name}`}
                value={provider.metadata.name}
              >
                {provider.metadata.name} ({provider.spec.provider})
              </MenuItem>
            ))
          )}
        </TextField>
      </Grid>
    </Grid>
  );

  const renderInfrastructureStep = () => {
    if (resourcesLoading) {
      return <Progress />;
    }

    if (!providerType) {
      return (
        <EmptyState
          title="No provider selected"
          description="Go back and select a provider to configure infrastructure settings."
          missing="info"
        />
      );
    }

    switch (providerType) {
      case 'harvester':
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Harvester Configuration
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                className={classes.formField}
                label="Harvester Namespace"
                value={form.harvesterNamespace}
                onChange={e =>
                  updateField('harvesterNamespace', e.target.value)
                }
                fullWidth
                variant="outlined"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                className={classes.formField}
                select
                label="Network"
                value={form.harvesterNetworkName}
                onChange={e =>
                  updateField('harvesterNetworkName', e.target.value)
                }
                fullWidth
                variant="outlined"
                required
                error={!!validationErrors.harvesterNetworkName}
                helperText={validationErrors.harvesterNetworkName}
              >
                {networks.length === 0 ? (
                  <MenuItem value="" disabled>
                    No networks available
                  </MenuItem>
                ) : (
                  networks.map(network => (
                    <MenuItem key={network.id} value={network.name}>
                      {network.name}
                      {network.vlan !== undefined ? ` (VLAN ${network.vlan})` : ''}
                    </MenuItem>
                  ))
                )}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                className={classes.formField}
                select
                label="Image"
                value={form.harvesterImageName}
                onChange={e =>
                  updateField('harvesterImageName', e.target.value)
                }
                fullWidth
                variant="outlined"
                required
                error={!!validationErrors.harvesterImageName}
                helperText={validationErrors.harvesterImageName}
              >
                {images.length === 0 ? (
                  <MenuItem value="" disabled>
                    No images available
                  </MenuItem>
                ) : (
                  images.map(image => (
                    <MenuItem key={image.id} value={image.name}>
                      {image.name}
                      {image.os ? ` (${image.os})` : ''}
                    </MenuItem>
                  ))
                )}
              </TextField>
            </Grid>
          </Grid>
        );

      case 'nutanix':
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Nutanix Configuration
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                className={classes.formField}
                label="Cluster UUID"
                value={form.nutanixClusterUUID}
                onChange={e =>
                  updateField('nutanixClusterUUID', e.target.value)
                }
                fullWidth
                variant="outlined"
                required
                error={!!validationErrors.nutanixClusterUUID}
                helperText={validationErrors.nutanixClusterUUID}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                className={classes.formField}
                select
                label="Subnet"
                value={form.nutanixSubnetUUID}
                onChange={e =>
                  updateField('nutanixSubnetUUID', e.target.value)
                }
                fullWidth
                variant="outlined"
                required
                error={!!validationErrors.nutanixSubnetUUID}
                helperText={validationErrors.nutanixSubnetUUID}
              >
                {networks.length === 0 ? (
                  <MenuItem value="" disabled>
                    No subnets available
                  </MenuItem>
                ) : (
                  networks.map(network => (
                    <MenuItem key={network.id} value={network.id}>
                      {network.name}
                    </MenuItem>
                  ))
                )}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                className={classes.formField}
                select
                label="Image"
                value={form.nutanixImageUUID}
                onChange={e =>
                  updateField('nutanixImageUUID', e.target.value)
                }
                fullWidth
                variant="outlined"
                required
                error={!!validationErrors.nutanixImageUUID}
                helperText={validationErrors.nutanixImageUUID}
              >
                {images.length === 0 ? (
                  <MenuItem value="" disabled>
                    No images available
                  </MenuItem>
                ) : (
                  images.map(image => (
                    <MenuItem key={image.id} value={image.id}>
                      {image.name}
                    </MenuItem>
                  ))
                )}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                className={classes.formField}
                label="Storage Container UUID"
                value={form.nutanixStorageContainerUUID}
                onChange={e =>
                  updateField('nutanixStorageContainerUUID', e.target.value)
                }
                fullWidth
                variant="outlined"
                helperText="Optional"
              />
            </Grid>
          </Grid>
        );

      case 'proxmox':
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Proxmox Configuration
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                className={classes.formField}
                label="Node"
                value={form.proxmoxNode}
                onChange={e => updateField('proxmoxNode', e.target.value)}
                fullWidth
                variant="outlined"
                required
                error={!!validationErrors.proxmoxNode}
                helperText={
                  validationErrors.proxmoxNode ||
                  'Proxmox node to deploy VMs on'
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                className={classes.formField}
                label="Storage"
                value={form.proxmoxStorage}
                onChange={e =>
                  updateField('proxmoxStorage', e.target.value)
                }
                fullWidth
                variant="outlined"
                required
                error={!!validationErrors.proxmoxStorage}
                helperText={validationErrors.proxmoxStorage}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                className={classes.formField}
                select
                label="Template"
                value={form.proxmoxTemplateID}
                onChange={e =>
                  updateField('proxmoxTemplateID', e.target.value)
                }
                fullWidth
                variant="outlined"
                required
                error={!!validationErrors.proxmoxTemplateID}
                helperText={validationErrors.proxmoxTemplateID}
              >
                {images.length === 0 ? (
                  <MenuItem value="" disabled>
                    No templates available
                  </MenuItem>
                ) : (
                  images.map(image => (
                    <MenuItem key={image.id} value={image.id}>
                      {image.name} (ID: {image.id})
                    </MenuItem>
                  ))
                )}
              </TextField>
            </Grid>
          </Grid>
        );

      default:
        return (
          <EmptyState
            title={`Unknown provider type: ${providerType}`}
            description="The selected provider type is not supported for infrastructure configuration."
            missing="info"
          />
        );
    }
  };

  const renderWorkersStep = () => (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Typography variant="subtitle1" gutterBottom>
          Worker Node Configuration
        </Typography>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          Configure the worker node pool for your cluster.
        </Typography>
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          className={classes.formField}
          label="Replicas"
          type="number"
          value={form.workerReplicas}
          onChange={e =>
            updateField('workerReplicas', parseInt(e.target.value, 10) || 1)
          }
          fullWidth
          variant="outlined"
          inputProps={{ min: 1, max: 100 }}
          error={!!validationErrors.workerReplicas}
          helperText={
            validationErrors.workerReplicas ||
            'Number of worker nodes'
          }
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          className={classes.formField}
          label="CPU (cores)"
          type="number"
          value={form.workerCPU}
          onChange={e =>
            updateField('workerCPU', parseInt(e.target.value, 10) || 1)
          }
          fullWidth
          variant="outlined"
          inputProps={{ min: 1, max: 128 }}
          error={!!validationErrors.workerCPU}
          helperText={validationErrors.workerCPU || 'CPU cores per worker'}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          className={classes.formField}
          label="Memory"
          value={form.workerMemory}
          onChange={e => updateField('workerMemory', e.target.value)}
          fullWidth
          variant="outlined"
          helperText="e.g., 4Gi, 8Gi, 16Gi"
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          className={classes.formField}
          label="Disk Size"
          value={form.workerDiskSize}
          onChange={e => updateField('workerDiskSize', e.target.value)}
          fullWidth
          variant="outlined"
          helperText="e.g., 50Gi, 100Gi, 200Gi"
        />
      </Grid>
    </Grid>
  );

  const renderNetworkingStep = () => (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Typography variant="subtitle1" gutterBottom>
          Load Balancer IP Range
        </Typography>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          Define the IP address range for MetalLB load balancer services in the
          tenant cluster.
        </Typography>
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          className={classes.formField}
          label="Start IP"
          value={form.loadBalancerStart}
          onChange={e => updateField('loadBalancerStart', e.target.value)}
          fullWidth
          variant="outlined"
          required
          placeholder="10.0.1.100"
          error={!!validationErrors.loadBalancerStart}
          helperText={
            validationErrors.loadBalancerStart ||
            'First IP in the load balancer range'
          }
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          className={classes.formField}
          label="End IP"
          value={form.loadBalancerEnd}
          onChange={e => updateField('loadBalancerEnd', e.target.value)}
          fullWidth
          variant="outlined"
          required
          placeholder="10.0.1.110"
          error={!!validationErrors.loadBalancerEnd}
          helperText={
            validationErrors.loadBalancerEnd ||
            'Last IP in the load balancer range'
          }
        />
      </Grid>
    </Grid>
  );

  const renderReviewStep = () => {
    const providerLabel = selectedProvider
      ? `${selectedProvider.metadata.name} (${selectedProvider.spec.provider})`
      : form.providerConfigRef;

    const reviewSections: Array<{
      title: string;
      rows: Array<{ label: string; value: string | number }>;
    }> = [
      {
        title: 'Basic Information',
        rows: [
          { label: 'Cluster Name', value: form.name },
          { label: 'Namespace', value: form.namespace || `team-${team}` },
          { label: 'Kubernetes Version', value: `v${form.kubernetesVersion}` },
          { label: 'Provider', value: providerLabel },
        ],
      },
      {
        title: 'Worker Nodes',
        rows: [
          { label: 'Replicas', value: form.workerReplicas },
          { label: 'CPU', value: `${form.workerCPU} cores` },
          { label: 'Memory', value: form.workerMemory },
          { label: 'Disk Size', value: form.workerDiskSize },
        ],
      },
      {
        title: 'Networking',
        rows: [
          {
            label: 'LB IP Range',
            value: `${form.loadBalancerStart} - ${form.loadBalancerEnd}`,
          },
        ],
      },
    ];

    // Add provider-specific section
    if (providerType === 'harvester') {
      reviewSections.push({
        title: 'Harvester Infrastructure',
        rows: [
          { label: 'Namespace', value: form.harvesterNamespace },
          { label: 'Network', value: form.harvesterNetworkName },
          { label: 'Image', value: form.harvesterImageName },
        ],
      });
    } else if (providerType === 'nutanix') {
      const rows = [
        { label: 'Cluster UUID', value: form.nutanixClusterUUID },
        { label: 'Subnet UUID', value: form.nutanixSubnetUUID },
        { label: 'Image UUID', value: form.nutanixImageUUID },
      ];
      if (form.nutanixStorageContainerUUID) {
        rows.push({
          label: 'Storage Container UUID',
          value: form.nutanixStorageContainerUUID,
        });
      }
      reviewSections.push({
        title: 'Nutanix Infrastructure',
        rows,
      });
    } else if (providerType === 'proxmox') {
      reviewSections.push({
        title: 'Proxmox Infrastructure',
        rows: [
          { label: 'Node', value: form.proxmoxNode },
          { label: 'Storage', value: form.proxmoxStorage },
          { label: 'Template ID', value: form.proxmoxTemplateID },
        ],
      });
    }

    return (
      <div>
        <Typography variant="subtitle1" gutterBottom>
          Review your cluster configuration before creating.
        </Typography>
        {reviewSections.map(section => (
          <Card
            key={section.title}
            className={classes.reviewCard}
            variant="outlined"
          >
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                {section.title}
              </Typography>
              <Divider />
              {section.rows.map(row => (
                <div key={row.label} className={classes.reviewRow}>
                  <Typography
                    variant="body2"
                    className={classes.reviewLabel}
                  >
                    {row.label}
                  </Typography>
                  <Typography
                    variant="body2"
                    className={classes.reviewValue}
                  >
                    {row.value}
                  </Typography>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        {submitError && (
          <Typography className={classes.errorText}>
            Error: {submitError}
          </Typography>
        )}
      </div>
    );
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return renderBasicInfoStep();
      case 1:
        return renderInfrastructureStep();
      case 2:
        return renderWorkersStep();
      case 3:
        return renderNetworkingStep();
      case 4:
        return renderReviewStep();
      default:
        return null;
    }
  };

  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <Button
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(`/butler/t/${team}/clusters`)}
        >
          Back to Clusters
        </Button>
        <Typography variant="h4">Create Cluster</Typography>
      </div>

      <Stepper
        activeStep={activeStep}
        alternativeLabel
        className={classes.stepper}
      >
        {STEPS.map(label => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <div className={classes.stepContent}>{renderStepContent(activeStep)}</div>

      <div className={classes.actions}>
        <Button
          disabled={activeStep === 0}
          onClick={handleBack}
          startIcon={<ArrowBackIcon />}
        >
          Back
        </Button>
        <Box>
          {activeStep === STEPS.length - 1 ? (
            <Button
              variant="contained"
              color="primary"
              onClick={handleSubmit}
              disabled={submitting}
              startIcon={<CheckIcon />}
            >
              {submitting ? 'Creating...' : 'Create Cluster'}
            </Button>
          ) : (
            <Button
              variant="contained"
              color="primary"
              onClick={handleNext}
              endIcon={<ArrowForwardIcon />}
            >
              Next
            </Button>
          )}
        </Box>
      </div>
    </div>
  );
};
