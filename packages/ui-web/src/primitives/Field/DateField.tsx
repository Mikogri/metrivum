import { useState } from "react";
import type { DateValue } from "@internationalized/date";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DateInput,
  DatePicker as AriaDatePicker,
  DateSegment,
  Dialog,
  Group,
  Heading,
  Popover,
  type DatePickerProps as AriaDatePickerProps,
} from "react-aria-components";
import { cx } from "../../lib/cx";
import { FieldFooter, FieldLabel, fieldStyles as styles, type FieldChromeProps } from "./FieldParts";
import local from "./DateField.module.css";

export interface DateFieldProps<T extends DateValue> extends Omit<AriaDatePickerProps<T>, "className" | "children">, FieldChromeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Locale-aware date input: type the segments with the keyboard, or open the app's own calendar
 * (never the browser's native picker) from the button at the end of the field.
 */
export function DateField<T extends DateValue>({ label, description, errorMessage, labelAside, size = "md", className, isOpen, onOpenChange, ...props }: DateFieldProps<T>) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = isOpen ?? ownOpen;
  const setOpen = (next: boolean) => { setOwnOpen(next); onOpenChange?.(next); };
  const interactive = !props.isDisabled && !props.isReadOnly;
  return (
    <AriaDatePicker {...props} isOpen={open} onOpenChange={setOpen} className={cx(styles.field, className)}>
      <FieldLabel label={label} isRequired={props.isRequired} labelAside={labelAside} />
      {/* A click anywhere in the field opens the calendar. Segments stop click propagation (react-aria
          press events), so this listens in the capture phase; the segments stay typeable with the keyboard. */}
      <div className={local.wrap} onClickCapture={() => { if (interactive) setOpen(true); }}>
        <Group className={cx(styles.control, styles[size], local.group)}>
          <DateInput className={local.input}>
            {(segment) => <DateSegment segment={segment} className={local.segment} />}
          </DateInput>
          <Button className={local.trigger} aria-label="Open calendar">
            <CalendarDays aria-hidden="true" />
          </Button>
        </Group>
      </div>
      <FieldFooter description={description} errorMessage={errorMessage} />
      <Popover className={local.popover} placement="bottom end" offset={6}>
        <Dialog className={local.dialog} aria-label="Calendar">
          <Calendar className={local.calendar}>
            <header className={local.header}>
              <Button slot="previous" className={local.nav} aria-label="Previous month">
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Heading className={local.heading} />
              <Button slot="next" className={local.nav} aria-label="Next month">
                <ChevronRight aria-hidden="true" />
              </Button>
            </header>
            <CalendarGrid className={local.grid} weekdayStyle="short">
              <CalendarGridHeader>{(day) => <CalendarHeaderCell className={local.weekday}>{day}</CalendarHeaderCell>}</CalendarGridHeader>
              <CalendarGridBody>{(date) => <CalendarCell date={date} className={local.cell} />}</CalendarGridBody>
            </CalendarGrid>
          </Calendar>
        </Dialog>
      </Popover>
    </AriaDatePicker>
  );
}
