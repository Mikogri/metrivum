import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type PropsWithChildren,
    type ReactNode,
} from "react";
import { ScrollView, View } from "react-native";
import {
    Button,
    ChipGroup,
    Divider,
    FieldButton,
    IconButton,
    SearchField,
    Text,
} from "../components";
import { Icon, type IconName } from "../Icon";
import { useUiLabels } from "../localization";
import { PressableScale } from "../motion";
import { haptic, useAccessibilityPreferences } from "../system";
import { tokens, useTheme } from "../theme";
import { NativeSheet } from "./NativeSheet";
import type { SheetSize } from "./types";

export type { SheetSize } from "./types";
export { SheetBackdrop } from "./backdrop";

/** Colours and material every sheet is presented with. */
function useSheetSurface() {
    const t = useTheme();
    const { reduceTransparency } = useAccessibilityPreferences();
    return {
        background: t.colors.sheet,
        glass: t.colors.sheetGlass,
        scrim: t.colors.scrim,
        translucent: !reduceTransparency,
        scheme: t.dark ? ("dark" as const) : ("light" as const),
    };
}

/* ------------------------------------------------------------------ requests */

export interface SheetAction<T = string> {
    value: T;
    label: string;
    icon?: IconName;
    destructive?: boolean;
    disabled?: boolean;
}

type ConfirmRequest = {
    kind: "confirm";
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive: boolean;
    resolve: (confirmed: boolean) => void;
};
type ActionsRequest = {
    kind: "actions";
    title: string;
    message?: string;
    actions: SheetAction[];
    resolve: (value: string | undefined) => void;
};
type Request = ConfirmRequest | ActionsRequest;

/**
 * Imperative requests (`confirm`, `chooseAction`) are answered in one place at a time. When one of
 * our sheets is already open the request becomes a step inside that sheet; otherwise the root
 * `SheetHost` presents it. Two independent sheets are never stacked.
 */
const openSheets: Array<(request: Request) => void> = [];
let hostRequest: Request | undefined;
const hostListeners = new Set<() => void>();
const publishHost = (request: Request | undefined) => {
    hostRequest = request;
    hostListeners.forEach((listener) => listener());
};
function dispatch(request: Request) {
    const top = openSheets[openSheets.length - 1];
    if (top) return top(request);
    // A second request while one is pending answers the first as cancelled.
    if (hostRequest) settle(hostRequest, undefined);
    publishHost(request);
}
function settle(request: Request, value: string | boolean | undefined) {
    if (request.kind === "confirm") request.resolve(value === true);
    else request.resolve(typeof value === "string" ? value : undefined);
}

/**
 * Asks before something that cannot be undone or would lose work. Resolves `true` only on an
 * explicit confirmation; closing the sheet any other way resolves `false`.
 */
export function confirm(
    title: string,
    message?: string,
    action?: string,
    options: { destructive?: boolean; cancelLabel?: string } = {},
): Promise<boolean> {
    return new Promise((resolve) =>
        dispatch({
            kind: "confirm",
            title,
            message,
            confirmLabel: action,
            cancelLabel: options.cancelLabel,
            destructive: options.destructive ?? true,
            resolve,
        }),
    );
}

/** Presents a list of actions and resolves with the chosen value, or `undefined` if dismissed. */
export function chooseAction<T extends string>(
    title: string,
    actions: SheetAction<T>[],
    message?: string,
): Promise<T | undefined> {
    return new Promise((resolve) =>
        dispatch({
            kind: "actions",
            title,
            message,
            actions,
            resolve: resolve as (value: string | undefined) => void,
        }),
    );
}

/* ------------------------------------------------------------------ pieces */

function SheetHeader({
    title,
    subtitle,
    onClose,
}: {
    title: string;
    subtitle?: string | null;
    onClose?: () => void;
}) {
    const labels = useUiLabels();
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: tokens.spacing.sm,
                paddingLeft: tokens.spacing.md + tokens.spacing.xs,
                paddingRight: tokens.spacing.sm,
                paddingBottom: tokens.spacing.sm,
            }}
        >
            <View style={{ flex: 1, gap: 2, paddingTop: tokens.spacing.sm }}>
                <Text accessibilityRole="header" variant="title">
                    {title}
                </Text>
                {subtitle ? (
                    <Text variant="caption" tone="mutedText">
                        {subtitle}
                    </Text>
                ) : null}
            </View>
            {onClose ? (
                <IconButton
                    icon="close"
                    label={labels.close}
                    tone="mutedText"
                    filled
                    size={tokens.control.sm + 2}
                    onPress={onClose}
                />
            ) : null}
        </View>
    );
}

