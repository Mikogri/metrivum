import { useState, type ReactNode } from "react";
import { View } from "react-native";
import {
    BottomSheet,
    Button,
    Heading,
    useInsideSheet,
    useTheme,
    type IconName,
    type SheetSize,
} from "@metrivum/ui-mobile";

/**
 * A form that is started from a visible button and filled in a bottom sheet. Closing with unsaved
 * input asks first, inside the same sheet. When the form is already shown inside another sheet
 * (for example group details) it is laid out in place instead, so two sheets never stack.
 */
export function FormSheet({
    trigger,
    title,
    subtitle,
    dirty = false,
    size = "full",
    footer,
    children,
    onDiscard,
    open: controlled,
    onOpenChange,
}: {
    /** The button on the screen that opens the form. */
    trigger: {
        title: string;
        icon?: IconName;
        tone?: "primary" | "neutral" | "ghost" | "brand";
        disabled?: boolean;
    };
    title: string;
    subtitle?: string;
    dirty?: boolean;
    size?: SheetSize;
    /** Receives `close`, for the submit button to dismiss the sheet after success. */
    footer: (close: () => void) => ReactNode;
    children: ReactNode;
    /** Called when the person closes the form and agrees to drop what they typed. */
    onDiscard?: () => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}) {
    const theme = useTheme();
    const inside = useInsideSheet();
    const [own, setOwn] = useState(false);
    const open = controlled ?? own;
    const setOpen = (next: boolean) => {
        setOwn(next);
        onOpenChange?.(next);
    };
    if (inside)
        return (
            <View
                style={{
                    gap: theme.spacing.md,
                    paddingTop: theme.spacing.md,
                    borderTopWidth: theme.hairline,
                    borderTopColor: theme.colors.border,
                }}
            >
                <Heading>{title}</Heading>
                {children}
                {footer(() => {})}
            </View>
        );
    return (
        <>
            <Button
                title={trigger.title}
                icon={trigger.icon}
                tone={trigger.tone}
                disabled={trigger.disabled}
                onPress={() => setOpen(true)}
            />
            <BottomSheet
                title={title}
                subtitle={subtitle}
                open={open}
                size={size}
                dirty={dirty}
                onClose={() => {
                    if (dirty) onDiscard?.();
                    setOpen(false);
                }}
                footer={footer(() => setOpen(false))}
            >
                {children}
            </BottomSheet>
        </>
    );
}
