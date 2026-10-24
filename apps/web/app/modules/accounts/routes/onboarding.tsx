import { parseDate, today, type CalendarDate } from "@internationalized/date";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { ProfileResponse, Schema } from "@trainflow/api-client-web";
import { Alert, Button, Checkbox, Combobox, DateField, Option, Select, TextField } from "@trainflow/ui-web";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { ApiError } from "~/shared/http/errors";
import { errorText, fieldError } from "~/shared/lib/errorText";
import { sanitizeReturnTo } from "~/shared/session/returnTo";
import { AuthHeader, registrationRole, type RegistrationRole } from "~/modules/auth";
import { AccountGate } from "../components/AccountGate";
import { completeOnboarding } from "../api/profile";
import { DETAIL_GROUPS, DetailFields, detailProblems, detailsToValues, emptyDetails, type DetailGroup, type DetailKey, type Details } from "../components/ProfileDetails";
import { profileKey } from "../api/useProfile";
import { timeZones } from "../lib/timeZones";
import { displayNameValid, normalizeDisplayName, USERNAME_MAX, usernameProblem } from "../lib/identity";
import styles from "./onboarding.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Set up your account — Metrivum");


type Step = 1 | 2 | 3 | 4 | 5;
const TOTAL_STEPS = 5;

function ageOn(date: CalendarDate, now: CalendarDate) {
  let age = now.year - date.year;
  if (now.month < date.month || (now.month === date.month && now.day < date.day)) age--;
  return age;
}

