// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import type {
  CreateProviderRequest,
  Provider,
  ProviderType,
  UpdateProviderRequest,
  ValidateResponse,
} from '../api/types/providers';

/**
 * A provider's editable settings as text, one field per server request
 * field. Credentials are held here only on the way in: the edit form
 * starts them blank and blank means "keep what the Secret holds".
 */
export interface ProviderFormValues {
  name: string;
  namespace: string;
  provider: ProviderType;
  harvesterKubeconfig: string;
  nutanixEndpoint: string;
  nutanixPort: string;
  nutanixUsername: string;
  nutanixPassword: string;
  nutanixInsecure: boolean;
  nutanixCABundle: string;
  removeCABundle: boolean;
  proxmoxEndpoint: string;
  proxmoxUsername: string;
  proxmoxPassword: string;
  proxmoxTokenId: string;
  proxmoxTokenSecret: string;
  proxmoxInsecure: boolean;
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsVpcId: string;
  awsSubnetIds: string;
  awsSecurityGroupIds: string;
  azureSubscriptionId: string;
  azureTenantId: string;
  azureClientId: string;
  azureClientSecret: string;
  azureResourceGroup: string;
  azureLocation: string;
  azureVnetName: string;
  azureSubnetName: string;
  azureVmSize: string;
  azureImageUrn: string;
  gcpProjectId: string;
  gcpRegion: string;
  gcpZone: string;
  gcpServiceAccount: string;
  gcpNetwork: string;
  gcpSubnetwork: string;
  gcpMachineType: string;
  gcpImageProject: string;
  gcpImageFamily: string;
  gcpImage: string;
  gcpTags: string;
  networkMode: '' | 'ipam' | 'cloud';
  networkSubnet: string;
  networkGateway: string;
  networkDnsServers: string;
  poolRefs: string;
  lbDefaultPoolSize: string;
  quotaMaxNodeIPs: string;
  quotaMaxLoadBalancerIPs: string;
  scopeType: '' | 'platform' | 'team';
  scopeTeamRef: string;
  maxClustersPerTeam: string;
  maxNodesPerTeam: string;
}

export const CLOUD_TYPES: ProviderType[] = ['aws', 'azure', 'gcp'];
export const ON_PREM_TYPES: ProviderType[] = [
  'harvester',
  'nutanix',
  'proxmox',
];
export const PROVIDER_TYPES: ProviderType[] = [
  ...ON_PREM_TYPES,
  ...CLOUD_TYPES,
];

export const PROVIDER_LABELS: Record<ProviderType, string> = {
  harvester: 'Harvester',
  nutanix: 'Nutanix',
  proxmox: 'Proxmox',
  aws: 'Amazon Web Services',
  azure: 'Microsoft Azure',
  gcp: 'Google Cloud Platform',
};

export const EMPTY_PROVIDER_FORM: ProviderFormValues = {
  name: '',
  namespace: 'butler-system',
  provider: 'harvester',
  harvesterKubeconfig: '',
  nutanixEndpoint: '',
  nutanixPort: '9440',
  nutanixUsername: '',
  nutanixPassword: '',
  nutanixInsecure: false,
  nutanixCABundle: '',
  removeCABundle: false,
  proxmoxEndpoint: '',
  proxmoxUsername: '',
  proxmoxPassword: '',
  proxmoxTokenId: '',
  proxmoxTokenSecret: '',
  proxmoxInsecure: false,
  awsRegion: '',
  awsAccessKeyId: '',
  awsSecretAccessKey: '',
  awsVpcId: '',
  awsSubnetIds: '',
  awsSecurityGroupIds: '',
  azureSubscriptionId: '',
  azureTenantId: '',
  azureClientId: '',
  azureClientSecret: '',
  azureResourceGroup: '',
  azureLocation: '',
  azureVnetName: '',
  azureSubnetName: '',
  azureVmSize: '',
  azureImageUrn: '',
  gcpProjectId: '',
  gcpRegion: '',
  gcpZone: '',
  gcpServiceAccount: '',
  gcpNetwork: '',
  gcpSubnetwork: '',
  gcpMachineType: '',
  gcpImageProject: '',
  gcpImageFamily: '',
  gcpImage: '',
  gcpTags: '',
  networkMode: '',
  networkSubnet: '',
  networkGateway: '',
  networkDnsServers: '',
  poolRefs: '',
  lbDefaultPoolSize: '',
  quotaMaxNodeIPs: '',
  quotaMaxLoadBalancerIPs: '',
  scopeType: '',
  scopeTeamRef: '',
  maxClustersPerTeam: '',
  maxNodesPerTeam: '',
};

