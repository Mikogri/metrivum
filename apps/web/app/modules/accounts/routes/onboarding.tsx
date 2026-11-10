import { parseDate, today, type CalendarDate } from "@internationalized/date";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import type { ProfileResponse, Schema } from "@metrivum/api-client-web";
import {
  Button,
  Combobox,
  DateField,
  Option,
  Select,
  TextField,
} from "@metrivum/ui-web";
import {
  useAccountContext,
  useAccountKey,
  useApi,
} from "~/shared/session/AccountScope";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { ApiError } from "~/shared/http/errors";
import { errorText, fieldError } from "~/shared/lib/errorText";
import { sanitizeReturnTo } from "~/shared/session/returnTo";
import {
  SpecializationPicker,
  emptySpecializations,
  type SpecializationDraft,
} from "~/modules/coaching";
import {
  AuthHeader,
  AuthWorking,
  registrationRole,
  type RegistrationRole,
} from "~/modules/auth";
import { AccountGate } from "../components/AccountGate";
import { completeOnboarding, usernameAvailable } from "../api/profile";
import {
  DETAIL_GROUPS,
  DetailFields,
  detailProblems,
  detailsToValues,
  emptyDetails,
  type DetailGroup,
  type DetailKey,
  type Details,
} from "../components/ProfileDetails";
import { profileKey } from "../api/useProfile";
import { timeZones } from "../lib/timeZones";
import {
  namePartValid,
  normalizeDisplayName,
  USERNAME_MAX,
  usernameProblem,
} from "../lib/identity";
import styles from "./onboarding.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Set up your account — Metrivum");

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** The account, five detail steps, and for coaches their specializations as a step of its own. */
const DETAIL_STEPS = 6;
const SPECIALIZATIONS_STEP = 7;

function ageOn(date: CalendarDate, now: CalendarDate) {
  let age = now.year - date.year;
  if (
    now.month < date.month ||
    (now.month === date.month && now.day < date.day)
  )
    age--;
  return age;
}

