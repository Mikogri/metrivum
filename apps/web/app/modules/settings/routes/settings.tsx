import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bot,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Compass,
  Dumbbell,
  Gauge,
  HeartPulse,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  MessageSquare,
  Plug,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Combobox,
  EmptyState,
  IconButton,
  LinkButton,
  Option,
  PageHeader,
  Segment,
  SegmentedControl,
  Select,
  Skeleton,
  Switch,
  TextArea,
  TextField,
  toast,
} from "@metrivum/ui-web";
import {
  DETAIL_GROUPS,
  DetailFields,
  ageFrom,
  detailProblems,
  detailsFromValues,
  detailsToValues,
  nameParts,
  namePartValid,
  normalizeDisplayName,
  profileFieldsKey,
  profileKey,
  timeZones,
  updateProfile,
  useAvatarUrl,
  useProfile,
  type DetailGroup,
  type Details,
} from "~/modules/accounts";
import { MAX_ACCOUNTS } from "~/shared/session";
import { CoachSpecializationsCard } from "~/modules/coaching";
import { Integrations } from "~/modules/integrations";

import { useAccessSnapshot } from "~/shared/access";
import { ApiError } from "~/shared/http/errors";
import { formatBytes, formatDate } from "~/shared/i18n/format";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useDiscardConfirm } from "~/shared/lib/useConfirm";
import {
  useAccountContext,
  useAccountKey,
  useApi,
} from "~/shared/session/AccountScope";
import {
  useActiveAccount,
  useSessionManager,
  useSessionState,
} from "~/shared/session/SessionProvider";
import { useAccountActions } from "~/shared/session/useAccountActions";
import { DevAccountErasure } from "./DevAccountErasure";
import { SignInSecurity } from "./SignInSecurity";
import styles from "./settings.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Settings — Metrivum");

const PHONE = /^\+?[0-9][0-9 ()-]{5,30}[0-9]$/;
const BIO_MAX = 500;