function OnboardingForm() {
  const m = useT();
  const t = m.onboarding;
  const { locale } = useAppLocale();
  const api = useApi();
  const accountKey = useAccountKey();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const zones = useMemo(() => timeZones(), []);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<RegistrationRole>(() => registrationRole(params.get("role")));
  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState<CalendarDate | null>(null);
  const [language, setLanguage] = useState<string>(locale);
  const [timeZone, setTimeZone] = useState<string>(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [accepted, setAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Steps after the account itself: body, heart rate and recovery, training, then health and goals.
  const [step, setStep] = useState<Step>(1);
  const [details, setDetails] = useState<Details>(emptyDetails);
  const [checked, setChecked] = useState<Partial<Record<DetailGroup, boolean>>>({});
  // The account is created once; a failed save of the extra details retries only that part.
  const created = useRef<ProfileResponse | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: Details) => {
      created.current ??= await completeOnboarding(api, {
        username: username.trim(),
        role,
        displayName: normalizeDisplayName(displayName),
        birthDate: birthDate!.toString(),
        acceptedTerms: accepted,
        locale: language,
        timeZone,
      });
      // Only valid groups are saved; a skipped or invalid optional group is left out rather than blocking setup.
      const keys = (Object.keys(DETAIL_GROUPS) as DetailGroup[]).filter((group) => !Object.keys(detailProblems(m, input, DETAIL_GROUPS[group], requiredFor(group))).length).flatMap((group) => DETAIL_GROUPS[group]);
      const values = detailsToValues(input, keys, false);
      if (Object.keys(values).length) {
        const fields = (await api<Schema<"AccountProfileFields">>({ path: "/api/v1/me/profile-fields" })).data;
        await api({ method: "PATCH", path: "/api/v1/me/profile-fields", ifMatch: fields.version, json: { values } });
      }
      return created.current;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(profileKey(accountKey), profile);
      navigate(sanitizeReturnTo(params.get("returnTo")), { replace: true });
    },
    // A taken username is fixed on the first step.
    onError: (error) => {
      if (!created.current && (error instanceof ApiError && error.status === 409 || fieldError(error, "username") || fieldError(error, "displayName") || fieldError(error, "birthDate"))) setStep(1);
    },
  });

  const now = today(timeZone || "UTC");
  const underage = birthDate ? ageOn(birthDate, now) < 18 : false;
  const invalid = {
    username: submitted && usernameProblem(username.trim()) !== null,
    displayName: submitted && !displayNameValid(displayName),
    birthDate: submitted && (!birthDate || underage),
    terms: submitted && !accepted,
  };

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (usernameProblem(username.trim()) || !displayNameValid(displayName) || !birthDate || underage || !accepted) return;
    mutation.reset();
    setStep(2);
  }

  // Clients give sex, height and weight; everything else (and everything for coaches) is optional.
  const client = role === "Client";
  const requiredFor = (group: DetailGroup): DetailKey[] => (client && group === "body" ? ["Sex", "Height", "Weight"] : []);
  const age = birthDate ? ageOn(birthDate, now) : null;
  const GROUP_OF: Record<Exclude<Step, 1>, DetailGroup> = { 2: "body", 3: "heart", 4: "training", 5: "health" };
  function next(event: FormEvent) {
    event.preventDefault();
    if (step === 1) return;
    const group = GROUP_OF[step];
    setChecked((value) => ({ ...value, [group]: true }));
    if (Object.keys(detailProblems(m, details, DETAIL_GROUPS[group], requiredFor(group))).length) return;
    if (step === TOTAL_STEPS) mutation.mutate(details);
    else setStep((step + 1) as Step);
  }
  // "Skip" clears the step's fields, so nothing half-typed is saved.
  function skip() {
    if (step === 1) return;
    const cleared = { ...details };
    for (const key of DETAIL_GROUPS[GROUP_OF[step]]) (cleared as Record<string, unknown>)[key] = emptyDetails[key];
    setDetails(cleared);
    if (step === TOTAL_STEPS) mutation.mutate(cleared);
    else setStep((step + 1) as Step);
  }

  const error = mutation.error;
  const conflict = !created.current && error instanceof ApiError && error.status === 409;
  // A taken username belongs to the field; another 409 means the identity differs from an earlier onboarding.
  const usernameError = conflict
    ? (error.code === "USERNAME_TAKEN" ? t.usernameTaken : t.identityMismatch)
    : (fieldError(error, "username") ?? (usernameProblem(username.trim()) === "reserved" ? t.usernameReserved : t.usernameHint));
  // Steps slide in from the side they come from: forward from the right, back from the left.
  const shown = useRef(step);
  const direction = step >= shown.current ? "forward" : "back";
  useEffect(() => {
    // A new step starts at its top (the first step is taller than most screens).
    if (shown.current !== step) window.scrollTo({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    shown.current = step;
  }, [step]);

  const progress = (
    <div className={styles.steps}>
      <ol aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
          <li key={n} data-state={n < step ? "done" : n === step ? "current" : undefined} />
        ))}
      </ol>
      <span>{t.step(step, TOTAL_STEPS)}</span>
    </div>
  );

  if (step !== 1) {
    const group = GROUP_OF[step];
    const header = { body: [t.bodyTitle, client ? t.bodyLead : t.bodyLeadCoach], heart: [t.heartTitle, t.heartLead], training: [t.trainingTitle, t.trainingLead], health: [t.healthTitle, t.healthLead] }[group];
    const optional = requiredFor(group).length === 0;
    const last = step === TOTAL_STEPS;
    return (
      <div key={step} className={styles.step} data-direction={direction}>
        <AuthHeader title={header[0]!} subtitle={header[1]} />
        {progress}
        {error ? <Alert tone="danger" title={created.current ? t.detailsFailed : errorText(m, error)} live="assertive" /> : null}
        <form className={styles.form} onSubmit={next} noValidate>
          <DetailFields group={group} value={details} onChange={setDetails} required={requiredFor(group)} age={age} problems={checked[group] ? detailProblems(m, details, DETAIL_GROUPS[group], requiredFor(group)) : {}} />
          <div className={styles.actions}>
            <Button size="lg" isDisabled={mutation.isPending} onPress={() => setStep((step - 1) as Step)}>
              {t.back}
            </Button>
            {optional ? (
              <Button size="lg" variant="ghost" isDisabled={mutation.isPending} onPress={skip}>
                {t.skip}
              </Button>
            ) : null}
            <Button type="submit" variant="primary" size="lg" loading={mutation.isPending} className={styles.primary}>
              {last ? t.finish : t.continue}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div key={step} className={styles.step} data-direction={direction}>
      <AuthHeader title={t.title} subtitle={t.body} />
      {progress}
      {error && !conflict ? <Alert tone="danger" title={errorText(m, error)} live="assertive" /> : null}
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <Select label={m.auth.register.accountType} selectedKey={role} onSelectionChange={(key) => setRole(registrationRole(String(key)))}>
          <Option id="Coach">{m.auth.register.coach}</Option>
          <Option id="Client">{m.auth.register.client}</Option>
        </Select>
        <TextField placeholder={m.common.ph.username}
          label={t.username}
          value={username}
          onChange={setUsername}
          autoComplete="username"
          isRequired
          description={t.usernameHint}
          isInvalid={invalid.username || conflict || Boolean(fieldError(error, "username"))}
          errorMessage={usernameError}
          maxLength={USERNAME_MAX}
        />
        <TextField placeholder={m.common.ph.displayName}
          label={t.displayName}
          value={displayName}
          onChange={setDisplayName}
          autoComplete="name"
          isRequired
          isInvalid={invalid.displayName || Boolean(fieldError(error, "displayName"))}
          errorMessage={fieldError(error, "displayName") ?? (displayName.trim() ? t.displayNameInvalid : m.auth.errors.required)}
        />
        <DateField
          label={t.birthDate}
          value={birthDate}
          onChange={setBirthDate}
          maxValue={now}
          minValue={parseDate("1900-01-01")}
          isRequired
          description={t.birthDateHint}
          isInvalid={invalid.birthDate || Boolean(fieldError(error, "birthDate"))}
          errorMessage={underage ? t.under18 : (fieldError(error, "birthDate") ?? m.auth.errors.required)}
        />
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
            isRequired
          >
            {(item: { id: string }) => <Option id={item.id}>{item.id.replace(/_/g, " ")}</Option>}
          </Combobox>
        </div>
        <Checkbox isSelected={accepted} onChange={setAccepted} isInvalid={invalid.terms} description={t.termsPending}>
          {t.acceptTerms}
        </Checkbox>
        {invalid.terms ? <p className={styles.error}>{t.termsRequired}</p> : null}
        <Button type="submit" variant="primary" size="lg" block>
          {t.continue}
        </Button>
      </form>
    </div>
  );
}

export default function Onboarding() {
  return (
    <AccountGate mode="onboarding">
      <OnboardingForm />
    </AccountGate>
  );
}
