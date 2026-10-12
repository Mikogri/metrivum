import { useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Bell, BellOff, CalendarClock, CalendarX, Check, CheckCheck, CheckCircle2, ClipboardCheck, CreditCard, Dumbbell, FileText, Film, Flag, Inbox, MailOpen, MessageSquare, PauseCircle, Repeat2, Settings2, UserMinus, UsersRound, Volume2, VolumeX, XCircle } from "lucide-react";
import { Button as AriaButton, DialogTrigger } from "react-aria-components";
import { useLocation, useNavigate } from "react-router";
import { Button, Checkbox, Dialog, IconButton, Popover, Segment, SegmentedControl, Spinner, toast, useMobileLayout } from "@trainflow/ui-web";
import { useAccountContext } from "~/shared/session";
import { useErrorToast } from "~/shared/lib/useErrorToast";
import { formatRelative } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useNotifications } from "./provider";
import { notificationTitle, useDurableNotifications } from "./durable-notifications";
import styles from "./notifications.module.css";

type Look = { icon: typeof Bell; tone: string };

/** Each category gets its own icon and tint, so the list can be scanned without reading. */
const CATEGORY: Record<string, Look> = {
    Messaging: { icon: MessageSquare, tone: "blue" },
    CheckIns: { icon: ClipboardCheck, tone: "violet" },
    Coaching: { icon: UsersRound, tone: "green" },
    Billing: { icon: CreditCard, tone: "orange" },
};

/**
 * The event itself wins over the category: a declined invitation shows a red cross, an accepted one a
 * green check, an overdue payment a warning, so the outcome reads before the text does.
 */
export function notificationLook(type: string, category: string): Look {
    if (/(Failed|Inactive)$/.test(type)) return { icon: AlertTriangle, tone: "red" };
    if (/(Declined|Rejected|Revoked)$/.test(type)) return { icon: XCircle, tone: "red" };
    if (/^Calendar.*Cancelled$/.test(type)) return { icon: CalendarX, tone: "red" };
    if (/Cancelled$/.test(type)) return { icon: XCircle, tone: "red" };
    if (/(Ended|Removed)$/.test(type)) return { icon: UserMinus, tone: "red" };
    if (/Suspended$/.test(type)) return { icon: PauseCircle, tone: "orange" };
    if (/Overdue$/.test(type)) return { icon: AlertTriangle, tone: "orange" };
    if (/(Due|DueSoon)$/.test(type)) return { icon: CreditCard, tone: "orange" };
    if (/(Accepted|Approved|Reviewed|Paid|Confirmed|Resumed|Active)$/.test(type) || type === "training.completed") return { icon: CheckCircle2, tone: "green" };
    if (/Completed$/.test(type) && type.startsWith("Relationship")) return { icon: Flag, tone: "neutral" };
    if (/Assigned$/.test(type) || type === "training.assigned") return { icon: Dumbbell, tone: "green" };
    if (/^Calendar/.test(type)) return { icon: CalendarClock, tone: "blue" };
    if (/^Invitation/.test(type)) return { icon: MailOpen, tone: "blue" };
    if (/^VideoAnalysis/.test(type)) return { icon: Film, tone: "green" };
    if (type === "documentation.shared") return { icon: FileText, tone: "blue" };
    if (type.startsWith("team.transfer")) return { icon: Repeat2, tone: "violet" };
    if (/^Application.*Submitted$/.test(type)) return { icon: Inbox, tone: "violet" };
    return CATEGORY[category] ?? { icon: Bell, tone: "neutral" };
}

