import { useState } from "react";
import { View } from "react-native";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import {
    Field,
    IconButton,
    SegmentedControl,
    SelectField,
    Text,
    confirm,
    useTheme,
} from "@metrivum/ui-mobile";
import { humanize } from "../shared/format";
import { decimal, type Page } from "./model";

/** Leaving with a pending or failed local save asks first, in a sheet, and keeps the screen as is. */
export function useDraftExitGuard(blocked: boolean) {
    const navigation = useNavigation();
    usePreventRemove(blocked, ({ data }) => {
        void confirm(
            "Leave without saving?",
            "A local save is still pending or failed. Stay to finish saving, or leave and risk losing the latest edit.",
            "Leave",
            { cancelLabel: "Stay" },
        ).then((leave) => {
            if (leave) navigation.dispatch(data.action);
        });
    });
}

/** Compact pager under a list. Hidden when everything fits on one page. */
export function Pagination({
    data,
    onChange,
    unknownTotal = false,
}: {
    data: Page<unknown>;
    onChange: (page: number) => void;
    /** The API gives no total: show the page number instead of a count. */
    unknownTotal?: boolean;
}) {
    const theme = useTheme();
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    if (pages <= 1) return null;
    const first = (data.page - 1) * data.pageSize + 1;
    const last = Math.min(data.total, data.page * data.pageSize);
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: theme.spacing.xs,
            }}
        >
            <Text variant="caption" tone="mutedText">
                {unknownTotal
                    ? `Page ${data.page}`
                    : `${first}–${last} of ${data.total}`}
            </Text>
            <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
                <IconButton
                    icon="back"
                    label="Previous page"
                    filled
                    size={40}
                    disabled={data.page <= 1}
                    onPress={() => onChange(data.page - 1)}
                />
                <IconButton
                    icon="chevronRight"
                    label="Next page"
                    filled
                    size={40}
                    disabled={data.page >= pages}
                    onPress={() => onChange(data.page + 1)}
                />
            </View>
        </View>
    );
}

/**
 * One choice from a fixed set. Up to three options sit inline as a segmented control; longer sets
 * (filters, statuses) open a selection sheet from a field-like button.
 */
export function Choices<T extends string>({
    label,
    values,
    value,
    onChange,
    disabled,
    labels,
}: {
    label: string;
    values: readonly T[];
    value: string;
    onChange: (value: T) => void;
    disabled?: boolean;
    labels?: Record<string, string>;
}) {
    const options = values.map((item) => ({
        value: item,
        label: labels?.[item] || humanize(item) || "All",
    }));
    if (options.length <= 3)
        return (
            <View style={{ gap: 6 }}>
                <Text variant="label" tone="mutedText">
                    {label}
                </Text>
                <SegmentedControl
                    label={label}
                    options={options}
                    value={value as T}
                    onChange={onChange}
                    disabled={disabled}
                />
            </View>
        );
    return (
        <SelectField
            label={label}
            options={options}
            value={value as T}
            onChange={onChange}
            disabled={disabled}
        />
    );
}

export function DecimalField({
    label,
    value,
    onChange,
    disabled,
    allowNegative = false,
    onValidityChange,
    placeholder,
}: {
    label: string;
    value: number | null;
    onChange: (value: number | null) => void;
    disabled?: boolean;
    allowNegative?: boolean;
    onValidityChange?: (valid: boolean) => void;
    placeholder?: string;
}) {
    const [input, setInput] = useState(value == null ? "" : String(value));
    const [error, setError] = useState<string>();
    return (
        <Field
            label={label}
            value={input}
            placeholder={placeholder}
            keyboardType={
                allowNegative ? "numbers-and-punctuation" : "decimal-pad"
            }
            editable={!disabled}
            error={error}
            onChangeText={(text) => {
                setInput(text);
                try {
                    const number = decimal(text, allowNegative);
                    setError(undefined);
                    onValidityChange?.(true);
                    onChange(number);
                } catch {
                    setError(
                        allowNegative
                            ? "Enter a valid number"
                            : "Enter a non-negative number",
                    );
                    onValidityChange?.(false);
                }
            }}
        />
    );
}
