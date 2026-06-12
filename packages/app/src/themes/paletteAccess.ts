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

import { Theme } from '@material-ui/core';

// butlerPortalTheme.ts builds the palette via Backstage's UnifiedThemePalette,
// which adds a custom `border` field on top of the Material-UI v4 Palette
// shape. The MUI Theme type does not declare `border`, so every consumer
// that wants the brand border color used to spell it as
// `(theme.palette as any).border ?? theme.palette.divider`. This helper
// centralizes the cast and the fallback so the rest of the codebase reads as
// typed code.
export const borderColor = (
  theme: Theme,
  fallback: string = theme.palette.divider,
): string => {
  const palette = theme.palette as unknown as { border?: unknown };
  return typeof palette.border === 'string' ? palette.border : fallback;
};
