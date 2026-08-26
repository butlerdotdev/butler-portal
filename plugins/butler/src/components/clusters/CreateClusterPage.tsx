// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent, InputHTMLAttributes, ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import clsx from 'clsx';
import { butlerApiRef } from '../../api/ButlerApi';
import { ButlerApiError, extractWebhookDenial } from '../../api/ButlerApiError';
import type {
  Provider,
  ImageInfo,
  NetworkInfo,
  PolicyMetadata,
} from '../../api/types/providers';
import { useButlerRoutes } from '../../hooks/useButlerRoutes';
import { useTeamContext } from '../../hooks/useTeamContext';
import { useTeamEnvironments } from '../../hooks/useTeamEnvironments';
import { useCanOperateTeam } from '../../hooks/useCanOperateTeam';
import {
  SERVER_DEFAULT_KUBERNETES_VERSION,
  SUPPORTED_KUBERNETES_VERSIONS,
  providerNetworkMode,
  requiresManualAddresses,
  resolveClusterDefaults,
} from '../../utils/clusterDefaults';
import { buildCreateClusterRequest } from '../../utils/createClusterRequest';
import { butlerTokens, rgb } from '../../theme';
import {
  ButlerButton,
  ButlerAccessDenied,
  ButlerCallout,
  ButlerCard,
  ButlerField,
  ButlerFormFooter,
  ButlerFormMessage,
  ButlerFormRow,
  ButlerFormSection,
  ButlerInput,
  ButlerInsetPanel,
  ButlerLoading,
  ButlerPageHeader,
  ButlerSelect,
  ButlerSpinner,
  ButlerStack,
  ButlerSwitch,
} from '../ui';

interface CreateClusterFormState {
  name: string;
  namespace: string;
  kubernetesVersion: string;
  providerConfigRef: string;
  workerReplicas: number;
  workerCPU: number;
  workerMemory: string;
  workerDiskSize: string;
  loadBalancerStart: string;
  loadBalancerEnd: string;
  harvesterNamespace: string;
  harvesterNetworkName: string;
  harvesterImageName: string;
  nutanixClusterUUID: string;
  nutanixSubnetUUID: string;
  nutanixImageUUID: string;
  nutanixStorageContainerUUID: string;
  proxmoxNode: string;
  proxmoxStorage: string;
  proxmoxTemplateID: string;
  workspacesEnabled: boolean;
  ingressEnabled: boolean;
  timeServers: string;
  cpApiServerCpuRequest: string;
  cpApiServerMemoryRequest: string;
  cpApiServerCpuLimit: string;
  cpApiServerMemoryLimit: string;
  cpControllerManagerCpuRequest: string;
  cpControllerManagerMemoryRequest: string;
  cpControllerManagerCpuLimit: string;
  cpControllerManagerMemoryLimit: string;
  cpSchedulerCpuRequest: string;
  cpSchedulerMemoryRequest: string;
  cpSchedulerCpuLimit: string;
  cpSchedulerMemoryLimit: string;
}

const useStyles = makeStyles(theme => {
  const t = butlerTokens(theme);
  const p = t.palette;
  return {
    root: {
      maxWidth: 672,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      fontFamily: t.fontSans,
    },
    forTeam: { color: t.accent },
    card: {
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
    },
    invalid: { borderColor: rgb(p.red[500]) },
    loadingField: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      border: `1px solid ${t.borderStrong}`,
      borderRadius: t.radius.lg,
      backgroundColor: rgb(p.neutral[800]),
      fontSize: 14,
      color: t.text.muted,
    },
    providerMissing: {
      fontSize: 14,
      lineHeight: '20px',
      color: rgb(p.red[400]),
    },
    advancedNote: {
      margin: '0 0 12px',
      fontSize: 12,
      lineHeight: '16px',
      color: t.text.subtle,
    },
    advancedLabel: {
      margin: '12px 0 6px',
      fontSize: 13,
      fontWeight: 500,
      color: t.text.muted,
    },
  };
});

