import { Award, BadgeCheck, CalendarHeart, ChevronDown, HeartHandshake, MapPin, Medal, Rocket, Sparkles, Store, Trophy, UserRoundCheck, UsersRound } from "lucide-react";
import { useState } from "react";
import { Button, Card } from "@metrivum/ui-web";
import { SectionTitle, ToneIcon, type Tone } from "./SectionTitle";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./ProfileAchievements.module.css";

/** What the achievements are computed from; anything unknown counts as not reached yet. */
export type AchievementFacts = {
  coach: boolean;
  bio: boolean;
  location: boolean;
  memberSince?: string | null;
  clientsCoached?: number;
  activeClients?: number;
  yearsExperience?: number | null;
  competencies?: number;
  certificates?: number;
  results?: number;
  offers?: number;
  headline?: boolean;
};

type Achievement = { id: string; icon: typeof Award; tone: Tone; current: number; goal: number };

/** How many tiles show before "Show all". */
const FIRST = 3;

const DAY = 86_400_000;

/** Every achievement with its progress; the person reaches it when current ≥ goal. */
export function achievementsFor(f: AchievementFacts, now = Date.now()): Achievement[] {
  const days = f.memberSince ? Math.max(0, Math.floor((now - new Date(f.memberSince).getTime()) / DAY)) : 0;
  const profile = [f.bio, f.location, f.coach ? Boolean(f.headline) : true, f.coach ? (f.competencies ?? 0) >= 3 : true].filter(Boolean).length;
  const common: Achievement[] = [
    { id: "profileComplete", icon: UserRoundCheck, tone: "violet", current: profile, goal: 4 },
    { id: "located", icon: MapPin, tone: "blue", current: f.location ? 1 : 0, goal: 1 },
    { id: "month", icon: CalendarHeart, tone: "rose", current: Math.min(days, 30), goal: 30 },
    { id: "year", icon: Medal, tone: "orange", current: Math.min(days, 365), goal: 365 },
  ];
  if (!f.coach) return common;
  return [
    { id: "firstClient", icon: HeartHandshake, tone: "green", current: Math.min(f.clientsCoached ?? 0, 1), goal: 1 },
    { id: "tenClients", icon: UsersRound, tone: "blue", current: Math.min(f.clientsCoached ?? 0, 10), goal: 10 },
    { id: "fiftyClients", icon: Trophy, tone: "orange", current: Math.min(f.clientsCoached ?? 0, 50), goal: 50 },
    { id: "fullHouse", icon: Rocket, tone: "rose", current: Math.min(f.activeClients ?? 0, 10), goal: 10 },
    { id: "openForBusiness", icon: Store, tone: "green", current: Math.min(f.offers ?? 0, 1), goal: 1 },
    { id: "certified", icon: BadgeCheck, tone: "violet", current: Math.min(f.certificates ?? 0, 1), goal: 1 },
    { id: "provenResults", icon: Sparkles, tone: "blue", current: Math.min(f.results ?? 0, 3), goal: 3 },
    { id: "seasoned", icon: Award, tone: "orange", current: Math.min(f.yearsExperience ?? 0, 5), goal: 5 },
    ...common,
  ];
}

/**
 * Achievements as even tiles, collapsed to the first few. Visitors see only what was reached; the owner also sees
 * what is next (closest first), with progress.
 */
export function ProfileAchievements({ facts, own }: { facts: AchievementFacts; own: boolean }) {
  const t = useT().profile.achievements;
  const [open, setOpen] = useState(false);
  const all = achievementsFor(facts);
  const reached = all.filter((a) => a.current >= a.goal);
  const next = all.filter((a) => a.current < a.goal).sort((a, b) => b.current / b.goal - a.current / a.goal);
  const ordered = own ? [...reached, ...next] : reached;
  if (!ordered.length) return null;
  const shown = open ? ordered : ordered.slice(0, FIRST);
  return (
    <Card as="section" padding="md" aria-labelledby="profile-achievements">
      <SectionTitle
        id="profile-achievements"
        icon={<Trophy />}
        tone="orange"
        title={t.title}
        sub={t.count(reached.length, all.length)}
        actions={
          ordered.length > FIRST ? (
            <Button size="sm" variant="ghost" iconEnd={<ChevronDown className={open ? styles.flip : undefined} />} onPress={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? t.less : t.all(ordered.length)}
            </Button>
          ) : undefined
        }
      />
      <ul className={styles.grid}>
        {shown.map((a) => {
          const done = a.current >= a.goal;
          const Icon = a.icon;
          const text = t.items[a.id] ?? { title: a.id, body: "" };
          return (
            <li key={a.id} className={styles.tile} data-done={done || undefined} data-tone={a.tone}>
              {done ? (
                <ToneIcon tone={a.tone}>
                  <Icon />
                </ToneIcon>
              ) : (
                <span className={styles.icon} aria-hidden="true">
                  <Icon />
                </span>
              )}
              <span className={styles.text}>
                <strong>{text.title}</strong>
                <span>{text.body}</span>
                {!done ? (
                  <span className={styles.progress} role="meter" aria-label={text.title} aria-valuemin={0} aria-valuemax={a.goal} aria-valuenow={a.current}>
                    <span style={{ transform: `scaleX(${a.current / a.goal})` }} />
                  </span>
                ) : null}
              </span>
              {!done ? (
                <span className={styles.ratio}>
                  {a.current}/{a.goal}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
