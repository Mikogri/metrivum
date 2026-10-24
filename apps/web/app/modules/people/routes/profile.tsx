import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, MessageSquare, Pencil, Store, UserPlus, UserRoundX } from "lucide-react";
import { useState } from "react";
import { Link as RouterLink, Navigate, useParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, LinkButton, LoadingState, Skeleton } from "@trainflow/ui-web";
import { DETAIL_GROUPS, detailsFromValues, getPerson, personKey, profileFieldsKey, useProfile, type DetailKey, type Details } from "~/modules/accounts";
import { InvitationEditor, useCoachingQuery, type Page } from "~/modules/coaching";
import { useFeatureAccess } from "~/shared/access";
import { ApiError } from "~/shared/http/errors";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import type { AppMessages } from "~/shared/i18n/messages/app.en";
import { privateMeta } from "~/shared/i18n/site";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import styles from "./profile.module.css";

export const meta = () => privateMeta("Profile — Metrivum");

type PersonView = { userId: string; username: string; displayName: string; bio?: string | null; roles: string[]; isSelf: boolean };

/** One value for display, or null when the field is empty. */
function formatDetail(m: AppMessages, locale: string, key: DetailKey, details: Details): string | null {
  const value = details[key];
  const u = m.profile.units;
  const number = (n: number, digits = 1) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);
  if (typeof value === "number") {
    if (Number.isNaN(value)) return null;
    switch (key) {
      case "Height": return `${number(value, 0)} ${u.cm}`;
      case "Weight": return `${number(value)} ${u.kg}`;
      case "BodyFat": return `${number(value)} ${u.percent}`;
      case "HrMax": return `${number(value, 0)} ${u.bpm}`;
      case "Sleep": return `${number(value)} ${u.hours}`;
      case "Stress": return `${number(value, 0)}/10`;
      case "AvailableSessionDuration": return `${number(value, 0)} ${u.minutes}`;
      default: return number(value, 0);
    }
  }
  if (Array.isArray(value)) {
    if (!value.length) return null;
    return key === "PreferredTrainingDays" ? (value as number[]).map((day) => m.onboarding.weekdays[day - 1] ?? String(day)).join(", ") : value.join(", ");
  }
  if (!value.trim()) return null;
  return key === "Sex" ? (m.onboarding.sexOptions[value] ?? value) : value;
}

/** A card: a soft cover band, the avatar overlapping it, then name, handle, roles and the actions. */
function Header({ person, actions }: { person: PersonView; actions: React.ReactNode }) {
  const m = useT();
  return (
    <header className={styles.hero}>
      <div className={styles.cover} aria-hidden="true" />
      <div className={styles.heroBody}>
        <span className={styles.avatarRing}>
          <Avatar name={person.displayName || person.username} size="xl" decorative />
        </span>
        <div className={styles.identity}>
          <h1 className={styles.name}>{person.displayName || person.username}</h1>
          <p className={styles.handle}>
            <span>@{person.username}</span>
            {person.isSelf ? <Badge tone="neutral">{m.profile.you}</Badge> : null}
            {person.roles.map((role) => (
              <Badge key={role} tone={role === "Coach" ? "violet" : "neutral"}>
                {m.profile.roles[role] ?? role}
              </Badge>
            ))}
          </p>
        </div>
        <div className={styles.actions}>{actions}</div>
      </div>
    </header>
  );
}

function About({ person }: { person: PersonView }) {
  const m = useT();
  return (
    <Card as="section" padding="lg" aria-labelledby="profile-about">
      <h2 id="profile-about" className={styles.title}>
        {m.profile.about}
      </h2>
      {person.bio ? <p className={styles.bio}>{person.bio}</p> : <p className={styles.muted}>{person.isSelf ? m.profile.noBioOwn : m.profile.noBio}</p>}
    </Card>
  );
}

