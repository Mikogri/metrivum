import {
    Children,
    createContext,
    isValidElement,
    useContext,
    useEffect,
    useRef,
    useState,
    type PropsWithChildren,
    type ReactNode,
} from "react";
import {
    ActivityIndicator,
    ScrollView,
    Text as NativeText,
    TextInput,
    View,
    type StyleProp,
    type TextInputProps,
    type TextProps,
    type ViewStyle,
} from "react-native";
import Animated, {
    FadeInUp,
    FadeOutUp,
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import {
    GlassView,
    isGlassEffectAPIAvailable,
    isLiquidGlassAvailable,
} from "expo-glass-effect";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";
import { useUiLabels } from "./localization";
import { PressableScale } from "./motion";
import { haptic, useAccessibilityPreferences } from "./system";
import {
    tokens,
    typography,
    useTheme,
    type TextVariant,
    type ThemeColors,
} from "./theme";

type Tone = "text" | "mutedText" | "subtleText" | "danger" | "warning" | "success" | "brand" | "info";

/* ------------------------------------------------------------------ text */

export function Text({
    children,
    tone = "text",
    variant = "body",
    style,
    ...props
}: TextProps & { tone?: Tone; variant?: TextVariant }) {
    const t = useTheme();
    return (
        <NativeText
            // Large accessibility sizes stay usable: text grows, but not past twice its base size.
            maxFontSizeMultiplier={2}
            {...props}
            style={[typography[variant], { color: t.colors[tone] }, style]}
        >
            {children}
        </NativeText>
    );
}

/** Section heading. `level="screen"` is the large light title at the top of a screen. */
export function Heading({
    children,
    level = "section",
}: PropsWithChildren<{ level?: "screen" | "title" | "section" }>) {
    return (
        <Text
            accessibilityRole="header"
            variant={
                level === "screen"
                    ? "display"
                    : level === "title"
                      ? "title"
                      : "heading"
            }
        >
            {children}
        </Text>
    );
}

/** Small tracked label above a group of rows or a value. */
export function Overline({ children }: PropsWithChildren) {
    return (
        <Text variant="overline" tone="subtleText">
            {children}
        </Text>
    );
}

/* ------------------------------------------------------------------ surfaces */

function useGlass() {
    const { reduceTransparency } = useAccessibilityPreferences();
    return (
        !reduceTransparency &&
        isGlassEffectAPIAvailable() &&
        isLiquidGlassAvailable()
    );
}

/**
 * Surface for chrome that floats above content (a bottom action bar, a toolbar). Real Liquid Glass
 * where the system has it and transparency is allowed; an opaque raised surface with a hairline
 * otherwise, including all of Android. Do not use it for cards, fields or inside native bars and
 * sheets, which bring their own material.
 */
export function ToolbarSurface({
    children,
    style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
    const t = useTheme();
    const glass = useGlass();
    const shape: ViewStyle = {
        padding: tokens.spacing.sm,
        borderRadius: tokens.radii.xl,
        overflow: "hidden",
    };
    return glass ? (
        <GlassView
            glassEffectStyle="regular"
            colorScheme={t.dark ? "dark" : "light"}
            style={[shape, style]}
        >
            {children}
        </GlassView>
    ) : (
        <View
            style={[
                shape,
                {
                    backgroundColor: t.colors.chrome,
                    borderWidth: tokens.hairline,
                    borderColor: t.colors.borderStrong,
                },
                style,
            ]}
        >
            {children}
        </View>
    );
}

type Chrome = {
    /** Shown at the trailing edge of every screen title inside the provider (the profile). */
    trailing?: ReactNode;
    /** Space covered by chrome floating over the bottom of the screen (the tab bar). */
    bottomInset: number;
    /** A native header already covers the status bar, so the screen adds no top inset. */
    underHeader: boolean;
};
const ScreenChrome = createContext<Chrome>({
    bottomInset: 0,
    underHeader: false,
});

/**
 * Set by a layout whose chrome floats over its screens. Content then scrolls behind that chrome
 * and ends above it, and each screen title carries the shared trailing control.
 */
export function ScreenChromeProvider({
    children,
    trailing,
    bottomInset = 0,
    underHeader = false,
}: PropsWithChildren<Partial<Chrome>>) {
    return (
        <ScreenChrome.Provider value={{ trailing, bottomInset, underHeader }}>
            {children}
        </ScreenChrome.Provider>
    );
}
/** For screens that bring their own scroller and must end it above floating chrome. */
export const useScreenChrome = () => useContext(ScreenChrome);

export function Screen({
    title,
    eyebrow,
    subtitle,
    children,
    actions,
    headerAction,
    footer,
    scroll = true,
    bare = false,
}: PropsWithChildren<{
    title: string;
    /** Short context above the title: the date, the person a screen belongs to. */
    eyebrow?: string | null;
    subtitle?: string | null;
    /** Buttons directly under the title. */
    actions?: ReactNode;
    /** One control level with the title, at the trailing edge (compose, add). */
    headerAction?: ReactNode;
    /** Pinned above the bottom edge, outside the scroll area (primary action of the screen). */
    footer?: ReactNode;
    scroll?: boolean;
    /**
     * No large title and no padding: the content manages its own layout edge to edge (a chat
     * thread). The native header then carries the title.
     */
    bare?: boolean;
}>) {
    const t = useTheme();
    const chrome = useContext(ScreenChrome);
    const header = bare ? null : (
        <View style={{ gap: tokens.spacing.sm }}>
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: tokens.spacing.sm,
                    minHeight: tokens.control.md,
                }}
            >
                <View style={{ flex: 1, gap: 2 }}>
                    {eyebrow ? <Overline>{eyebrow}</Overline> : null}
                    <Heading level="screen">{title}</Heading>
                </View>
                {headerAction}
                {chrome.trailing}
            </View>
            {subtitle ? (
                <Text variant="caption" tone="mutedText">
                    {subtitle}
                </Text>
            ) : null}
            {actions ? (
                <View style={{ gap: tokens.spacing.sm }}>{actions}</View>
            ) : null}
        </View>
    );
    const padding = bare
        ? {}
        : {
              paddingHorizontal: tokens.spacing.md + tokens.spacing.xs,
              paddingTop: tokens.spacing.sm + tokens.spacing.xs,
              paddingBottom: tokens.spacing.xl + chrome.bottomInset,
              gap: tokens.spacing.lg - tokens.spacing.xs,
          };
    return (
        <SafeAreaView
            // "top" adds space only where nothing covers the status bar (tab roots, sign-in).
            // Floating chrome already accounts for the bottom inset, so the screen runs to the
            // edge behind it.
            edges={[
                "left",
                "right",
                ...(chrome.underHeader ? [] : (["top"] as const)),
                ...(chrome.bottomInset ? [] : (["bottom"] as const)),
            ]}
            style={{ flex: 1, backgroundColor: t.colors.background }}
        >
            {scroll ? (
                <ScrollView
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    contentInsetAdjustmentBehavior="automatic"
                    automaticallyAdjustKeyboardInsets
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={padding}
                >
                    {header}
                    {children}
                </ScrollView>
            ) : (
                <View
                    style={[
                        padding,
                        { flex: 1, paddingBottom: bare ? 0 : chrome.bottomInset },
                    ]}
                >
                    {header}
                    {children}
                </View>
            )}
            {footer ? (
                <View
                    style={{
                        paddingHorizontal: tokens.spacing.md,
                        paddingTop: tokens.spacing.sm,
                        paddingBottom: tokens.spacing.sm + chrome.bottomInset,
                        borderTopWidth: tokens.hairline,
                        borderTopColor: t.colors.border,
                    }}
                >
                    {footer}
                </View>
            ) : null}
        </SafeAreaView>
    );
}