export function NotificationBell({ label, className }: { label?: string; className?: string } = {}) {
    const sound = useNotifications();
    const locale = useLocale();
    const [open, setOpen] = useState(false);
    const [settings, setSettings] = useState(false);
    const { lifecycle } = useAccountContext();
    const showError = useErrorToast();
    const inFlight = useRef(new Set<string>());
    const [pending, setPending] = useState(new Set<string>());
    const location = useLocation();
    const navigate = useNavigate();
    const active = location.pathname === "/app/messages" ? new URLSearchParams(location.search).get("conversation") : null;
    const notifications = useDurableNotifications(active, open, location.pathname + location.search);
    const count = notifications.count;
    const act = async (key: string, operation: () => Promise<unknown>, success?: string) => {
        if (inFlight.current.has(key)) return;
        inFlight.current.add(key);
        setPending(new Set(inFlight.current));
        try {
            await operation();
            if (success && lifecycle.isCurrent()) toast({ tone: "success", title: success });
        } catch (error) {
            if (lifecycle.isCurrent()) showError(error, "Could not save notification changes. Please retry.");
        } finally {
            inFlight.current.delete(key);
            if (lifecycle.isCurrent()) setPending(new Set(inFlight.current));
        }
    };
    return (
        <DialogTrigger isOpen={open} onOpenChange={setOpen}>
            {label ? <AriaButton className={className} aria-label={`${label}${count ? `, ${count} unread` : ""}`}>
                <Bell aria-hidden="true" />
                <span>{label}{count ? ` (${count > 99 ? "99+" : count})` : ""}</span>
            </AriaButton> : <IconButton
                className={styles.bell}
                data-unread={count ? "" : undefined}
                label={`Notifications${count ? `, ${count} unread` : ""}`}
                variant="secondary"
                size="sm"
                showTooltip={false}
                icon={
                    <>
                        <Bell strokeWidth={1.75} />
                        {count ? <span className={styles.badge}>{count > 99 ? "99+" : count}</span> : null}
                    </>
                }
            />}
            <NotificationPanel open={open} setOpen={setOpen}>
                <header className={styles.head}>
                    <div className={styles.title}>
                        <strong>Notifications</strong>
                        {count ? <span className={styles.count}>{count > 99 ? "99+" : count}</span> : null}
                    </div>
                    <div className={styles.tools}>
                        <IconButton label="Mark all read" icon={<CheckCheck />} variant="ghost" size="sm" isPending={pending.has("all")} isDisabled={!count} onPress={() => void act("all", notifications.readAll)} />
                        <IconButton label={sound.muted ? "Enable notification sound" : "Mute notification sound"} icon={sound.muted ? <VolumeX /> : <Volume2 />} variant="ghost" size="sm" onPress={sound.toggleSound} />
                        <IconButton label="Preferences" icon={<Settings2 />} variant={settings ? "secondary" : "ghost"} size="sm" onPress={() => setSettings(!settings)} />
                    </div>
                </header>
                {settings && notifications.preferences ? (
                    <fieldset className={styles.preferences}>
                        <legend>Show in the app {pending.has("preferences") && <Spinner size="sm" label="Saving preferences" />}</legend>
                        {(["messaging", "checkIns", "coaching", "system"] as const).map((key) => (
                            <Checkbox
                                key={key}
                                isSelected={notifications.preferences![key]}
                                isDisabled={pending.has("preferences")}
                                onChange={(checked) => void act("preferences", () => notifications.updatePreferences({ ...notifications.preferences!, [key]: checked }), "Notification preferences saved")}
                            >
                                {key === "checkIns" ? "Check-ins" : key.charAt(0).toUpperCase() + key.slice(1)}
                            </Checkbox>
                        ))}
                        <p>Billing and account alerts are always enabled.</p>
                    </fieldset>
                ) : null}
                <div className={styles.filter}>
                    <SegmentedControl size="sm" aria-label="Show notifications" selectedKeys={[notifications.unreadOnly ? "unread" : "all"]} onSelectionChange={(keys) => notifications.setUnreadOnly([...keys][0] === "unread")}>
                        <Segment id="all">All</Segment>
                        <Segment id="unread">Unread</Segment>
                    </SegmentedControl>
                </div>
                {notifications.loading ? (
                    <div className={styles.empty}>
                        <Spinner label="Loading notifications" />
                    </div>
                ) : null}
                {notifications.failed ? (
                    <div className={styles.empty}>
                        <p>Notifications could not load.</p>
                        <Button size="sm" loading={pending.has("refresh")} onPress={() => void act("refresh", notifications.refresh, "Notifications refreshed")}>
                            Retry
                        </Button>
                    </div>
                ) : null}
                {!notifications.loading && !notifications.failed && !notifications.items.length ? (
                    <div className={styles.empty}>
                        <span className={styles.emptyIcon} aria-hidden="true">
                            <BellOff />
                        </span>
                        <p>You're all caught up.</p>
                    </div>
                ) : null}
                <ul className={styles.list}>
                    {notifications.items.map((item) => {
                        const look = notificationLook(item.type, item.category);
                        const Icon = look.icon;
                        return (
                            <li key={item.id} className={styles.item} data-unread={!item.readAt || undefined}>
                                <button
                                    className={styles.source}
                                    onClick={() => {
                                        if (!item.readAt) void act(item.id, () => notifications.read(item.id));
                                        if (item.deepLink) {
                                            setOpen(false);
                                            navigate(item.deepLink);
                                        }
                                    }}
                                >
                                    <span className={styles.icon} data-tone={look.tone} aria-hidden="true">
                                        <Icon />
                                    </span>
                                    <span className={styles.text}>
                                        <strong>{notificationTitle(item.type)}</strong>
                                        <span className={styles.meta}>
                                            {item.category} · <time dateTime={item.createdAt}>{formatRelative(locale, item.createdAt)}</time>
                                        </span>
                                    </span>
                                </button>
                                {!item.readAt || pending.has(item.id) ? (
                                    <IconButton className={styles.read} label="Mark as read" icon={<Check />} variant="ghost" size="sm" isPending={pending.has(item.id)} onPress={() => void act(item.id, () => notifications.read(item.id))} />
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
                {notifications.page > 1 || notifications.hasOlder ? (
                    <footer className={styles.foot}>
                        <Button size="sm" variant="ghost" isDisabled={notifications.page === 1} onPress={() => notifications.setPage(notifications.page - 1)}>
                            Newer
                        </Button>
                        <span>Page {notifications.page}</span>
                        <Button size="sm" variant="ghost" isDisabled={!notifications.hasOlder} onPress={() => notifications.setPage(notifications.page + 1)}>
                            Older
                        </Button>
                    </footer>
                ) : null}
            </NotificationPanel>
        </DialogTrigger>
    );
}

function NotificationPanel({ open, setOpen, children }: { open: boolean; setOpen: (open: boolean) => void; children: ReactNode }) {
    const mobile = useMobileLayout();
    return mobile
        ? <Dialog title="Notifications" isOpen={open} onOpenChange={setOpen}><div className={styles.mobilePanel}>{children}</div></Dialog>
        : <Popover placement="bottom end" aria-label="Notifications" className={styles.panel}>{children}</Popover>;
}