/** The own body and training details: private, so shown only on the own profile. */
function OwnDetails() {
  const m = useT();
  const { locale } = useAppLocale();
  const api = useApi();
  const account = useAccountKey();
  const fields = useQuery({
    queryKey: profileFieldsKey(account),
    queryFn: async ({ signal }) => (await api<Schema<"AccountProfileFields">>({ path: "/api/v1/me/profile-fields", signal })).data,
  });
  const details = detailsFromValues(fields.data?.values as Record<string, unknown> | undefined);
  const groups = (Object.keys(DETAIL_GROUPS) as (keyof typeof DETAIL_GROUPS)[])
    .map((group) => ({ group, rows: DETAIL_GROUPS[group].map((key) => ({ key, value: formatDetail(m, locale, key, details) })).filter((row) => row.value !== null) }))
    .filter((group) => group.rows.length);
  return (
    <Card as="section" padding="lg" aria-labelledby="profile-details">
      <div className={styles.cardHead}>
        <div>
          <h2 id="profile-details" className={styles.title}>
            {m.profile.details}
          </h2>
          <p className={styles.muted}>{m.profile.detailsPrivate}</p>
        </div>
        <LinkButton href="/app/settings?section=body" size="sm" iconStart={<Pencil />}>
          {groups.length ? m.profile.editDetails : m.profile.addDetails}
        </LinkButton>
      </div>
      {fields.isPending ? <Skeleton height="6rem" /> : fields.isError ? <p className={styles.muted}>{errorText(m, fields.error)}</p> : !groups.length ? (
        <p className={styles.muted}>{m.profile.noDetails}</p>
      ) : (
        <div className={styles.groups}>
          {groups.map(({ group, rows }) => (
            <section key={group} aria-label={m.settings.bodyGroups[group]}>
              <h3 className={styles.groupTitle}>{m.settings.bodyGroups[group]}</h3>
              <dl className={styles.facts}>
                {rows.map((row) => (
                  <div key={row.key} className={styles.fact} data-wide={row.key === "InjuriesLimitationsPainNotes" || row.key === "AdditionalNotes" || row.key === "AvailableEquipment" || undefined}>
                    <dt>{m.profile.fields[row.key] ?? row.key}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

/** How much of the profile is filled in: the introduction and the four detail groups, with links to finish. */
function Completeness({ bio }: { bio: boolean }) {
  const m = useT();
  const api = useApi();
  const account = useAccountKey();
  const fields = useQuery({
    queryKey: profileFieldsKey(account),
    queryFn: async ({ signal }) => (await api<Schema<"AccountProfileFields">>({ path: "/api/v1/me/profile-fields", signal })).data,
  });
  if (fields.isPending || fields.isError) return null;
  const details = detailsFromValues(fields.data.values as Record<string, unknown> | undefined);
  const filled = (key: DetailKey) => {
    const value = details[key];
    return typeof value === "number" ? !Number.isNaN(value) : Array.isArray(value) ? value.length > 0 : value.trim() !== "";
  };
  const items = [
    { id: "bio", done: bio, href: "/app/settings" },
    ...(Object.keys(DETAIL_GROUPS) as (keyof typeof DETAIL_GROUPS)[]).map((group) => ({ id: group, done: DETAIL_GROUPS[group].some(filled), href: "/app/settings?section=body" })),
  ];
  const done = items.filter((item) => item.done).length;
  const percent = Math.round((done / items.length) * 100);
  return (
    <Card as="section" padding="lg" aria-labelledby="profile-completeness">
      <div className={styles.cardHead}>
        <div>
          <h2 id="profile-completeness" className={styles.title}>{m.profile.completeness}</h2>
          <p className={styles.muted}>{m.profile.completenessHint}</p>
        </div>
        <span className={styles.percent}>{percent}%</span>
      </div>
      <div className={styles.meter} role="meter" aria-label={m.profile.completeness} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <ul className={styles.checklist}>
        {items.map((item) => (
          <li key={item.id} data-done={item.done || undefined}>
            <span className={styles.checkMark} aria-hidden="true">{item.done ? <Check /> : null}</span>
            <span className={styles.checkLabel}>{m.profile.completeItems[item.id]}</span>
            {item.done ? null : <RouterLink to={item.href} className={styles.checkLink}>{m.profile.complete}<ArrowRight aria-hidden="true" /></RouterLink>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** A coach's public offers: up to three, linking to the offer pages. */
function CoachOffers({ coachId }: { coachId: string }) {
  const m = useT();
  const offers = useCoachingQuery<Page<Schema<"OfferRevisionDto">>>(`/api/v1/coaches/${coachId}/offers`, { page: 1, pageSize: 3 });
  return (
    <Card as="section" padding="lg" aria-labelledby="profile-offers">
      <div className={styles.cardHead}>
        <div>
          <h2 id="profile-offers" className={styles.title}>{m.profile.offers}</h2>
          {offers.data ? <p className={styles.muted}>{m.profile.offersCount(Number(offers.data.total))}</p> : null}
        </div>
        {offers.data && Number(offers.data.total) > 0 ? <LinkButton href={`/app/coaches/${coachId}/offers`} size="sm" variant="ghost">{m.profile.seeAllOffers}</LinkButton> : null}
      </div>
      {offers.isPending ? <Skeleton height="5rem" /> : offers.isError ? <p className={styles.muted}>{errorText(m, offers.error)}</p> : !offers.data.items.length ? (
        <p className={styles.muted}>{m.profile.noOffers}</p>
      ) : (
        <ul className={styles.offers}>
          {offers.data.items.map((offer) => (
            <li key={offer.offerId}>
              <RouterLink to={`/app/coaches/${coachId}/offers/${offer.offerId}`} className={styles.offer}>
                <span className={styles.offerIcon} aria-hidden="true"><Store /></span>
                <span className={styles.offerText}>
                  <strong>{offer.name}</strong>
                  {offer.description ? <span>{offer.description}</span> : null}
                </span>
                <ArrowRight aria-hidden="true" className={styles.offerArrow} />
              </RouterLink>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function OwnProfile() {
  const m = useT();
  const profile = useProfile();
  const person: PersonView = { userId: profile.id, username: profile.username ?? "", displayName: profile.displayName, bio: profile.bio, roles: [...profile.roles], isSelf: true };
  return (
    <div className={styles.page}>
      <Header person={person} actions={<LinkButton href="/app/settings" iconStart={<Pencil />}>{m.profile.edit}</LinkButton>} />
      <div className={styles.columns}>
        <div className={styles.stack}>
          <About person={person} />
          <Completeness bio={Boolean(profile.bio)} />
        </div>
        <OwnDetails />
      </div>
    </div>
  );
}

function OtherProfile({ username }: { username: string }) {
  const m = useT();
  const api = useApi();
  const account = useAccountKey();
  const viewer = useProfile();
  const canInvite = useFeatureAccess("coaching.invitations.send");
  const [inviting, setInviting] = useState(false);
  const person = useQuery({ queryKey: personKey(account, username), queryFn: ({ signal }) => getPerson(api, username, signal), retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2 });
  if (person.isPending) return <LoadingState label={m.common.loading} />;
  if (person.isError) {
    if (person.error instanceof ApiError && person.error.status === 404)
      return <EmptyState icon={<UserRoundX />} title={m.profile.notFound} description={m.profile.notFoundBody} actions={<LinkButton href="/app">{m.common.back}</LinkButton>} />;
    return <ErrorState title={errorText(m, person.error)} actions={<Button onPress={() => void person.refetch()}>{m.common.retry}</Button>} />;
  }
  const data = person.data;
  if (data.isSelf) return <Navigate to="/app/profile" replace />;
  const view: PersonView = { ...data, roles: [...data.roles] };
  const message = `/app/messages?${new URLSearchParams({ person: data.userId, name: data.displayName, username: data.username })}`;
  const coach = viewer.roles.includes("Coach");
  return (
    <div className={styles.page}>
      <Header
        person={view}
        actions={
          <>
            {data.roles.includes("Coach") ? <LinkButton href={`/app/coaches/${data.userId}/offers`} iconStart={<Store />}>{m.profile.viewOffers}</LinkButton> : null}
            <LinkButton href={message} iconStart={<MessageSquare />}>{m.profile.message}</LinkButton>
            {coach && canInvite.allowed ? <Button iconStart={<UserPlus />} onPress={() => setInviting(true)}>{m.profile.invite}</Button> : null}
          </>
        }
      />
      <div className={data.roles.includes("Coach") ? styles.columns : undefined}>
        <About person={view} />
        {data.roles.includes("Coach") ? <CoachOffers coachId={data.userId} /> : null}
      </div>
      {inviting ? <InvitationEditor username={data.username} close={() => setInviting(false)} /> : null}
    </div>
  );
}

export default function ProfileRoute() {
  const { username } = useParams();
  return username ? <OtherProfile key={username} username={username} /> : <OwnProfile />;
}