const list = (text: string): string[] =>
  text
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

const int = (text: string): number | undefined => {
  const t = text.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
};

/** `name:priority, name` into the pool references the server expects. */
export function parsePoolRefs(
  text: string,
): Array<{ name: string; priority?: number }> {
  return list(text).map(entry => {
    const [name, priority] = entry.split(':').map(s => s.trim());
    const p = priority ? Number(priority) : undefined;
    return Number.isInteger(p) ? { name, priority: p } : { name };
  });
}

/** What the form cannot send as it stands, keyed by field. */
export function validateProviderForm(
  form: ProviderFormValues,
  mode: 'create' | 'edit',
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (mode === 'create') {
    if (!form.name.trim()) errors.name = 'Name is required';
    else if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(form.name.trim())) {
      errors.name = 'Lowercase letters, numbers and hyphens only';
    }
    switch (form.provider) {
      case 'harvester':
        if (!form.harvesterKubeconfig.trim()) {
          errors.harvesterKubeconfig = 'A kubeconfig is required';
        }
        break;
      case 'nutanix':
        if (!form.nutanixEndpoint.trim())
          errors.nutanixEndpoint = 'Endpoint is required';
        if (!form.nutanixUsername.trim() || !form.nutanixPassword) {
          errors.nutanixUsername = 'Username and password are required';
        }
        break;
      case 'proxmox':
        if (!form.proxmoxEndpoint.trim())
          errors.proxmoxEndpoint = 'Endpoint is required';
        if (
          !(form.proxmoxTokenId.trim() && form.proxmoxTokenSecret) &&
          !(form.proxmoxUsername.trim() && form.proxmoxPassword)
        ) {
          errors.proxmoxUsername =
            'Either a username and password or a token id and secret is required';
        }
        break;
      case 'aws':
        if (!form.awsRegion.trim()) errors.awsRegion = 'Region is required';
        if (!form.awsAccessKeyId.trim() || !form.awsSecretAccessKey) {
          errors.awsAccessKeyId = 'Access key id and secret are required';
        }
        break;
      case 'azure':
        if (!form.azureSubscriptionId.trim()) {
          errors.azureSubscriptionId = 'Subscription id is required';
        }
        break;
      case 'gcp':
        if (!form.gcpProjectId.trim())
          errors.gcpProjectId = 'Project id is required';
        if (!form.gcpRegion.trim()) errors.gcpRegion = 'Region is required';
        if (!form.gcpServiceAccount.trim()) {
          errors.gcpServiceAccount = 'A service account key is required';
        }
        break;
      default:
        break;
    }
  }
  // The admission webhook refuses an ipam provider without a pool; saying
  // so here is faster than a denied request.
  if (
    form.networkMode === 'ipam' &&
    parsePoolRefs(form.poolRefs).length === 0
  ) {
    errors.poolRefs = 'IPAM mode needs at least one network pool';
  }
  if (form.scopeType === 'team' && !form.scopeTeamRef.trim()) {
    errors.scopeTeamRef = 'A team is required for a team-scoped provider';
  }
  for (const key of [
    'nutanixPort',
    'lbDefaultPoolSize',
    'quotaMaxNodeIPs',
    'quotaMaxLoadBalancerIPs',
    'maxClustersPerTeam',
    'maxNodesPerTeam',
  ] as const) {
    if (form[key].trim() && int(form[key]) === undefined) {
      errors[key] = 'Must be a whole number';
    }
  }
  return errors;
}

/**
 * The create body. Everything the user left blank is omitted so the
 * server applies its own defaults, and the network, scope and limits
 * sections are sent only when something in them was set.
 */
