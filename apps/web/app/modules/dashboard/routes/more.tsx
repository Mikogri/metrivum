import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("More — Metrivum");

import { Dumbbell, CalendarDays, ClipboardCheck, CreditCard, Film, Settings, Users, UserRound } from "lucide-react";
import { Link } from "react-router";
import { Fragment } from "react";
import { PageHeader, Segment, SegmentedControl } from "@metrivum/ui-web";
import { NotificationBell } from "~/modules/messaging";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./mobile-home.module.css";

export default function More() {
  const uiCopy = useUiCopy();

  const m = useT();
  const { mode, canCoach, switchMode, switching } = useWorkspace();
  const tiles = [
    { title: m.nav.exercises, to: "/app/exercises", icon: Dumbbell },
    { title: uiCopy["ui"]["Check-ins"], to: mode === "coach" ? "/app/check-ins" : "/app/my-check-ins", icon: ClipboardCheck },
    ...(mode === "client" ? [{ title: uiCopy["dashboard"]["coach"]["openCalendar"], to: "/app/calendar", icon: CalendarDays }] : []),
    { title: uiCopy["ui"]["Coaches & invitations"], to: "/app/my-coaches", icon: UserRound },
    { title: uiCopy["ui"]["Team"], to: "/app/team", icon: Users },
    { title: uiCopy["settings"]["areas"]["video"], to: "/app/analysis", icon: Film },
  ];
  return <div className={styles.home}><PageHeader title={uiCopy["ui"]["More"]} />
    <div className={styles.tiles}>
      {tiles.map(({ title, to, icon: Icon }, index) => <Fragment key={to}><Link className={styles.tile} to={to}><Icon aria-hidden="true" />{title}</Link>{index === 0 && <div><NotificationBell label={uiCopy["common"]["notifications"]} className={styles.tile} /></div>}</Fragment>)}
    </div>
    <section className={styles.account} aria-label={uiCopy["ui"]["Account and workspace"]}>
      {canCoach && <SegmentedControl aria-label={uiCopy["ui"]["Workspace view"]} selectedKeys={[mode]} isDisabled={switching} onSelectionChange={keys => { const next = [...keys][0]; if ((next === "coach" || next === "client") && next !== mode) void switchMode(next, next === "client" ? "/app/my-training" : "/app/today"); }}><Segment id="coach">{uiCopy["profile"]["roles"]["Coach"]}</Segment><Segment id="client">{uiCopy["profile"]["roles"]["Client"]}</Segment></SegmentedControl>}
      <Link className={styles.row} to="/app/settings"><span>{uiCopy["ui"]["Profile and account"]}</span><Settings size={20} aria-hidden="true" /></Link>
      <Link className={styles.row} to="/app/subscription"><span>{uiCopy["ui"]["Subscription and checkout"]}</span><CreditCard size={20} aria-hidden="true" /></Link>
    </section>
  </div>;
}
