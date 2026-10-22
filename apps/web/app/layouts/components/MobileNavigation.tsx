import { CalendarDays, Clock3, House, LayoutGrid, MessageCircle, NotebookTabs, Users } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useNotifications } from "~/modules/messaging";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { mobileDestinations, mobileSelection } from "./mobile-navigation";
import styles from "./mobile-shell.module.css";

const icons = { today: House, plans: NotebookTabs, history: Clock3, clients: Users, messages: MessageCircle, calendar: CalendarDays, more: LayoutGrid };
export function MobileNavigation() {
  const { mode } = useWorkspace();
  const { pathname, search } = useLocation();
  const { unreadMessages } = useNotifications();
  const selected = mobileSelection(mode, pathname, search);
  return <nav aria-label="Main" className={styles.navigation}>
    {mobileDestinations(mode).map(item => {
      const Icon = icons[item.id as keyof typeof icons];
      const unread = item.id === "messages" && selected !== "messages" ? unreadMessages : 0;
      return <Link key={item.id} to={item.to} prefetch="render" aria-current={selected === item.id ? "page" : undefined} className={styles.destination}>
        <span className={styles.icon}><Icon aria-hidden="true" />{unread > 0 && <span className={styles.badge} aria-label={`${unread} unread messages`}>{unread > 99 ? "99+" : unread}</span>}</span>
        <span>{item.label}</span>
      </Link>;
    })}
  </nav>;
}
