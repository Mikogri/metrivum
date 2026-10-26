import { useQuery } from "@tanstack/react-query";
import { ArrowRight, AtSign, CalendarDays, Check, Clock, Eye, Gauge, HeartPulse, ListChecks, MapPin, MessageSquare, Pencil, Settings, Store, Trophy, UserPlus, UserRound, UserRoundX } from "lucide-react";
import { useState } from "react";
import { Link as RouterLink, Navigate, useParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, LinkButton, LoadingState, Skeleton } from "@trainflow/ui-web";
import { BodySummary, DETAIL_GROUPS, detailsFromValues, getPerson, personKey, profileFieldsKey, useProfile, useProfileCompleteness, type DetailKey, type Details } from "~/modules/accounts";
import { CoachSpecializationsCard, InvitationEditor, money, useCoachingQuery, type Page } from "~/modules/coaching";
import { useFeatureAccess } from "~/shared/access";
import { ApiError } from "~/shared/http/errors";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import type { AppMessages } from "~/shared/i18n/messages/app.en";
import { privateMeta } from "~/shared/i18n/site";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { CoverControls, Portfolio, ShowcaseAbout, ShowcaseFailed, ShowcaseStats, StatsStrip, joined, useCoverUrl, useShowcase, type StatItem } from "../components/CoachShowcase";
import { ProfileAchievements, achievementsFor, type AchievementFacts } from "../components/ProfileAchievements";
import { SectionTitle } from "../components/SectionTitle";
import { ProfileCover } from "~/shared/ui/cover/ProfileCover";
import { CoverEditorCard, IdentityEditorCard, coverDraftOf } from "../components/ProfileEditor";
import { TopNotice, TopNoticeLink } from "~/shared/ui/TopNotice";
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
  if (key === "Country") return countryName(locale, value);
  return key === "Sex" ? (m.onboarding.sexOptions[value] ?? value) : value;
}

