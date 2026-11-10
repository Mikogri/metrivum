import { useI18n as useNativeCopy } from "../../infrastructure/i18n";
import { useState } from "react";
import { Platform } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { View } from "react-native";
import {
  BottomSheet,
  Button,
  FieldButton,
  Text,
  useInsideSheet,
} from "@metrivum/ui-mobile";
import { formatDay } from "../shared/format";
import { localDate, pickerDate } from "./model";

/**
 * Date-only API values stay in the user's calendar, never round-trip through UTC. Android opens the
 * system date/time picker; iOS shows the system wheel in a bottom sheet.
 */
export function NativeDateField({
  label,
  value,
  onChange,
  mode = "date",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mode?: "date" | "time";
  disabled?: boolean;
}) {
  const nativeCopy = useNativeCopy().t;

  const [open, setOpen] = useState(false);
  const insideSheet = useInsideSheet();
  const parsed = pickerDate(value, mode);
  const selected = parsed ?? new Date();
  const apply = (date: Date) =>
    onChange(
      mode === "date"
        ? localDate(date)
        : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00`,
    );
  const show = () => {
    if (Platform.OS === "android")
      DateTimePickerAndroid.open({
        value: selected,
        mode,
        onValueChange: (_event, date) => apply(date),
      });
    else setOpen(true);
  };
  // Already in a sheet on iOS: the system compact control edits in place, so no second sheet opens.
  if (insideSheet && Platform.OS === "ios")
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 48,
        }}
      >
        <Text variant="label" tone="mutedText">
          {label}
        </Text>
        <DateTimePicker
          value={selected}
          mode={mode}
          display="compact"
          disabled={disabled}
          onValueChange={(_event, date) => apply(date)}
        />
      </View>
    );
  return (
    <>
      <FieldButton
        label={label}
        icon={mode === "date" ? "calendar" : "schedule"}
        value={
          parsed
            ? mode === "date"
              ? formatDay(localDate(parsed))
              : parsed.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
            : null
        }
        placeholder={
          mode === "date"
            ? nativeCopy("interface.Choose a date")
            : nativeCopy("interface.Choose a time")
        }
        disabled={disabled}
        expanded={open}
        onPress={show}
      />
      <BottomSheet
        title={label}
        open={open}
        onClose={() => setOpen(false)}
        footer={
          <Button
            size="lg"
            tone="primary"
            title={nativeCopy("interface.Done")}
            onPress={() => setOpen(false)}
          />
        }
      >
        <DateTimePicker
          value={selected}
          mode={mode}
          display="spinner"
          onValueChange={(_event, date) => apply(date)}
        />
      </BottomSheet>
    </>
  );
}
