import {
	ScmIntegrationsApi,
	scmIntegrationsApiRef,
	ScmAuth,
} from '@backstage/integration-react';
import {
	AnyApiFactory,
	configApiRef,
	createApiFactory,
	identityApiRef,
	storageApiRef,
} from '@backstage/core-plugin-api';
import {
	visitsApiRef,
	VisitsStorageApi,
} from '@backstage/plugin-home';
import { MockSearchApi, searchApiRef } from '@backstage/plugin-search-react';

const isDev = process.env.NODE_ENV === 'development';

export const apis: AnyApiFactory[] = [
	createApiFactory({
		api: scmIntegrationsApiRef,
		deps: { configApi: configApiRef },
		factory: ({ configApi }) => ScmIntegrationsApi.fromConfig(configApi),
	}),
	ScmAuth.createDefaultApiFactory(),
	// Add this for the home plugin
	createApiFactory({
		api: visitsApiRef,
		deps: {
			storageApi: storageApiRef,
			identityApi: identityApiRef,
		},
		factory: ({ storageApi, identityApi }) =>
			VisitsStorageApi.create({ storageApi, identityApi }),
	}),
	// Dev-mode mock so HomePageSearchBar renders locally without a fully
	// wired search backend. Production builds use the real searchApiRef
	// from @backstage/plugin-search via discovery; this branch is dead
	// code in NODE_ENV=production.
	...(isDev
		? [
				createApiFactory({
					api: searchApiRef,
					deps: {},
					factory: () => new MockSearchApi(),
				}),
		  ]
		: []),
];
