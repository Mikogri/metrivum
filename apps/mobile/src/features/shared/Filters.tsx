import { useState, type PropsWithChildren } from "react";
import { View } from "react-native";
import { BottomSheet, Button, Chip, useTheme } from "@trainflow/ui-mobile";

/**
 * Filters and sorting live in a bottom sheet. The chip on the screen opens it and says what is
 * currently applied, so an active filter is never invisible.
 */
export function Filters({
    title = "Filters",
    summary,
    active = false,
    onReset,
    children,
}: PropsWithChildren<{
    title?: string;
    /** Short description of what is applied, shown on the chip. */
    summary?: string;
    active?: boolean;
    onReset?: () => void;
}>) {
    const theme = useTheme();
    const [open, setOpen] = useState(false);
    return (
        <View style={{ flexDirection: "row" }}>
            <Chip
                icon="filter"
                label={summary || title}
                selected={active}
                onPress={() => setOpen(true)}
            />
            <BottomSheet
                title={title}
                open={open}
                onClose={() => setOpen(false)}
                footer={
                    <View style={{ gap: theme.spacing.sm }}>
                        <Button
                            size="lg"
                            tone="primary"
                            title="Show results"
                            onPress={() => setOpen(false)}
                        />
                        {onReset && active ? (
                            <Button
                                tone="ghost"
                                title="Clear filters"
                                onPress={onReset}
                            />
                        ) : null}
                    </View>
                }
            >
                {children}
            </BottomSheet>
        </View>
    );
}
