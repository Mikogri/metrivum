import { useContext, useState } from "react";
import type { DateValue } from "@internationalized/date";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarStateContext,
  DateInput,
  DatePicker as AriaDatePicker,
  DateSegment,
  Dialog,
  Group,
  Popover,
  useLocale,
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
            <CalendarViews />
          </Calendar>
        </Dialog>
      </Popover>
    </AriaDatePicker>
  );
}

const YEARS_PER_PAGE = 12;

/**
 * The calendar body with three levels: days, months and years. The heading opens the years, a year opens its months and
 * a month goes back to its days, so a date decades away (a birth date) is two clicks instead of hundreds of pages.
 */
function CalendarViews() {
  const state = useContext(CalendarStateContext)!;
  const { locale } = useLocale();
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const focused = state.focusedDate;
  const min = state.minValue;
  const max = state.maxValue;
  const monthName = new Intl.DateTimeFormat(locale, { month: "short" });
  const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const asDate = (year: number, month: number) => new Date(Date.UTC(year, month - 1, 15));

  // Moving to another month or year keeps the day where it can and stays within the allowed range.
  const go = (year: number, month = focused.month) => {
    let next = focused.set({ year, month });
    if (min && next.compare(min) < 0) next = focused.set({ year: min.year, month: min.month, day: min.day });
    if (max && next.compare(max) > 0) next = focused.set({ year: max.year, month: max.month, day: max.day });
    state.setFocusedDate(next);
  };
  const yearOutside = (year: number) => (min && year < min.year) || (max && year > max.year);
  const monthOutside = (month: number) =>
    (min && (focused.year < min.year || (focused.year === min.year && month < min.month))) ||
    (max && (focused.year > max.year || (focused.year === max.year && month > max.month)));

  if (view === "days")
    return (
      <>
        <header className={local.header}>
          <Button slot="previous" className={local.nav} aria-label="Previous month">
            <ChevronLeft aria-hidden="true" />
          </Button>
          <button type="button" className={local.headingButton} onClick={() => setView("years")} aria-label="Choose year and month">
            {title.format(asDate(focused.year, focused.month))}
            <ChevronDown aria-hidden="true" />
          </button>
          <Button slot="next" className={local.nav} aria-label="Next month">
            <ChevronRight aria-hidden="true" />
          </Button>
        </header>
        <CalendarGrid className={local.grid} weekdayStyle="short">
          <CalendarGridHeader>{(day) => <CalendarHeaderCell className={local.weekday}>{day}</CalendarHeaderCell>}</CalendarGridHeader>
          <CalendarGridBody>{(date) => <CalendarCell date={date} className={local.cell} />}</CalendarGridBody>
        </CalendarGrid>
      </>
    );

  if (view === "months")
    return (
      <div className={local.picker}>
        <header className={local.header}>
          <button type="button" className={local.nav} aria-label="Previous year" disabled={!!yearOutside(focused.year - 1)} onClick={() => go(focused.year - 1)}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" className={local.headingButton} onClick={() => setView("years")} aria-label="Choose year">
            {focused.year}
            <ChevronDown aria-hidden="true" />
          </button>
          <button type="button" className={local.nav} aria-label="Next year" disabled={!!yearOutside(focused.year + 1)} onClick={() => go(focused.year + 1)}>
            <ChevronRight aria-hidden="true" />
          </button>
        </header>
        <div className={local.choices} role="group" aria-label="Months">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
            <button type="button" key={month} className={local.choice} data-current={month === focused.month || undefined} disabled={!!monthOutside(month)}
              onClick={() => { go(focused.year, month); setView("days"); }}>
              {monthName.format(asDate(2000, month))}
            </button>
          ))}
        </div>
      </div>
    );

  const first = Math.floor(focused.year / YEARS_PER_PAGE) * YEARS_PER_PAGE;
  const years = Array.from({ length: YEARS_PER_PAGE }, (_, i) => first + i);
  return (
    <div className={local.picker}>
      <header className={local.header}>
        <button type="button" className={local.nav} aria-label="Earlier years" disabled={!!yearOutside(first - 1)} onClick={() => go(Math.max(first - YEARS_PER_PAGE + (focused.year - first), min?.year ?? -Infinity))}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <span className={local.heading}>{first} – {first + YEARS_PER_PAGE - 1}</span>
        <button type="button" className={local.nav} aria-label="Later years" disabled={!!yearOutside(first + YEARS_PER_PAGE)} onClick={() => go(Math.min(first + YEARS_PER_PAGE + (focused.year - first), max?.year ?? Infinity))}>
          <ChevronRight aria-hidden="true" />
        </button>
      </header>
      <div className={local.choices} role="group" aria-label="Years">
        {years.map((year) => (
          <button type="button" key={year} className={local.choice} data-current={year === focused.year || undefined} disabled={!!yearOutside(year)}
            onClick={() => { go(year); setView("months"); }}>
            {year}
          </button>
        ))}
      </div>
    </div>
  );
}