/** Marks the last row of a run of list rows so it drops its divider. */
const RowPosition = createContext<{ last: boolean }>({ last: false });

function withRowPositions(children: ReactNode) {
    const items = Children.toArray(children);
    return items.map((child, index) => {
        if (!isValidElement(child) || child.type !== ListItem) return child;
        const next = items[index + 1];
        const last = !(isValidElement(next) && next.type === ListItem);
        return (
            <RowPosition.Provider key={child.key ?? index} value={{ last }}>
                {child}
            </RowPosition.Provider>
        );
    });
}

/**
 * One group of related content on a single surface. Rows inside share the surface and are
 * separated by hairlines; unrelated content belongs in another section, not in nested cards.
 */
export function Section({
    children,
    title,
    action,
    flat = false,
}: PropsWithChildren<{
    title?: string;
    /** Small control aligned with the title, e.g. "See all". */
    action?: ReactNode;
    /** No surface: just the label and the content on the page background. */
    flat?: boolean;
}>) {
    const t = useTheme();
    return (
        <View style={{ gap: tokens.spacing.sm }}>
            {title || action ? (
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: tokens.spacing.sm,
                        paddingHorizontal: tokens.spacing.xs,
                    }}
                >
                    {title ? <Heading>{title}</Heading> : <View />}
                    {action}
                </View>
            ) : null}
            <View
                style={
                    flat
                        ? { gap: tokens.spacing.sm }
                        : {
                              paddingHorizontal: tokens.spacing.md,
                              paddingVertical: tokens.spacing.md - 2,
                              gap: tokens.spacing.sm,
                              backgroundColor: t.colors.surface,
                              borderRadius: tokens.radii.lg,
                          }
                }
            >
                {withRowPositions(children)}
            </View>
        </View>
    );
}

export function Divider() {
    const t = useTheme();
    return (
        <View
            style={{ height: tokens.hairline, backgroundColor: t.colors.border }}
        />
    );
}

/* ------------------------------------------------------------------ actions */

type ButtonTone = "primary" | "neutral" | "danger" | "ghost" | "brand";