/**
 * Server field names as the controls that carry them. The server answers
 * validation failures with its own request field names, which mostly but
 * not always match the form.
 */
const SERVER_FIELD_TO_CONTROL: Record<string, string> = {
  name: 'name',
  namespace: 'namespace',
  kubernetesVersion: 'kubernetesVersion',
  providerConfigRef: 'providerConfigRef',
  workerReplicas: 'workerReplicas',
  workerCPU: 'workerCPU',
  workerMemory: 'workerMemory',
  workerDiskSize: 'workerDiskSize',
  loadBalancerStart: 'loadBalancerStart',
  loadBalancerEnd: 'loadBalancerEnd',
  harvesterNetworkName: 'harvesterNetworkName',
  harvesterImageName: 'harvesterImageName',
  nutanixClusterUUID: 'nutanixClusterUUID',
  nutanixSubnetUUID: 'nutanixSubnetUUID',
  nutanixImageUUID: 'nutanixImageUUID',
  proxmoxNode: 'proxmoxNode',
  proxmoxStorage: 'proxmoxStorage',
  osType: 'harvesterImageName',
  timeServers: 'timeServers',
  // The admission webhook answers with the path on the resource rather
  // than the request field, so those are mapped too.
  'spec.providerConfigRef.name': 'providerConfigRef',
  'metadata.labels[butler.butlerlabs.dev/environment]': 'environment',
  'metadata.name': 'name',
};

/**
 * What a ClusterCreationPolicy did to a list of options.
 *
 * The server applied the rule before answering, so this explains a list
 * that is already shorter or already reordered rather than offering a
 * choice. Saying nothing would leave a filtered list looking like the
 * provider simply has less to offer.
 */
const PolicyNote = ({
  policy,
  noun,
}: {
  policy: PolicyMetadata;
  noun: string;
}) => {
  const explanation =
    policy.mode === 'pin' || policy.mode === 'allowList'
      ? `Only the ${noun} options your platform allows are listed.`
      : policy.mode === 'recommended'
      ? `Recommended ${noun} options are listed first.`
      : `Your platform suggests a default ${noun}.`;
  return (
    <ButlerCallout tone="violet" compact title={`Policy: ${policy.name}`}>
      {explanation}
      {policy.recommendedReason ? ` ${policy.recommendedReason}` : ''}
    </ButlerCallout>
  );
};

const initialFormState: CreateClusterFormState = {
  name: '',
  namespace: '',
  kubernetesVersion: SERVER_DEFAULT_KUBERNETES_VERSION,
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
  workspacesEnabled: true,
  ingressEnabled: true,
  timeServers: '',
  cpApiServerCpuRequest: '',
  cpApiServerMemoryRequest: '',
  cpApiServerCpuLimit: '',
  cpApiServerMemoryLimit: '',
  cpControllerManagerCpuRequest: '',
  cpControllerManagerMemoryRequest: '',
  cpControllerManagerCpuLimit: '',
  cpControllerManagerMemoryLimit: '',
  cpSchedulerCpuRequest: '',
  cpSchedulerMemoryRequest: '',
  cpSchedulerCpuLimit: '',
  cpSchedulerMemoryLimit: '',
};

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  mono?: boolean;
}

/** Labelled console input with the red error border and message. */
const TextField = ({
  label,
  required,
  hint,
  help,
  error,
  mono,
  className,
  ...props
}: TextFieldProps) => {
  const classes = useStyles();
  const id = useId();
  return (
    <ButlerField
      label={
        <>
          {label}
          {required && ' *'}
          {hint}
        </>
      }
      htmlFor={id}
      help={help}
      error={error}
    >
      <ButlerInput
        id={id}
        mono={mono}
        aria-invalid={error ? true : undefined}
        className={clsx(error && classes.invalid, className)}
        {...props}
      />
    </ButlerField>
  );
};

