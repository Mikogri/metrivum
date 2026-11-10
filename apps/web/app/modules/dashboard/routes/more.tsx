import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("More — Metrivum");

import {
  Dumbbell,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  Film,
  Settings,
  Users,
  UserRound,
} from "lucide-react";
import { Link } from "react-router";
import { Fragment } from "react";
import { PageHeader, Segment, SegmentedControl } from "@metrivum/ui-web";
import { NotificationBell } from "~/modules/messaging";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./mobile-home.module.css";

export default function More() {
  const m = useT();
  const { mode, canCoach, switchMode, switching } = useWorkspace();
  const tiles = [
    { title: m.nav.exercises, to: "/app/exercises", icon: Dumbbell },
    {
      title: m["ui"]["Check-ins"],
      to: mode === "coach" ? "/app/check-ins" : "/app/my-check-ins",
      icon: ClipboardCheck,
    },
    ...(mode === "client"
      ? [
          {
            title: m["dashboard"]["coach"]["openCalendar"],
            to: "/app/calendar",
            icon: CalendarDays,
          },
        ]
      : []),
    {
      title: m["ui"]["Coaches & invitations"],
      to: "/app/my-coaches",
      icon: UserRound,
    },
    { title: m["ui"]["Team"], to: "/app/team", icon: Users },
    { title: m["settings"]["areas"]["video"], to: "/app/analysis", icon: Film },
  ];
  return (
    <div className={styles.home}>
      <PageHeader title={m["ui"]["More"]} />
      <div className={styles.tiles}>
        {tiles.map(({ title, to, icon: Icon }, index) => (
          <Fragment key={to}>
            <Link className={styles.tile} to={to}>
              <Icon aria-hidden="true" />
              {title}
            </Link>
            {index === 0 && (
              <div>
                <NotificationBell
                  label={m["common"]["notifications"]}
                  className={styles.tile}
                />
              </div>
            )}
          </Fragment>
        ))}
      </div>
      <section
        className={styles.account}
        aria-label={m["ui"]["Account and workspace"]}
      >
        {canCoach && (
          <SegmentedControl
            aria-label={m["ui"]["Workspace view"]}
            selectedKeys={[mode]}
            isDisabled={switching}
            onSelectionChange={(keys) => {
              const next = [...keys][0];
              if ((next === "coach" || next === "client") && next !== mode)
                void switchMode(
                  next,
                  next === "client" ? "/app/my-training" : "/app/today",
                );
            }}
          >
            <Segment id="coach">{m["profile"]["roles"]["Coach"]}</Segment>
            <Segment id="client">{m["profile"]["roles"]["Client"]}</Segment>
          </SegmentedControl>
        )}
        <Link className={styles.row} to="/app/settings">
          <span>{m["ui"]["Profile and account"]}</span>
          <Settings size={20} aria-hidden="true" />
        </Link>
        <Link className={styles.row} to="/app/subscription">
          <span>{m["ui"]["Subscription and checkout"]}</span>
          <CreditCard size={20} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