const bodyPadding = {
    paddingHorizontal: tokens.spacing.md + tokens.spacing.xs,
    paddingBottom: tokens.spacing.lg,
    gap: tokens.spacing.md,
};

function ConfirmBody({
    request,
    onAnswer,
}: {
    request: Omit<ConfirmRequest, "kind" | "resolve">;
    onAnswer: (confirmed: boolean) => void;
}) {
    const labels = useUiLabels();
    return (
        <View style={bodyPadding}>
            {request.message ? (
                <Text tone="mutedText">{request.message}</Text>
            ) : null}
            <View style={{ gap: tokens.spacing.sm }}>
                <Button
                    size="lg"
                    tone={request.destructive ? "danger" : "primary"}
                    title={request.confirmLabel ?? labels.confirm}
                    onPress={() => {
                        if (request.destructive) haptic.warning();
                        onAnswer(true);
                    }}
                />
                <Button
                    size="lg"
                    title={request.cancelLabel ?? labels.cancel}
                    onPress={() => onAnswer(false)}
                />
            </View>
        </View>
    );
}

function ActionRows({
    actions,
    onPick,
}: {
    actions: SheetAction[];
    onPick: (value: string) => void;
}) {
    const t = useTheme();
    return (
        <View
            style={{
                marginHorizontal: tokens.spacing.md,
                marginBottom: tokens.spacing.lg,
                paddingHorizontal: tokens.spacing.md,
                borderRadius: tokens.radii.lg,
                backgroundColor: t.colors.selected,
            }}
        >
            {actions.map((action, index) => (
                <View key={action.value}>
                    {index > 0 ? <Divider /> : null}
                    <PressableScale
                        accessibilityRole="button"
                        accessibilityLabel={action.label}
                        accessibilityState={{ disabled: !!action.disabled }}
                        disabled={action.disabled}
                        scale={0.985}
                        onPress={() => {
                            haptic.selection();
                            onPick(action.value);
                        }}
                        style={{
                            minHeight: tokens.touch + 4,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: tokens.spacing.md - 2,
                            opacity: action.disabled ? 0.4 : 1,
                        }}
                    >
                        {action.icon ? (
                            <Icon
                                name={action.icon}
                                tone={action.destructive ? "danger" : "mutedText"}
                            />
                        ) : null}
                        <Text
                            variant="bodyStrong"
                            tone={action.destructive ? "danger" : "text"}
                            style={{ flex: 1 }}
                        >
                            {action.label}
                        </Text>
                    </PressableScale>
                </View>
            ))}
        </View>
    );
}

/* ------------------------------------------------------------------ BottomSheet */

/** True for anything rendered inside one of our sheets, so pickers there stay in place. */
const InsideSheet = createContext(false);
/** Lets a control keep its picker in place when it already lives in a sheet. */
export const useInsideSheet = () => useContext(InsideSheet);

export interface BottomSheetProps {
    title: string;
    subtitle?: string | null;
    open: boolean;
    /** Closes the sheet. With `dirty`, only called after the person agreed to discard. */
    onClose: () => void;
    size?: SheetSize;
    /**
     * Unsaved input inside the sheet. Closing then asks first, inside this same sheet, and the
     * form stays mounted with everything typed until the person really discards it.
     */
    dirty?: boolean;
    /** Wording of the discard question; sensible defaults are used when omitted. */
    discard?: { title?: string; message?: string; confirmLabel?: string; keepLabel?: string };
    /** Pinned under the content: the primary action of the sheet. */
    footer?: ReactNode;
    /** Set false when the content brings its own scroller (a FlatList). */
    scroll?: boolean;
}

/**
 * The one way Metrivum presents its own modal content: a native sheet rising from the bottom.
 * Content-sized by default; `half`/`full` scroll. Handles the close button, Android Back, the
 * swipe gesture when it is safe, and the discard question for unsaved work.
 */
