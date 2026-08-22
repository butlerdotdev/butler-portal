// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

// Single barrel for the Butler UI primitives. Pages import from `../ui`;
// nothing outside this folder should import a primitive by file path.

export { ButlerAccessDenied } from './ButlerAccessDenied';
export type { ButlerAccessDeniedProps } from './ButlerAccessDenied';
export { ButlerAvatarTile } from './ButlerAvatarTile';
export type { ButlerAvatarTileProps } from './ButlerAvatarTile';
export { ButlerButton, ButlerIconButton } from './ButlerButton';
export type { ButlerButtonProps, ButlerButtonVariant } from './ButlerButton';
export { ButlerCallout } from './ButlerCallout';
export type { ButlerCalloutProps, ButlerCalloutTone } from './ButlerCallout';
export { ButlerCard, ButlerSectionTitle } from './ButlerCard';
export type { ButlerCardProps } from './ButlerCard';
export { ButlerDialog } from './ButlerDialog';
export type { ButlerDialogProps } from './ButlerDialog';
export { ButlerDisclosure } from './ButlerDisclosure';
export type { ButlerDisclosureProps } from './ButlerDisclosure';
export {
  ButlerCodeBlock,
  ButlerFilePreview,
  ButlerLinkButton,
  ButlerPreviewToggle,
} from './ButlerFilePreview';
export type {
  ButlerFilePreviewProps,
  ButlerLinkButtonProps,
  ButlerPreviewToggleProps,
} from './ButlerFilePreview';
export {
  ButlerCheckbox,
  ButlerField,
  ButlerFileButton,
  ButlerFormRow,
  ButlerSegmented,
  ButlerSelect,
  ButlerTextarea,
} from './ButlerForm';
export type {
  ButlerCheckboxProps,
  ButlerFieldProps,
  ButlerFileButtonProps,
  ButlerSegmentedOption,
  ButlerSegmentedProps,
  ButlerSelectOption,
  ButlerSelectProps,
  ButlerTextareaProps,
} from './ButlerForm';
export {
  ButlerFormFooter,
  ButlerFormMessage,
  ButlerFormSection,
  ButlerInsetPanel,
} from './ButlerFormSection';
export type {
  ButlerFormMessageProps,
  ButlerFormSectionProps,
  ButlerInsetPanelProps,
} from './ButlerFormSection';
export {
  ButlerGroupEmpty,
  ButlerGroupNested,
  ButlerGroupSection,
} from './ButlerGroupHeader';
export type { ButlerGroupSectionProps } from './ButlerGroupHeader';
export { ButlerInput, ButlerSearchInput } from './ButlerInput';
export type { ButlerInputProps } from './ButlerInput';
export { ButlerKeyValueList, ButlerKeyValueRow } from './ButlerKeyValue';
export type { ButlerKeyValueRowProps } from './ButlerKeyValue';
export {
  ButlerList,
  ButlerListCard,
  ButlerListEmpty,
  ButlerListRow,
} from './ButlerListCard';
export type { ButlerListCardProps, ButlerListRowProps } from './ButlerListCard';
export { ButlerMenu, ButlerMenuItem } from './ButlerMenu';
export type { ButlerMenuItemProps, ButlerMenuProps } from './ButlerMenu';
export { ButlerPageHeader } from './ButlerPageHeader';
export type { ButlerPageHeaderProps } from './ButlerPageHeader';
export { ButlerQuickAction } from './ButlerQuickAction';
export type {
  ButlerQuickActionProps,
  ButlerQuickActionTone,
} from './ButlerQuickAction';
export {
  ButlerOptionRow,
  ButlerRadioTile,
  ButlerRadioTileGroup,
} from './ButlerRadioTile';
export type {
  ButlerOptionRowProps,
  ButlerRadioTileProps,
} from './ButlerRadioTile';
export { ButlerGrid, ButlerStack } from './ButlerStack';
export {
  ButlerBanner,
  ButlerEmptyState,
  ButlerErrorState,
  ButlerLoading,
  ButlerSpinner,
} from './ButlerStates';
export type {
  ButlerBannerProps,
  ButlerEmptyStateProps,
  ButlerErrorStateProps,
} from './ButlerStates';
export {
  ButlerDashboardStat,
  ButlerStatDots,
  ButlerStatGrid,
  ButlerStatTile,
} from './ButlerStats';
export type {
  ButlerDashboardStatProps,
  ButlerStatDotsProps,
  ButlerStatGridProps,
  ButlerStatTileProps,
  ButlerStatTone,
} from './ButlerStats';
export {
  ButlerChip,
  ButlerStatusBadge,
  statusStyle,
} from './ButlerStatusBadge';
export type {
  ButlerChipProps,
  ButlerStatusBadgeProps,
} from './ButlerStatusBadge';
export { ButlerSwitch } from './ButlerSwitch';
export type { ButlerSwitchProps } from './ButlerSwitch';
export { ButlerTable } from './ButlerTable';
export type { ButlerColumn, ButlerTableProps } from './ButlerTable';
export { ButlerTabPanel, ButlerTabs, tabId, tabPanelId } from './ButlerTabs';
export type {
  ButlerTabItem,
  ButlerTabPanelProps,
  ButlerTabsProps,
} from './ButlerTabs';
export { ButlerToggleBar } from './ButlerToggleBar';
export type {
  ButlerToggleBarProps,
  ButlerToggleOption,
} from './ButlerToggleBar';
export { envAccent, neutralAccent } from './envAccent';
export type { EnvAccent } from './envAccent';
export * from './icons';
