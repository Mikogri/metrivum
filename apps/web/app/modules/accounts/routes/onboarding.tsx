import { parseDate, today, type CalendarDate } from "@internationalized/date";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { ProfileResponse, Schema } from "@trainflow/api-client-web";
import { Alert, Button, Checkbox, Combobox, DateField, NumberInput, Option, Select, TextArea, TextField } from "@trainflow/ui-web";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { ApiError } from "~/shared/http/errors";
import { errorText, fieldError } from "~/shared/lib/errorText";
import { sanitizeReturnTo } from "~/shared/session/returnTo";
import { AuthHeader, registrationRole, type RegistrationRole } from "~/modules/auth";
import { AccountGate } from "../components/AccountGate";
import { completeOnboarding } from "../api/profile";
import { profileKey } from "../api/useProfile";
import { timeZones } from "../lib/timeZones";
import { displayNameValid, normalizeDisplayName, USERNAME_MAX, usernameProblem } from "../lib/identity";
import styles from "./onboarding.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Set up your account — TrainFlow");


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
  // Steps after the account itself: 2 is the body (sex, height, weight), 3 is training habits.
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sex, setSex] = useState("");
  const [height, setHeight] = useState(NaN);
  const [weight, setWeight] = useState(NaN);
  const [bodyChecked, setBodyChecked] = useState(false);
  const [experience, setExperience] = useState("");
  const [activity, setActivity] = useState("");
  const [sessions, setSessions] = useState(NaN);
  const [injuries, setInjuries] = useState("");
  // The account is created once; a failed save of the extra details retries only that part.
  const created = useRef<ProfileResponse | null>(null);

  const mutation = useMutation({
    mutationFn: async (includeBody: boolean) => {
      created.current ??= await completeOnboarding(api, {
        username: username.trim(),
        role,
        displayName: normalizeDisplayName(displayName),
        birthDate: birthDate!.toString(),
        acceptedTerms: accepted,
        locale: language,
        timeZone,
      });
      const values: Record<string, unknown> = {};
      if (includeBody && sex) values.Sex = sex;
      if (includeBody && !Number.isNaN(height)) values.Height = height;
      if (includeBody && !Number.isNaN(weight)) values.Weight = weight;
      if (experience) values.TrainingExperience = experience;
      if (activity) values.ActivityLevel = activity;
      if (!Number.isNaN(sessions)) values.SessionsPerWeek = sessions;
      if (injuries.trim()) values.InjuriesLimitationsPainNotes = injuries.trim();
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

  // Clients give the three body details; for coaches they are optional.
  const client = role === "Client";
  const heightOk = Number.isNaN(height) ? !client : height >= 100 && height <= 250;
  const weightOk = Number.isNaN(weight) ? !client : weight >= 30 && weight <= 300;
  const bodyOk = (sex !== "" || !client) && heightOk && weightOk;
  function onBody(event: FormEvent) {
    event.preventDefault();
    setBodyChecked(true);
    if (bodyOk) setStep(3);
  }

  const error = mutation.error;
  const conflict = !created.current && error instanceof ApiError && error.status === 409;
  // A taken username belongs to the field; another 409 means the identity differs from an earlier onboarding.
  const usernameError = conflict
    ? (error.code === "USERNAME_TAKEN" ? t.usernameTaken : t.identityMismatch)
    : (fieldError(error, "username") ?? (usernameProblem(username.trim()) === "reserved" ? t.usernameReserved : t.usernameHint));
  const progress = (
    <div className={styles.steps}>
      <ol aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <li key={n} data-state={n < step ? "done" : n === step ? "current" : undefined} />
        ))}
      </ol>
      <span>{t.step(step, 3)}</span>
    </div>
  );

  if (step === 2)
    return (
      <>
        <AuthHeader title={t.bodyTitle} subtitle={client ? t.bodyLead : t.bodyLeadCoach} />
        {progress}
        <form className={styles.form} onSubmit={onBody} noValidate>
          <Select label={t.sex} placeholder={t.choose} selectedKey={sex || null} onSelectionChange={(key) => setSex(String(key))} isRequired={client} isInvalid={bodyChecked && client && !sex} errorMessage={m.auth.errors.required}>
            {["Male", "Female", "Other"].map((key) => (
              <Option key={key} id={key}>
                {t.sexOptions[key]}
              </Option>
            ))}
          </Select>
          <div className={styles.pair}>
            <NumberInput label={t.height} unit="cm" placeholder="175" value={height} onChange={setHeight} minValue={0} isRequired={client} isInvalid={bodyChecked && !heightOk} errorMessage={Number.isNaN(height) ? m.auth.errors.required : t.heightRange} />
            <NumberInput label={t.weight} unit="kg" placeholder="70" value={weight} onChange={setWeight} minValue={0} formatOptions={{ maximumFractionDigits: 1 }} isRequired={client} isInvalid={bodyChecked && !weightOk} errorMessage={Number.isNaN(weight) ? m.auth.errors.required : t.weightRange} />
          </div>
          <div className={styles.row}>
            <Button size="lg" onPress={() => setStep(1)}>
              {t.back}
            </Button>
            <Button type="submit" variant="primary" size="lg">
              {t.continue}
            </Button>
          </div>
        </form>
      </>
    );

  if (step === 3)
    return (
      <>
        <AuthHeader title={t.trainingTitle} subtitle={t.trainingLead} />
        {progress}
        {error ? <Alert tone="danger" title={created.current ? t.detailsFailed : errorText(m, error)} live="assertive" /> : null}
        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(bodyOk);
          }}
        >
          <Select label={t.experience} placeholder={t.choose} selectedKey={experience || null} onSelectionChange={(key) => setExperience(String(key))}>
            {t.experienceOptions.map((option) => (
              <Option key={option} id={option}>
                {option}
              </Option>
            ))}
          </Select>
          <Select label={t.activity} placeholder={t.choose} selectedKey={activity || null} onSelectionChange={(key) => setActivity(String(key))}>
            {t.activityOptions.map((option) => (
              <Option key={option} id={option}>
                {option}
              </Option>
            ))}
          </Select>
          <NumberInput label={t.sessions} placeholder="3" value={sessions} onChange={setSessions} minValue={0} maxValue={21} formatOptions={{ maximumFractionDigits: 0 }} />
          <TextArea label={t.injuries} placeholder={t.injuriesPlaceholder} value={injuries} onChange={setInjuries} maxLength={4000} />
          <div className={styles.row}>
            <Button size="lg" isDisabled={mutation.isPending} onPress={() => setStep(2)}>
              {t.back}
            </Button>
            <Button type="submit" variant="primary" size="lg" loading={mutation.isPending}>
              {t.submit}
            </Button>
          </div>
        </form>
      </>
    );

  return (
    <>
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
    </>
  );
}

export default function Onboarding() {
  return (
    <AccountGate mode="onboarding">
      <OnboardingForm />
    </AccountGate>
  );
}
