/*
 * Copyright 2026 The Butler Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { sourceSchemas } from './schemas/sources';
import { transformSchemas } from './schemas/transforms';
import { sinkSchemas } from './schemas/sinks';

export type { ComponentSchemaDefinition } from './schemas/transforms';

const allSchemas = [...sourceSchemas, ...transformSchemas, ...sinkSchemas];

const schemaMap = new Map(allSchemas.map(s => [s.vectorType, s]));

export function getComponentSchemas() {
  return allSchemas;
}

export function getComponentSchema(vectorType: string) {
  return schemaMap.get(vectorType) ?? null;
}