function countryName(locale: string, code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** "City, Region, Country" from whatever is filled in, or null. */
function placeOf(locale: string, details: Details): string | null {
  const parts = [details.City.trim(), details.Region.trim(), details.Country ? countryName(locale, details.Country) : ""].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/**
 * The profile header: a cover (photo on Pro, otherwise the animated default), the avatar overlapping its lower
 * edge with the actions on the right, then name, roles, headline, handle and place.
 */
function Header({ person, place, sex, memberSince, headline, actions, coverUrl, coverStyle, coverRestart, coverControls }: { person: PersonView; place?: string | null; sex?: string | null; memberSince?: string | null; headline?: React.ReactNode; actions: React.ReactNode; coverUrl?: string | null; coverStyle?: unknown; coverRestart?: number; coverControls?: React.ReactNode }) {
  const m = useT();
  const { locale } = useAppLocale();
  const since = joined(locale, memberSince);
  return (
    <header className={styles.hero}>
      <ProfileCover imageUrl={coverUrl} style={coverStyle} restart={coverRestart}>{coverControls}</ProfileCover>
      <div className={styles.heroBody}>
        <div className={styles.heroTop}>
          <span className={styles.avatarRing}>
            <Avatar name={person.displayName || person.username} size="xxl" decorative />
          </span>
          <div className={styles.actions}>{actions}</div>
        </div>
        <div className={styles.identity}>
          <div className={styles.nameRow}>
            <h1 className={styles.name}>{person.displayName || person.username}</h1>
            {person.roles.map((role) => (
              <Badge key={role} tone={role === "Coach" ? "violet" : "neutral"}>
                {m.profile.roles[role] ?? role}
              </Badge>
            ))}
            {person.isSelf ? <Badge tone="neutral">{m.profile.you}</Badge> : null}
          </div>
          {headline ? <p className={styles.headline}>{headline}</p> : null}
          <ul className={styles.meta}>
            <li>
              <AtSign aria-hidden="true" />
              {person.username}
            </li>
            {sex ? (
              <li>
                <UserRound aria-hidden="true" />
                {m.onboarding.sexOptions[sex] ?? sex}
              </li>
            ) : null}
            {place ? (
              <li>
                <MapPin aria-hidden="true" />
                {place}
              </li>
            ) : null}
            {since ? (
              <li>
                <CalendarDays aria-hidden="true" />
                {m.profile.joined(since)}
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </header>
  );
}

function About({ person }: { person: PersonView }) {
  const m = useT();
  return (
    <Card as="section" padding="md" aria-labelledby="profile-about">
      <SectionTitle id="profile-about" icon={<UserRound />} tone="violet" title={m.profile.about} sub={person.isSelf ? m.profile.aboutSub : m.profile.aboutSubOther} />
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
    <Card as="section" padding="md" aria-labelledby="profile-details">
      <SectionTitle
        id="profile-details"
        icon={<HeartPulse />}
        tone="rose"
        title={m.profile.details}
        sub={m.profile.detailsPrivate}
        actions={
          <LinkButton href="/app/settings?section=body" size="sm" iconStart={<Pencil />}>
            {groups.length ? m.profile.editDetails : m.profile.addDetails}
          </LinkButton>
        }
      />
      {fields.isPending ? <Skeleton height="6rem" /> : fields.isError ? <p className={styles.muted}>{errorText(m, fields.error)}</p> : !groups.length ? (
        <p className={styles.muted}>{m.profile.noDetails}</p>
      ) : (
        <BodySummary details={details} showSex={false} />
      )}
    </Card>
  );
}

/** How much of the profile is filled in: the introduction and the four detail groups, with links to finish. */
function Completeness() {
  const m = useT();
  const { items, percent, pending } = useProfileCompleteness();
  if (pending) return null;
  return (
    <Card as="section" padding="md" aria-labelledby="profile-completeness">
      <SectionTitle id="profile-completeness" icon={<ListChecks />} tone="orange" title={m.profile.completeness} sub={m.profile.completenessHint} actions={<span className={styles.percent}>{percent}%</span>} />
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
  const offers = useCoachingQuery<Page<Schema<"OfferRevisionDto">>>(`/api/v1/coaches/${coachId}/offers`, { page: 1, pageSize: 4 });
  return (
    <Card as="section" padding="md" aria-labelledby="profile-offers" className={styles.fillCard}>
      <SectionTitle
        id="profile-offers"
        icon={<Store />}
        tone="green"
        title={m.profile.offers}
        sub={offers.data ? m.profile.offersCount(Number(offers.data.total)) : undefined}
        actions={offers.data && Number(offers.data.total) > 0 ? <LinkButton href={`/app/coaches/${coachId}/offers`} size="sm" variant="ghost">{m.profile.seeAllOffers}</LinkButton> : undefined}
      />
      {offers.isPending ? <Skeleton height="5rem" /> : offers.isError ? <p className={styles.muted}>{errorText(m, offers.error)}</p> : !offers.data.items.length ? (
        <EmptyState size="sm" className={styles.offersEmpty} icon={<Store />} title={m.profile.noOffers} description={m.profile.noOffersBody} />
      ) : (
        <ul className={styles.offers}>
          {offers.data.items.map((offer) => (
            <li key={offer.offerId}>
              <RouterLink to={`/app/coaches/${coachId}/offers/${offer.offerId}`} className={styles.offer}>
                <span className={styles.offerIcon} aria-hidden="true"><Store /></span>
                <span className={styles.offerText}>
                  <strong>{offer.name}</strong>
                  {offer.description ? <span>{offer.description}</span> : null}
                  <span className={styles.offerMeta}>
                    <Badge size="sm" tone="neutral">{m.profile.modes[offer.coachingMode] ?? offer.coachingMode}</Badge>
                    {offer.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} size="sm" tone="neutral">{tag}</Badge>
                    ))}
                  </span>
                </span>
                {offer.billingOptions.length ? (
                  <span className={styles.offerPrice}>
                    <small>{m.profile.from}</small>
                    {money(Math.min(...offer.billingOptions.map((option) => Number(option.price))), offer.currency)}
                  </span>
                ) : null}
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
  const { locale } = useAppLocale();
  const api = useApi();
  const account = useAccountKey();
  const fields = useQuery({
    queryKey: profileFieldsKey(account),
    queryFn: async ({ signal }) => (await api<Schema<"AccountProfileFields">>({ path: "/api/v1/me/profile-fields", signal })).data,
  });
  const place = fields.data ? placeOf(locale, detailsFromValues(fields.data.values as Record<string, unknown> | undefined)) : null;
  const person: PersonView = { userId: profile.id, username: profile.username ?? "", displayName: profile.displayName, bio: profile.bio, roles: [...profile.roles], isSelf: true };
  const isCoach = profile.roles.includes("Coach");
  const t = m.profile.editor;
  // View: the own profile with its private parts. Edit: every part editable in place. Preview: exactly what others see.
  const [mode, setMode] = useState<"view" | "edit" | "preview">("view");
  // Leaving the preview returns to where it was opened from (viewing or editing).
  const [previewFrom, setPreviewFrom] = useState<"view" | "edit">("view");
  const [coverDraft, setCoverDraft] = useState(() => coverDraftOf(profile.coverStyle));
  const [restart, setRestart] = useState(0);
  // The joined date lives on the public profile only.
  const self = useQuery({ queryKey: personKey(account, profile.username ?? ""), queryFn: ({ signal }) => getPerson(api, profile.username!, signal), enabled: Boolean(profile.username) });
  const showcase = useShowcase(profile.id, isCoach);
  const cover = useCoverUrl(profile.id, isCoach && showcase.data?.hasCover);
  const offersTotal = useOffersTotal(profile.id, isCoach);
  const editing = mode === "edit";
  const previewing = mode === "preview";
  const openEdit = () => {
    setCoverDraft(coverDraftOf(profile.coverStyle));
    setMode("edit");
  };
  const actions = previewing ? (
    <>
      {isCoach ? <Button iconStart={<Store />} isDisabled>{m.profile.viewOffers}</Button> : null}
      <Button iconStart={<MessageSquare />} isDisabled>{m.profile.message}</Button>
    </>
  ) : (
    <>
      <Button variant="ghost" iconStart={<Eye />} onPress={() => { setPreviewFrom(mode === "edit" ? "edit" : "view"); setMode("preview"); }}>{t.preview}</Button>
      {editing ? (
        <Button variant="primary" iconStart={<Check />} onPress={() => setMode("view")}>{t.done}</Button>
      ) : (
        <>
          <LinkButton href="/app/usage" variant="ghost" iconStart={<Gauge />}>{m.usage.title}</LinkButton>
          <LinkButton href="/app/settings" variant="ghost" iconStart={<Settings />}>{t.settings}</LinkButton>
          <Button variant="primary" iconStart={<Pencil />} onPress={openEdit}>{m.profile.edit}</Button>
        </>
      )}
    </>
  );
  const header = (
    <Header
      person={{ ...person, isSelf: !previewing }}
      place={previewing ? null : place}
      sex={previewing ? null : (fields.data?.values as Record<string, unknown> | undefined)?.Sex as string | undefined}
      memberSince={self.data?.memberSince}
      headline={isCoach ? showcase.data?.headline : null}
      coverUrl={cover.data}
      coverStyle={editing ? coverDraft : profile.coverStyle}
      coverRestart={restart}
      coverControls={editing && isCoach ? <CoverControls coachId={profile.id} showcase={showcase.data} /> : null}
      actions={actions}
    />
  );
  const facts = factsOf({ coach: isCoach, bio: Boolean(profile.bio), location: Boolean(place), memberSince: self.data?.memberSince, showcase: showcase.data, offers: offersTotal.data });
  if (previewing) {
    const visitor = { ...person, isSelf: false };
    return (
      <div className={styles.page}>
        <TopNotice tone="accent" icon={<Eye />} title={t.previewTitle} label={t.previewTitle} onClose={() => setMode(previewFrom)} closeLabel={t.closePreview}>
          {t.previewBody}{" "}
          <TopNoticeLink onPress={() => setMode(previewFrom)}>{previewFrom === "edit" ? t.exitPreview : t.closePreview}</TopNoticeLink>
        </TopNotice>
        {header}
        {isCoach ? (
          <CoachSections coachId={profile.id} about={<About person={visitor} />} facts={{ ...facts, location: false }} />
        ) : (
          <PersonSections memberSince={self.data?.memberSince} about={<About person={visitor} />} facts={{ ...facts, location: false }} />
        )}
      </div>
    );
  }
  return (
    <div className={styles.page} data-editing={editing || undefined}>
      {editing ? (
        <TopNotice tone="warning" icon={<Pencil />} title={t.editingTitle} label={t.editingTitle} onClose={() => setMode("view")} closeLabel={t.done}>
          {t.editingBody}{" "}
          <TopNoticeLink onPress={() => { setPreviewFrom("edit"); setMode("preview"); }}>{t.preview}</TopNoticeLink>
          {" · "}
          <TopNoticeLink onPress={() => setMode("view")}>{t.done}</TopNoticeLink>
        </TopNotice>
      ) : null}
      {header}
      {editing ? (
        <div className={styles.grid}>
          <div className={styles.wide}>
            <CoverEditorCard saved={profile.coverStyle} draft={coverDraft} onDraft={setCoverDraft} onRestart={() => setRestart((n) => n + 1)} />
          </div>
          <div className={styles.wide}>
            {!isCoach || showcase.data ? <IdentityEditorCard key={`${profile.version}-${showcase.data?.version ?? 0}`} profile={profile} showcase={showcase.data} /> : null}
          </div>
        </div>
      ) : null}
      {isCoach ? (
        <ShowcaseStats showcase={showcase.data} offers={offersTotal.data} failed={showcase.isError} />
      ) : (
        <PersonStats memberSince={self.data?.memberSince} place={place} facts={facts} />
      )}
      {isCoach && showcase.isError ? <ShowcaseFailed error={showcase.error} retry={() => void showcase.refetch()} /> : null}
      <div className={styles.grid}>
        <About person={person} />
        {isCoach && <CoachSpecializationsCard selections={showcase.data?.specializationSelections} editable />}
        {isCoach && !showcase.isError ? <ShowcaseAbout showcase={showcase.data} editable /> : <Completeness />}
        <div className={styles.wide}>
          <OwnDetails />
        </div>
        {isCoach ? <CoachOffers coachId={profile.id} /> : null}
        {isCoach ? <Completeness /> : null}
        <div className={styles.wide}>
          <ProfileAchievements facts={facts} own />
        </div>
        {isCoach && !showcase.isError ? (
          <div className={styles.wide}>
            <Portfolio coachId={profile.id} showcase={showcase.data} editable={editing} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Achievement inputs from what the page already loads. */
function factsOf({ coach, bio, location, memberSince, showcase, offers }: { coach: boolean; bio: boolean; location: boolean; memberSince?: string | null; showcase?: Schema<"CoachShowcaseDto">; offers?: number }): AchievementFacts {
  return {
    coach,
    bio,
    location,
    memberSince,
    clientsCoached: showcase ? Number(showcase.clientsCoached) : undefined,
    activeClients: showcase ? Number(showcase.activeClients) : undefined,
    yearsExperience: showcase?.yearsExperience != null ? Number(showcase.yearsExperience) : null,
    competencies: showcase?.competencies.length,
    certificates: showcase?.portfolio.filter((item) => item.kind === "Certificate").length,
    results: showcase?.portfolio.filter((item) => item.kind === "ClientResult").length,
    offers,
    headline: Boolean(showcase?.headline),
  };
}

/** A coach's published offers count, sharing the request with the offers card. */
function useOffersTotal(coachId: string, enabled: boolean) {
  const offers = useCoachingQuery<Page<Schema<"OfferRevisionDto">>>(`/api/v1/coaches/${coachId}/offers`, { page: 1, pageSize: 4 }, enabled && Boolean(coachId));
  return { data: offers.data ? Number(offers.data.total) : undefined };
}

/** Numbers for someone who is not a coach: time on Metrivum, achievements and place. */
function PersonStats({ memberSince, place, facts }: { memberSince?: string | null; place?: string | null; facts: AchievementFacts }) {
  const m = useT();
  const all = achievementsFor(facts);
  const days = memberSince ? Math.max(0, Math.floor((Date.now() - new Date(memberSince).getTime()) / 86_400_000)) : null;
  const items: StatItem[] = [
    { icon: Clock, tone: "blue", label: m.profile.stats.days, value: days === null ? "—" : String(days) },
    { icon: Trophy, tone: "orange", label: m.profile.stats.achievements, value: `${all.filter((a) => a.current >= a.goal).length}/${all.length}` },
    ...(place !== undefined ? [{ icon: MapPin, tone: "violet" as const, label: m.profile.stats.place, value: place ?? "—" }] : []),
  ];
  return <StatsStrip items={items} label={m.profile.showcase.statsLabel} />;
}

/** What a visitor sees on someone who is not a coach. */
function PersonSections({ memberSince, about, facts }: { memberSince?: string | null; about: React.ReactNode; facts: AchievementFacts }) {
  return (
    <>
      <PersonStats memberSince={memberSince} facts={facts} />
      <div className={styles.grid}>
        <div className={styles.wide}>{about}</div>
        <div className={styles.wide}>
          <ProfileAchievements facts={facts} own={false} />
        </div>
      </div>
    </>
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
  const isCoach = Boolean(person.data?.roles.includes("Coach"));
  const showcase = useShowcase(person.data?.userId ?? "", isCoach);
  const coverUrl = useCoverUrl(person.data?.userId ?? "", isCoach && showcase.data?.hasCover).data;
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
        memberSince={data.memberSince}
        headline={isCoach ? <CoachHeadline coachId={data.userId} /> : null}
        coverUrl={coverUrl}
        coverStyle={data.coverStyle}
        actions={
          <>
            {data.roles.includes("Coach") ? <LinkButton href={`/app/coaches/${data.userId}/offers`} iconStart={<Store />}>{m.profile.viewOffers}</LinkButton> : null}
            <LinkButton href={message} iconStart={<MessageSquare />}>{m.profile.message}</LinkButton>
            {coach && canInvite.allowed ? <Button iconStart={<UserPlus />} onPress={() => setInviting(true)}>{m.profile.invite}</Button> : null}
          </>
        }
      />
      {isCoach ? (
        <CoachSections coachId={data.userId} about={<About person={view} />} facts={factsOf({ coach: true, bio: Boolean(data.bio), location: false, memberSince: data.memberSince, showcase: showcase.data })} />
      ) : (
        <PersonSections memberSince={data.memberSince} about={<About person={view} />} facts={factsOf({ coach: false, bio: Boolean(data.bio), location: false, memberSince: data.memberSince })} />
      )}
      {inviting ? <InvitationEditor username={data.username} close={() => setInviting(false)} /> : null}
    </div>
  );
}

function CoachHeadline({ coachId }: { coachId: string }) {
  const showcase = useShowcase(coachId);
  return showcase.data?.headline ?? null;
}

/** What a visitor sees on a coach's profile: numbers, introduction, competencies, offers and portfolio. */
function CoachSections({ coachId, about, facts }: { coachId: string; about: React.ReactNode; facts: AchievementFacts }) {
  const showcase = useShowcase(coachId);
  const offers = useOffersTotal(coachId, true);
  const competencies = !showcase.isError && Boolean(showcase.data?.competencies.length);
  return (
    <>
      <ShowcaseStats showcase={showcase.data} offers={offers.data} failed={showcase.isError} />
      {showcase.isError ? <ShowcaseFailed error={showcase.error} retry={() => void showcase.refetch()} /> : null}
      <div className={styles.grid}>
        <div className={competencies ? undefined : styles.wide}>{about}</div>
        <div className={styles.wide}><CoachSpecializationsCard selections={showcase.data?.specializationSelections} /></div>
        {competencies ? <ShowcaseAbout showcase={showcase.data} editable={false} /> : null}
        <div className={styles.wide}>
          <CoachOffers coachId={coachId} />
        </div>
        <div className={styles.wide}>
          <ProfileAchievements facts={{ ...facts, offers: offers.data }} own={false} />
        </div>
        {showcase.data?.portfolio.length ? (
          <div className={styles.wide}>
            <Portfolio coachId={coachId} showcase={showcase.data} editable={false} />
          </div>
        ) : null}
      </div>
    </>
  );
}

export default function ProfileRoute() {
  const { username } = useParams();
  return username ? <OtherProfile key={username} username={username} /> : <OwnProfile />;
}