export const CreateClusterPage = () => {
  const classes = useStyles();
  const api = useApi(butlerApiRef);
  const routes = useButlerRoutes();
  const navigate = useNavigate();
  const { team } = useParams<{ team: string }>();
  const { teams } = useTeamContext();
  // The environments this team defines. When it defines none the section
  // is not shown at all, which is the state most teams are in.
  const { environments, teamClusterDefaults } = useTeamEnvironments(team);
  const canCreate = useCanOperateTeam(team);
  const [environment, setEnvironment] = useState('');
  const activeTeam = teams.find(t => t.name === team);
  const teamDisplayName = activeTeam?.displayName || team;
  // The team's namespace comes from the server. Deriving it as
  // `team-{name}` produced a namespace that does not exist.
  const teamNamespace = activeTeam?.namespace || team || '';

  const [form, setForm] = useState<CreateClusterFormState>({
    ...initialFormState,
    namespace: teamNamespace,
  });

  useEffect(() => {
    setForm(prev =>
      prev.namespace === teamNamespace
        ? prev
        : { ...prev, namespace: teamNamespace },
    );
  }, [teamNamespace]);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  // What a ClusterCreationPolicy did to each list. The server has already
  // filtered or reordered; this is only so the form can say so and honour
  // the suggested default.
  const [imagePolicy, setImagePolicy] = useState<PolicyMetadata | null>(null);
  const [networkPolicy, setNetworkPolicy] = useState<PolicyMetadata | null>(
    null,
  );
  // Only meaningful where the platform allocates addresses.
  const [overrideAllocation, setOverrideAllocation] = useState(false);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

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

  const selectedProvider = providers.find(
    p =>
      p.metadata.name === form.providerConfigRef ||
      `${p.metadata.namespace}/${p.metadata.name}` === form.providerConfigRef,
  );
  const providerType = selectedProvider?.spec.provider || '';
  const networkMode = providerNetworkMode(selectedProvider?.spec.network?.mode);
  const needsAddresses = requiresManualAddresses(
    networkMode,
    overrideAllocation,
  );

  // A team sets defaults for its clusters and an environment may narrow
  // them, so both are resolved together and the form says which layer a
  // prefilled value came from.
  const selectedEnvironment = environments.find(e => e.name === environment);
  const defaults = useMemo(
    () =>
      resolveClusterDefaults(
        teamClusterDefaults,
        selectedEnvironment?.clusterDefaults,
      ),
    [teamClusterDefaults, selectedEnvironment?.clusterDefaults],
  );

  // Applied only to fields the user has not touched, so switching
  // environment updates untouched values without discarding edits.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setForm(prev => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(defaults.values)) {
        if (value === undefined || touched[key]) continue;
        (next as Record<string, unknown>)[key] = value;
      }
      return next;
    });
  }, [defaults, touched]);

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
      setImagePolicy(imagesRes.policy ?? null);
      setNetworkPolicy(networksRes.policy ?? null);
    } catch {
      setImages([]);
      setNetworks([]);
      setImagePolicy(null);
      setNetworkPolicy(null);
    } finally {
      setResourcesLoading(false);
    }
  }, [api, selectedProvider]);

  useEffect(() => {
    if (selectedProvider) {
      fetchProviderResources();
    }
  }, [selectedProvider, fetchProviderResources]);

  const updateField = (
    field: keyof CreateClusterFormState,
    value: string | number | boolean,
  ) => {
    setForm(prev => ({ ...prev, [field]: value }));
    // Once a field is edited, a change of environment must not overwrite it.
    setTouched(prev => (prev[field] ? prev : { ...prev, [field]: true }));
    setValidationErrors(prev => {
      if (!(field in prev)) return prev;
      const updated = { ...prev };
      delete updated[field];
      return updated;
    });
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!form.name.trim()) {
      errors.name = 'Cluster name is required';
    } else if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(form.name)) {
      errors.name =
        'Must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric';
    }
    if (!form.kubernetesVersion) {
      errors.kubernetesVersion = 'Control plane version is required';
    }
    if (!form.providerConfigRef) {
      errors.providerConfigRef = 'Provider is required';
    }

    if (providerType === 'harvester') {
      if (!form.harvesterNetworkName) {
        errors.harvesterNetworkName = 'Network is required for Harvester';
      }
      if (!form.harvesterImageName) {
        errors.harvesterImageName = 'OS Image is required for Harvester';
      }
    } else if (providerType === 'nutanix') {
      if (!form.nutanixClusterUUID) {
        errors.nutanixClusterUUID = 'Cluster UUID is required for Nutanix';
      }
      if (!form.nutanixSubnetUUID) {
        errors.nutanixSubnetUUID = 'Subnet is required for Nutanix';
      }
      if (!form.nutanixImageUUID) {
        errors.nutanixImageUUID = 'Image is required for Nutanix';
      }
    } else if (providerType === 'proxmox') {
      if (!form.proxmoxNode) {
        errors.proxmoxNode = 'Node is required for Proxmox';
      }
      if (!form.proxmoxStorage) {
        errors.proxmoxStorage = 'Storage is required for Proxmox';
      }
      if (!form.proxmoxTemplateID) {
        errors.proxmoxTemplateID = 'Template is required for Proxmox';
      }
    }

    if (form.workerReplicas < 1) {
      errors.workerReplicas = 'At least 1 worker replica is required';
    }
    if (form.workerCPU < 1) {
      errors.workerCPU = 'CPU must be at least 1';
    }

    // Only where the caller is the one supplying the range. In ipam mode
    // the platform allocates and demanding a range would block the normal
    // path; a cloud provider owns addressing outright.
    if (needsAddresses) {
      if (!form.loadBalancerStart.trim()) {
        errors.loadBalancerStart = 'Load balancer start IP is required';
      }
      if (!form.loadBalancerEnd.trim()) {
        errors.loadBalancerEnd = 'Load balancer end IP is required';
      }
    }

    // A team that defines environments places every new cluster in one;
    // the server would otherwise create it outside all of them.
    if (environments.length > 0 && !environment) {
      errors.environment = 'Environment is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) {
      setSubmitError('Please fix the highlighted fields before creating.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.createCluster(
        buildCreateClusterRequest({
          form,
          providerType,
          networkMode,
          overrideAllocation,
          team: team || undefined,
          images,
        }),
        environment ? { environment } : undefined,
      );
      // The server has accepted the resource; the controller provisions it
      // afterwards, so the cluster is requested rather than ready. Land on
      // its detail page so that progress is what the user sees next.
      const namespace = created?.metadata?.namespace || form.namespace;
      if (namespace && created?.metadata?.name) {
        navigate(
          routes.clusterDetail({
            team: team ?? '',
            namespace,
            name: created.metadata.name,
          }),
        );
        return;
      }
      navigate(routes.clusters({ team: team ?? '' }));
    } catch (err) {
      // A field the server names is shown against that control; anything
      // it cannot attribute stays at the top of the form.
      if (err instanceof ButlerApiError && err.fieldErrors.length > 0) {
        const mapped: Record<string, string> = {};
        for (const fieldError of err.fieldErrors) {
          const control = SERVER_FIELD_TO_CONTROL[fieldError.field];
          if (control) mapped[control] = fieldError.reason;
        }
        setValidationErrors(prev => ({ ...prev, ...mapped }));
        const unmapped = err.fieldErrors.filter(
          f => !SERVER_FIELD_TO_CONTROL[f.field],
        );
        setSubmitError(
          unmapped.length > 0
            ? unmapped.map(f => `${f.field}: ${f.reason}`).join('; ')
            : err.message,
        );
        setSubmitting(false);
        return;
      }
      setSubmitError(
        err instanceof Error
          ? extractWebhookDenial(err.message)
          : 'Failed to create cluster',
      );
      setSubmitting(false);
    }
  };

  const cancel = () => navigate(routes.clusters({ team: team ?? '' }));

  // butler-server refuses creation to a viewer of either kind, so the
  // form is not offered to them: filling it in only to be refused is
  // worse than being told plainly. The server still decides.
  if (!canCreate) {
    return (
      <ButlerStack>
        <ButlerPageHeader
          title="Create Cluster"
          subtitle={teamDisplayName ? `Team ${teamDisplayName}` : undefined}
        />
        <ButlerAccessDenied
          message="Your role on this team can read clusters but not create them. A team admin can create one, or grant you the operator role."
          resourceType="cluster"
        />
      </ButlerStack>
    );
  }

  if (providersLoading) {
    return <ButlerLoading />;
  }

  const renderProviderFields = () => {
    if (resourcesLoading) {
      return (
        <div className={classes.loadingField}>
          <ButlerSpinner small />
          Loading provider resources...
        </div>
      );
    }
    switch (providerType) {
      case 'harvester':
        return (
          <ButlerFormRow>
            <TextField
              label="Harvester Namespace"
              value={form.harvesterNamespace}
              onChange={e => updateField('harvesterNamespace', e.target.value)}
              placeholder="default"
            />
            <ButlerSelect
              label="Network *"
              value={form.harvesterNetworkName}
              onChange={e =>
                updateField('harvesterNetworkName', e.target.value)
              }
              error={validationErrors.harvesterNetworkName}
              help="VM network for worker nodes"
            >
              <option value="">
                {networks.length === 0
                  ? 'No networks available'
                  : 'Select network...'}
              </option>
              {networks.map(network => (
                <option key={network.id} value={network.name}>
                  {network.name}
                  {network.vlan !== undefined ? ` (VLAN ${network.vlan})` : ''}
                </option>
              ))}
            </ButlerSelect>
            <ButlerSelect
              label="OS Image *"
              value={form.harvesterImageName}
              onChange={e => updateField('harvesterImageName', e.target.value)}
              error={validationErrors.harvesterImageName}
              help="OS image for worker nodes"
            >
              <option value="">
                {images.length === 0
                  ? 'No images available'
                  : 'Select image...'}
              </option>
              {images.map(image => (
                <option key={image.id} value={image.name}>
                  {image.name}
                  {image.os ? ` (${image.os})` : ''}
                </option>
              ))}
            </ButlerSelect>
          </ButlerFormRow>
        );
      case 'nutanix':
        return (
          <ButlerFormRow>
            <TextField
              label="Cluster UUID"
              required
              value={form.nutanixClusterUUID}
              onChange={e => updateField('nutanixClusterUUID', e.target.value)}
              error={validationErrors.nutanixClusterUUID}
              mono
            />
            <ButlerSelect
              label="Subnet *"
              value={form.nutanixSubnetUUID}
              onChange={e => updateField('nutanixSubnetUUID', e.target.value)}
              error={validationErrors.nutanixSubnetUUID}
            >
              <option value="">
                {networks.length === 0
                  ? 'No subnets available'
                  : 'Select subnet...'}
              </option>
              {networks.map(network => (
                <option key={network.id} value={network.id}>
                  {network.name}
                </option>
              ))}
            </ButlerSelect>
            <ButlerSelect
              label="Image *"
              value={form.nutanixImageUUID}
              onChange={e => updateField('nutanixImageUUID', e.target.value)}
              error={validationErrors.nutanixImageUUID}
            >
              <option value="">
                {images.length === 0
                  ? 'No images available'
                  : 'Select image...'}
              </option>
              {images.map(image => (
                <option key={image.id} value={image.id}>
                  {image.name}
                </option>
              ))}
            </ButlerSelect>
            <TextField
              label="Storage Container UUID"
              value={form.nutanixStorageContainerUUID}
              onChange={e =>
                updateField('nutanixStorageContainerUUID', e.target.value)
              }
              help="Optional"
              mono
            />
          </ButlerFormRow>
        );
      case 'proxmox':
        return (
          <ButlerFormRow>
            <TextField
              label="Node"
              required
              value={form.proxmoxNode}
              onChange={e => updateField('proxmoxNode', e.target.value)}
              placeholder="pve1"
              error={validationErrors.proxmoxNode}
              help="Proxmox node to deploy VMs on"
            />
            <TextField
              label="Storage"
              required
              value={form.proxmoxStorage}
              onChange={e => updateField('proxmoxStorage', e.target.value)}
              placeholder="local-lvm"
              error={validationErrors.proxmoxStorage}
            />
            <ButlerSelect
              label="Template *"
              value={form.proxmoxTemplateID}
              onChange={e => updateField('proxmoxTemplateID', e.target.value)}
              error={validationErrors.proxmoxTemplateID}
            >
              <option value="">
                {images.length === 0
                  ? 'No templates available'
                  : 'Select template...'}
              </option>
              {images.map(image => (
                <option key={image.id} value={image.id}>
                  {image.name} (ID: {image.id})
                </option>
              ))}
            </ButlerSelect>
          </ButlerFormRow>
        );
      default:
        return (
          <ButlerFormMessage tone="danger">
            Unknown provider type: {providerType}. The selected provider type is
            not supported for infrastructure configuration.
          </ButlerFormMessage>
        );
    }
  };

  return (
    <div className={classes.root}>
      <ButlerPageHeader
        title="Create Cluster"
        subtitle={
          <>
            Deploy a new tenant Kubernetes cluster
            {team && (
              <span className={classes.forTeam}> for {teamDisplayName}</span>
            )}
          </>
        }
        onBack={cancel}
      />

      <form onSubmit={handleSubmit} noValidate>
        <ButlerCard flush className={classes.card}>
          <ButlerFormSection title="Basic Information">
            <ButlerFormRow>
              <TextField
                label="Cluster Name"
                required
                value={form.name}
                onChange={e => updateField('name', e.target.value)}
                placeholder="my-cluster"
                error={validationErrors.name}
                help="Lowercase letters, numbers, and hyphens only"
                autoFocus
              />
              <TextField
                label="Namespace"
                hint={
                  team && (
                    <span
                      style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}
                    >
                      (from team)
                    </span>
                  )
                }
                value={form.namespace}
                onChange={e => updateField('namespace', e.target.value)}
                disabled={Boolean(team)}
                help="Defaults to the team namespace"
              />
              <ButlerSelect
                label="Control Plane Version"
                value={form.kubernetesVersion}
                onChange={e => updateField('kubernetesVersion', e.target.value)}
                error={validationErrors.kubernetesVersion}
                help={
                  defaults.sources.kubernetesVersion
                    ? `Default from this ${defaults.sources.kubernetesVersion}. Worker kubelet version comes from the OS image.`
                    : 'Worker kubelet version is determined by the OS image.'
                }
              >
                {SUPPORTED_KUBERNETES_VERSIONS.map(version => (
                  <option key={version} value={version}>
                    {version}
                  </option>
                ))}
              </ButlerSelect>
              {providers.length === 0 ? (
                <ButlerField label="Provider *">
                  <p className={classes.providerMissing}>
                    No providers configured. Ask a platform admin to add one.
                  </p>
                </ButlerField>
              ) : (
                <ButlerSelect
                  label="Provider *"
                  value={form.providerConfigRef}
                  onChange={e =>
                    updateField('providerConfigRef', e.target.value)
                  }
                  error={validationErrors.providerConfigRef}
                >
                  <option value="">Select provider...</option>
                  {providers.map(provider => (
                    <option
                      key={`${provider.metadata.namespace}/${provider.metadata.name}`}
                      value={provider.metadata.name}
                    >
                      {provider.metadata.name} ({provider.spec.provider})
                    </option>
                  ))}
                </ButlerSelect>
              )}
            </ButlerFormRow>
          </ButlerFormSection>

          {/*
            Only shown when the team defines environments. The choice is
            not part of the request body: the server reads it from a
            header and stamps it on the cluster as a label.
          */}
          {environments.length > 0 && (
            <ButlerFormSection
              title="Environment"
              description="Which of the team's environments this cluster belongs to."
            >
              <ButlerSelect
                label="Environment *"
                value={environment}
                onChange={e => setEnvironment(e.target.value)}
                error={validationErrors.environment}
              >
                <option value="">Select environment...</option>
                {environments.map(env => (
                  <option key={env.name} value={env.name}>
                    {env.limits?.maxClusters == null
                      ? env.name
                      : `${env.name} (up to ${env.limits.maxClusters} clusters)`}
                  </option>
                ))}
              </ButlerSelect>
            </ButlerFormSection>
          )}

          {selectedProvider && (
            <ButlerFormSection title={`Infrastructure (${providerType})`}>
              {imagePolicy && <PolicyNote policy={imagePolicy} noun="image" />}
              {renderProviderFields()}
            </ButlerFormSection>
          )}

          <ButlerFormSection title="Worker Nodes">
            <ButlerFormRow>
              <TextField
                label="Replicas"
                type="number"
                min={1}
                max={100}
                value={form.workerReplicas}
                onChange={e =>
                  updateField(
                    'workerReplicas',
                    parseInt(e.target.value, 10) || 0,
                  )
                }
                error={validationErrors.workerReplicas}
                help="Number of worker nodes"
              />
              <TextField
                label="CPU (cores)"
                type="number"
                min={1}
                max={128}
                value={form.workerCPU}
                onChange={e =>
                  updateField('workerCPU', parseInt(e.target.value, 10) || 0)
                }
                error={validationErrors.workerCPU}
                help="CPU cores per worker"
              />
              <TextField
                label="Memory"
                value={form.workerMemory}
                onChange={e => updateField('workerMemory', e.target.value)}
                placeholder="16Gi"
                help="e.g., 4Gi, 8Gi, 16Gi"
                mono
              />
              <TextField
                label="Disk Size"
                value={form.workerDiskSize}
                onChange={e => updateField('workerDiskSize', e.target.value)}
                placeholder="100Gi"
                help="e.g., 50Gi, 100Gi, 200Gi"
                mono
              />
            </ButlerFormRow>
          </ButlerFormSection>

          <ButlerFormSection
            title="Networking"
            description={
              networkMode === 'cloud'
                ? `Load balancer addresses are managed by ${providerType} itself.`
                : 'Addresses for load balancer services inside the tenant cluster.'
            }
          >
            {networkPolicy && (
              <PolicyNote policy={networkPolicy} noun="network" />
            )}
            {networkMode === 'cloud' ? (
              <ButlerCallout tone="info" compact>
                This provider manages load balancers and their addresses, so
                there is no range to choose here.
              </ButlerCallout>
            ) : (
              <>
                {networkMode === 'ipam' && (
                  <ButlerCallout tone="info" compact>
                    The platform allocates this cluster's addresses from a
                    network pool. You do not need to pick a range.
                    <ButlerSwitch
                      checked={overrideAllocation}
                      onChange={setOverrideAllocation}
                      label="Choose the addresses myself"
                      help="Only if this cluster must use a specific range."
                    />
                  </ButlerCallout>
                )}
                {needsAddresses && (
                  <ButlerFormRow>
                    <TextField
                      label="Load Balancer Start IP"
                      required
                      value={form.loadBalancerStart}
                      onChange={e =>
                        updateField('loadBalancerStart', e.target.value)
                      }
                      placeholder="10.40.1.100"
                      error={validationErrors.loadBalancerStart}
                      mono
                    />
                    <TextField
                      label="Load Balancer End IP"
                      required
                      value={form.loadBalancerEnd}
                      onChange={e =>
                        updateField('loadBalancerEnd', e.target.value)
                      }
                      placeholder="10.40.1.150"
                      error={validationErrors.loadBalancerEnd}
                      mono
                    />
                  </ButlerFormRow>
                )}
              </>
            )}
          </ButlerFormSection>

          <ButlerFormSection
            title="Advanced"
            description="Optional. Every field here is left to the platform default when blank."
            collapsible
          >
            <TextField
              label="Time servers"
              value={form.timeServers}
              onChange={e => updateField('timeServers', e.target.value)}
              placeholder="pool.ntp.org, time.cloudflare.com"
              error={validationErrors.timeServers}
              help="Comma separated NTP servers for the worker nodes. Overrides the provider and platform defaults."
              mono
            />
            <ButlerInsetPanel title="Control plane resources">
              <p className={classes.advancedNote}>
                Leaving a box empty keeps the platform default for that
                component.
              </p>
              {(
                [
                  ['API server', 'cpApiServer'],
                  ['Controller manager', 'cpControllerManager'],
                  ['Scheduler', 'cpScheduler'],
                ] as const
              ).map(([label, prefix]) => (
                <div key={prefix}>
                  <p className={classes.advancedLabel}>{label}</p>
                  <ButlerFormRow>
                    <TextField
                      label="CPU request"
                      value={
                        form[
                          `${prefix}CpuRequest` as keyof CreateClusterFormState
                        ] as string
                      }
                      onChange={e =>
                        updateField(
                          `${prefix}CpuRequest` as keyof CreateClusterFormState,
                          e.target.value,
                        )
                      }
                      placeholder="500m"
                      mono
                    />
                    <TextField
                      label="Memory request"
                      value={
                        form[
                          `${prefix}MemoryRequest` as keyof CreateClusterFormState
                        ] as string
                      }
                      onChange={e =>
                        updateField(
                          `${prefix}MemoryRequest` as keyof CreateClusterFormState,
                          e.target.value,
                        )
                      }
                      placeholder="512Mi"
                      mono
                    />
                    <TextField
                      label="CPU limit"
                      value={
                        form[
                          `${prefix}CpuLimit` as keyof CreateClusterFormState
                        ] as string
                      }
                      onChange={e =>
                        updateField(
                          `${prefix}CpuLimit` as keyof CreateClusterFormState,
                          e.target.value,
                        )
                      }
                      placeholder="1"
                      mono
                    />
                    <TextField
                      label="Memory limit"
                      value={
                        form[
                          `${prefix}MemoryLimit` as keyof CreateClusterFormState
                        ] as string
                      }
                      onChange={e =>
                        updateField(
                          `${prefix}MemoryLimit` as keyof CreateClusterFormState,
                          e.target.value,
                        )
                      }
                      placeholder="2Gi"
                      mono
                    />
                  </ButlerFormRow>
                </div>
              ))}
            </ButlerInsetPanel>
          </ButlerFormSection>

          <ButlerFormSection title="Features">
            <ButlerSwitch
              checked={form.ingressEnabled}
              onChange={checked => updateField('ingressEnabled', checked)}
              label="Install ingress controller"
              help="Traefik, installed by default. Turning it off frees one load balancer address."
            />
            <ButlerSwitch
              checked={form.workspacesEnabled}
              onChange={checked => updateField('workspacesEnabled', checked)}
              label="Enable Cloud Workspaces"
              help="Allow developers to create cloud development environments on this cluster."
            />
          </ButlerFormSection>

          {submitError && (
            <ButlerFormMessage tone="danger">{submitError}</ButlerFormMessage>
          )}

          <ButlerFormFooter>
            <ButlerButton variant="secondary" onClick={cancel}>
              Cancel
            </ButlerButton>
            <ButlerButton
              type="submit"
              disabled={submitting || providers.length === 0}
            >
              {submitting ? 'Creating...' : 'Create Cluster'}
            </ButlerButton>
          </ButlerFormFooter>
        </ButlerCard>
      </form>
    </div>
  );
};
