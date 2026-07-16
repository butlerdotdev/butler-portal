import { createPermission } from '@backstage/plugin-permission-common';

export const thingReadPermission = createPermission({
  name: 'example.thing.read',
  attributes: { action: 'read' },
  resourceType: 'example-thing',
});