export function buildCreateProviderRequest(
  form: ProviderFormValues,
): CreateProviderRequest {
  const req: CreateProviderRequest = {
    name: form.name.trim(),
    provider: form.provider,
  };
  if (form.namespace.trim()) req.namespace = form.namespace.trim();
  Object.assign(req, providerSpecificFields(form));
  Object.assign(req, sharedSections(form));
  if (form.scopeType) {
    req.scopeType = form.scopeType;
    if (form.scopeType === 'team' && form.scopeTeamRef.trim()) {
      req.scopeTeamRef = form.scopeTeamRef.trim();
    }
  }
  return req;
}

/**
 * The update body: only what differs from the provider as stored, plus
 * any credential the user typed. The server changes exactly the fields
 * present, so sending an unchanged value is harmless but sending nothing
 * is the honest statement of "nothing changed". Scope and provider type
 * are never sent; the server does not accept changing them.
 */
export function buildUpdateProviderRequest(
  form: ProviderFormValues,
  existing: Provider,
): UpdateProviderRequest {
  const current = providerToForm(existing);
  const req: UpdateProviderRequest = {};
  const specific = providerSpecificFields(form);
  const currentSpecific = providerSpecificFields(current);
  for (const [key, value] of Object.entries(specific)) {
    const k = key as keyof typeof specific;
    if (CREDENTIAL_FIELDS.has(k)) {
      // Credentials are never prefilled, so any value here is new.
      if (value !== undefined && value !== '') {
        (req as Record<string, unknown>)[k] = value;
      }
      continue;
    }
    if (JSON.stringify(value) !== JSON.stringify(currentSpecific[k])) {
      (req as Record<string, unknown>)[k] = value;
    }
  }
  if (form.removeCABundle) req.removeCABundle = true;
  const shared = sharedSections(form);
  const currentShared = sharedSections(current);
  for (const [key, value] of Object.entries(shared)) {
    const k = key as keyof typeof shared;
    if (JSON.stringify(value) !== JSON.stringify(currentShared[k])) {
      (req as Record<string, unknown>)[k] = value;
    }
  }
  return req;
}

const CREDENTIAL_FIELDS = new Set<string>([
  'harvesterKubeconfig',
  'nutanixPassword',
  'nutanixCABundle',
  'proxmoxPassword',
  'proxmoxTokenSecret',
  'awsSecretAccessKey',
  'azureClientSecret',
  'gcpServiceAccount',
]);

/** Fields that identify a credential the user may have typed. */
export function isCredentialField(key: string): boolean {
  return CREDENTIAL_FIELDS.has(key);
}

