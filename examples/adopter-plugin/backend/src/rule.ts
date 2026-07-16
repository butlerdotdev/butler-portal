import {
  createPermissionResourceRef,
  createPermissionRule,
} from '@backstage/plugin-permission-node';
import { z } from 'zod';

export type Thing = { id: string; owner?: string };
export type ThingQuery = { ownerFilter?: string };

export const thingResourceRef = createPermissionResourceRef<Thing, ThingQuery>().with({
  pluginId: 'example',
  resourceType: 'example-thing',
});

export const isThingOwnerRule = createPermissionRule({
  name: 'IS_THING_OWNER',
  description:
    'Match a Thing whose owner equals the expectedOwner parameter. Adopters typically pass $currentUser here.',
  resourceRef: thingResourceRef,
  paramsSchema: z.object({
    expectedOwner: z.string().describe('User entity ref that the resource must belong to.'),
  }),
  apply(resource, params) {
    return resource?.owner === params.expectedOwner;
  },
  toQuery(params) {
    return { ownerFilter: params.expectedOwner };
  },
});