export function Button({
    title,
    onPress,
    loading,
    disabled,
    tone = "neutral",
    icon,
    size = "md",
    accessibilityHint,
}: {
    title: string;
    onPress: () => void | Promise<void>;
    loading?: boolean;
    disabled?: boolean;
    tone?: ButtonTone;
    icon?: IconName;
    /** `lg` for the main action of a screen or a workout control reached with one thumb. */
    size?: "sm" | "md" | "lg";
    accessibilityHint?: string;
}) {
    // Drawn compact; hit slop brings every size up to the minimum touch target.
    const t = useTheme();
    const inactive = !!disabled || !!loading;
    const fill: Record<ButtonTone, string> = {
        primary: t.colors.accent,
        brand: t.colors.brand,
        neutral: t.colors.surfaceRaised,
        danger: t.colors.dangerSoft,
        ghost: "transparent",
    };
    const ink: Record<ButtonTone, string> = {
        primary: t.colors.onAccent,
        brand: t.colors.onBrand,
        neutral: t.colors.text,
        danger: t.colors.danger,
        ghost: t.colors.text,
    };
    const height = tokens.control[size];
    const slop = Math.max(0, (tokens.touch - height) / 2);
    return (
        <PressableScale
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityHint={accessibilityHint}
            accessibilityState={{ disabled: inactive, busy: !!loading }}
            disabled={inactive}
            hitSlop={{ top: slop, bottom: slop }}
            onPress={() => {
                void onPress();
            }}
            style={{
                minHeight: height,
                paddingHorizontal:
                    size === "sm" ? tokens.spacing.md - 4 : tokens.spacing.md,
                paddingVertical: tokens.spacing.xs,
                flexDirection: "row",
                gap: tokens.spacing.xs + 2,
                justifyContent: "center",
                alignItems: "center",
                borderRadius: size === "sm" ? tokens.radii.sm + 2 : tokens.radius,
                backgroundColor: fill[tone],
                opacity: inactive ? 0.45 : 1,
            }}
        >
            {loading ? (
                <ActivityIndicator size="small" color={ink[tone]} />
            ) : (
                <>
                    {icon ? (
                        <Icon
                            name={icon}
                            size={tokens.icon.sm - 2}
                            color={ink[tone]}
                        />
                    ) : null}
                    <NativeText
                        maxFontSizeMultiplier={1.6}
                        style={[
                            size === "sm"
                                ? typography.label
                                : typography.button,
                            {
                                color: ink[tone],
                                textAlign: "center",
                                flexShrink: 1,
                            },
                        ]}
                    >
                        {title}
                    </NativeText>
                </>
            )}
        </PressableScale>
    );
}

/** Icon-only control. The label is required: it is the accessible name. */
export function IconButton({
    icon,
    label,
    onPress,
    disabled,
    tone = "text",
    filled = false,
    size = tokens.control.md,
}: {
    icon: IconName;
    label: string;
    onPress: () => void;
    disabled?: boolean;
    tone?: keyof ThemeColors;
    /** Sits on a raised circle, for controls that float or need a clear target. */
    filled?: boolean;
    size?: number;
}) {
    const t = useTheme();
    return (
        <PressableScale
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !!disabled }}
            disabled={disabled}
            hitSlop={8}
            onPress={onPress}
            scale={0.9}
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: filled ? t.colors.selected : "transparent",
                opacity: disabled ? 0.4 : 1,
            }}
        >
            <Icon
                name={icon}
                tone={tone}
                size={size < tokens.control.md ? tokens.icon.sm : tokens.icon.md}
            />
        </PressableScale>
    );
}

/* ------------------------------------------------------------------ inputs */

export function Field({
    label,
    error,
    hint,
    leading,
    hideLabel = false,
    ...props
}: TextInputProps & {
    label: string;
    error?: string;
    /** Help text under the label, above the input. */
    hint?: string;
    leading?: ReactNode;
    /** Keeps the label for assistive technology only (search boxes, chat composer). */
    hideLabel?: boolean;
}) {
    const t = useTheme();
    const [focused, setFocused] = useState(false);
    const focus = useSharedValue(0);
    useEffect(() => {
        focus.value = withTiming(focused ? 1 : 0, {
            duration: tokens.motion.duration.fast,
        });
    }, [focused, focus]);
    const border = error ? t.colors.danger : t.colors.border;
    const frame = useAnimatedStyle(() => ({
        borderColor: interpolateColor(
            focus.value,
            [0, 1],
            [border, error ? t.colors.danger : t.colors.mutedText],
        ),
    }));
    return (
        <View style={{ gap: tokens.spacing.xs + 2 }}>
            {hideLabel ? null : (
                <Text variant="label" tone="mutedText">
                    {label}
                </Text>
            )}
            {hint ? (
                <Text variant="caption" tone="subtleText">
                    {hint}
                </Text>
            ) : null}
            <Animated.View
                style={[
                    {
                        flexDirection: "row",
                        alignItems: props.multiline ? "flex-start" : "center",
                        gap: tokens.spacing.sm,
                        minHeight: tokens.touch,
                        paddingHorizontal: tokens.spacing.md - 2,
                        borderWidth: tokens.hairline,
                        borderRadius: tokens.radii.md,
                        backgroundColor: t.colors.surfaceRaised,
                        opacity: props.editable === false ? 0.55 : 1,
                    },
                    frame,
                ]}
            >
                {leading}
                <TextInput
                    accessibilityLabel={label}
                    placeholderTextColor={t.colors.subtleText}
                    selectionColor={t.colors.brand}
                    maxFontSizeMultiplier={1.8}
                    {...props}
                    onFocus={(event) => {
                        setFocused(true);
                        props.onFocus?.(event);
                    }}
                    onBlur={(event) => {
                        setFocused(false);
                        props.onBlur?.(event);
                    }}
                    style={[
                        typography.body,
                        {
                            flex: 1,
                            minHeight: props.multiline
                                ? tokens.touch * 2
                                : tokens.touch,
                            paddingVertical: tokens.spacing.sm + 2,
                            color: t.colors.text,
                            textAlignVertical: props.multiline
                                ? "top"
                                : "center",
                        },
                        props.style,
                    ]}
                />
            </Animated.View>
            {error ? (
                <Text variant="caption" tone="danger">
                    {error}
                </Text>
            ) : null}
        </View>
    );
}