function providerSpecificFields(
  form: ProviderFormValues,
): Partial<CreateProviderRequest> {
  const out: Partial<CreateProviderRequest> = {};
  const set = (key: keyof CreateProviderRequest, value: unknown) => {
    if (value === undefined || value === '' || value === null) return;
    (out as Record<string, unknown>)[key] = value;
  };
  switch (form.provider) {
    case 'harvester':
      set('harvesterKubeconfig', form.harvesterKubeconfig.trim());
      break;
    case 'nutanix':
      set('nutanixEndpoint', form.nutanixEndpoint.trim());
      set('nutanixPort', int(form.nutanixPort));
      set('nutanixUsername', form.nutanixUsername.trim());
      set('nutanixPassword', form.nutanixPassword);
      if (form.nutanixInsecure) set('nutanixInsecure', true);
      set('nutanixCABundle', form.nutanixCABundle.trim());
      break;
    case 'proxmox':
      set('proxmoxEndpoint', form.proxmoxEndpoint.trim());
      set('proxmoxUsername', form.proxmoxUsername.trim());
      set('proxmoxPassword', form.proxmoxPassword);
      set('proxmoxTokenId', form.proxmoxTokenId.trim());
      set('proxmoxTokenSecret', form.proxmoxTokenSecret);
      if (form.proxmoxInsecure) set('proxmoxInsecure', true);
      break;
    case 'aws':
      set('awsRegion', form.awsRegion.trim());
      set('awsAccessKeyId', form.awsAccessKeyId.trim());
      set('awsSecretAccessKey', form.awsSecretAccessKey);
      set('awsVpcId', form.awsVpcId.trim());
      if (list(form.awsSubnetIds).length)
        set('awsSubnetIds', list(form.awsSubnetIds));
      if (list(form.awsSecurityGroupIds).length) {
        set('awsSecurityGroupIds', list(form.awsSecurityGroupIds));
      }
      break;
    case 'azure':
      set('azureSubscriptionId', form.azureSubscriptionId.trim());
      set('azureTenantId', form.azureTenantId.trim());
      set('azureClientId', form.azureClientId.trim());
      set('azureClientSecret', form.azureClientSecret);
      set('azureResourceGroup', form.azureResourceGroup.trim());
      set('azureLocation', form.azureLocation.trim());
      set('azureVnetName', form.azureVnetName.trim());
      set('azureSubnetName', form.azureSubnetName.trim());
      set('azureVmSize', form.azureVmSize.trim());
      set('azureImageUrn', form.azureImageUrn.trim());
      break;
    case 'gcp':
      set('gcpProjectId', form.gcpProjectId.trim());
      set('gcpRegion', form.gcpRegion.trim());
      set('gcpZone', form.gcpZone.trim());
      set('gcpServiceAccount', form.gcpServiceAccount.trim());
      set('gcpNetwork', form.gcpNetwork.trim());
      set('gcpSubnetwork', form.gcpSubnetwork.trim());
      set('gcpMachineType', form.gcpMachineType.trim());
      set('gcpImageProject', form.gcpImageProject.trim());
      set('gcpImageFamily', form.gcpImageFamily.trim());
      set('gcpImage', form.gcpImage.trim());
      if (list(form.gcpTags).length) set('gcpTags', list(form.gcpTags));
      break;
    default:
      break;
  }
  return out;
}

function sharedSections(
  form: ProviderFormValues,
): Partial<CreateProviderRequest> {
  const out: Partial<CreateProviderRequest> = {};
  if (form.networkMode) out.networkMode = form.networkMode;
  if (form.networkMode === 'ipam') {
    if (form.networkSubnet.trim())
      out.networkSubnet = form.networkSubnet.trim();
    if (form.networkGateway.trim())
      out.networkGateway = form.networkGateway.trim();
    if (list(form.networkDnsServers).length) {
      out.networkDnsServers = list(form.networkDnsServers);
    }
    const refs = parsePoolRefs(form.poolRefs);
    if (refs.length) out.poolRefs = refs;
    const lb = int(form.lbDefaultPoolSize);
    if (lb !== undefined) out.lbDefaultPoolSize = lb;
    const qn = int(form.quotaMaxNodeIPs);
    if (qn !== undefined) out.quotaMaxNodeIPs = qn;
    const ql = int(form.quotaMaxLoadBalancerIPs);
    if (ql !== undefined) out.quotaMaxLoadBalancerIPs = ql;
  }
  const mc = int(form.maxClustersPerTeam);
  if (mc !== undefined) out.maxClustersPerTeam = mc;
  const mn = int(form.maxNodesPerTeam);
  if (mn !== undefined) out.maxNodesPerTeam = mn;
  return out;
}

/**
 * A stored provider as form values, credentials left blank. This is the
 * baseline an edit is compared against, so it must read exactly the
 * fields the server would otherwise be sent.
 */
