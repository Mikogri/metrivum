import { Badge } from "@trainflow/ui-mobile";

/** "InProgress" → "In progress": API enum names shown as readable labels. */
export function humanize(value: string | null | undefined) {
    if (!value) return "";
    const spaced = value.replace(/([a-z])([A-Z])/g, "$1 $2");
    return spaced.charAt(0) + spaced.slice(1).toLowerCase();
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";
const tones: Record<string, Tone> = {
    Active: "success",
    Accepted: "success",
    Completed: "success",
    Reviewed: "success",
    Paid: "success",
    Submitted: "info",
    Available: "info",
    Scheduled: "neutral",
    InProgress: "brand",
    Pending: "warning",
    AwaitingPayment: "warning",
    Suspended: "warning",
    Paused: "warning",
    Skipped: "neutral",
    Overdue: "danger",
    Missed: "danger",
    Declined: "danger",
    Rejected: "danger",
    Cancelled: "danger",
    Revoked: "danger",
};

/** One status vocabulary for the whole app: same word, same colour, everywhere. */
export function StatusBadge({ status }: { status: string | null | undefined }) {
    if (!status) return null;
    return <Badge tone={tones[status] ?? "neutral"}>{humanize(status)}</Badge>;
}

const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

/** A calendar date ("2026-10-10") as "Today", "Tomorrow", "Yesterday" or "Sat, 10 Oct". */
export function formatDay(value: string | null | undefined) {
    if (!value) return "";
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    const date = match
        ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
        : new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const now = new Date();
    const shift = (days: number) => {
        const other = new Date(now);
        other.setDate(other.getDate() + days);
        return other;
    };
    if (sameDay(date, now)) return "Today";
    if (sameDay(date, shift(1))) return "Tomorrow";
    if (sameDay(date, shift(-1))) return "Yesterday";
    return date.toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    });
}

/** An instant as a short local date and time. */
export function formatDateTime(value: string | null | undefined) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const time = date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    });
    return `${formatDay(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`)}, ${time}`;
}

export const joinParts = (...parts: Array<string | null | undefined | false>) =>
    parts.filter(Boolean).join(" · ");
