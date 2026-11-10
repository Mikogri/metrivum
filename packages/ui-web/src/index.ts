// Public API of @metrivum/ui-web. Styles are imported explicitly via "@metrivum/ui-web/styles.css".
// The library knows nothing about endpoints, Supabase, users or feature access.

export { cx } from "./lib/cx";
export { useMobileLayout } from "./lib/useMobileLayout";

// Actions
export {
  Button,
  LinkButton,
  type ButtonProps,
  type LinkButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from "./primitives/Button/Button";
export {
  IconButton,
  type IconButtonProps,
} from "./primitives/IconButton/IconButton";
export { Link, type LinkProps } from "./primitives/Link/Link";

// Typography
export {
  Text,
  Heading,
  Label,
  Caption,
  type TextProps,
  type HeadingProps,
} from "./primitives/Typography/Typography";

// Fields
export {
  TextField,
  TextArea,
  type TextFieldProps,
  type TextAreaProps,
} from "./primitives/Field/TextField";
export {
  NumberInput,
  type NumberFieldProps,
} from "./primitives/Field/NumberField";
export { DateField, type DateFieldProps } from "./primitives/Field/DateField";
export { TimeField, type TimeFieldProps } from "./primitives/Field/TimeField";
export {
  SearchInput,
  type SearchInputProps,
} from "./primitives/Field/SearchInput";
export {
  Select,
  Combobox,
  Option,
  type SelectProps,
  type ComboboxProps,
  type OptionProps,
} from "./primitives/Select/Select";
export {
  Checkbox,
  RadioGroup,
  Radio,
  Switch,
  SegmentedControl,
  Segment,
  ChipGroup,
  Chip,
  type CheckboxProps,
  type RadioGroupProps,
  type RadioProps,
  type SwitchProps,
  type SegmentedControlProps,
  type ChipGroupProps,
  type ChipProps,
} from "./primitives/Toggle/Toggle";
export {
  FieldLabel,
  FieldFooter,
  type FieldChromeProps,
} from "./primitives/Field/FieldParts";

// Overlays
export {
  ContextMenu,
  type ContextMenuEntry,
  type ContextMenuProps,
} from "./components/ContextMenu/ContextMenu";
export {
  DataTable,
  type DataTableColumn,
  type DataTableProps,
} from "./components/DataTable/DataTable";
export {
  Dialog,
  AlertDialog,
  DialogFooter,
  DialogTrigger,
  type DialogProps,
  type AlertDialogProps,
} from "./components/Dialog/Dialog";
export { Popover, type PopoverProps } from "./components/Popover/Popover";
export {
  Hint,
  Tooltip,
  TooltipTrigger,
  type TooltipProps,
} from "./components/Tooltip/Tooltip";
export { InfoTip } from "./components/InfoTip/InfoTip";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSection,
  DropdownMenuSeparator,
  type DropdownMenuProps,
  type DropdownMenuItemProps,
} from "./components/Menu/Menu";

// Navigation & structure
export {
  Tabs,
  TabList,
  Tab,
  TabPanel,
  type TabsProps,
  type TabProps,
} from "./components/Tabs/Tabs";
export {
  Breadcrumbs,
  type BreadcrumbItem,
  type BreadcrumbsProps,
} from "./components/Breadcrumbs/Breadcrumbs";
export { Card, Separator, type CardProps } from "./components/Card/Card";
export {
  Disclosure,
  type DisclosureProps,
} from "./components/Disclosure/Disclosure";
export {
  PageHeader,
  PageBackContext,
  type PageBack,
  SectionHeader,
  Toolbar,
  type PageHeaderProps,
  type SectionHeaderProps,
  type ToolbarProps,
} from "./components/PageHeader/PageHeader";
export {
  Pagination,
  type PaginationProps,
  type PaginationLabels,
} from "./components/Pagination/Pagination";
export { List, ListRow, type ListRowProps } from "./components/List/List";

// Feedback
export {
  Badge,
  type BadgeProps,
  type BadgeTone,
} from "./components/Badge/Badge";
export { Alert, type AlertProps } from "./components/Alert/Alert";
export {
  Toaster,
  ToastView,
  toast,
  dismissToast,
  clearToasts,
  type ToastOptions,
  type ToastTone,
  type ToasterProps,
  type ToastViewProps,
} from "./components/Toast/Toast";
export { Spinner, type SpinnerProps } from "./components/Spinner/Spinner";
export { Skeleton, type SkeletonProps } from "./components/Skeleton/Skeleton";
export {
  LoadingState,
  type LoadingStateProps,
} from "./components/LoadingState/LoadingState";
export {
  EmptyState,
  ErrorState,
  type EmptyStateProps,
  type ErrorStateProps,
} from "./components/EmptyState/EmptyState";

// Display
export { Avatar, type AvatarProps } from "./components/Avatar/Avatar";
export { Kbd } from "./components/Kbd/Kbd";
export { FileCard, type FileCardProps } from "./components/FileCard/FileCard";

export { overlayPosition, overlayViewport } from "./lib/overlay-position";

export { DecimalInput } from "./primitives/Field/NumberField";