function OnboardingForm() {
  const m = useT();
  const t = m.onboarding;
  const { locale } = useAppLocale();
  const api = useApi();
  const { lifecycle } = useAccountContext();
  const accountKey = useAccountKey();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const zones = useMemo(() => timeZones(), []);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<RegistrationRole>(() =>
    registrationRole(params.get("role")),
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState<CalendarDate | null>(null);
  const [language, setLanguage] = useState<string>(locale);
  const [timeZone, setTimeZone] = useState<string>(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [submitted, setSubmitted] = useState(false);
  // The username last found taken (checked before leaving the first step), and whether that check is running.
  const [takenName, setTakenName] = useState<string | null>(null);
  const [checkingName, setCheckingName] = useState(false);
  const [nameCheckFailed, setNameCheckFailed] = useState(false);
  // Steps after the account itself: location (for discovery), body, heart rate and recovery, training, then health and goals.
  const [step, setStep] = useState<Step>(1);
  const [specializations, setSpecializations] =
    useState<SpecializationDraft>(emptySpecializations);
  const [details, setDetails] = useState<Details>(emptyDetails);
  const [checked, setChecked] = useState<Partial<Record<DetailGroup, boolean>>>(
    {},
  );
  // The account is created once; a failed save of the extra details retries only that part.
  const created = useRef<ProfileResponse | null>(null);

  const mutation = useMutation({
    mutationFn: async ({
      input,
      selections,
    }: {
      input: Details;
      selections: SpecializationDraft;
    }) => {
      created.current ??= await completeOnboarding(api, {
        username: username.trim(),
        role,
        // Also sent whole, so an API that only knows the single display name accepts it too.
        displayName: normalizeDisplayName(`${firstName} ${lastName}`),
        firstName: normalizeDisplayName(firstName),
        lastName: normalizeDisplayName(lastName),
        birthDate: birthDate!.toString(),
        // Accepted on the sign-up form, before the account existed.
        acceptedTerms: true,
        locale: language,
        timeZone,
      });
      // Only valid groups are saved; a skipped or invalid optional group is left out rather than blocking setup.
      const keys = (Object.keys(DETAIL_GROUPS) as DetailGroup[])
        .filter(
          (group) =>
            !Object.keys(
              detailProblems(
                m,
                input,
                DETAIL_GROUPS[group],
                requiredFor(group),
              ),
            ).length,
        )
        .flatMap((group) => DETAIL_GROUPS[group]);
      const values = detailsToValues(input, keys, false);
      if (Object.keys(values).length) {
        const fields = (
          await api<Schema<"AccountProfileFields">>({
            path: "/api/v1/me/profile-fields",
          })
        ).data;
        await api({
          method: "PATCH",
          path: "/api/v1/me/profile-fields",
          ifMatch: fields.version,
          json: { values },
        });
      }
      if (role === "Coach" && selections.selectedCodes.length) {
        const current = (
          await api<Schema<"CoachSpecializationsDto">>({
            path: "/api/v1/me/coaching-specializations",
          })
        ).data;
        await api({
          method: "PUT",
          path: "/api/v1/me/coaching-specializations",
          json: { ...selections, version: current.version },
        });
      }
      return created.current;
    },
    onSuccess: (profile) => {
      if (!lifecycle.isCurrent()) return;
      queryClient.setQueryData(profileKey(accountKey), profile);
      // Without a page to return to, coaches start on the dashboard and clients on their training.
      const next = sanitizeReturnTo(
        params.get("returnTo"),
        profile.roles.includes("Coach") ? "/app/dashboard" : "/app/my-training",
      );
      // Coaches pick a plan before they start; everyone else goes straight in.
      navigate(
        profile.roles.includes("Coach")
          ? `/onboarding/plan?returnTo=${encodeURIComponent(next)}`
          : next,
        { replace: true },
      );
    },
    // A taken username is fixed on the first step.
    onError: (error) => {
      if (
        !created.current &&
        ((error instanceof ApiError && error.status === 409) ||
          fieldError(error, "username") ||
          fieldError(error, "firstName") ||
          fieldError(error, "lastName") ||
          fieldError(error, "displayName") ||
          fieldError(error, "birthDate"))
      )
        setStep(1);
    },
  });

  const now = today(timeZone || "UTC");
  const underage = birthDate ? ageOn(birthDate, now) < 18 : false;
  const invalid = {
    username: submitted && usernameProblem(username.trim()) !== null,
    firstName: submitted && !namePartValid(firstName),
    lastName: submitted && !namePartValid(lastName),
    birthDate: submitted && (!birthDate || underage),
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (
      usernameProblem(username.trim()) ||
      !namePartValid(firstName) ||
      !namePartValid(lastName) ||
      !birthDate ||
      underage
    )
      return;
    // A taken username is caught here, not only when the account is saved after the last step.
    const name = username.trim();
    setCheckingName(true);
    setNameCheckFailed(false);
    try {
      if (!(await usernameAvailable(api, name))) {
        setTakenName(name);
        return;
      }
    } catch {
      // Not knowing is not good enough: a username must be confirmed free before moving on.
      setNameCheckFailed(true);
      return;
    } finally {
      setCheckingName(false);
    }
    setTakenName(null);
    mutation.reset();
    setStep(2);
  }

  // Clients give sex, height and weight; everything else (and everything for coaches) is optional.
  const client = role === "Client";
  const requiredFor = (group: DetailGroup): DetailKey[] =>
    client && group === "body" ? ["Sex", "Height", "Weight"] : [];
  const age = birthDate ? ageOn(birthDate, now) : null;
  const GROUP_OF: Record<2 | 3 | 4 | 5 | 6, DetailGroup> = {
    2: "location",
    3: "body",
    4: "heart",
    5: "training",
    6: "health",
  };
  const TOTAL_STEPS = client ? DETAIL_STEPS : SPECIALIZATIONS_STEP;
  function next(event: FormEvent) {
    event.preventDefault();
    if (step === 1) return;
    if (step !== SPECIALIZATIONS_STEP) {
      const group = GROUP_OF[step];
      setChecked((value) => ({ ...value, [group]: true }));
      if (
        Object.keys(
          detailProblems(m, details, DETAIL_GROUPS[group], requiredFor(group)),
        ).length
      )
        return;
    }
    if (step === TOTAL_STEPS)
      mutation.mutate({
        input: details,
        selections: client ? emptySpecializations : specializations,
      });
    else setStep((step + 1) as Step);
  }

  const error = mutation.error;
  const conflict =
    !created.current && error instanceof ApiError && error.status === 409;
  // A taken username belongs to the field; another 409 means the identity differs from an earlier onboarding.
  const usernameError = conflict
    ? error.code === "USERNAME_TAKEN"
      ? t.usernameTaken
      : t.identityMismatch
    : takenName !== null && takenName === username.trim()
      ? t.usernameTaken
      : nameCheckFailed
        ? t.usernameCheckFailed
        : (fieldError(error, "username") ??
          (usernameProblem(username.trim()) === "reserved"
            ? t.usernameReserved
            : t.usernameHint));
  // Steps slide in from the side they come from: forward from the right, back from the left.
  const shown = useRef(step);
  const direction = step >= shown.current ? "forward" : "back";
  useEffect(() => {
    // A new step starts at its top (the first step is taller than most screens).
    if (shown.current !== step)
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "auto"
          : "smooth",
      });
    shown.current = step;
  }, [step]);

  const progress = (
    <div className={styles.steps}>
      {step > 1 ? (
        <button
          type="button"
          className={styles.stepBack}
          onClick={() => setStep((step - 1) as Step)}
          disabled={mutation.isPending}
        >
          <ArrowLeft aria-hidden="true" />
          {t.previousStep}
        </button>
      ) : null}
      <ol aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
          <li
            key={n}
            data-state={n < step ? "done" : n === step ? "current" : undefined}
          />
        ))}
      </ol>
      <span>{t.step(step, TOTAL_STEPS)}</span>
    </div>
  );

  // A request error after the account exists belongs under the fields it names; anything else goes under the button.
  const serverProblems = (keys: readonly string[]) =>
    Object.fromEntries(
      keys
        .map((key) => [key, fieldError(error, key)])
        .filter(([, message]) => message),
    ) as Record<string, string>;
  const stepError =
    error && !conflict
      ? created.current
        ? t.detailsFailed
        : errorText(m, error)
      : null;

  // Saving after the last step, and the moment before the app opens: a calm waiting screen, never an empty card.
  if (mutation.isPending || mutation.isSuccess) {
    return (
      <div className={styles.step} data-direction="forward">
        <AuthWorking title={t.finishing} steps={t.finishingSteps} />
      </div>
    );
  }

  if (step === SPECIALIZATIONS_STEP) {
    return (
      <div key={step} className={styles.step} data-direction={direction}>
        <AuthHeader
          title={m.specializations.title}
          subtitle={m.specializations.description}
        />
        {progress}
        <form className={styles.form} onSubmit={next} noValidate>
          <p className={styles.optionalNote}>
            {m.specializations.optional} {m.specializations.limit}
          </p>
          <SpecializationPicker
            value={specializations}
            onChange={setSpecializations}
            disabled={mutation.isPending}
          />
          <Button
            type="submit"
            variant="primary"
            block
            loading={mutation.isPending}
          >
            {t.finish}
          </Button>
          {stepError ? (
            <p className={styles.formError} role="alert">
              {stepError}
            </p>
          ) : null}
        </form>
      </div>
    );
  }

  if (step !== 1) {
    const group = GROUP_OF[step];
    const header = {
      location: [t.locationTitle, t.locationLead],
      body: [t.bodyTitle, client ? t.bodyLead : t.bodyLeadCoach],
      heart: [t.heartTitle, t.heartLead],
      training: [t.trainingTitle, t.trainingLead],
      health: [t.healthTitle, t.healthLead],
    }[group];
    const last = step === TOTAL_STEPS;
    return (
      <div key={step} className={styles.step} data-direction={direction}>
        <AuthHeader title={header[0]!} subtitle={header[1]} />
        {progress}
        <form className={styles.form} onSubmit={next} noValidate>
          <DetailFields
            group={group}
            value={details}
            onChange={setDetails}
            required={requiredFor(group)}
            age={age}
            problems={{
              ...serverProblems(DETAIL_GROUPS[group]),
              ...(checked[group]
                ? detailProblems(
                    m,
                    details,
                    DETAIL_GROUPS[group],
                    requiredFor(group),
                  )
                : {}),
            }}
          />
          <Button
            type="submit"
            variant="primary"
            block
            loading={mutation.isPending}
          >
            {last ? t.finish : t.continue}
          </Button>
          {stepError &&
          Object.keys(serverProblems(DETAIL_GROUPS[group])).length === 0 ? (
            <p className={styles.formError} role="alert">
              {stepError}
            </p>
          ) : null}
        </form>
      </div>
    );
  }

  return (
    <div key={step} className={styles.step} data-direction={direction}>
      <AuthHeader title={t.title} subtitle={t.body} />
      {progress}
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <Select
          label={m.auth.register.accountType}
          selectedKey={role}
          onSelectionChange={(key) => setRole(registrationRole(String(key)))}
        >
          <Option id="Coach">{m.auth.register.coach}</Option>
          <Option id="Client">{m.auth.register.client}</Option>
        </Select>
        <TextField
          placeholder={m.common.ph.username}
          label={t.username}
          value={username}
          onChange={(next) => {
            setUsername(next);
            setNameCheckFailed(false);
          }}
          autoComplete="username"
          isRequired
          description={t.usernameHint}
          isInvalid={
            invalid.username ||
            conflict ||
            nameCheckFailed ||
            (takenName !== null && takenName === username.trim()) ||
            Boolean(fieldError(error, "username"))
          }
          errorMessage={usernameError}
          maxLength={USERNAME_MAX}
        />
        <div className={styles.twoCols}>
          <TextField
            placeholder={m.common.ph.firstName}
            label={t.firstName}
            value={firstName}
            onChange={setFirstName}
            autoComplete="given-name"
            isRequired
            isInvalid={
              invalid.firstName || Boolean(fieldError(error, "firstName"))
            }
            errorMessage={
              fieldError(error, "firstName") ??
              (firstName.trim() ? t.namePartInvalid : m.auth.errors.required)
            }
          />
          <TextField
            placeholder={m.common.ph.lastName}
            label={t.lastName}
            value={lastName}
            onChange={setLastName}
            autoComplete="family-name"
            isRequired
            isInvalid={
              invalid.lastName || Boolean(fieldError(error, "lastName"))
            }
            errorMessage={
              fieldError(error, "lastName") ??
              (lastName.trim() ? t.namePartInvalid : m.auth.errors.required)
            }
          />
        </div>
        <DateField
          label={t.birthDate}
          value={birthDate}
          onChange={setBirthDate}
          maxValue={now}
          minValue={parseDate("1900-01-01")}
          isRequired
          description={t.birthDateHint}
          isInvalid={
            invalid.birthDate || Boolean(fieldError(error, "birthDate"))
          }
          errorMessage={
            underage
              ? t.under18
              : (fieldError(error, "birthDate") ?? m.auth.errors.required)
          }
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
            isRequired
          >
            {(item: { id: string }) => (
              <Option id={item.id}>{item.id.replace(/_/g, " ")}</Option>
            )}
          </Combobox>
        </div>
        <Button type="submit" variant="primary" block loading={checkingName}>
          {t.continue}
        </Button>
        {stepError &&
        !fieldError(error, "username") &&
        !fieldError(error, "firstName") &&
        !fieldError(error, "lastName") &&
        !fieldError(error, "birthDate") ? (
          <p className={styles.formError} role="alert">
            {stepError}
          </p>
        ) : null}
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
