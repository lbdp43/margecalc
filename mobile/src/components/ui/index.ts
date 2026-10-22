/**
 * MargeBar Pro UI kit (D1 « Émeraude Signature »).
 * Import from here: `import { Button, Card, Screen, toast } from '../../components/ui';`
 * Catalogue and rules: scratchpad FOUNDATION.md.
 */
export { PressableScale } from './PressableScale';
export type { PressableScaleProps, ScalePreset } from './PressableScale';
export { FadeIn, Stagger, SwapFade, staggerDelay, useReduceMotion } from './motion';
export { AnimatedNumber } from './AnimatedNumber';
export type { AnimatedNumberProps } from './AnimatedNumber';
export {
  Skeleton,
  SkeletonText,
  SkeletonProductCard,
  SkeletonStatTile,
  SkeletonList,
  useDelayedLoading,
} from './Skeleton';
export { Meter, ProgressBar, CompositionBar, compositionColor } from './Meter';
export type { CompositionSegment, CompositionKey } from './Meter';
export { Button, IconButton, FAB } from './Button';
export type { ButtonProps, ButtonVariant, IconButtonProps, IconButtonVariant } from './Button';
export { Card } from './Card';
export type { CardProps } from './Card';
export { TextField } from './TextField';
export type { TextFieldProps } from './TextField';
export { Input } from './Input';
export { NumberInput } from './NumberInput';
export type { NumberInputProps } from './NumberInput';
export { Chip, ChipRow } from './Chip';
export type { ChipProps, ChipItem, ChipRowProps } from './Chip';
export { SegmentedControl } from './SegmentedControl';
export type { SegmentOption } from './SegmentedControl';
export { Slider } from './Slider';
export type { SliderProps, SliderZone } from './Slider';
export { StatTile, ResultTile, ResultGrid } from './Tiles';
export { Badge } from './Badge';
export type { BadgeProps, BadgeVariant } from './Badge';
export { ListRow, ValueRow, ListGroup, Divider, SectionHeader } from './ListRow';
export type { ListRowProps, ValueRowProps, SectionHeaderProps } from './ListRow';
export { LargeTitleHeader, NavBar, HeroHeader, HeroRings } from './Headers';
export { BrandMark, Wordmark, Avatar, initialsOf } from './Brand';
export { Screen, ScreenList, useScreen, useInsideTabs } from './Screen';
export type { ScreenProps } from './Screen';
export { ScreenWrapper } from './ScreenWrapper';
export { StickyActionBar } from './StickyActionBar';
export type { StickyActionBarProps } from './StickyActionBar';
export { ProductCard, PriceTag, ProductActionsSheet, categoryIcon, primaryPrice, servingLabel, sortedServings } from './ProductCard';
export type { ProductCardProps, PriceTagProps, ProductActionsSheetProps } from './ProductCard';
export { MarginLegend, countByZone, zoneRangeLabels } from './MarginLegend';
export type { MarginLegendProps, ZoneCounts } from './MarginLegend';
export { FiscalCategorySheet, fiscalRateLabel, groupFiscalRates, FISCAL_GROUPS } from './FiscalCategorySheet';
export type { FiscalCategorySheetProps } from './FiscalCategorySheet';
export { WelcomeModal } from './WelcomeModal';
export { InstallAppCard, InstallAppCardSlot, IosInstallSheet, useInstallFlow } from './InstallAppCard';
export type { InstallAppCardProps, InstallAppCardSlotProps, IosInstallSheetProps } from './InstallAppCard';
export { BottomSheet } from './BottomSheet';
export type { BottomSheetProps } from './BottomSheet';
export { DialogHost, dialog } from './Dialog';
export type { DialogOptions, ConfirmOptions } from './Dialog';
export { ToastHost, toast } from './Toast';
export type { ToastOptions } from './Toast';
export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { OfflineBanner, OfflineBannerInsets } from './OfflineBanner';
export { ErrorBoundary } from './ErrorBoundary';
export { YinYangSpinner } from './YinYangSpinner';
export { Icon } from './Icon';
export type { IconName } from './Icon';
export { useKeyboardHeight, useSafeIsFocused } from './chrome';
