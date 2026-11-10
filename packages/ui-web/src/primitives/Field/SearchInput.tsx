import { Search, X } from "lucide-react";
import {
  Button,
  Group,
  Input,
  SearchField,
  type SearchFieldProps,
} from "react-aria-components";
import { cx } from "../../lib/cx";
import { fieldStyles as styles } from "./FieldParts";

export interface SearchInputProps extends Omit<
  SearchFieldProps,
  "className" | "children"
> {
  placeholder?: string;
  clearLabel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  "aria-label": string;
}

export function SearchInput({
  placeholder,
  clearLabel = "Clear search",
  size = "md",
  className,
  ...props
}: SearchInputProps) {
  return (
    <SearchField
      {...props}
      className={cx(styles.field, styles.searchField, className)}
    >
      <Group className={cx(styles.control, styles[size])}>
        <span className={styles.adornment} aria-hidden="true">
          <Search />
        </span>
        <Input className={styles.input} placeholder={placeholder} />
        <Button className={styles.clear} aria-label={clearLabel}>
          <X aria-hidden="true" />
        </Button>
      </Group>
    </SearchField>
  );
}
