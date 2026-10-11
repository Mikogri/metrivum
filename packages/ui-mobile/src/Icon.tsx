import { SymbolView, type SymbolViewProps } from "expo-symbols";
import lightWeight from "expo-symbols/androidWeights/light";
import { useTheme, type ThemeColors } from "./theme";

type Glyph = { ios: string; android: string };
/**
 * One semantic name per icon, drawn with the platform's own set: SF Symbols on iOS, Material
 * Symbols (light weight, to match the thin outline look) on Android.
 */
const glyphs = {
    home: { ios: "house", android: "home" },
    plans: { ios: "list.bullet.rectangle", android: "description" },
    history: { ios: "clock", android: "history" },
    clients: { ios: "person.2", android: "group" },
    person: { ios: "person", android: "person" },
    personAdd: { ios: "person.badge.plus", android: "person_add" },
    team: { ios: "person.3", android: "groups" },
    messages: { ios: "message", android: "chat" },
    calendar: { ios: "calendar", android: "calendar_month" },
    more: { ios: "ellipsis", android: "more_horiz" },
    workout: { ios: "dumbbell", android: "fitness_center" },
    exercise: { ios: "figure.strengthtraining.traditional", android: "exercise" },
    checkIn: { ios: "checklist", android: "assignment" },
    progress: { ios: "chart.line.uptrend.xyaxis", android: "monitoring" },
    document: { ios: "doc.text", android: "description" },
    folder: { ios: "folder", android: "folder" },
    video: { ios: "video", android: "videocam" },
    camera: { ios: "camera", android: "photo_camera" },
    notifications: { ios: "bell", android: "notifications" },
    settings: { ios: "gearshape", android: "settings" },
    payments: { ios: "creditcard", android: "payments" },
    mail: { ios: "envelope", android: "mail" },
    chevronRight: { ios: "chevron.right", android: "chevron_right" },
    chevronDown: { ios: "chevron.down", android: "expand_more" },
    back: { ios: "chevron.left", android: "arrow_back" },
    add: { ios: "plus", android: "add" },
    remove: { ios: "minus", android: "remove" },
    close: { ios: "xmark", android: "close" },
    check: { ios: "checkmark", android: "check" },
    checkCircle: { ios: "checkmark.circle.fill", android: "check_circle" },
    circle: { ios: "circle", android: "radio_button_unchecked" },
    search: { ios: "magnifyingglass", android: "search" },
    filter: { ios: "line.3.horizontal.decrease", android: "tune" },
    sort: { ios: "arrow.up.arrow.down", android: "sort" },
    edit: { ios: "pencil", android: "edit" },
    delete: { ios: "trash", android: "delete" },
    copy: { ios: "doc.on.doc", android: "content_copy" },
    reply: { ios: "arrowshape.turn.up.left", android: "reply" },
    send: { ios: "arrow.up", android: "send" },
    mic: { ios: "mic", android: "mic" },
    attach: { ios: "paperclip", android: "attach_file" },
    play: { ios: "play.fill", android: "play_arrow" },
    pause: { ios: "pause.fill", android: "pause" },
    timer: { ios: "timer", android: "timer" },
    schedule: { ios: "clock", android: "schedule" },
    info: { ios: "info.circle", android: "info" },
    warning: { ios: "exclamationmark.triangle", android: "warning" },
    error: { ios: "exclamationmark.circle", android: "error" },
    lock: { ios: "lock", android: "lock" },
    block: { ios: "nosign", android: "block" },
    archive: { ios: "archivebox", android: "archive" },
    logout: { ios: "rectangle.portrait.and.arrow.right", android: "logout" },
    switchAccount: { ios: "arrow.left.arrow.right", android: "swap_horiz" },
    appearance: { ios: "moon", android: "dark_mode" },
    language: { ios: "globe", android: "language" },
    star: { ios: "star", android: "star" },
    bolt: { ios: "bolt", android: "bolt" },
    read: { ios: "checkmark.circle", android: "done_all" },
    done: { ios: "checkmark.circle", android: "task_alt" },
} satisfies Record<string, Glyph>;
export type IconName = keyof typeof glyphs;

export function Icon({
    name,
    size,
    tone = "text",
    color,
}: {
    name: IconName;
    size?: number;
    tone?: keyof ThemeColors;
    /** Overrides `tone` with an explicit colour, e.g. a contrast colour on a filled button. */
    color?: string;
}) {
    const t = useTheme();
    const glyph = glyphs[name];
    return (
        <SymbolView
            // Decorative by default: the control that owns the icon carries the label.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            name={glyph as SymbolViewProps["name"]}
            size={size ?? t.icon.md}
            tintColor={color ?? t.colors[tone]}
            weight={{ ios: "light", android: lightWeight }}
        />
    );
}