export function providerToForm(provider: Provider): ProviderFormValues {
  const { spec } = provider;
  const net = spec.network ?? {};
  const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  return {
    ...EMPTY_PROVIDER_FORM,
    name: provider.metadata.name,
    namespace: provider.metadata.namespace,
    provider: (spec.provider as ProviderType) ?? 'harvester',
    nutanixEndpoint: s(spec.nutanix?.endpoint),
    nutanixPort:
      spec.nutanix?.port !== undefined ? String(spec.nutanix.port) : '9440',
    nutanixInsecure: Boolean(spec.nutanix?.insecure),
    proxmoxEndpoint: s(spec.proxmox?.endpoint),
    proxmoxInsecure: Boolean(spec.proxmox?.insecure),
    awsRegion: s(spec.aws?.region),
    awsVpcId: s(spec.aws?.vpcID ?? spec.aws?.vpcId),
    awsSubnetIds: (spec.aws?.subnetIDs ?? []).join(', '),
    awsSecurityGroupIds: (spec.aws?.securityGroupIDs ?? []).join(', '),
    azureSubscriptionId: s(spec.azure?.subscriptionID),
    azureResourceGroup: s(spec.azure?.resourceGroup),
    azureLocation: s(spec.azure?.location),
    azureVnetName: s(spec.azure?.vnetName),
    azureSubnetName: s(spec.azure?.subnetName),
    azureVmSize: s(spec.azure?.vmSize),
    azureImageUrn: s(spec.azure?.imageURN),
    gcpProjectId: s(spec.gcp?.projectID),
    gcpRegion: s(spec.gcp?.region),
    gcpZone: s(spec.gcp?.zone),
    gcpNetwork: s(spec.gcp?.network),
    gcpSubnetwork: s(spec.gcp?.subnetwork),
    gcpMachineType: s(spec.gcp?.machineType),
    gcpImageProject: s(spec.gcp?.imageProject),
    gcpImageFamily: s(spec.gcp?.imageFamily),
    gcpImage: s(spec.gcp?.image),
    gcpTags: (spec.gcp?.tags ?? []).join(', '),
    networkMode: (net.mode as '' | 'ipam' | 'cloud') ?? '',
    networkSubnet: s(net.subnet),
    networkGateway: s(net.gateway),
    networkDnsServers: (net.dnsServers ?? []).join(', '),
    poolRefs: (net.poolRefs ?? [])
      .map(r => (r.priority !== undefined ? `${r.name}:${r.priority}` : r.name))
      .join(', '),
    lbDefaultPoolSize: s(net.loadBalancer?.defaultPoolSize),
    quotaMaxNodeIPs: s(net.quotaPerTenant?.maxNodeIPs),
    quotaMaxLoadBalancerIPs: s(net.quotaPerTenant?.maxLoadBalancerIPs),
    scopeType: (spec.scope?.type as '' | 'platform' | 'team') ?? '',
    scopeTeamRef: s(spec.scope?.teamRef?.name),
    maxClustersPerTeam: s(spec.limits?.maxClustersPerTeam),
    maxNodesPerTeam: s(spec.limits?.maxNodesPerTeam),
  };
}

/**
 * The test and validate endpoints report which stage failed. Naming it
 * tells the operator where to look; a bare "validation failed" does not.
 */
export function describeValidation(result: ValidateResponse): {
  headline: string;
  detail: string;
} {
  if (result.valid) return { headline: 'Reachable', detail: result.message };
  switch (result.category) {
    case 'auth':
      return { headline: 'Credentials refused', detail: result.message };
    case 'tls':
      return { headline: 'TLS failed', detail: result.message };
    case 'network':
      return { headline: 'Endpoint unreachable', detail: result.message };
    case 'parse':
      return {
        headline: 'Configuration could not be read',
        detail: result.message,
      };
    default:
      return { headline: 'Not reachable', detail: result.message };
  }
}

/**
 * The controller's readiness and a live validation are different facts.
 * `status.validated` records that the credentials Secret exists and was
 * accepted; it has been observed true for an endpoint that refuses
 * connections. Only a validate call proves the provider answers.
 */
export function providerReadiness(provider: Provider): {
  headline: string;
  detail: string;
  tone: 'green' | 'yellow' | 'neutral';
} {
  const st = provider.status;
  if (!st)
    return {
      headline: 'Not probed',
      detail: 'No status reported yet.',
      tone: 'neutral',
    };
  if (st.ready) {
    return {
      headline: 'Ready',
      detail: st.lastProbeTime
        ? `Probed ${new Date(
            st.lastProbeTime,
          ).toLocaleString()}. Readiness records that the credentials are present; run Validate to confirm the endpoint answers.`
        : 'Readiness records that the credentials are present; run Validate to confirm the endpoint answers.',
      tone: 'green',
    };
  }
  const failing = st.conditions?.find(c => c.status !== 'True');
  return {
    headline: 'Not ready',
    detail:
      failing?.message || 'The controller has not marked this provider ready.',
    tone: 'yellow',
  };
}
