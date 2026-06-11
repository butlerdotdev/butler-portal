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

import { SidebarSubmenuItem } from '@backstage/core-components';
import { makeStyles, Tooltip } from '@material-ui/core';
import {
  ButlerLabsPluginMeta,
  pluginEnabledConfigKey,
} from '../plugins/butlerLabsPluginsMeta';

const useBrandIconStyles = makeStyles(theme => ({
  brand: { color: theme.palette.primary.main },
}));

const brandIcon = (Icon: any) => (props: any) => {
  const classes = useBrandIconStyles();
  return <Icon {...props} className={classes.brand} />;
};

// SidebarSubmenuItem has no disabled prop, no className, no style escape.
// The disabled affordance is composed at the wrapper level: a Material-UI
// Tooltip carries the descriptive copy on hover and keyboard focus, and a
// span with reduced opacity plus a not-allowed cursor makes the disabled
// state visually unambiguous. The route target (`to`) stays the same as the
// enabled item -- the route element in App.tsx renders the branded
// PluginNotEnabledPage when the flag is off, so clicking still feels like a
// well-formed action rather than a dead link.
const useDisabledItemStyles = makeStyles(() => ({
  wrapper: {
    opacity: 0.45,
    cursor: 'not-allowed',
    display: 'block',
    '& a, & a:hover': {
      cursor: 'not-allowed',
      textDecoration: 'none',
    },
  },
}));

export const ButlerLabsSubmenuItem = ({
  meta,
  enabled,
}: {
  meta: ButlerLabsPluginMeta;
  enabled: boolean;
}) => {
  const disabledClasses = useDisabledItemStyles();
  const BrandedIcon = brandIcon(meta.icon);

  const item = (
    <SidebarSubmenuItem
      title={meta.brandName}
      to={meta.routePath}
      icon={BrandedIcon}
    />
  );

  if (enabled) {
    return item;
  }

  const tooltipBody = `${meta.brandName} -- ${meta.shortDescription} Available but not enabled for this deployment. Ask your administrator to set ${pluginEnabledConfigKey(meta)} to true.`;

  // Material-UI v4 Tooltip attaches aria-describedby to the cloned child
  // element while open (set in core/Tooltip.js around the cloneElement
  // call). SidebarSubmenuItem does not accept aria props for pass-through,
  // so the cloned child is this wrapping span. The aria-label here gives
  // the disabled state its own screen-reader-readable name independent of
  // the describedby; assistive tech that walks the ancestor chain when
  // announcing the focused inner anchor picks up both the describedby and
  // the disabled state.
  return (
    <Tooltip
      title={tooltipBody}
      placement="right"
      enterDelay={250}
      enterNextDelay={250}
    >
      <span
        className={disabledClasses.wrapper}
        aria-disabled="true"
        aria-label={`${meta.brandName}: available but not enabled for this deployment.`}
        data-testid={`butler-labs-submenu-item-disabled-${meta.configKey}`}
      >
        {item}
      </span>
    </Tooltip>
  );
};