export function BottomSheet({
    title,
    subtitle,
    open,
    onClose,
    size = "content",
    dirty = false,
    discard,
    footer,
    scroll = true,
    children,
}: PropsWithChildren<BottomSheetProps>) {
    const t = useTheme();
    const surface = useSheetSurface();
    const labels = useUiLabels();
    const [step, setStep] = useState<Request | "discard">();
    const stepRef = useRef(step);
    stepRef.current = step;
    // Content exists only while the sheet is on screen (including its closing animation), so every
    // opening starts from a clean form on both platforms.
    const [present, setPresent] = useState(open);
    if (open && !present) setPresent(true);

    // While open, imperative confirm/chooseAction requests become a step of this sheet.
    useEffect(() => {
        if (!open) return;
        const receive = (request: Request) => {
            const current = stepRef.current;
            if (current && current !== "discard") settle(current, undefined);
            setStep(request);
        };
        openSheets.push(receive);
        return () => {
            openSheets.splice(openSheets.indexOf(receive), 1);
            const current = stepRef.current;
            if (current && current !== "discard") settle(current, undefined);
            setStep(undefined);
        };
    }, [open]);

    const requestClose = () => {
        const current = stepRef.current;
        if (current === "discard") return setStep(undefined);
        if (current) {
            settle(current, undefined);
            return setStep(undefined);
        }
        if (dirty) return setStep("discard");
        onClose();
    };

    const sized = size !== "content";
    const content = (
        <View
            // Kept mounted (only hidden) during a step, so typed input survives the question.
            style={[
                sized ? { flex: 1 } : undefined,
                step ? { display: "none" } : undefined,
            ]}
        >
            <SheetHeader title={title} subtitle={subtitle} onClose={requestClose} />
            {sized && scroll ? (
                <ScrollView
                    style={{ flex: 1 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    contentContainerStyle={bodyPadding}
                >
                    {children}
                </ScrollView>
            ) : (
                <View
                    style={[
                        scroll ? bodyPadding : undefined,
                        sized ? { flex: 1 } : undefined,
                    ]}
                >
                    {children}
                </View>
            )}
            {footer ? (
                <View
                    style={{
                        paddingHorizontal: tokens.spacing.md + tokens.spacing.xs,
                        paddingTop: tokens.spacing.sm,
                        paddingBottom: tokens.spacing.lg,
                        gap: tokens.spacing.sm,
                        borderTopWidth: tokens.hairline,
                        borderTopColor: t.colors.border,
                    }}
                >
                    {footer}
                </View>
            ) : null}
        </View>
    );

    let stepView: ReactNode = null;
    if (step === "discard")
        stepView = (
            <View>
                <SheetHeader title={discard?.title ?? labels.discardTitle} />
                <ConfirmBody
                    request={{
                        title: "",
                        message: discard?.message ?? labels.discardMessage,
                        confirmLabel: discard?.confirmLabel ?? labels.discard,
                        cancelLabel: discard?.keepLabel ?? labels.keepEditing,
                        destructive: true,
                    }}
                    onAnswer={(confirmed) => {
                        setStep(undefined);
                        if (confirmed) onClose();
                    }}
                />
            </View>
        );
    else if (step?.kind === "confirm")
        stepView = (
            <View>
                <SheetHeader title={step.title} />
                <ConfirmBody
                    request={step}
                    onAnswer={(confirmed) => {
                        setStep(undefined);
                        step.resolve(confirmed);
                    }}
                />
            </View>
        );
    else if (step?.kind === "actions")
        stepView = (
            <View>
                <SheetHeader
                    title={step.title}
                    subtitle={step.message}
                    onClose={requestClose}
                />
                <ActionRows
                    actions={step.actions}
                    onPick={(value) => {
                        setStep(undefined);
                        step.resolve(value);
                    }}
                />
            </View>
        );

    return (
        <NativeSheet
            open={open}
            size={size}
            dismissible={!dirty && !step}
            {...surface}
            onRequestClose={requestClose}
            onClosed={() => setPresent(false)}
        >
            <InsideSheet.Provider value>
                {present ? content : null}
                {stepView}
            </InsideSheet.Provider>
        </NativeSheet>
    );
}

/** Kept for existing callers: the previous name of `BottomSheet`. */
export const Sheet = BottomSheet;

/* ------------------------------------------------------------------ ActionSheet */

/** A short list of actions for one object: a client, a message, a plan. Replaces context menus. */
export function ActionSheet<T extends string>({
    title,
    subtitle,
    open,
    actions,
    onSelect,
    onClose,
}: {
    title: string;
    subtitle?: string | null;
    open: boolean;
    actions: SheetAction<T>[];
    onSelect: (value: T) => void;
    onClose: () => void;
}) {
    const surface = useSheetSurface();
    // The choice is delivered once the sheet has left the screen: an action often opens another
    // sheet (a confirmation, a form), and two presentations must not overlap.
    const picked = useRef<T | undefined>(undefined);
    return (
        <NativeSheet
            open={open}
            {...surface}
            onRequestClose={onClose}
            onClosed={() => {
                const value = picked.current;
                picked.current = undefined;
                if (value !== undefined) onSelect(value);
            }}
        >
            <SheetHeader title={title} subtitle={subtitle} onClose={onClose} />
            <ActionRows
                actions={actions}
                onPick={(value) => {
                    picked.current = value as T;
                    onClose();
                }}
            />
        </NativeSheet>
    );
}

/* ------------------------------------------------------------------ ConfirmationSheet */

/** Declarative confirmation for a destructive or irreversible step. */
export function ConfirmationSheet({
    title,
    message,
    open,
    confirmLabel,
    cancelLabel,
    destructive = true,
    onConfirm,
    onCancel,
}: {
    title: string;
    message?: string;
    open: boolean;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const surface = useSheetSurface();
    return (
        <NativeSheet
            open={open}
            {...surface}
            onRequestClose={onCancel}
        >
            <SheetHeader title={title} />
            <ConfirmBody
                request={{ title, message, confirmLabel, cancelLabel, destructive }}
                onAnswer={(confirmed) => (confirmed ? onConfirm() : onCancel())}
            />
        </NativeSheet>
    );
}

/* ------------------------------------------------------------------ SelectionSheet */

export interface SelectionOption<T extends string = string> {
    value: T;
    label: string;
    description?: string | null;
    icon?: IconName;
    disabled?: boolean;
}

/**
 * Picks one or several items from a list: a program, an exercise, a form, a group, a filter value.
 * Single choice closes on pick; multiple choice keeps the sheet open and confirms with "Done".
 */
export function SelectionSheet<T extends string>({
    title,
    subtitle,
    open,
    options,
    selected,
    multiple = false,
    onChange,
    onClose,
    searchable,
    searchLabel,
    emptyLabel,
    loading,
}: {
    title: string;
    subtitle?: string | null;
    open: boolean;
    options: readonly SelectionOption<T>[];
    selected: readonly T[];
    multiple?: boolean;
    onChange: (values: T[]) => void;
    onClose: () => void;
    /** Shows a search box; defaults to on for more than eight options. */
    searchable?: boolean;
    searchLabel?: string;
    emptyLabel?: string;
    loading?: boolean;
}) {
    const labels = useUiLabels();
    const [query, setQuery] = useState("");
    useEffect(() => {
        if (!open) setQuery("");
    }, [open]);
    const search = searchable ?? options.length > 8;
    const term = query.trim().toLocaleLowerCase();
    const visible = term
        ? options.filter((option) =>
              `${option.label} ${option.description ?? ""}`
                  .toLocaleLowerCase()
                  .includes(term),
          )
        : options;
    return (
        <BottomSheet
            title={title}
            subtitle={subtitle}
            open={open}
            onClose={onClose}
            size={options.length > 6 || search ? "full" : "content"}
            footer={
                multiple ? (
                    <Button
                        size="lg"
                        tone="primary"
                        title={labels.done}
                        onPress={onClose}
                    />
                ) : undefined
            }
        >
            {search ? (
                <SearchField
                    label={searchLabel ?? labels.search}
                    value={query}
                    onChangeText={setQuery}
                />
            ) : null}
            <View accessibilityRole={multiple ? undefined : "radiogroup"}>
                {loading ? (
                    <Text tone="mutedText">{labels.loading}</Text>
                ) : visible.length ? (
                    visible.map((option, index) => {
                        const active = selected.includes(option.value);
                        return (
                            <View key={option.value}>
                                {index > 0 ? <Divider /> : null}
                                <PressableScale
                                    accessibilityRole={
                                        multiple ? "checkbox" : "radio"
                                    }
                                    accessibilityLabel={option.label}
                                    accessibilityState={{
                                        selected: active,
                                        checked: active,
                                        disabled: !!option.disabled,
                                    }}
                                    disabled={option.disabled}
                                    scale={0.985}
                                    onPress={() => {
                                        haptic.selection();
                                        if (multiple)
                                            onChange(
                                                active
                                                    ? selected.filter(
                                                          (value) =>
                                                              value !==
                                                              option.value,
                                                      )
                                                    : [...selected, option.value],
                                            );
                                        else {
                                            onChange([option.value]);
                                            onClose();
                                        }
                                    }}
                                    style={{
                                        minHeight: tokens.touch + 4,
                                        flexDirection: "row",
                                        alignItems: "center",
                                        gap: tokens.spacing.md - 2,
                                        paddingVertical: tokens.spacing.sm,
                                        opacity: option.disabled ? 0.4 : 1,
                                    }}
                                >
                                    {option.icon ? (
                                        <Icon name={option.icon} tone="mutedText" />
                                    ) : null}
                                    <View style={{ flex: 1, gap: 2 }}>
                                        <Text variant="bodyStrong">
                                            {option.label}
                                        </Text>
                                        {option.description ? (
                                            <Text
                                                variant="caption"
                                                tone="mutedText"
                                            >
                                                {option.description}
                                            </Text>
                                        ) : null}
                                    </View>
                                    {active ? (
                                        <Icon name="check" tone="brand" />
                                    ) : multiple ? (
                                        <Icon name="circle" tone="subtleText" />
                                    ) : null}
                                </PressableScale>
                            </View>
                        );
                    })
                ) : (
                    <Text tone="mutedText">
                        {emptyLabel ?? labels.noResults}
                    </Text>
                )}
            </View>
        </BottomSheet>
    );
}

/**
 * Form control that opens a `SelectionSheet`: looks like a field, shows the current choice, and is
 * the visible way into the picker (no hidden long-press, no dropdown). Used inside another sheet it
 * shows its options in place instead.
 */
export function SelectField<T extends string>({
    label,
    placeholder,
    options,
    value,
    onChange,
    disabled,
    sheetTitle,
    error,
}: {
    label: string;
    placeholder?: string;
    options: readonly SelectionOption<T>[];
    value: T | null | undefined;
    onChange: (value: T) => void;
    disabled?: boolean;
    sheetTitle?: string;
    error?: string;
}) {
    const [open, setOpen] = useState(false);
    const insideSheet = useContext(InsideSheet);
    const current = options.find((option) => option.value === value);
    // Inside a sheet the options are shown in place: a second sheet is never stacked on the first.
    if (insideSheet)
        return (
            <ChipGroup
                label={label}
                options={options}
                value={value}
                onChange={onChange}
                disabled={disabled}
            />
        );
    return (
        <>
            <FieldButton
                label={label}
                value={current?.label}
                placeholder={placeholder}
                disabled={disabled}
                error={error}
                expanded={open}
                onPress={() => setOpen(true)}
            />
            <SelectionSheet
                title={sheetTitle ?? label}
                open={open}
                options={options}
                selected={value != null ? [value] : []}
                onChange={(values) => {
                    const next = values[0];
                    if (next !== undefined) onChange(next);
                }}
                onClose={() => setOpen(false)}
            />
        </>
    );
}

/* ------------------------------------------------------------------ host */

const subscribeHost = (listener: () => void) => {
    hostListeners.add(listener);
    return () => {
        hostListeners.delete(listener);
    };
};

/**
 * Mount once at the root. Presents `confirm` / `chooseAction` requests made while no other sheet
 * is open. The last request stays rendered while the sheet animates out.
 */
export function SheetHost() {
    const surface = useSheetSurface();
    const request = useSyncExternalStore(subscribeHost, () => hostRequest);
    const [shown, setShown] = useState<Request>();
    useEffect(() => {
        if (request) setShown(request);
    }, [request]);
    const pending = useRef<{ request: Request; value: string } | undefined>(
        undefined,
    );
    const answer = (value: string | boolean | undefined) => {
        if (!request) return;
        // A chosen action is delivered after the sheet is gone (it may open another sheet);
        // confirmations and cancellations are answered at once.
        if (request.kind === "actions" && typeof value === "string")
            pending.current = { request, value };
        else settle(request, value);
        publishHost(undefined);
    };
    const current = request ?? shown;
    return (
        <NativeSheet
            open={!!request}
            {...surface}
            onRequestClose={() => answer(undefined)}
            onClosed={() => {
                const chosen = pending.current;
                pending.current = undefined;
                setShown(undefined);
                if (chosen) settle(chosen.request, chosen.value);
            }}
        >
            {current?.kind === "confirm" ? (
                <>
                    <SheetHeader title={current.title} />
                    <ConfirmBody
                        request={current}
                        onAnswer={(confirmed) => answer(confirmed)}
                    />
                </>
            ) : current?.kind === "actions" ? (
                <>
                    <SheetHeader
                        title={current.title}
                        subtitle={current.message}
                        onClose={() => answer(undefined)}
                    />
                    <ActionRows
                        actions={current.actions}
                        onPick={(value) => answer(value)}
                    />
                </>
            ) : (
                <View />
            )}
        </NativeSheet>
    );
}
