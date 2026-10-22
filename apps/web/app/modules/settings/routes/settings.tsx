import { displayNameValid, normalizeDisplayName } from "~/modules/accounts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LogOut, Minus, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Avatar, Badge, Button, Card, Checkbox, Combobox, List, ListRow, Option, PageHeader, Select, Skeleton, TextField, toast } from "@trainflow/ui-web";
import { profileKey, timeZones, updateProfile, useProfile } from "~/modules/accounts";
import { Integrations } from "~/modules/integrations";

import { useAccessSnapshot } from "~/shared/access";
import { ApiError } from "~/shared/http/errors";
import { formatBytes, formatDate } from "~/shared/i18n/format";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useDiscardConfirm } from "~/shared/lib/useConfirm";
import { useAccountContext, useAccountKey, useApi } from "~/shared/session/AccountScope";
import { useSessionState } from "~/shared/session/SessionProvider";
import { useAccountActions } from "~/shared/session/useAccountActions";
import styles from "./settings.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Settings — TrainFlow");

function ProfileForm() {
  const m = useT();
  const t = m.settings;
  const profile = useProfile();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const { locale, setLocale } = useAppLocale();
  const zones = useMemo(() => timeZones(), []);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [language, setLanguage] = useState(profile.locale);
  const [timeZone, setTimeZone] = useState(profile.timeZone);

  const mutation = useMutation({
    mutationFn: () => updateProfile(api, { displayName: normalizeDisplayName(displayName), locale: language, timeZone }, profile.version),
    onSuccess: (updated) => {
      queryClient.setQueryData(profileKey(a), updated);
      setLocale(updated.locale);
      toast({ tone: "success", title: t.saved });
    },
  });
  const conflict = mutation.error instanceof ApiError && mutation.error.status === 412;
  const dirty = normalizeDisplayName(displayName) !== profile.displayName || language !== profile.locale || timeZone !== profile.timeZone;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!displayNameValid(displayName)) return;
    mutation.mutate();
  }

  return (
    <Card as="section" padding="lg" aria-labelledby="profile-title">
      <h2 id="profile-title" className={styles.title}>
        {t.profile}
      </h2>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {mutation.error ? (
          <Alert
            tone="danger"
            title={errorText(m, mutation.error)}
            actions={
              conflict ? (
                <Button size="sm" onPress={() => void queryClient.invalidateQueries({ queryKey: profileKey(a) })}>
                  {m.common.retry}
                </Button>
              ) : undefined
            }
          />
        ) : null}
        <div className={styles.readOnly}>
          <div>
            <p className={styles.label}>{t.username}</p>
            <p>{profile.username}</p>
          </div>
          <div>
            <p className={styles.label}>{t.birthDate}</p>
            <p>{profile.birthDate ? formatDate(locale, `${profile.birthDate}T00:00:00Z`, { dateStyle: "long" }, "UTC") : "—"}</p>
          </div>
          <p className={styles.hint}>{t.readOnlyHint}</p>
        </div>
        <TextField placeholder={m.common.ph.displayName} label={t.displayName} value={displayName} onChange={setDisplayName} isRequired isInvalid={!displayNameValid(displayName)} errorMessage={displayName.trim() ? m.onboarding.displayNameInvalid : m.auth.errors.required} />
        <div className={styles.twoCols}>
          <Select label={t.locale} selectedKey={language} onSelectionChange={(key) => setLanguage(String(key))}>
            <Option id="en">English</Option>
            <Option id="pl">Polski</Option>
          </Select>
          <Combobox placeholder={m.common.ph.timeZone}
            label={t.timeZone}
            defaultItems={zones.map((zone) => ({ id: zone }))}
            selectedKey={timeZone}
            onSelectionChange={(key) => key && setTimeZone(String(key))}
          >
            {(item: { id: string }) => <Option id={item.id}>{item.id.replace(/_/g, " ")}</Option>}
          </Combobox>
        </div>
        <div>
          <Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!dirty}>
            {m.common.saveChanges}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MessagingPrivacy() {
  const { api, accountKey, lifecycle } = useAccountContext();
  const cache = useQueryClient();
  const key = [accountKey, "messaging-preferences"];
  const preferences = useQuery({ queryKey: key, queryFn: async ({ signal }) => (await api<Schema<"MessagingPreferenceDto">>({ path: "/api/v1/me/messaging-preferences", signal })).data });
  const save = useMutation({
    mutationFn: async (requireApproval: boolean) => (await api<Schema<"MessagingPreferenceDto">>({ method: "PUT", path: "/api/v1/me/messaging-preferences", json: { requireApproval }, signal: lifecycle.signal() })).data,
    onSuccess: value => { if (lifecycle.isCurrent()) { cache.setQueryData(key, value); toast({ tone: "success", title: "Message privacy saved" }); } },
  });
  return <Card as="section" padding="lg">
    <h2 className={styles.title}>Message privacy</h2>
    <p className={styles.hint}>Anyone can message you by default. Require approval to review a new conversation before continuing. Existing accepted conversations stay open.</p>
    {preferences.isPending ? <Skeleton /> : preferences.error ? <Alert tone="danger" title="Could not load message privacy" actions={<Button onPress={() => void preferences.refetch()}>Retry</Button>} /> : <Checkbox isSelected={preferences.data.requireApproval} isDisabled={save.isPending} onChange={value => save.mutate(value)}>Require approval for new conversations</Checkbox>}
    {save.error && <Alert tone="danger" title={save.error instanceof Error ? save.error.message : "Could not save message privacy"} />}
  </Card>;
}