function ProfileForm() {
  const m = useT();
  const t = m.settings;
  const profile = useProfile();
  const active = useActiveAccount();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const { locale, setLocale } = useAppLocale();
  const zones = useMemo(() => timeZones(), []);
  const initialName = nameParts(profile);
  const [firstName, setFirstName] = useState(initialName.first);
  const [lastName, setLastName] = useState(initialName.last);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [language, setLanguage] = useState(profile.locale);
  const [timeZone, setTimeZone] = useState(profile.timeZone);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [phoneShared, setPhoneShared] = useState(profile.phoneVisibleToCoach);

  const mutation = useMutation({
    mutationFn: () =>
      updateProfile(
        api,
        {
          displayName: normalizeDisplayName(`${firstName} ${lastName}`),
          firstName: normalizeDisplayName(firstName),
          lastName: normalizeDisplayName(lastName),
          bio: bio.trim(),
          locale: language,
          timeZone,
          phone: phone.trim(),
          phoneVisibleToCoach: phoneShared,
        },
        profile.version,
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(profileKey(a), updated);
      // The details share the profile version: refresh them so their next save is not refused.
      void queryClient.invalidateQueries({ queryKey: profileFieldsKey(a) });
      setLocale(updated.locale);
      toast({ tone: "success", title: t.saved });
    },
  });
  const conflict =
    mutation.error instanceof ApiError && mutation.error.status === 412;
  const phoneInvalid = phone.trim() !== "" && !PHONE.test(phone.trim());
  const bioTooLong = bio.trim().length > BIO_MAX;
  const dirty =
    normalizeDisplayName(firstName) !== initialName.first ||
    normalizeDisplayName(lastName) !== initialName.last ||
    bio.trim() !== (profile.bio ?? "") ||
    language !== profile.locale ||
    timeZone !== profile.timeZone ||
    phone.trim() !== (profile.phone ?? "") ||
    phoneShared !== profile.phoneVisibleToCoach;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (
      !namePartValid(firstName) ||
      !namePartValid(lastName) ||
      phoneInvalid ||
      bioTooLong
    )
      return;
    mutation.mutate();
  }

  return (
    <Card as="section" padding="lg" aria-labelledby="profile-title">
      <div className={styles.cardHead}>
        <h2 id="profile-title" className={styles.title}>
          {t.profile}
        </h2>
        <LinkButton
          href="/app/profile"
          size="sm"
          variant="ghost"
          iconStart={<UserRound />}
        >
          {t.viewProfile}
        </LinkButton>
      </div>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {mutation.error ? (
          <Alert
            tone="danger"
            title={errorText(m, mutation.error)}
            actions={
              conflict ? (
                <Button
                  size="sm"
                  onPress={() =>
                    void queryClient.invalidateQueries({
                      queryKey: profileKey(a),
                    })
                  }
                >
                  {m.common.retry}
                </Button>
              ) : undefined
            }
          />
        ) : null}
        <dl className={styles.readOnly}>
          <div>
            <dt className={styles.label}>{t.username}</dt>
            <dd>@{profile.username}</dd>
          </div>
          <div>
            <dt className={styles.label}>{t.email}</dt>
            <dd className={styles.ellipsis}>{active?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className={styles.label}>{t.birthDate}</dt>
            <dd>
              {profile.birthDate
                ? formatDate(
                    locale,
                    `${profile.birthDate}T00:00:00Z`,
                    { dateStyle: "long" },
                    "UTC",
                  )
                : "—"}
            </dd>
          </div>
          <p className={styles.hint}>{t.readOnlyHint}</p>
        </dl>
        <div className={styles.twoCols}>
          <TextField
            placeholder={m.common.ph.firstName}
            label={t.firstName}
            value={firstName}
            onChange={setFirstName}
            autoComplete="given-name"
            isRequired
            isInvalid={!namePartValid(firstName)}
            errorMessage={
              firstName.trim()
                ? m.onboarding.namePartInvalid
                : m.auth.errors.required
            }
          />
          <TextField
            placeholder={m.common.ph.lastName}
            label={t.lastName}
            value={lastName}
            onChange={setLastName}
            autoComplete="family-name"
            isRequired
            isInvalid={!namePartValid(lastName)}
            errorMessage={
              lastName.trim()
                ? m.onboarding.namePartInvalid
                : m.auth.errors.required
            }
          />
        </div>
        <TextArea
          label={t.bio}
          placeholder={t.bioPlaceholder}
          value={bio}
          onChange={setBio}
          maxLength={BIO_MAX}
          description={`${t.bioHint} ${bio.trim().length}/${BIO_MAX}`}
          isInvalid={bioTooLong}
        />
        <div className={styles.twoCols}>
          <Select
            label={t.locale}
            selectedKey={language}
            onSelectionChange={(key) => setLanguage(String(key))}
          >
            <Option id="en">English</Option>
            <Option id="pl">Polski</Option>
          </Select>
          <Combobox
            placeholder={m.common.ph.timeZone}
            label={t.timeZone}
            defaultItems={zones.map((zone) => ({ id: zone }))}
            selectedKey={timeZone}
            onSelectionChange={(key) => key && setTimeZone(String(key))}
          >
            {(item: { id: string }) => (
              <Option id={item.id}>{item.id.replace(/_/g, " ")}</Option>
            )}
          </Combobox>
        </div>
        <div className={styles.phone}>
          <TextField
            label={t.phone}
            type="tel"
            autoComplete="tel"
            placeholder="+48 600 000 000"
            value={phone}
            onChange={setPhone}
            maxLength={32}
            description={t.phoneHint}
            isInvalid={phoneInvalid}
            errorMessage={t.phoneInvalid}
          />
          <Checkbox
            isSelected={phoneShared}
            onChange={setPhoneShared}
            isDisabled={!phone.trim()}
          >
            {t.phoneVisible}
          </Checkbox>
        </div>
        <div>
          <Button
            type="submit"
            variant="primary"
            loading={mutation.isPending}
            isDisabled={!dirty}
          >
            {m.common.saveChanges}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Body and training details, grouped like onboarding. Empty fields are removed on save. */
function BodyDetails() {
  const m = useT();
  const t = m.settings;
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const query = useQuery({
    queryKey: profileFieldsKey(a),
    queryFn: async ({ signal }) =>
      (
        await api<Schema<"AccountProfileFields">>({
          path: "/api/v1/me/profile-fields",
          signal,
        })
      ).data,
  });
  const stored = useMemo(
    () =>
      detailsFromValues(
        query.data?.values as Record<string, unknown> | undefined,
      ),
    [query.data],
  );
  const [draft, setDraft] = useState<Details | null>(null);
  const value = draft ?? stored;
  const keys = Object.values(DETAIL_GROUPS).flat();
  const problems = detailProblems(m, value, keys);
  const dirty =
    draft !== null &&
    JSON.stringify(detailsToValues(draft, keys, true)) !==
      JSON.stringify(detailsToValues(stored, keys, true));
  const mutation = useMutation({
    mutationFn: async () =>
      (
        await api<Schema<"AccountProfileFields">>({
          method: "PATCH",
          path: "/api/v1/me/profile-fields",
          ifMatch: query.data!.version,
          json: { values: detailsToValues(value, keys, true) },
        })
      ).data,
    onSuccess: (saved) => {
      queryClient.setQueryData(profileFieldsKey(a), saved);
      // Same version counter as the profile itself.
      void queryClient.invalidateQueries({
        queryKey: profileKey(a),
        exact: true,
      });
      setDraft(null);
      toast({ tone: "success", title: t.bodySaved });
    },
  });
  const conflict =
    mutation.error instanceof ApiError && mutation.error.status === 412;
  return (
    <Card as="section" padding="lg" aria-labelledby="body-title">
      <h2 id="body-title" className={styles.title}>
        {t.bodyTitle}
      </h2>
      <p className={styles.hint}>{t.bodyBody}</p>
      {query.isPending ? (
        <Skeleton height="16rem" />
      ) : query.isError ? (
        <Alert
          tone="danger"
          title={errorText(m, query.error)}
          actions={
            <Button size="sm" onPress={() => void query.refetch()}>
              {m.common.retry}
            </Button>
          }
        />
      ) : (
        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!Object.keys(problems).length) mutation.mutate();
          }}
        >
          {mutation.error ? (
            <Alert
              tone="danger"
              title={errorText(m, mutation.error)}
              actions={
                conflict ? (
                  <Button
                    size="sm"
                    onPress={() => {
                      setDraft(null);
                      mutation.reset();
                      void query.refetch();
                    }}
                  >
                    {m.common.retry}
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {(Object.keys(DETAIL_GROUPS) as DetailGroup[]).map((group) => (
            <fieldset key={group} className={styles.group}>
              <legend className={styles.groupTitle}>
                {t.bodyGroups[group]}
              </legend>
              <DetailFields
                group={group}
                value={value}
                onChange={setDraft}
                problems={problems}
                age={ageFrom(profile.birthDate)}
              />
            </fieldset>
          ))}
          <div className={styles.stickyActions}>
            <Button
              type="submit"
              variant="primary"
              loading={mutation.isPending}
              isDisabled={!dirty || Object.keys(problems).length > 0}
            >
              {m.common.saveChanges}
            </Button>
            {dirty ? (
              <Button
                variant="ghost"
                isDisabled={mutation.isPending}
                onPress={() => setDraft(null)}
              >
                {m.common.cancel}
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </Card>
  );
}

function MessagingPrivacy() {
  const m = useT();
  const t = m.settings;
  const { api, accountKey, lifecycle } = useAccountContext();
  const cache = useQueryClient();
  const key = [accountKey, "messaging-preferences"];
  const preferences = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      (
        await api<Schema<"MessagingPreferenceDto">>({
          path: "/api/v1/me/messaging-preferences",
          signal,
        })
      ).data,
  });
  const save = useMutation({
    mutationFn: async (requireApproval: boolean) =>
      (
        await api<Schema<"MessagingPreferenceDto">>({
          method: "PUT",
          path: "/api/v1/me/messaging-preferences",
          json: { requireApproval },
          signal: lifecycle.signal(),
        })
      ).data,
    onSuccess: (value) => {
      if (lifecycle.isCurrent()) {
        cache.setQueryData(key, value);
        toast({ tone: "success", title: t.privacySaved });
      }
    },
  });
  return (
    <Card as="section" padding="lg" aria-labelledby="privacy-title">
      <h2 id="privacy-title" className={styles.title}>
        {t.privacyTitle}
      </h2>
      <p className={styles.hint}>{t.privacyBody}</p>
      <div className={styles.form}>
        {preferences.isPending ? (
          <Skeleton />
        ) : preferences.error ? (
          <Alert
            tone="danger"
            title={t.privacyFailed}
            actions={
              <Button size="sm" onPress={() => void preferences.refetch()}>
                {m.common.retry}
              </Button>
            }
          />
        ) : (
          <Switch
            isSelected={preferences.data.requireApproval}
            isDisabled={save.isPending}
            onChange={(value) => save.mutate(value)}
          >
            {t.requireApproval}
          </Switch>
        )}
        {save.error && <Alert tone="danger" title={errorText(m, save.error)} />}
      </div>
    </Card>
  );
}

/** The accounts signed in to this browser as cards, the active one first, then the free slots to add another. */
function Accounts() {
  const m = useT();
  const t = m.settings;
  const state = useSessionState();
  const profile = useProfile();
  const photo = useAvatarUrl(profile.id, profile.hasAvatar);
  const navigate = useNavigate();
  const manager = useSessionManager();
  const { confirm, dialog } = useDiscardConfirm();
  const actions = useAccountActions(confirm);
  const slot = manager.slotForNewSignIn();
  const accounts = [...state.accounts].sort(
    (a, b) =>
      Number(b.slot === state.activeSlot) - Number(a.slot === state.activeSlot),
  );
  const free = Math.max(0, MAX_ACCOUNTS - accounts.length);
  return (
    <Card as="section" padding="lg" aria-labelledby="accounts-title">
      <div className={styles.accountsHead}>
        <div>
          <h2 id="accounts-title" className={styles.title}>
            {t.accounts}
          </h2>
          <p className={styles.hint}>{t.accountsBody}</p>
        </div>
        <Badge tone="neutral">
          {t.accountsCount(accounts.length, MAX_ACCOUNTS)}
        </Badge>
      </div>
      <ul className={styles.accountCards}>
        {accounts.map((account) => {
          const active = account.slot === state.activeSlot;
          const name = active
            ? profile.displayName || profile.username || account.email || "?"
            : (account.email ?? "?");
          return (
            <li
              key={account.slot}
              className={styles.accountCard}
              data-active={active || undefined}
            >
              <Avatar
                name={name}
                size="lg"
                decorative
                src={active ? photo : undefined}
              />
              <span className={styles.accountText}>
                <strong>{name}</strong>
                <small>
                  {active && profile.username
                    ? `@${profile.username} · ${account.email ?? ""}`
                    : account.email}
                </small>
              </span>
              <span className={styles.accountActions}>
                {active ? (
                  <Badge tone="success" dot>
                    {t.accountActive}
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    aria-label={m.accounts.switchTo(account.email ?? "")}
                    onPress={() => void actions.switchTo(account.slot)}
                  >
                    {t.accountSwitch}
                  </Button>
                )}
                <IconButton
                  size="sm"
                  variant="ghost"
                  icon={<LogOut />}
                  label={m.accounts.signOutOf(account.email ?? "")}
                  onPress={() => void actions.signOut(account.slot)}
                />
              </span>
            </li>
          );
        })}
        {slot !== null && free > 0 ? (
          <li className={styles.freeSlot}>
            <span className={styles.freeIcon} aria-hidden="true">
              <Plus />
            </span>
            <span className={styles.accountText} data-wrap>
              <strong>{t.freeSlots(free)}</strong>
              <small>{t.freeSlotBody}</small>
            </span>
            <span className={styles.freeActions}>
              <Button
                size="sm"
                variant="ghost"
                iconStart={<LogIn />}
                onPress={() => void actions.addAccount()}
              >
                {t.signIn}
              </Button>
              <Button
                size="sm"
                iconStart={<Plus />}
                onPress={() => navigate(`/auth/register?slot=${slot}&add=1`)}
              >
                {t.createAccount}
              </Button>
            </span>
          </li>
        ) : null}
      </ul>
      {slot === null ? (
        <p className={styles.hint}>{m.accounts.maxReached}</p>
      ) : null}
      {dialog}
    </Card>
  );
}

const AREAS = [
  "training",
  "exercises",
  "video",
  "coaching",
  "calendar",
  "messaging",
  "insights",
  "discovery",
  "integrations",
  "team",
] as const;
const AREA_ICONS: Record<string, typeof Check> = {
  training: ClipboardList,
  exercises: Dumbbell,
  video: Video,
  coaching: Users,
  calendar: CalendarDays,
  messaging: MessageSquare,
  insights: BarChart3,
  discovery: Compass,
  integrations: Bot,
  team: Building2,
  other: Sparkles,
};
const areaOf = (key: string) => {
  const head = key.split(".")[0]!;
  if (["coaching", "offers", "forms", "checkins", "billing"].includes(head))
    return "coaching";
  if (head === "analytics" || head === "automation") return "insights";
  if (head === "organization") return "team";
  return (AREAS as readonly string[]).includes(head) ? head : "other";
};
type AccessFilter = "all" | "available" | "missing";

/** The plan with how much of it is in use, the limits as meters, then every feature by area. */
function AccessOverview() {
  const m = useT();
  const t = m.settings;
  const { locale } = useAppLocale();
  const access = useAccessSnapshot();
  const [filter, setFilter] = useState<AccessFilter>("all");
  const features = access.data?.features ?? [];
  const available = features.filter((f) => f.available).length;
  const missing = features.length - available;
  const shown = features.filter((f) =>
    filter === "available"
      ? f.available
      : filter === "missing"
        ? !f.available
        : true,
  );
  // Features not included come first, so what is missing is never buried in a long list.
  const groups = [...AREAS, "other"]
    .map((area) => ({
      area,
      all: features.filter((f) => areaOf(f.key) === area),
      items: shown
        .filter((f) => areaOf(f.key) === area)
        .sort((a, b) => Number(a.available) - Number(b.available)),
    }))
    .filter((g) => g.items.length);
  const limits = access.data?.limits ?? [];
  const percent = features.length
    ? Math.round((available / features.length) * 100)
    : 0;
  return (
    <div className={styles.stack}>
      <Card as="section" padding="lg" aria-labelledby="plan-title">
        <div className={styles.planHead}>
          <span className={styles.planIcon} aria-hidden="true">
            <Gauge />
          </span>
          <div className={styles.planText}>
            <h2 id="plan-title" className={styles.planTitle}>
              {t.accessPlan}
              {access.data?.planId ? (
                <Badge tone="violet">{access.data.planId}</Badge>
              ) : null}
            </h2>
            <p className={styles.hint}>{t.accessPlanBody}</p>
          </div>
          <div className={styles.planActions}>
            <LinkButton href="/app/usage" size="sm" variant="ghost">
              {t.accessUsage}
            </LinkButton>
            <LinkButton href="/app/subscription" size="sm">
              {t.accessPlans}
            </LinkButton>
          </div>
        </div>
        {access.isError ? (
          <Alert tone="danger" title={errorText(m, access.error)} />
        ) : access.isPending ? (
          <Skeleton height="2.5rem" />
        ) : (
          <div className={styles.planMeter}>
            <div className={styles.planMeterHead}>
              <span>{t.accessSummary(available, features.length)}</span>
              <strong>{percent}%</strong>
            </div>
            <span
              className={styles.meter}
              role="meter"
              aria-label={t.accessFeatures}
              aria-valuemin={0}
              aria-valuemax={features.length}
              aria-valuenow={available}
            >
              <span style={{ transform: `scaleX(${percent / 100})` }} />
            </span>
          </div>
        )}
      </Card>

      {limits.length ? (
        <Card as="section" padding="lg" aria-labelledby="limits-title">
          <h2 id="limits-title" className={styles.title}>
            {t.limits}
          </h2>
          <ul className={styles.limitTiles}>
            {limits.map((limit) => {
              const used = Number(limit.used);
              const maximum = Number(limit.maximum);
              const unlimited = limit.maximum == null;
              const bytes = limit.key.toLowerCase().includes("bytes");
              const ratio = maximum > 0 ? Math.min(1, used / maximum) : 0;
              const label = m.access.limits[limit.key] ?? limit.key;
              return (
                <li
                  key={limit.key}
                  className={styles.limitTile}
                  data-high={
                    (!unlimited && !bytes && ratio >= 0.8) || undefined
                  }
                >
                  <span className={styles.limitLabel}>{label}</span>
                  {bytes ? (
                    <strong className={styles.limitNumber}>
                      {unlimited
                        ? t.accessUnlimited
                        : formatBytes(locale, maximum)}
                    </strong>
                  ) : (
                    <>
                      <strong className={styles.limitNumber}>
                        {used}
                        <small>
                          {" "}
                          / {unlimited ? t.accessUnlimited : maximum}
                        </small>
                      </strong>
                      {unlimited ? null : (
                        <span
                          className={styles.meter}
                          role="meter"
                          aria-label={label}
                          aria-valuemin={0}
                          aria-valuemax={maximum}
                          aria-valuenow={Math.min(used, maximum)}
                        >
                          <span
                            style={{ transform: `scaleX(${ratio})` }}
                            data-high={ratio >= 0.8 || undefined}
                          />
                        </span>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <Card as="section" padding="lg" aria-labelledby="access-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="access-title" className={styles.title}>
              {t.accessFeatures}
            </h2>
            <p className={styles.hint}>{t.accessBody}</p>
          </div>
          <SegmentedControl
            size="sm"
            aria-label={t.accessFeatures}
            selectedKeys={[filter]}
            onSelectionChange={(keys) =>
              setFilter(([...keys][0] as AccessFilter | undefined) ?? "all")
            }
          >
            {(["all", "available", "missing"] as const).map((id) => (
              <Segment key={id} id={id}>
                {t.accessFilter[id]}
                {id === "missing" && missing ? (
                  <span className={styles.filterCount}>{missing}</span>
                ) : null}
              </Segment>
            ))}
          </SegmentedControl>
        </div>
        {access.isPending ? (
          <Skeleton height="12rem" />
        ) : filter === "missing" && !missing ? (
          <EmptyState
            size="sm"
            className={styles.accessEmpty}
            icon={<Check />}
            title={t.accessNoneMissing}
          />
        ) : (
          <div className={styles.areas}>
            {groups.map(({ area, all, items }) => {
              const Icon = AREA_ICONS[area] ?? Sparkles;
              const on = all.filter((f) => f.available).length;
              return (
                <section
                  key={area}
                  className={styles.area}
                  aria-labelledby={`area-${area}`}
                >
                  <header className={styles.areaHead}>
                    <span className={styles.areaIcon} aria-hidden="true">
                      <Icon />
                    </span>
                    <h3 id={`area-${area}`} className={styles.areaTitle}>
                      {t.areas[area] ?? area}
                    </h3>
                    <span
                      className={styles.areaCount}
                      data-full={on === all.length || undefined}
                    >
                      {on}/{all.length}
                    </span>
                  </header>
                  <ul className={styles.features}>
                    {items.map((feature) => {
                      const reason =
                        m.access.reasons[feature.reason] ?? feature.reason;
                      return (
                        <li
                          key={feature.key}
                          data-available={feature.available || undefined}
                        >
                          <span
                            className={styles.featureMark}
                            aria-hidden="true"
                          >
                            {feature.available ? <Check /> : <Lock />}
                          </span>
                          <span className={styles.featureName}>
                            {m.access.features[feature.key] ?? feature.key}
                            <span
                              className={
                                feature.available
                                  ? styles.srOnly
                                  : styles.featureReason
                              }
                            >
                              {reason}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

const CURRENCIES = [
  "EUR",
  "PLN",
  "USD",
  "GBP",
  "CHF",
  "CZK",
  "SEK",
  "NOK",
  "DKK",
  "CAD",
  "AUD",
];

/** Coach-only preferences (moved here from the Coaching section of the sidebar). */
function CoachingPreferences() {
  const m = useT();
  const t = m.settings;
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [a, "coaching", "settings", "profile-fields"],
    queryFn: async ({ signal }) =>
      (
        await api<Schema<"AccountProfileFields">>({
          path: "/api/v1/me/profile-fields",
          signal,
        })
      ).data,
  });
  const [currency, setCurrency] = useState("");
  const mutation = useMutation({
    mutationFn: (value: string) =>
      api({
        method: "PATCH",
        path: "/api/v1/me/currency",
        ifMatch: query.data!.version,
        json: { currency: value },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [a, "coaching"] });
      void queryClient.invalidateQueries({ queryKey: profileKey(a) });
      setCurrency("");
      toast({ tone: "success", title: t.currencySaved });
    },
  });
  const value = currency || query.data?.currency || "";
  return (
    <Card as="section" padding="lg" aria-labelledby="coaching-title">
      <h2 id="coaching-title" className={styles.title}>
        {t.coaching}
      </h2>
      <p className={styles.hint}>{t.coachingBody}</p>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (currency && currency !== query.data?.currency)
            mutation.mutate(currency);
        }}
      >
        {query.isError ? (
          <Alert tone="danger" title={errorText(m, query.error)} />
        ) : null}
        {mutation.error ? (
          <Alert tone="danger" title={errorText(m, mutation.error)} />
        ) : null}
        <Select
          label={t.currency}
          className={styles.narrow}
          isDisabled={!query.data}
          placeholder={m.common.loading}
          selectedKey={value || null}
          onSelectionChange={(key) => setCurrency(String(key))}
        >
          {CURRENCIES.map((c) => (
            <Option key={c} id={c}>
              {c}
            </Option>
          ))}
        </Select>
        <div>
          <Button
            type="submit"
            variant="primary"
            loading={mutation.isPending}
            isDisabled={!currency || currency === query.data?.currency}
          >
            {t.saveCurrency}
          </Button>
        </div>
      </form>
    </Card>
  );
}

const ENDING_ALERTS = [
  "LastBlock",
  "LastCycle",
  "LastWeek",
  "LastWorkout",
] as const;
type NotificationPreferences = {
  messaging: boolean;
  checkIns: boolean;
  coaching: boolean;
  system: boolean;
  programEnding?: string[];
};

/** Which moments of a client's program running out the coach hears about; several at once. */
function ProgramEndingAlerts() {
  const m = useT();
  const t = m.settings;
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const key = [a, "notifications", "preferences"];
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      (
        await api<NotificationPreferences>({
          path: "/api/v1/me/notification-preferences",
          signal,
        })
      ).data,
  });
  const mutation = useMutation({
    mutationFn: (programEnding: string[]) =>
      api<NotificationPreferences>({
        method: "PATCH",
        path: "/api/v1/me/notification-preferences",
        json: { ...query.data!, programEnding },
      }),
    onSuccess: (response, programEnding) => {
      queryClient.setQueryData(key, {
        ...query.data!,
        ...(response.data ?? {}),
        programEnding,
      });
      toast({ tone: "success", title: t.programEndingSaved });
    },
  });
  const chosen = mutation.isPending
    ? mutation.variables
    : (query.data?.programEnding ?? []);
  return (
    <Card as="section" padding="lg" aria-labelledby="program-ending-title">
      <h2 id="program-ending-title" className={styles.title}>
        {t.programEnding}
      </h2>
      <p className={styles.hint}>{t.programEndingBody}</p>
      {query.isError ? (
        <Alert tone="danger" title={errorText(m, query.error)} />
      ) : null}
      {mutation.error ? (
        <Alert tone="danger" title={errorText(m, mutation.error)} />
      ) : null}
      {query.isPending ? (
        <Skeleton height="8rem" />
      ) : !query.data?.coaching ? (
        <Alert title={t.programEndingOff} />
      ) : null}
      {query.data ? (
        <div
          className={styles.form}
          role="group"
          aria-labelledby="program-ending-title"
        >
          {ENDING_ALERTS.map((id) => (
            <Checkbox
              key={id}
              description={t.programEndingOptions[id][1]}
              isSelected={chosen.includes(id)}
              isDisabled={mutation.isPending}
              onChange={(on) =>
                mutation.mutate(
                  ENDING_ALERTS.filter((x) =>
                    x === id ? on : chosen.includes(x),
                  ),
                )
              }
            >
              {t.programEndingOptions[id][0]}
            </Checkbox>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

type Section =
  | "profile"
  | "body"
  | "security"
  | "accounts"
  | "privacy"
  | "coaching"
  | "integrations"
  | "access";

const SECTION_ICONS: Record<Section, typeof UserRound> = {
  profile: UserRound,
  body: HeartPulse,
  security: KeyRound,
  accounts: Users,
  privacy: ShieldCheck,
  coaching: Wallet,
  integrations: Plug,
  access: Gauge,
};

export default function Settings() {
  const m = useT();
  const t = m.settings;
  const profile = useProfile();
  const active = useActiveAccount();
  const [params, setParams] = useSearchParams();
  const sections: Section[] = [
    "profile",
    "body",
    "security",
    "accounts",
    "privacy",
    ...(profile.roles.includes("Coach")
      ? (["coaching", "integrations"] as const)
      : []),
    "access",
  ];
  const requested = params.get("section") as Section | null;
  const section =
    requested && sections.includes(requested) ? requested : "profile";
  const name = profile.displayName || profile.username || active?.email || "";
  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <div className={styles.layout}>
        <aside className={styles.side}>
          {/* Who these settings belong to, with a way to the public profile. */}
          <RouterLink to="/app/profile" className={styles.who}>
            <Avatar name={name} size="lg" decorative />
            <span className={styles.whoText}>
              <strong>{name}</strong>
              <small>@{profile.username}</small>
            </span>
            <ChevronRight aria-hidden="true" className={styles.whoChevron} />
          </RouterLink>
          <nav className={styles.sideNav} aria-label={t.title}>
            {sections.map((id) => {
              const Icon = SECTION_ICONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={id === section ? "page" : undefined}
                  ref={
                    id === section
                      ? (element) =>
                          element?.scrollIntoView({
                            block: "nearest",
                            inline: "center",
                          })
                      : undefined
                  }
                  onClick={() =>
                    setParams(id === "profile" ? {} : { section: id }, {
                      replace: true,
                    })
                  }
                >
                  <Icon aria-hidden="true" className={styles.sideIcon} />
                  <span className={styles.sideText}>
                    <span>{t.sections[id]}</span>
                    <small>{t.sectionHints[id]}</small>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>
        <div className={styles.content} key={section}>
          {section === "profile" ? (
            <ProfileForm />
          ) : section === "body" ? (
            <BodyDetails />
          ) : section === "security" ? (
            <SignInSecurity />
          ) : section === "accounts" ? (
            <>
              <Accounts />
              <DevAccountErasure />
            </>
          ) : section === "privacy" ? (
            <MessagingPrivacy />
          ) : section === "coaching" ? (
            <>
              <CoachSpecializationsCard editable initialEditing />
              <CoachingPreferences />
              <ProgramEndingAlerts />
            </>
          ) : section === "integrations" ? (
            <Integrations />
          ) : (
            <AccessOverview />
          )}
        </div>
      </div>
    </>
  );
}