/**
 * A control that looks like a field but opens something (a selection sheet, a date picker). It is
 * the visible way into that picker: no hidden long-press, no dropdown.
 */
export function FieldButton({
    label,
    value,
    placeholder,
    onPress,
    disabled,
    icon = "chevronDown",
    error,
    expanded,
}: {
    label: string;
    value?: string | null;
    placeholder?: string;
    onPress: () => void;
    disabled?: boolean;
    icon?: IconName;
    error?: string;
    expanded?: boolean;
}) {
    const t = useTheme();
    const labels = useUiLabels();
    const shown = value || placeholder || labels.choose;
    return (
        <View style={{ gap: tokens.spacing.xs + 2 }}>
            <Text variant="label" tone="mutedText">
                {label}
            </Text>
            <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${shown}`}
                accessibilityState={{ disabled: !!disabled, expanded }}
                disabled={disabled}
                scale={0.985}
                onPress={onPress}
                style={{
                    minHeight: tokens.touch,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: tokens.spacing.sm,
                    paddingHorizontal: tokens.spacing.md - 2,
                    borderWidth: tokens.hairline,
                    borderColor: error ? t.colors.danger : t.colors.border,
                    borderRadius: tokens.radii.md,
                    backgroundColor: t.colors.surfaceRaised,
                    opacity: disabled ? 0.55 : 1,
                }}
            >
                <Text
                    tone={value ? "text" : "subtleText"}
                    style={{ flex: 1 }}
                    numberOfLines={1}
                >
                    {shown}
                </Text>
                <Icon name={icon} tone="subtleText" size={tokens.icon.sm} />
            </PressableScale>
            {error ? (
                <Text variant="caption" tone="danger">
                    {error}
                </Text>
            ) : null}
        </View>
    );
}

/** Search box: the label names it for assistive technology and doubles as the placeholder. */
export function SearchField(props: TextInputProps & { label: string }) {
    return (
        <Field
            hideLabel
            placeholder={props.label}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            leading={<Icon name="search" tone="subtleText" size={tokens.icon.sm} />}
            {...props}
        />
    );
}

/**
 * Large number entry for values typed mid-workout (reps, load): big calm digits, a tall target and
 * optional step buttons so a small correction does not need the keyboard.
 */
export function NumericInput({
    label,
    value,
    onChangeText,
    suffix,
    invalid,
    disabled,
    integer = false,
    onStep,
    stepLabels,
    placeholder = "–",
}: {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    suffix?: string;
    invalid?: boolean;
    disabled?: boolean;
    /** Whole numbers only (reps): shows the plain number pad. */
    integer?: boolean;
    /** Shows minus/plus buttons; receives -1 or +1. */
    onStep?: (direction: -1 | 1) => void;
    stepLabels?: { decrease: string; increase: string };
    placeholder?: string;
}) {
    const t = useTheme();
    return (
        <View style={{ flex: 1, gap: tokens.spacing.xs }}>
            <Text variant="caption" tone="mutedText">
                {label}
            </Text>
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    minHeight: tokens.touchLarge,
                    borderRadius: tokens.radii.md,
                    borderWidth: tokens.hairline,
                    borderColor: invalid ? t.colors.danger : t.colors.border,
                    backgroundColor: t.colors.surfaceRaised,
                    opacity: disabled ? 0.5 : 1,
                }}
            >
                {onStep ? (
                    <IconButton
                        icon="remove"
                        label={stepLabels?.decrease ?? `Decrease ${label}`}
                        tone="mutedText"
                        size={44}
                        disabled={disabled}
                        onPress={() => onStep(-1)}
                    />
                ) : null}
                <TextInput
                    accessibilityLabel={suffix ? `${label} (${suffix})` : label}
                    value={value}
                    onChangeText={onChangeText}
                    editable={!disabled}
                    keyboardType={integer ? "number-pad" : "decimal-pad"}
                    placeholder={placeholder}
                    placeholderTextColor={t.colors.subtleText}
                    selectionColor={t.colors.brand}
                    selectTextOnFocus
                    maxFontSizeMultiplier={1.5}
                    style={[
                        typography.numeric,
                        {
                            flex: 1,
                            minWidth: 0,
                            minHeight: tokens.touchLarge,
                            paddingVertical: 0,
                            paddingHorizontal: tokens.spacing.xs,
                            textAlign: "center",
                            color: invalid ? t.colors.danger : t.colors.text,
                        },
                    ]}
                />
                {suffix && !onStep ? (
                    <Text
                        variant="caption"
                        tone="subtleText"
                        style={{ paddingRight: tokens.spacing.sm }}
                    >
                        {suffix}
                    </Text>
                ) : null}
                {onStep ? (
                    <IconButton
                        icon="add"
                        label={stepLabels?.increase ?? `Increase ${label}`}
                        tone="mutedText"
                        size={44}
                        disabled={disabled}
                        onPress={() => onStep(1)}
                    />
                ) : null}
            </View>
        </View>
    );
}

/**
 * The round "done" control of a row: an outlined circle that fills with the brand colour and pops
 * when checked. Used to record a set; the haptic belongs to the caller's action.
 */
export function CheckButton({
    checked,
    label,
    onPress,
    disabled,
    size = tokens.touchLarge,
}: {
    checked: boolean;
    label: string;
    onPress: () => void;
    disabled?: boolean;
    size?: number;
}) {
    const t = useTheme();
    const on = useSharedValue(checked ? 1 : 0);
    useEffect(() => {
        on.value = checked
            ? withSpring(1, tokens.motion.spring.pop)
            : withTiming(0, { duration: tokens.motion.duration.fast });
    }, [checked, on]);
    const fill = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            on.value,
            [0, 1],
            [t.colors.surfaceRaised, t.colors.brand],
        ),
        transform: [{ scale: 0.92 + 0.08 * Math.min(1.15, on.value) }],
    }));
    return (
        <PressableScale
            accessibilityRole="checkbox"
            accessibilityLabel={label}
            accessibilityState={{ checked, disabled: !!disabled }}
            disabled={disabled}
            hitSlop={6}
            scale={0.9}
            onPress={onPress}
            style={{ opacity: disabled ? 0.4 : 1 }}
        >
            <Animated.View
                style={[
                    {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: tokens.hairline,
                        borderColor: checked
                            ? t.colors.brand
                            : t.colors.borderStrong,
                    },
                    fill,
                ]}
            >
                <Icon
                    name="check"
                    color={checked ? t.colors.onBrand : t.colors.subtleText}
                />
            </Animated.View>
        </PressableScale>
    );
}

/**
 * Short mutually exclusive choice shown inline (2–4 options): a quiet track with a thumb that
 * slides to the chosen option. Longer sets belong in a sheet.
 */
export function SegmentedControl<T extends string>({
    label,
    options,
    value,
    onChange,
    disabled,
}: {
    label: string;
    options: readonly { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
    disabled?: boolean;
}) {
    const t = useTheme();
    const inset = 3;
    const height = tokens.control.sm;
    const [width, setWidth] = useState(0);
    const index = Math.max(
        0,
        options.findIndex((option) => option.value === value),
    );
    const cell = width > 0 ? (width - inset * 2) / options.length : 0;
    const x = useSharedValue(0);
    const placed = useRef(false);
    useEffect(() => {
        if (!cell) return;
        // The first measurement places the thumb; later changes slide it.
        x.value = placed.current
            ? withSpring(index * cell, tokens.motion.spring.settle)
            : index * cell;
        placed.current = true;
    }, [index, cell, x]);
    const thumb = useAnimatedStyle(() => ({
        transform: [{ translateX: x.value }],
    }));
    return (
        <View
            accessibilityRole="radiogroup"
            accessibilityLabel={label}
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
            style={{
                flexDirection: "row",
                padding: inset,
                borderRadius: tokens.radii.pill,
                backgroundColor: t.colors.selected,
                opacity: disabled ? 0.5 : 1,
            }}
        >
            {cell ? (
                <Animated.View
                    style={[
                        {
                            position: "absolute",
                            top: inset,
                            left: inset,
                            width: cell,
                            height,
                            borderRadius: tokens.radii.pill,
                            backgroundColor: t.colors.thumb,
                        },
                        thumb,
                    ]}
                />
            ) : null}
            {options.map((option, position) => {
                const selected = option.value === value;
                return (
                    <PressableScale
                        key={option.value}
                        accessibilityRole="radio"
                        accessibilityLabel={option.label}
                        accessibilityState={{ selected, disabled: !!disabled }}
                        disabled={disabled}
                        hitSlop={{ top: 6, bottom: 6 }}
                        onPress={() => {
                            if (selected) return;
                            // The thumb starts moving on the UI thread at once, even when the
                            // change it triggers is expensive to render.
                            x.value = withSpring(
                                position * cell,
                                tokens.motion.spring.settle,
                            );
                            onChange(option.value);
                        }}
                        style={{
                            flex: 1,
                            height,
                            paddingHorizontal: tokens.spacing.sm,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <NativeText
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.4}
                            style={[
                                typography.label,
                                {
                                    color: selected
                                        ? t.colors.text
                                        : t.colors.mutedText,
                                },
                            ]}
                        >
                            {option.label}
                        </NativeText>
                    </PressableScale>
                );
            })}
        </View>
    );
}

/**
 * Sections of one screen (client details, the Clients views): a scrolling row of pills, the
 * current one filled. For in-screen navigation, not for filters.
 */
export function Tabs<T extends string>({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: readonly { value: T; label: string; badge?: number }[];
    value: T;
    onChange: (value: T) => void;
}) {
    const t = useTheme();
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityRole="tablist"
            accessibilityLabel={label}
            // Bleeds to the screen edges so the row scrolls under the page padding.
            style={{
                marginHorizontal: -(tokens.spacing.md + tokens.spacing.xs),
                flexGrow: 0,
            }}
            contentContainerStyle={{
                paddingHorizontal: tokens.spacing.md + tokens.spacing.xs,
                gap: tokens.spacing.xs + 2,
            }}
        >
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <PressableScale
                        key={option.value}
                        accessibilityRole="tab"
                        accessibilityLabel={option.label}
                        accessibilityState={{ selected }}
                        hitSlop={{ top: 6, bottom: 6 }}
                        scale={0.96}
                        onPress={() => {
                            if (!selected) onChange(option.value);
                        }}
                        style={{
                            height: tokens.control.sm + 2,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: tokens.spacing.xs + 2,
                            paddingHorizontal: tokens.spacing.md - 2,
                            borderRadius: tokens.radii.pill,
                            backgroundColor: selected
                                ? t.colors.accent
                                : t.colors.surface,
                        }}
                    >
                        <NativeText
                            maxFontSizeMultiplier={1.4}
                            style={[
                                typography.label,
                                {
                                    color: selected
                                        ? t.colors.onAccent
                                        : t.colors.mutedText,
                                },
                            ]}
                        >
                            {option.label}
                        </NativeText>
                        {option.badge ? (
                            <NativeText
                                maxFontSizeMultiplier={1.4}
                                style={[
                                    typography.label,
                                    {
                                        color: selected
                                            ? t.colors.onAccent
                                            : t.colors.brand,
                                        opacity: selected ? 0.6 : 1,
                                    },
                                ]}
                            >
                                {option.badge}
                            </NativeText>
                        ) : null}
                    </PressableScale>
                );
            })}
        </ScrollView>
    );
}

/**
 * On/off setting that applies at once. The label is the accessible name; the row it sits in shows
 * the same words.
 */
export function Switch({
    value,
    onValueChange,
    disabled,
    accessibilityLabel,
}: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    disabled?: boolean;
    accessibilityLabel: string;
}) {
    const t = useTheme();
    const width = 42;
    const inset = 3;
    const knob = 20;
    const on = useSharedValue(value ? 1 : 0);
    useEffect(() => {
        on.value = withTiming(value ? 1 : 0, {
            duration: tokens.motion.duration.fast,
        });
    }, [value, on]);
    const track = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            on.value,
            [0, 1],
            [t.colors.borderStrong, t.colors.brand],
        ),
    }));
    const thumb = useAnimatedStyle(() => ({
        transform: [{ translateX: on.value * (width - knob - inset * 2) }],
    }));
    return (
        <PressableScale
            accessibilityRole="switch"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ checked: value, disabled: !!disabled }}
            disabled={disabled}
            hitSlop={10}
            scale={0.96}
            onPress={() => {
                haptic.selection();
                onValueChange(!value);
            }}
            style={{ opacity: disabled ? 0.45 : 1 }}
        >
            <Animated.View
                style={[
                    {
                        width,
                        height: knob + inset * 2,
                        padding: inset,
                        borderRadius: tokens.radii.pill,
                    },
                    track,
                ]}
            >
                <Animated.View
                    style={[
                        {
                            width: knob,
                            height: knob,
                            borderRadius: knob / 2,
                            backgroundColor: t.colors.knob,
                        },
                        thumb,
                    ]}
                />
            </Animated.View>
        </PressableScale>
    );
}

/** Small toggleable pill: a filter that is on or off, a tag. */
export function Chip({
    label,
    selected = false,
    onPress,
    icon,
    disabled,
}: {
    label: string;
    selected?: boolean;
    onPress?: () => void;
    icon?: IconName;
    disabled?: boolean;
}) {
    const t = useTheme();
    return (
        <PressableScale
            accessibilityRole={onPress ? "button" : "text"}
            accessibilityLabel={label}
            accessibilityState={{ selected, disabled: !!disabled }}
            disabled={disabled || !onPress}
            hitSlop={6}
            onPress={onPress}
            style={{
                height: tokens.control.sm,
                flexDirection: "row",
                alignItems: "center",
                gap: tokens.spacing.xs + 2,
                paddingHorizontal: tokens.spacing.md - 4,
                borderRadius: tokens.radii.pill,
                borderWidth: tokens.hairline,
                borderColor: selected ? t.colors.accent : t.colors.borderStrong,
                backgroundColor: selected ? t.colors.accent : "transparent",
                opacity: disabled ? 0.5 : 1,
            }}
        >
            {icon ? (
                <Icon
                    name={icon}
                    size={tokens.icon.sm}
                    color={selected ? t.colors.onAccent : t.colors.mutedText}
                />
            ) : null}
            <NativeText
                maxFontSizeMultiplier={1.4}
                style={[
                    typography.label,
                    { color: selected ? t.colors.onAccent : t.colors.text },
                ]}
            >
                {label}
            </NativeText>
        </PressableScale>
    );
}

/** A labelled, wrapping set of chips for one choice shown in place, e.g. inside a filter sheet. */
export function ChipGroup<T extends string>({
    label,
    options,
    value,
    onChange,
    disabled,
}: {
    label: string;
    options: readonly { value: T; label: string }[];
    value: T | null | undefined;
    onChange: (value: T) => void;
    disabled?: boolean;
}) {
    return (
        <View style={{ gap: tokens.spacing.sm }}>
            <Text variant="label" tone="mutedText">
                {label}
            </Text>
            <View
                accessibilityRole="radiogroup"
                accessibilityLabel={label}
                style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: tokens.spacing.sm,
                }}
            >
                {options.map((option) => (
                    <Chip
                        key={option.value}
                        label={option.label}
                        selected={option.value === value}
                        disabled={disabled}
                        onPress={() => onChange(option.value)}
                    />
                ))}
            </View>
        </View>
    );
}

/* ------------------------------------------------------------------ rows */

export function ListItem({
    title,
    subtitle,
    onPress,
    trailing,
    icon,
    leading,
    tone = "text",
    accessibilityHint,
    subtitleLines,
}: {
    title: string;
    subtitle?: string | null;
    /** Truncates the subtitle (message previews); unlimited by default. */
    subtitleLines?: number;
    onPress?: () => void;
    /** Replaces the chevron shown on pressable rows (a badge, a value, a control). */
    trailing?: ReactNode;
    icon?: IconName;
    /** Custom leading element instead of an icon, e.g. an avatar. */
    leading?: ReactNode;
    tone?: "text" | "danger";
    accessibilityHint?: string;
}) {
    const t = useTheme();
    const { last } = useContext(RowPosition);
    const content = (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: tokens.spacing.md - 4,
                minHeight: tokens.touch + 2,
                paddingVertical: tokens.spacing.sm,
                borderBottomWidth: last ? 0 : tokens.hairline,
                borderBottomColor: t.colors.border,
            }}
        >
            {leading ??
                (icon ? (
                    <Icon
                        name={icon}
                        tone={tone === "danger" ? "danger" : "mutedText"}
                    />
                ) : null)}
            <View style={{ flex: 1, gap: 2 }}>
                <Text tone={tone}>{title}</Text>
                {subtitle ? (
                    <Text
                        variant="caption"
                        tone="mutedText"
                        numberOfLines={subtitleLines}
                    >
                        {subtitle}
                    </Text>
                ) : null}
            </View>
            {trailing ??
                (onPress ? (
                    <Icon
                        name="chevronRight"
                        tone="subtleText"
                        size={tokens.icon.sm}
                    />
                ) : null)}
        </View>
    );
    return onPress ? (
        <PressableScale
            accessibilityRole="button"
            accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
            accessibilityHint={accessibilityHint}
            onPress={onPress}
            scale={0.985}
        >
            {content}
        </PressableScale>
    ) : (
        content
    );
}

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

export function Badge({
    children,
    tone = "neutral",
}: PropsWithChildren<{ tone?: BadgeTone }>) {
    const t = useTheme();
    const colors: Record<BadgeTone, [string, string]> = {
        neutral: [t.colors.surfaceRaised, t.colors.mutedText],
        success: [t.colors.successSoft, t.colors.success],
        warning: [t.colors.warningSoft, t.colors.warning],
        danger: [t.colors.dangerSoft, t.colors.danger],
        info: [t.colors.infoSoft, t.colors.info],
        brand: [t.colors.successSoft, t.colors.brand],
    };
    return (
        <View
            style={{
                alignSelf: "flex-start",
                minHeight: 24,
                justifyContent: "center",
                paddingHorizontal: tokens.spacing.sm + 2,
                borderRadius: tokens.radii.pill,
                backgroundColor: colors[tone][0],
            }}
        >
            <NativeText
                maxFontSizeMultiplier={1.4}
                style={[typography.caption, { color: colors[tone][1] }]}
            >
                {children}
            </NativeText>
        </View>
    );
}

/** A label over a calm large value: counts on Today, sets and reps in a workout. */
export function Stat({
    label,
    value,
    tone = "text",
}: {
    label: string;
    value: string | number;
    tone?: Tone;
}) {
    return (
        <View
            accessible
            accessibilityLabel={`${label}: ${value}`}
            style={{ flex: 1, gap: 2 }}
        >
            <Text variant="caption" tone="mutedText">
                {label}
            </Text>
            <Text variant="numeric" tone={tone}>
                {value}
            </Text>
        </View>
    );
}

/** Initials on a quiet disc, for people in lists and headers. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
    const t = useTheme();
    const initials = name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
    return (
        <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: t.colors.surfaceRaised,
                borderWidth: tokens.hairline,
                borderColor: t.colors.border,
            }}
        >
            <NativeText
                allowFontScaling={false}
                style={[
                    typography.label,
                    { color: t.colors.mutedText, fontSize: size * 0.36 },
                ]}
            >
                {initials || "?"}
            </NativeText>
        </View>
    );
}

/** Determinate progress of real work (sets done of sets planned). Never a made-up percentage. */
export function ProgressBar({
    value,
    max,
    label,
}: {
    value: number;
    max: number;
    label: string;
}) {
    const t = useTheme();
    const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
    const width = useSharedValue(fraction);
    useEffect(() => {
        width.value = withSpring(fraction, tokens.motion.spring.settle);
    }, [fraction, width]);
    const bar = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
    return (
        <View
            accessibilityRole="progressbar"
            accessibilityLabel={label}
            accessibilityValue={{ min: 0, max, now: value }}
            style={{
                height: 4,
                borderRadius: 2,
                overflow: "hidden",
                backgroundColor: t.colors.surfaceRaised,
            }}
        >
            <Animated.View
                style={[
                    { height: 4, borderRadius: 2, backgroundColor: t.colors.brand },
                    bar,
                ]}
            />
        </View>
    );
}

/* ------------------------------------------------------------------ states */

export function LoadingState({ label }: { label?: string }) {
    const labels = useUiLabels();
    const t = useTheme();
    return (
        <View
            accessible
            accessibilityLabel={label ?? labels.loading}
            accessibilityRole="progressbar"
            style={{
                minHeight: tokens.touch * 2,
                alignItems: "center",
                justifyContent: "center",
                gap: tokens.spacing.sm,
            }}
        >
            <ActivityIndicator color={t.colors.mutedText} />
            {label ? (
                <Text variant="caption" tone="mutedText">
                    {label}
                </Text>
            ) : null}
        </View>
    );
}

/** Covers the whole app while an account switch is in flight, so nothing underneath is tapped. */
export function BlockingOverlay({ label }: { label?: string }) {
    const t = useTheme();
    return (
        <View
            accessibilityViewIsModal
            style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                justifyContent: "center",
                backgroundColor: t.colors.scrim,
            }}
        >
            <LoadingState label={label} />
        </View>
    );
}

function StateBlock({
    icon,
    tone,
    title,
    description,
    children,
}: PropsWithChildren<{
    icon: IconName;
    tone: keyof ThemeColors;
    title: string;
    description?: string;
}>) {
    const t = useTheme();
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: tokens.spacing.md - 4,
                paddingVertical: tokens.spacing.xs,
            }}
        >
            <View
                style={{
                    width: tokens.control.md,
                    height: tokens.control.md,
                    borderRadius: tokens.radii.md,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: t.colors.selected,
                }}
            >
                <Icon name={icon} tone={tone} size={tokens.icon.sm + 2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{title}</Text>
                {description ? (
                    <Text variant="caption" tone="mutedText">
                        {description}
                    </Text>
                ) : null}
                {children ? (
                    <View
                        style={{
                            alignSelf: "flex-start",
                            marginTop: tokens.spacing.xs + 2,
                        }}
                    >
                        {children}
                    </View>
                ) : null}
            </View>
        </View>
    );
}

export function ErrorState({
    error,
    retry,
}: {
    error: unknown;
    retry?: () => void;
}) {
    const labels = useUiLabels();
    return (
        <View accessibilityRole="alert">
            <StateBlock
                icon="error"
                tone="danger"
                title={error instanceof Error ? error.message : labels.loadError}
            >
                {retry ? (
                    <Button size="sm" title={labels.retry} onPress={retry} />
                ) : null}
            </StateBlock>
        </View>
    );
}

export function EmptyState({
    title,
    description,
    icon = "info",
    action,
}: {
    title: string;
    description?: string;
    icon?: IconName;
    action?: ReactNode;
}) {
    return (
        <StateBlock
            icon={icon}
            tone="subtleText"
            title={title}
            description={description}
        >
            {action}
        </StateBlock>
    );
}

/** The person may not use this feature (plan, role or permission). Says why, never just hides. */
export function NoAccessState({
    title,
    description,
}: {
    title: string;
    description?: string;
}) {
    return (
        <StateBlock
            icon="lock"
            tone="subtleText"
            title={title}
            description={description}
        />
    );
}

/* ------------------------------------------------------------------ toast */

type ToastOptions = { error?: boolean };
const ToastContext = createContext<
    (message: string, error?: boolean | ToastOptions) => void
>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: PropsWithChildren) {
    const labels = useUiLabels();
    const t = useTheme();
    const glass = useGlass();
    const [toast, setToast] = useState<{
        message: string;
        error: boolean;
        id: number;
    }>();
    const next = useRef(0);
    useEffect(() => {
        // Errors stay until dismissed: an auto-hiding failure is easy to miss.
        if (!toast || toast.error) return;
        const timer = setTimeout(() => setToast(undefined), 3200);
        return () => clearTimeout(timer);
    }, [toast]);
    const body = toast ? (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: tokens.spacing.sm,
                paddingVertical: tokens.spacing.xs,
                paddingLeft: tokens.spacing.sm,
            }}
        >
            <Icon
                name={toast.error ? "error" : "checkCircle"}
                tone={toast.error ? "danger" : "brand"}
            />
            <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                variant="label"
                style={{ flex: 1 }}
            >
                {toast.message}
            </Text>
            <IconButton
                icon="close"
                label={labels.dismiss}
                tone="mutedText"
                size={tokens.control.sm}
                onPress={() => setToast(undefined)}
            />
        </View>
    ) : null;
    return (
        <ToastContext.Provider
            value={(message, options = false) => {
                const error =
                    typeof options === "boolean" ? options : !!options.error;
                if (error) haptic.warning();
                setToast({ message, error, id: ++next.current });
            }}
        >
            {children}
            {toast ? (
                <SafeAreaView
                    pointerEvents="box-none"
                    style={{
                        position: "absolute",
                        top: 0,
                        left: tokens.spacing.md,
                        right: tokens.spacing.md,
                    }}
                >
                    <Animated.View
                        key={toast.id}
                        entering={FadeInUp.duration(
                            tokens.motion.duration.base,
                        )}
                        exiting={FadeOutUp.duration(
                            tokens.motion.duration.fast,
                        )}
                        style={{ marginTop: tokens.spacing.sm }}
                    >
                        {glass ? (
                            <ToolbarSurface>{body}</ToolbarSurface>
                        ) : (
                            <View
                                style={{
                                    padding: tokens.spacing.sm,
                                    borderRadius: tokens.radii.lg,
                                    backgroundColor: t.colors.surfaceRaised,
                                    borderWidth: tokens.hairline,
                                    borderColor: toast.error
                                        ? t.colors.danger
                                        : t.colors.borderStrong,
                                }}
                            >
                                {body}
                            </View>
                        )}
                    </Animated.View>
                </SafeAreaView>
            ) : null}
        </ToastContext.Provider>
    );
}
