import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("More — Metrivum");

import { Dumbbell, CalendarDays, ClipboardCheck, CreditCard, Film, Settings, Users, UserRound } from "lucide-react";
import { Link } from "react-router";
import { Fragment } from "react";
import { PageHeader, Segment, SegmentedControl } from "@trainflow/ui-web";
import { NotificationBell } from "~/modules/messaging";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./mobile-home.module.css";

export default function More() {
  const m = useT();
  const { mode, canCoach, switchMode, switching } = useWorkspace();
  const tiles = [
    { title: m.nav.exercises, to: "/app/exercises", icon: Dumbbell },
    { title: "Check-ins", to: mode === "coach" ? "/app/check-ins" : "/app/my-check-ins", icon: ClipboardCheck },
    ...(mode === "client" ? [{ title: "Calendar", to: "/app/calendar", icon: CalendarDays }] : []),
    { title: "Coaches & invitations", to: "/app/my-coaches", icon: UserRound },
    { title: "Team", to: "/app/team", icon: Users },
    { title: "Video analysis", to: "/app/analysis", icon: Film },
  ];
  return <div className={styles.home}><PageHeader title="More" />
    <div className={styles.tiles}>
      {tiles.map(({ title, to, icon: Icon }, index) => <Fragment key={to}><Link className={styles.tile} to={to}><Icon aria-hidden="true" />{title}</Link>{index === 0 && <div><NotificationBell label="Notifications" className={styles.tile} /></div>}</Fragment>)}
    </div>
    <section className={styles.account} aria-label="Account and workspace">
      {canCoach && <SegmentedControl aria-label="Workspace view" selectedKeys={[mode]} isDisabled={switching} onSelectionChange={keys => { const next = [...keys][0]; if ((next === "coach" || next === "client") && next !== mode) void switchMode(next, "/app/today"); }}><Segment id="coach">Coach</Segment><Segment id="client">Client</Segment></SegmentedControl>}
      <Link className={styles.row} to="/app/settings"><span>Profile and account</span><Settings size={20} aria-hidden="true" /></Link>
      <Link className={styles.row} to="/app/subscription"><span>Subscription and checkout</span><CreditCard size={20} aria-hidden="true" /></Link>
    </section>
  </div>;
}