function Accounts() {
  const m = useT();
  const t = m.settings;
  const state = useSessionState();
  const { confirm, dialog } = useDiscardConfirm();
  const actions = useAccountActions(confirm);
  return (
    <Card as="section" padding="lg" aria-labelledby="accounts-title">
      <h2 id="accounts-title" className={styles.title}>
        {t.accounts}
      </h2>
      <p className={styles.hint}>{t.accountsBody}</p>
      <List className={styles.list}>
        {state.accounts.map((account) => (
          <ListRow
            key={account.slot}
            leading={<Avatar name={account.email ?? "?"} size="sm" decorative />}
            title={account.email}
            subtitle={account.slot === state.activeSlot ? m.accounts.current : undefined}
            trailing={
              <>
                {account.slot !== state.activeSlot ? (
                  <Button size="sm" onPress={() => void actions.switchTo(account.slot)}>
                    {m.accounts.switchTo(account.email ?? "")}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" iconStart={<LogOut />} onPress={() => void actions.signOut(account.slot)}>
                  {m.accounts.signOut}
                </Button>
              </>
            }
          />
        ))}
      </List>
      <Button iconStart={<Plus />} isDisabled={!actions.canAdd} onPress={() => void actions.addAccount()}>
        {actions.canAdd ? m.accounts.add : m.accounts.maxReached}
      </Button>
      {dialog}
    </Card>
  );
}

const AREAS = ["training", "exercises", "video", "coaching", "calendar", "messaging"] as const;
const areaOf = (key: string) => {
  const head = key.split(".")[0]!;
  if (["coaching", "offers", "forms", "checkins", "billing"].includes(head)) return "coaching";
  return (AREAS as readonly string[]).includes(head) ? head : "other";
};

/** Every feature grouped by area (a tick or a dash plus the reason), then the limits with usage meters. */
function AccessOverview() {
  const m = useT();
  const t = m.settings;
  const { locale } = useAppLocale();
  const access = useAccessSnapshot();
  const features = access.data?.features ?? [];
  const available = features.filter((f) => f.available).length;
  const groups = [...AREAS, "other"].map((area) => ({ area, items: features.filter((f) => areaOf(f.key) === area) })).filter((g) => g.items.length);
  const limits = (access.data?.limits ?? []).filter((limit) => Number(limit.maximum) > 0);
  return (
    <div className={styles.stack}>
      <Card as="section" padding="lg" aria-labelledby="access-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="access-title" className={styles.title}>
              {t.access}
            </h2>
            <p className={styles.hint}>{t.accessBody}</p>
          </div>
          {access.data ? (
            <Badge tone={available === features.length ? "success" : "neutral"} dot>
              {t.accessSummary(available, features.length)}
            </Badge>
          ) : null}
        </div>
        {access.isError ? <Alert tone="danger" title={errorText(m, access.error)} /> : null}
        {access.isPending ? <Skeleton height="12rem" /> : null}
        <div className={styles.areas}>
          {groups.map(({ area, items }) => (
            <section key={area} className={styles.area} aria-labelledby={`area-${area}`}>
              <h3 id={`area-${area}`} className={styles.areaTitle}>
                {t.areas[area] ?? area}
                <span className={styles.areaCount}>
                  {items.filter((f) => f.available).length}/{items.length}
                </span>
              </h3>
              <ul className={styles.features}>
                {items.map((feature) => {
                  const reason = m.access.reasons[feature.reason] ?? feature.reason;
                  return (
                    <li key={feature.key} data-available={feature.available || undefined} title={reason}>
                      <span className={styles.featureMark} aria-hidden="true">
                        {feature.available ? <Check /> : <Minus />}
                      </span>
                      <span className={styles.featureName}>
                        {m.access.features[feature.key] ?? feature.key}
                        <span className={feature.available ? styles.srOnly : styles.featureReason}>{reason}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </Card>
      {limits.length ? (
        <Card as="section" padding="lg" aria-labelledby="limits-title">
          <h2 id="limits-title" className={styles.title}>
            {t.limits}
          </h2>
          <dl className={styles.limits}>
            {limits.map((limit) => {
              const used = Number(limit.used);
              const maximum = Number(limit.maximum);
              const bytes = limit.key.toLowerCase().includes("bytes");
              const ratio = Math.min(1, used / maximum);
              const label = m.access.limits[limit.key] ?? limit.key;
              return (
                <div key={limit.key} className={styles.limit}>
                  <dt>{label}</dt>
                  <dd>
                    {bytes ? (
                      <span className={styles.limitValue}>{formatBytes(locale, maximum)}</span>
                    ) : (
                      <>
                        <span className={styles.meter} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={used}>
                          <span style={{ transform: `scaleX(${ratio})` }} data-high={ratio >= 0.8 || undefined} />
                        </span>
                        <span className={styles.limitValue}>{t.usageValue(used, maximum)}</span>
                      </>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Card>
      ) : null}
    </div>
  );
}

const CURRENCIES = ["EUR", "PLN", "USD", "GBP", "CHF", "CZK", "SEK", "NOK", "DKK", "CAD", "AUD"];

/** Coach-only preferences (moved here from the Coaching section of the sidebar). */
function CoachingPreferences() {
  const m = useT();
  const t = m.settings;
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [a, "coaching", "settings", "profile-fields"],
    queryFn: async ({ signal }) => (await api<Schema<"AccountProfileFields">>({ path: "/api/v1/me/profile-fields", signal })).data,
  });
  const [currency, setCurrency] = useState("");
  const mutation = useMutation({
    mutationFn: (value: string) => api({ method: "PATCH", path: "/api/v1/me/currency", ifMatch: query.data!.version, json: { currency: value } }),
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
          if (currency && currency !== query.data?.currency) mutation.mutate(currency);
        }}
      >
        {query.isError ? <Alert tone="danger" title={errorText(m, query.error)} /> : null}
        {mutation.error ? <Alert tone="danger" title={errorText(m, mutation.error)} /> : null}
        <Select label={t.currency} className={styles.narrow} isDisabled={!query.data} placeholder={m.common.loading} selectedKey={value || null} onSelectionChange={(key) => setCurrency(String(key))}>
          {CURRENCIES.map((c) => (
            <Option key={c} id={c}>
              {c}
            </Option>
          ))}
        </Select>
        <div>
          <Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!currency || currency === query.data?.currency}>
            {t.saveCurrency}
          </Button>
        </div>
      </form>
    </Card>
  );
}

type Section = "profile" | "accounts" | "coaching" | "access" | "integrations";

export default function Settings() {
  const m = useT();
  const t = m.settings;
  const profile = useProfile();
  const [params, setParams] = useSearchParams();
  const sections: Section[] = ["profile", "accounts", ...(profile.roles.includes("Coach") ? (["coaching", "integrations"] as const) : []), "access"];
  const requested = params.get("section") as Section | null;
  const section = requested && sections.includes(requested) ? requested : "profile";
  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <div className={styles.layout}>
        <nav className={styles.sideNav} aria-label={t.title}>
          {sections.map((id) => (
            <button key={id} type="button" aria-current={id === section ? "page" : undefined} onClick={() => setParams(id === "profile" ? {} : { section: id }, { replace: true })}>
              {t.sections[id]}
            </button>
          ))}
        </nav>
        <div className={styles.content} key={section}>
          {section === "profile" ? <><ProfileForm /><MessagingPrivacy /></> : section === "accounts" ? <Accounts /> : section === "coaching" ? <CoachingPreferences /> : section === "integrations" ? <Integrations /> : <AccessOverview />}
        </div>
      </div>
    </>
  );
}
