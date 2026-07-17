import {
  createPermissionResourceRef,
  createPermissionRule,
} from '@backstage/plugin-permission-node';
import { z } from 'zod';

export type Thing = { id: string; owner?: string };
export type ThingQuery = { ownerFilter?: string };
type IsThingOwnerParams = { expectedOwner: string };

export const thingResourceRef = createPermissionResourceRef<Thing, ThingQuery>().with({
  pluginId: 'example',
  resourceType: 'example-thing',
});

// Explicit generic parameters are required under
// @backstage/plugin-permission-node@0.11.2: without them, TypeScript
// picks the deprecated createPermissionRule overload and infers
// TParams as `undefined`, which produces TS2589 excessively-deep and
// TS18048 params-possibly-undefined errors. Same shape as the
// plugin-authoring docs' worked example.
export const isThingOwnerRule = createPermissionRule<
  typeof thingResourceRef,
  IsThingOwnerParams
>({
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
