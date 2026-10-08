import { parseDate, today, type CalendarDate } from "@internationalized/date";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Alert, Button, Checkbox, Combobox, DateField, Option, Select, TextField } from "@trainflow/ui-web";
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
import styles from "./onboarding.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Set up your account — TrainFlow");

const USERNAME = /^[A-Za-z0-9_]{3,30}$/;

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

  const mutation = useMutation({
    mutationFn: () =>
      completeOnboarding(api, {
        username: username.trim(),
        role,
        displayName: displayName.trim(),
        birthDate: birthDate!.toString(),
        acceptedTerms: accepted,
        locale: language,
        timeZone,
      }),
    onSuccess: (profile) => {
      queryClient.setQueryData(profileKey(accountKey), profile);
      navigate(sanitizeReturnTo(params.get("returnTo")), { replace: true });
    },
  });

  const now = today(timeZone || "UTC");
  const underage = birthDate ? ageOn(birthDate, now) < 18 : false;
  const invalid = {
    username: submitted && !USERNAME.test(username.trim()),
    displayName: submitted && !displayName.trim(),
    birthDate: submitted && (!birthDate || underage),
    terms: submitted && !accepted,
  };

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!USERNAME.test(username.trim()) || !displayName.trim() || !birthDate || underage || !accepted) return;
    mutation.mutate();
  }

  const error = mutation.error;
  const conflict = error instanceof ApiError && error.status === 409;

  return (
    <>
      <AuthHeader title={t.title} subtitle={t.body} />
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
          errorMessage={conflict ? t.usernameTaken : (fieldError(error, "username") ?? t.usernameHint)}
        />
        <TextField placeholder={m.common.ph.displayName}
          label={t.displayName}
          value={displayName}
          onChange={setDisplayName}
          autoComplete="name"
          isRequired
          isInvalid={invalid.displayName || Boolean(fieldError(error, "displayName"))}
          errorMessage={fieldError(error, "displayName") ?? m.auth.errors.required}
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
        <Button type="submit" variant="primary" size="lg" block loading={mutation.isPending}>
          {t.submit}
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
