import { useState } from "react";
import { Bell, Volume2, VolumeX } from "lucide-react";
import { DialogTrigger } from "react-aria-components";
import { useLocation, useNavigate } from "react-router";
import {
    Button,
    Checkbox,
    IconButton,
    Popover,
    Spinner,
} from "@trainflow/ui-web";
import { useNotifications } from "./provider";
import {
    notificationTitle,
    useDurableNotifications,
} from "./durable-notifications";
import styles from "./notifications.module.css";
export function NotificationBell() {
    const sound = useNotifications();
    const [open, setOpen] = useState(false);
    const [settings, setSettings] = useState(false);
    const [error, setError] = useState("");
    const location = useLocation();
    const navigate = useNavigate();
    const active =
        location.pathname === "/app/messages"
            ? new URLSearchParams(location.search).get("conversation")
            : null;
    const notifications = useDurableNotifications(active, open);
    const count = notifications.count;
    const act = (operation: Promise<unknown>) => {
        setError("");
        void operation.catch(() =>
            setError("Could not save notification changes. Please retry."),
        );
    };
    return (
        <DialogTrigger isOpen={open} onOpenChange={setOpen}>
            <IconButton
                className={styles.bell}
                label={`Notifications${count ? `, ${count} unread` : ""}`}
                variant="secondary"
                size="sm"
                showTooltip={false}
                icon={
                    <>
                        <Bell strokeWidth={1.75} />
                        {count ? (
                            <span className={styles.badge}>
                                {count > 99 ? "99+" : count}
                            </span>
                        ) : null}
                    </>
                }
            />
            <Popover
                placement="bottom end"
                aria-label="Notifications"
                className={styles.panel}
            >
                <header className={styles.header}>
                    <strong>Notifications</strong>
                    <IconButton
                        label={
                            sound.muted
                                ? "Enable notification sound"
                                : "Mute notification sound"
                        }
                        icon={sound.muted ? <VolumeX /> : <Volume2 />}
                        variant="ghost"
                        size="sm"
                        onPress={sound.toggleSound}
                    />
                </header>
                <div className={styles.header}>
                    <Button
                        size="sm"
                        onPress={() => act(notifications.readAll())}
                    >
                        Mark all read
                    </Button>
                    <Button size="sm" onPress={() => setSettings(!settings)}>
                        Preferences
                    </Button>
                </div>
                {settings && notifications.preferences ? (
                    <fieldset className={styles.preferences}>
                        <legend>In-app notifications</legend>
                        {(
                            [
                                "messaging",
                                "checkIns",
                                "coaching",
                                "system",
                            ] as const
                        ).map((key) => (
                            <Checkbox
                                key={key}
                                isSelected={notifications.preferences![key]}
                                onChange={(checked) =>
                                    act(
                                        notifications.updatePreferences({
                                            ...notifications.preferences!,
                                            [key]: checked,
                                        }),
                                    )
                                }
                            >
                                {key === "checkIns"
                                    ? "Check-ins"
                                    : key.charAt(0).toUpperCase() +
                                      key.slice(1)}
                            </Checkbox>
                        ))}
                        <p>Billing and account alerts are always enabled.</p>
                    </fieldset>
                ) : null}
                <div className={styles.header}>
                    <Checkbox
                        isSelected={notifications.unreadOnly}
                        onChange={notifications.setUnreadOnly}
                    >
                        Unread only
                    </Checkbox>
                </div>
                {error ? <p role="alert">{error}</p> : null}
                {notifications.loading ? (
                    <div className={styles.empty}>
                        <Spinner label="Loading notifications" />
                    </div>
                ) : null}
                {notifications.failed ? (
                    <div className={styles.empty}>
                        Notifications could not load.{" "}
                        <Button
                            size="sm"
                            onPress={() => void notifications.refresh()}
                        >
                            Retry
                        </Button>
                    </div>
                ) : null}
                {!notifications.loading &&
                !notifications.failed &&
                !notifications.items.length ? (
                    <p className={styles.empty}>You're all caught up.</p>
                ) : null}
                <div className={styles.list}>
                    {notifications.items.map((item) => (
                        <div key={item.id} className={styles.item}>
                            <button
                                className={`${styles.text} ${styles.source}`}
                                onClick={() => {
                                    act(notifications.read(item.id));
                                    if (item.deepLink) {
                                        setOpen(false);
                                        navigate(item.deepLink);
                                    }
                                }}
                            >
                                <strong>{notificationTitle(item.type)}</strong>
                                <span className={styles.preview}>
                                    {item.category} |{" "}
                                    {new Date(item.createdAt).toLocaleString()}
                                </span>
                            </button>
                            {!item.readAt ? (
                                <Button
                                    size="sm"
                                    onPress={() =>
                                        act(notifications.read(item.id))
                                    }
                                >
                                    Read
                                </Button>
                            ) : (
                                <span>Read</span>
                            )}
                        </div>
                    ))}
                </div>
                <footer className={styles.header}>
                    <Button
                        size="sm"
                        isDisabled={notifications.page === 1}
                        onPress={() =>
                            notifications.setPage(notifications.page - 1)
                        }
                    >
                        Newer
                    </Button>
                    <span>Page {notifications.page}</span>
                    <Button
                        size="sm"
                        isDisabled={!notifications.hasOlder}
                        onPress={() =>
                            notifications.setPage(notifications.page + 1)
                        }
                    >
                        Older
                    </Button>
                </footer>
            </Popover>
        </DialogTrigger>
    );
}
