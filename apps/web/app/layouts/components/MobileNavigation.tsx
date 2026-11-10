import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import {
  CalendarDays,
  Dumbbell,
  House,
  LayoutGrid,
  MessageCircle,
  Users,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import { useNotifications } from "~/modules/messaging";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { mobileDestinations, mobileSelection } from "./mobile-navigation";
import styles from "./mobile-shell.module.css";

const icons = {
  today: House,
  training: Dumbbell,
  clients: Users,
  messages: MessageCircle,
  calendar: CalendarDays,
  more: LayoutGrid,
};
export function MobileNavigation() {
  const uiCopy = useUiCopy();

  const { mode } = useWorkspace();
  const { pathname, search } = useLocation();
  const { unreadMessages } = useNotifications();
  const selected = mobileSelection(mode, pathname, search);
  return (
    <nav aria-label={uiCopy["nav"]["main"]} className={styles.navigation}>
      {mobileDestinations(mode).map((item) => {
        const Icon = icons[item.id as keyof typeof icons];
        const unread =
          item.id === "messages" && selected !== "messages"
            ? unreadMessages
            : 0;
        return (
          <Link
            key={item.id}
            to={item.to}
            prefetch="render"
            aria-current={selected === item.id ? "page" : undefined}
            className={styles.destination}
          >
            <span className={styles.icon}>
              <Icon aria-hidden="true" />
              {unread > 0 && (
                <span
                  className={styles.badge}
                  aria-label={formatInterfaceText(
                    uiCopy["ui"]["{0} unread messages"],
                    [unread],
                  )}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
            <span>
              {(uiCopy["ui"] as Record<string, string>)[item.label] ??
                item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
